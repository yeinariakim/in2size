import { db, doc, collection, getDoc, runTransaction, serverTimestamp } from './firebase.js';

export const MAX_MEMBERS = 5;
const CODE_PREFIX = 'SIZE-';

// 화면에 그대로 보여줄 수 있는 안내가 담긴 에러
function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

// "SIZE-K7P2QX" 형태: 6글자, 영어 대문자 + 숫자.
// 헷갈리는 0, O, 1, I, L은 빼서 31가지 글자 → 31^6 ≈ 8억 8천만 가지.
// firestore.rules의 validCode 정규식과 항상 같이 바꿀 것.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CONFUSING = /[01OIL]/;

function generateCode() {
  // 암호학적 난수 + 버림 샘플링으로 글자마다 확률을 똑같이
  const limit = 256 - (256 % CODE_CHARS.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && code.length < CODE_LENGTH) code += CODE_CHARS[byte % CODE_CHARS.length];
    }
  }
  return CODE_PREFIX + code;
}

// "size k7p2qx", "K7P2QX", "SIZE - K7P2QX" 등으로 입력해도 SIZE-K7P2QX로 맞춰줍니다.
// 형식이 틀리면 빈 문자열.
export function normalizeCode(input) {
  const body = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SIZE(?=.{6}$)/, '');
  const valid = body.length === CODE_LENGTH && [...body].every((c) => CODE_CHARS.includes(c));
  return valid ? CODE_PREFIX + body : '';
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
  if (!code) {
    const body = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SIZE/, '');
    throw userError(
      CONFUSING.test(body)
        ? '초대 코드에는 0, O, 1, I, L이 없어요. 다시 확인해 주세요'
        : '초대 코드는 SIZE-K7P2QX처럼 영어와 숫자 6글자예요',
    );
  }

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
