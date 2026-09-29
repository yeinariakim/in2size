// 같이 탭 데이터: 내 그룹들 → 멤버들 → 멤버마다 요약·응원 구독 (화면 코드와 분리)
// 같이 탭·운동하기 탭(친구 소식)·아래 탭의 새 반응 점이 이 한 곳을 같이 써요.
//
// users/{uid}/workoutSummaries/{workoutId}  요약 (workout-data.js가 기록과 같이 씀)
// users/{owner}/cheers/{workoutId}_{from}_{emoji}   응원 반응 하나 = 문서 하나
//   workoutId, from(누른 사람), emoji("clap"|"fire"|"muscle"|"heart"), createdAt
//   다시 누르면 문서를 지워서 취소. 내 기록에는 못 누름(보안 규칙).
// users/{uid}.cheersSeenAt  이 시각 이후에 받은 반응이 "새 반응"
//
// 보안 규칙상 요약·응원은 그룹이 하나라도 겹치는 사람만 읽을 수 있어요.
import {
  db, doc, collection, onSnapshot, setDoc, deleteDoc, updateDoc, serverTimestamp,
  query, where, orderBy, limit,
} from './firebase.js';
import { groupIdsOf, claimColor, MEMBER_COLORS } from './group.js';

export const CHEERS = [
  { key: 'clap', emoji: '👏' },
  { key: 'fire', emoji: '🔥' },
  { key: 'muscle', emoji: '💪' },
  { key: 'heart', emoji: '❤️' },
];
export const cheerEmoji = (key) => CHEERS.find((c) => c.key === key)?.emoji ?? '';

const SUMMARY_LIMIT = 30; // 멤버마다 최근 요약 몇 개까지 피드에
const CHEER_LIMIT = 300; // 멤버마다 최근 받은 응원 몇 개까지
const TS = { serverTimestamps: 'estimate' };

const state = {
  uid: null,
  seenAt: 0, // 내 cheersSeenAt (ms)
  groupKey: null,
  groups: new Map(), // id → { id, ...data } (지워진 그룹은 빠짐)
  groupUnsubs: new Map(),
  colorClaimed: new Set(), // 이번 로그인에 내 색 저장을 시도한 그룹
  members: new Map(), // uid → { profile, summaries, cheers, ready, unsubs }
  listeners: new Set(),
};

let notifyTimer = null;
// 구독이 여러 개라 한꺼번에 바뀔 때가 많아서, 잠깐 모았다가 한 번에 알려요
function notify() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => state.listeners.forEach((fn) => fn(state)), 30);
}

const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);

// ---------- 시작 / 멈춤 (app.js) ----------
// 프로필이 바뀔 때마다 불려요. 그룹 목록이 같으면 구독은 그대로 둬요.
export function syncTogether(uid, profile) {
  if (state.uid !== uid) {
    stopTogether();
    state.uid = uid;
  }
  const seen = ms(profile?.cheersSeenAt);
  if (seen !== state.seenAt) {
    state.seenAt = seen;
    notify();
  }
  const ids = groupIdsOf(profile);
  const key = ids.join(',');
  if (key === state.groupKey) return;
  state.groupKey = key;

  state.groupUnsubs.forEach((unsub, id) => {
    if (ids.includes(id)) return;
    unsub();
    state.groupUnsubs.delete(id);
    state.groups.delete(id);
  });
  ids.forEach((id) => {
    if (state.groupUnsubs.has(id)) return;
    state.groupUnsubs.set(id, onSnapshot(doc(db, 'groups', id), (snap) => {
      if (snap.exists()) {
        const group = { id, ...snap.data() };
        state.groups.set(id, group);
        ensureMyColor(group);
      } else {
        state.groups.delete(id);
      }
      updateMembers();
    }, (err) => {
      console.warn('그룹 불러오기 실패:', err);
      state.groups.delete(id);
      updateMembers();
    }));
  });
  updateMembers();
}

export function stopTogether() {
  state.groupUnsubs.forEach((u) => u());
  state.members.forEach((m) => m.unsubs.forEach((u) => u()));
  Object.assign(state, {
    uid: null, seenAt: 0, groupKey: null, groups: new Map(), groupUnsubs: new Map(), members: new Map(),
    colorClaimed: new Set(),
  });
  notify();
}

