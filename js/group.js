import { db, doc, collection, getDoc, runTransaction, serverTimestamp } from './firebase.js';

export const MAX_MEMBERS = 5;
const CODE_PREFIX = 'SIZE-';

// 화면에 그대로 보여줄 수 있는 안내가 담긴 에러
function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

// "SIZE-4821" 형태. 숫자만 써서 헷갈리는 글자(O/0, I/1)가 없어요.
function generateCode() {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return CODE_PREFIX + digits;
}

// 사용자가 "size 4821", "4821", "size-4821" 등으로 입력해도 SIZE-4821로 맞춰줍니다.
export function normalizeCode(input) {
  const digits = input.toUpperCase().replace(/^\s*SIZE/, '').replace(/\D/g, '');
  return digits.length === 4 ? CODE_PREFIX + digits : '';
}

export async function createGroup(uid) {
  const userRef = doc(db, 'users', uid);
  // 코드가 이미 쓰이고 있으면 새로 뽑아서 다시 시도
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();
    const codeRef = doc(db, 'inviteCodes', code);
    const groupRef = doc(collection(db, 'groups'));
    const created = await runTransaction(db, async (tx) => {
      const [codeSnap, userSnap] = await Promise.all([tx.get(codeRef), tx.get(userRef)]);
      if (userSnap.data()?.groupId) throw userError('이미 그룹에 들어가 있어요');
      if (codeSnap.exists()) return false;
      tx.set(groupRef, {
        code,
        ownerId: uid,
        memberIds: [uid],
        createdAt: serverTimestamp(),
      });
      tx.set(codeRef, { groupId: groupRef.id, createdAt: serverTimestamp() });
      tx.update(userRef, { groupId: groupRef.id });
      return true;
    });
    if (created) return { groupId: groupRef.id, code };
  }
  throw userError('초대 코드를 만들지 못했어요. 다시 시도해 주세요');
}

export async function joinGroup(uid, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) throw userError('초대 코드는 SIZE-1234처럼 숫자 4자리예요');

  const codeSnap = await getDoc(doc(db, 'inviteCodes', code));
  if (!codeSnap.exists()) throw userError('없는 초대 코드예요. 다시 확인해 주세요');
  const groupRef = doc(db, 'groups', codeSnap.data().groupId);
  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const [groupSnap, userSnap] = await Promise.all([tx.get(groupRef), tx.get(userRef)]);
    if (!groupSnap.exists()) throw userError('없어진 그룹이에요');
    if (userSnap.data()?.groupId) throw userError('이미 그룹에 들어가 있어요');
    const memberIds = groupSnap.data().memberIds ?? [];
    if (memberIds.includes(uid)) throw userError('이미 이 그룹의 멤버예요');
    if (memberIds.length >= MAX_MEMBERS) throw userError('그룹이 가득 찼어요 (최대 5명)');
    tx.update(groupRef, { memberIds: [...memberIds, uid] });
    tx.update(userRef, { groupId: groupRef.id });
  });
  return { groupId: groupRef.id, code };
}

export async function getGroup(groupId) {
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// 같은 그룹 멤버들의 프로필 (보안 규칙상 같은 그룹이면 읽을 수 있어요)
export async function getMembers(memberIds) {
  const snaps = await Promise.all(memberIds.map((id) => getDoc(doc(db, 'users', id))));
  return snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
}
