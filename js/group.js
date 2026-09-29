// 그룹: 만들기 / 초대 코드로 들어가기 / 나가기 / 이름 바꾸기
// 한 사람은 그룹을 최대 3개(MAX_GROUPS)까지, 그룹 하나는 최대 5명(MAX_MEMBERS)까지.
// 내 그룹 목록은 users/{uid}.groupIds, 그룹의 멤버 목록은 groups/{id}.memberIds.
// 두 목록은 항상 같은 트랜잭션에서 같이 바꿔요 (보안 규칙이 둘이 맞는지 확인함).
import {
  db, doc, collection, getDoc, updateDoc, runTransaction, serverTimestamp, waitForPendingWrites,
} from './firebase.js';

export const MAX_MEMBERS = 5;
export const MEMBER_COLORS = 5; // 멤버 색 개수 (tokens.css의 --c-member-1~5, 규칙의 validColor와 같게)
export const MAX_GROUPS = 3;
export const GROUP_NAME_MAX = 20;

// 화면에 그대로 보여줄 수 있는 안내가 담긴 에러
function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

// 내 그룹 id 목록. 예전 형식(groupId 하나) 문서도 읽을 수 있게.
export function groupIdsOf(profile) {
  if (Array.isArray(profile?.groupIds)) return profile.groupIds;
  return profile?.groupId ? [profile.groupId] : [];
}

export function groupNameOf(group) {
  return group?.name || '이름 없는 그룹';
}

export function validateGroupName(value) {
  const name = value.trim();
  if (!name) return '그룹 이름을 입력해 주세요';
  if (name.length > GROUP_NAME_MAX) return `그룹 이름은 ${GROUP_NAME_MAX}자까지 쓸 수 있어요`;
  return '';
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

// 멤버 색: 그룹 문서 colors { uid: 1~5 }에 저장. 들어올 때 남은 색 중 무작위로 하나, 나가면 비워짐.
// 한 번 정해지면 다른 사람이 들어오고 나가도 바뀌지 않아요.
function pickColor(colors = {}) {
  const used = new Set(Object.values(colors));
  const free = [];
  for (let c = 1; c <= MEMBER_COLORS; c++) if (!used.has(c)) free.push(c);
  if (free.length === 0) return 1; // 5명 제한이라 생기지 않지만 혹시 몰라서
  return free[crypto.getRandomValues(new Uint32Array(1))[0] % free.length];
}

function withoutKey(map = {}, key) {
  const copy = { ...map };
  delete copy[key];
  return copy;
}

const TOO_MANY = () => userError(`그룹은 최대 ${MAX_GROUPS}개까지 들어갈 수 있어요`);

export async function createGroup(uid, rawName) {
  const name = rawName.trim();
  const problem = validateGroupName(name);
  if (problem) throw userError(problem);

  await serverReady();
  const userRef = doc(db, 'users', uid);
  // 코드가 이미 쓰이고 있으면 새로 뽑아서 다시 시도
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();
    const codeRef = doc(db, 'inviteCodes', code);
    const groupRef = doc(collection(db, 'groups'));
    const created = await runTransaction(db, async (tx) => {
      const [codeSnap, userSnap] = await Promise.all([tx.get(codeRef), tx.get(userRef)]);
      const ids = groupIdsOf(userSnap.data());
      if (ids.length >= MAX_GROUPS) throw TOO_MANY();
      if (codeSnap.exists()) return false;
      tx.set(groupRef, {
        name,
        code,
        ownerId: uid,
        memberIds: [uid],
        colors: { [uid]: pickColor() },
        createdAt: serverTimestamp(),
      });
      tx.set(codeRef, { groupId: groupRef.id, createdAt: serverTimestamp() });
      tx.update(userRef, { groupIds: [...ids, groupRef.id] });
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
    const ids = groupIdsOf(userSnap.data());
    const memberIds = groupSnap.data().memberIds ?? [];
    if (ids.includes(groupRef.id) || memberIds.includes(uid)) throw userError('이미 이 그룹의 멤버예요');
    if (ids.length >= MAX_GROUPS) throw TOO_MANY();
    if (memberIds.length >= MAX_MEMBERS) throw userError('그룹이 가득 찼어요 (최대 5명)');
    const colors = groupSnap.data().colors ?? {};
    tx.update(groupRef, { memberIds: [...memberIds, uid], colors: { ...colors, [uid]: pickColor(colors) } });
    tx.update(userRef, { groupIds: [...ids, groupRef.id] });
  });
  return { groupId: groupRef.id, code };
}

// 그룹 나가기. 마지막 한 명이 나가면 그룹과 초대 코드도 지워요.
// 운동 기록은 내 계정(users/{uid}/workouts)에 있어서 나가도 그대로 남아요.
export async function leaveGroup(uid, groupId) {
  await serverReady();
  const groupRef = doc(db, 'groups', groupId);
  const userRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const [groupSnap, userSnap] = await Promise.all([tx.get(groupRef), tx.get(userRef)]);
    const ids = groupIdsOf(userSnap.data());
    tx.update(userRef, { groupIds: ids.filter((id) => id !== groupId) });
    if (!groupSnap.exists()) return;
    const { memberIds = [], code, colors } = groupSnap.data();
    if (!memberIds.includes(uid)) return;
    if (memberIds.length <= 1) {
      tx.delete(groupRef);
      if (code) tx.delete(doc(db, 'inviteCodes', code));
    } else {
      const update = { memberIds: memberIds.filter((id) => id !== uid) };
      if (colors) update.colors = withoutKey(colors, uid); // 내 색은 비워서 다음 사람이 쓸 수 있게
      tx.update(groupRef, update);
    }
  });
}

// 색이 없는 멤버(색 기능 전에 만든 그룹)는 같이 탭을 열 때 자기 색을 하나 골라 저장해요
export async function claimColor(uid, groupId) {
  const groupRef = doc(db, 'groups', groupId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return;
    const { memberIds = [], colors = {} } = snap.data();
    if (!memberIds.includes(uid) || colors[uid]) return;
    tx.update(groupRef, { colors: { ...colors, [uid]: pickColor(colors) } });
  });
}

// 그룹 이름 바꾸기 (멤버 누구나)
export function renameGroup(groupId, rawName) {
  const name = rawName.trim();
  const problem = validateGroupName(name);
  if (problem) return Promise.reject(userError(problem));
  return updateDoc(doc(db, 'groups', groupId), { name });
}

export async function getGroup(groupId) {
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getGroups(groupIds) {
  const groups = await Promise.all(groupIds.map(getGroup));
  return groups.filter(Boolean);
}

// 같은 그룹 멤버들의 프로필 (보안 규칙상 그룹이 하나라도 겹치면 읽을 수 있어요)
export async function getMembers(memberIds) {
  const snaps = await Promise.all(memberIds.map((id) => getDoc(doc(db, 'users', id))));
  return snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
}