export function watchTogether(listener) {
  state.listeners.add(listener);
  listener(state);
  return () => state.listeners.delete(listener);
}

// 색 기능 전에 만든 그룹이면 내 색이 없어요. 한 번만 골라 저장 (다른 멤버는 각자 열 때 저장)
function ensureMyColor(group) {
  const uid = state.uid;
  if (!uid || group.colors?.[uid] || !(group.memberIds || []).includes(uid) || state.colorClaimed.has(group.id)) return;
  state.colorClaimed.add(group.id);
  claimColor(uid, group.id).catch((err) => console.warn('멤버 색 저장 실패:', err.code || err));
}

// 나 + 내 그룹들의 멤버 전부 (중복 없이)
function wantedMembers() {
  const set = new Set(state.uid ? [state.uid] : []);
  state.groups.forEach((g) => (g.memberIds || []).forEach((id) => set.add(id)));
  return set;
}

function updateMembers() {
  const wanted = wantedMembers();
  state.members.forEach((m, id) => {
    if (wanted.has(id)) return;
    m.unsubs.forEach((u) => u());
    state.members.delete(id);
  });
  wanted.forEach((id) => {
    if (!state.members.has(id)) state.members.set(id, watchMember(id));
  });
  notify();
}

function watchMember(id) {
  const m = { profile: null, summaries: [], cheers: [], summariesReady: false, cheersReady: false, unsubs: [] };
  // 친구가 그룹을 나가면 읽기 권한이 없어져서 에러가 날 수 있어요. 그땐 빈 채로 둬요
  const fail = (what) => (err) => {
    console.warn(`${what} 불러오기 실패:`, err.code || err);
    if (what === '요약') m.summariesReady = true;
    if (what === '응원') m.cheersReady = true;
    notify();
  };
  m.unsubs = [
    onSnapshot(doc(db, 'users', id), (snap) => {
      m.profile = snap.exists() ? snap.data() : null;
      notify();
    }, fail('프로필')),
    onSnapshot(query(collection(db, 'users', id, 'workoutSummaries'), orderBy('date', 'desc'), limit(SUMMARY_LIMIT)), (snap) => {
      m.summaries = snap.docs.map((d) => ({ id: d.id, owner: id, ...d.data(TS) }));
      m.summariesReady = true;
      notify();
    }, fail('요약')),
    onSnapshot(query(collection(db, 'users', id, 'cheers'), orderBy('createdAt', 'desc'), limit(CHEER_LIMIT)), (snap) => {
      m.cheers = snap.docs.map((d) => ({ id: d.id, owner: id, ...d.data(TS) }));
      m.cheersReady = true;
      notify();
    }, fail('응원')),
  ];
  return m;
}

// ---------- 읽기 도우미 ----------
export function nicknameOf(s, uid) {
  return s.members.get(uid)?.profile?.nickname || null;
}

// 최신순: 날짜 → 저장한 시각
const byRecent = (a, b) => (b.date || '').localeCompare(a.date || '') || ms(b.createdAt) - ms(a.createdAt);

// uids(없으면 전부)의 요약을 최신순으로
export function feedOf(s, uids = null) {
  const list = [];
  s.members.forEach((m, id) => {
    if (uids && !uids.includes(id)) return;
    list.push(...m.summaries);
  });
  return list.sort(byRecent);
}

export function feedReady(s, uids = null) {
  let ok = true;
  s.members.forEach((m, id) => {
    if ((!uids || uids.includes(id)) && !m.summariesReady) ok = false;
  });
  return ok;
}

// 기록 하나에 달린 응원 (누른 순서대로)
export function cheersOf(s, summary) {
  const m = s.members.get(summary.owner);
  return (m?.cheers || []).filter((c) => c.workoutId === summary.id).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
}

