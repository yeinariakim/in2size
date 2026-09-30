// 앱 안에서 올린 영상 코스 (courses/{id}). courses.json 코스와 같은 목록에 보여줘요.
//
// courses/{자동ID}
//   ownerId, youtube(영상 ID), name(1~30자), category, desc(0~60자), emoji,
//   groupIds: [공유할 그룹 id]   [] = 나만 보기. 여러 그룹에 공유해도 문서는 하나
//   durationSec: 영상 길이(초). 올린 사람이 처음 재생할 때 저장 (없으면 null)
//   createdAt, updatedAt
//
// 보안 규칙: 올린 사람 + 공유된 그룹 중 하나에 들어가 있는 사람만 읽음. 고치기·지우기는 올린 사람만.
// 로그인한 동안 app.js가 startCourseStore로 두 가지를 구독해요: 내가 올린 것 / 내 그룹에 공유된 것.
// 친구가 그룹을 나갔는데 코스의 groupIds에 그 그룹이 남아 있으면(나가기 정리가 실패한 경우 등) 보여주지 않아요:
// 올린 사람과 내가 지금 같이 들어가 있는 그룹에 공유된 것만 보여줘요.
import {
  db, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, query, where,
} from './firebase.js';
import { groupIdsOf } from './group.js';
import { watchTogether } from './together-data.js';
import { findCourse } from './courses.js';

export const MAX_UPLOADS = 30; // 한 사람이 올릴 수 있는 코스 수 (화면에서만 막아요)
export const COURSE_NAME_MAX = 30; // 규칙의 validCourse와 같게
export const COURSE_DESC_MAX = 60;
export const OTHER_CATEGORY = '기타'; // courses.json 카테고리 말고 고를 수 있는 하나
export const COURSE_EMOJIS = ['🔥', '💪', '🧘', '🦵', '🍑', '🏃', '🤸', '💃', '🥊', '⚡', '🌿', '✨'];

const TS = { serverTimestamps: 'estimate' };

const state = {
  uid: null,
  groupKey: null,
  mine: new Map(), // 내가 올린 것
  shared: new Map(), // 내 그룹에 공유된 것 (내 것도 섞여 있을 수 있음)
  mineReady: false,
  sharedReady: false,
  unsubMine: null,
  unsubShared: null,
  unsubTogether: null,
  together: null, // together-data 상태 (그룹 멤버 확인용)
  listeners: new Set(),
};

function notify() {
  const view = viewOf();
  state.listeners.forEach((fn) => fn(view));
}

function fromDoc(d) {
  const x = d.data(TS);
  const sec = Number.isInteger(x.durationSec) && x.durationSec > 0 ? x.durationSec : null;
  return {
    id: d.id,
    video: x.youtube,
    uploaded: true,
    ownerId: x.ownerId,
    emoji: x.emoji || '▶️',
    name: x.name || '',
    category: x.category || '',
    desc: x.desc || '',
    groupIds: Array.isArray(x.groupIds) ? x.groupIds : [],
    durationSec: sec,
    minutes: sec ? Math.max(1, Math.round(sec / 60)) : null,
    createdAt: x.createdAt?.toMillis ? x.createdAt.toMillis() : 0,
  };
}

// ---------- 시작 / 멈춤 (app.js) ----------
// 프로필이 바뀔 때마다 불려요. 그룹 목록이 같으면 구독은 그대로 둬요.
export function startCourseStore(uid, profile) {
  if (state.uid !== uid) {
    stopCourseStore();
    state.uid = uid;
    state.unsubMine = onSnapshot(query(collection(db, 'courses'), where('ownerId', '==', uid)), (snap) => {
      state.mine = new Map(snap.docs.map((d) => [d.id, fromDoc(d)]));
      state.mineReady = true;
      notify();
    }, (err) => {
      console.warn('내 코스 불러오기 실패:', err.code || err);
      state.mineReady = true;
      notify();
    });
    // 친구 이름·그룹 멤버가 바뀌면 목록도 다시
    state.unsubTogether = watchTogether((s) => {
      state.together = s;
      notify();
    });
  }
  const ids = groupIdsOf(profile);
  const key = ids.join(',');
  if (key === state.groupKey) return;
  state.groupKey = key;
  state.unsubShared?.();
  state.unsubShared = null;
  state.shared = new Map();
  state.sharedReady = !ids.length;
  if (ids.length) {
    state.unsubShared = onSnapshot(
      query(collection(db, 'courses'), where('groupIds', 'array-contains-any', ids)),
      (snap) => {
        state.shared = new Map(snap.docs.map((d) => [d.id, fromDoc(d)]));
        state.sharedReady = true;
        notify();
      },
      (err) => {
        console.warn('공유 코스 불러오기 실패:', err.code || err);
        state.sharedReady = true;
        notify();
      },
    );
  }
  notify();
}

