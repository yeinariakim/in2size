import { db, doc, collection, getDoc, runTransaction, serverTimestamp, waitForPendingWrites } from './firebase.js';

export const MAX_MEMBERS = 5;

// 화면에 그대로 보여줄 수 있는 안내가 담긴 에러
function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

// "K7P2QX" 형태: 6글자, 영어 대문자 + 숫자.
// 헷갈리는 0, O, 1, I, L은 빼서 31가지 글자 → 31^6 ≈ 8억 8천만 가지.
// firestore.rules의 validCode 정규식과 항상 같이 바꿀 것.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode() {
  // 암호학적 난수 + 버림 샘플링으로 글자마다 확률을 똑같이
  const limit = 256 - (256 % CODE_CHARS.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && code.length < CODE_LENGTH) code += CODE_CHARS[byte % CODE_CHARS.length];
    }
  }
  return code;
}

// "k7p2qx", "K7P 2QX", "K7P-2QX" 등으로 입력해도 K7P2QX로 맞춰줍니다. 형식이 틀리면 빈 문자열.
// 예전에 쓰던 "SIZE-" 접두어를 붙여 넣어도 떼고 받습니다 (코드에는 I가 없어서 헷갈릴 일 없음).
export function normalizeCode(input) {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SIZE(?=.{6}$)/, '');
  const valid = code.length === CODE_LENGTH && [...code].every((c) => CODE_CHARS.includes(c));
  return valid ? code : '';
}

// 오프라인 캐시 때문에 가입 직후 프로필이 아직 서버에 안 올라갔을 수 있어요.
// 트랜잭션은 서버 값만 보므로, 먼저 올라가길 기다립니다.
async function serverReady() {
  await waitForPendingWrites(db);
}

export async function createGroup(uid) {
  await serverReady();
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
  if (!code) throw userError('초대 코드는 6글자예요');

  await serverReady();
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