// 내 기록에 친구가 보낸 반응 중 아직 안 본 것 (최신순)
export function unreadCheers(s) {
  const me = s.members.get(s.uid);
  if (!me) return [];
  return me.cheers
    .filter((c) => c.from !== s.uid && ms(c.createdAt) > s.seenAt)
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

export function summaryOfCheer(s, cheer) {
  return s.members.get(cheer.owner)?.summaries.find((x) => x.id === cheer.workoutId) || null;
}

// 운동하기 탭 친구 소식: 모든 그룹 중 가장 최근 친구 기록 하나
export function latestFriendSummary(s) {
  const friends = [...s.members.keys()].filter((id) => id !== s.uid);
  return feedOf(s, friends)[0] || null;
}

// ---------- 쓰기 ----------
export function cheerDocId(workoutId, from, key) {
  return `${workoutId}_${from}_${key}`;
}

// 누르면 추가, 이미 눌렀으면 취소
export function toggleCheer(owner, workoutId, key, on) {
  const ref = doc(db, 'users', owner, 'cheers', cheerDocId(workoutId, state.uid, key));
  if (!on) return deleteDoc(ref);
  return setDoc(ref, { workoutId, from: state.uid, emoji: key, createdAt: serverTimestamp() });
}

export function markCheersSeen(uid) {
  return updateDoc(doc(db, 'users', uid), { cheersSeenAt: serverTimestamp() });
}

// 달력: 그 달에 멤버별로 운동한 날짜. listener(Map<date, Set<uid>>)
export function watchMonth(uids, from, to, listener) {
  const byMember = new Map();
  const emit = () => {
    const days = new Map();
    byMember.forEach((dates, id) => dates.forEach((d) => {
      if (!days.has(d)) days.set(d, new Set());
      days.get(d).add(id);
    }));
    listener(days);
  };
  const unsubs = uids.map((id) => onSnapshot(
    query(collection(db, 'users', id, 'workoutSummaries'), where('date', '>=', from), where('date', '<=', to)),
    (snap) => {
      byMember.set(id, snap.docs.map((d) => d.data().date));
      emit();
    },
    (err) => console.warn('달력 불러오기 실패:', err.code || err),
  ));
  return () => unsubs.forEach((u) => u());
}

// ---------- 표시용 ----------
// 멤버 색: 그룹 문서 colors { uid: 1~5 }에 저장된 색 (들어올 때 무작위로 정해지고 안 바뀜).
// 아직 색이 없는 멤버(예전 그룹)는 그 사람이 같이 탭을 열 때 저장되고, 그 전엔 남은 색을 임시로 보여줘요.
// tokens.css의 --c-member-1~5
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function memberColors(group) {
  const stored = group.colors || {};
  const colors = new Map();
  const taken = new Set();
  (group.memberIds || []).forEach((id) => {
    const c = stored[id];
    if (c >= 1 && c <= MEMBER_COLORS && !taken.has(c)) {
      colors.set(id, c);
      taken.add(c);
    }
  });
  (group.memberIds || []).forEach((id) => {
    if (colors.has(id)) return;
    let c = hash(id) % MEMBER_COLORS;
    for (let i = 0; i < MEMBER_COLORS && taken.has(c + 1); i++) c = (c + 1) % MEMBER_COLORS;
    taken.add(c + 1);
    colors.set(id, c + 1);
  });
  return colors;
}

// 운동 종류 이모지: 이름을 보고 고르고, 모르면 종류별 기본
const KIND_EMOJI = [
  [/러닝|런닝|달리기|뛰기|조깅|run|트레드밀/i, '🏃'],
  [/걷기|산책|워킹|walk/i, '🚶'],
  [/자전거|사이클|싸이클|스피닝|bike|cycl/i, '🚴'],
  [/수영|swim/i, '🏊'],
  [/등산|하이킹|트레킹|hik/i, '🥾'],
  [/로잉|row/i, '🚣'],
  [/요가|필라테스|yoga|pilates/i, '🧘'],
  [/스트레칭|웜업|워밍업|쿨다운|stretch/i, '🤸'],
  [/복싱|킥복싱|box/i, '🥊'],
  [/테니스|tennis/i, '🎾'],
  [/배드민턴/i, '🏸'],
  [/축구|풋살/i, '⚽'],
  [/농구/i, '🏀'],
  [/골프|golf/i, '⛳'],
  [/클라이밍|볼더링|climb/i, '🧗'],
  [/댄스|춤|줌바|dance/i, '💃'],
];

export function kindEmoji(kind) {
  if (kind.type === 'strength') return '🏋️';
  const hit = KIND_EMOJI.find(([re]) => re.test(kind.name || ''));
  if (hit) return hit[1];
  return kind.type === 'cardio' ? '🏃' : '✨';
}

// "🏃 러닝 · 🏋️ 근력"
export function kindsText(kinds) {
  return (kinds || []).map((k) => `${kindEmoji(k)} ${k.name}`).join(' · ');
}