export function stopCourseStore() {
  state.unsubMine?.();
  state.unsubShared?.();
  state.unsubTogether?.();
  Object.assign(state, {
    uid: null, groupKey: null, mine: new Map(), shared: new Map(), mineReady: false, sharedReady: false,
    unsubMine: null, unsubShared: null, unsubTogether: null, together: null,
  });
  notify();
}

// listener({ courses, ready, mineCount, nicknameOf }) — 올린 코스(최신순)
export function watchCourses(listener) {
  state.listeners.add(listener);
  listener(viewOf());
  return () => state.listeners.delete(listener);
}

// 친구 코스: 올린 사람과 내가 지금 같이 있는 그룹에 공유된 것만
function visible(c) {
  if (c.ownerId === state.uid) return true;
  const groups = state.together?.groups;
  return !!groups && c.groupIds.some((id) => {
    const members = groups.get(id)?.memberIds || [];
    return members.includes(state.uid) && members.includes(c.ownerId);
  });
}

function viewOf() {
  const all = new Map([...state.shared, ...state.mine]);
  const courses = [...all.values()].filter(visible)
    // 막 올려서 아직 서버 시각이 없으면 맨 위
    .sort((a, b) => (b.createdAt || Infinity) - (a.createdAt || Infinity) || a.name.localeCompare(b.name));
  return {
    courses,
    ready: state.mineReady && state.sharedReady,
    mineCount: state.mine.size,
    nicknameOf: (uid) => state.together?.members.get(uid)?.profile?.nickname || null,
  };
}

// "내가 올림" / "지수님이 올림"
export function uploaderText(view, c, uid) {
  if (c.ownerId === uid) return '내가 올림';
  const name = view.nicknameOf(c.ownerId);
  return name ? `${name}님이 올림` : '친구가 올림';
}

// ---------- 찾기 ----------
// 주소 값(?v= 또는 ?c=)으로 코스 하나. 올린 코스는 구독이 아직이면 문서를 직접 읽어요.
export async function findCourseByParams(params) {
  if (!params.c) return findCourse(params.v || '');
  const id = params.c;
  const known = state.mine.get(id) || state.shared.get(id);
  if (known) return known;
  try {
    const snap = await getDoc(doc(db, 'courses', id));
    return snap.exists() ? fromDoc(snap) : null;
  } catch (err) {
    // 지워졌거나 읽을 권한이 없음 (공유가 풀린 코스 등)
    console.warn('코스 불러오기 실패:', err.code || err);
    return null;
  }
}

// ---------- 쓰기 ----------
// fields: { video, name, category, desc, emoji, groupIds }. 새로 올리면 id를 돌려줘요
export async function saveUploadedCourse(uid, id, fields) {
  const data = {
    youtube: fields.video,
    name: fields.name,
    category: fields.category,
    desc: fields.desc,
    emoji: fields.emoji,
    groupIds: fields.groupIds,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    const before = state.mine.get(id);
    if (before && before.video !== fields.video) data.durationSec = null; // 영상을 바꾸면 길이는 다시
    await updateDoc(doc(db, 'courses', id), data);
    return id;
  }
  const ref = doc(collection(db, 'courses'));
  await setDoc(ref, { ...data, ownerId: uid, durationSec: null, createdAt: serverTimestamp() });
  return ref.id;
}

// 지워도 이미 남긴 운동 기록은 그대로예요 (기록엔 코스 이름만 메모로 들어가 있어요)
export function deleteUploadedCourse(id) {
  return deleteDoc(doc(db, 'courses', id));
}

// 올린 사람이 처음 재생할 때 영상 길이를 저장 (다른 사람은 규칙상 못 고쳐요)
export function saveCourseDuration(id, sec) {
  return updateDoc(doc(db, 'courses', id), { durationSec: Math.round(sec), updatedAt: serverTimestamp() });
}

// 그룹을 나간 뒤: 내 코스에서 그 그룹 공유를 빼요 (실패해도 화면에서는 이미 안 보여요)
export async function unshareGroup(uid, groupId) {
  const snap = await getDocs(query(collection(db, 'courses'), where('ownerId', '==', uid), where('groupIds', 'array-contains', groupId)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, {
    groupIds: (d.data().groupIds || []).filter((g) => g !== groupId),
    updatedAt: serverTimestamp(),
  }));
  await batch.commit();
}
