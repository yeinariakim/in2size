// 운동 기록 데이터: 저장/불러오기 + 계산 (화면 코드와 분리)
// ⚠️ 데이터 구조는 eatsylog와 "똑같이" 유지합니다. 나중에 eatsylog 기록을 그대로 옮겨오기 위해서예요.
//    필드 이름·단위(초)·null 처리까지 바꾸지 마세요. (CLAUDE.md "운동 기록" 참고)
//
// users/{uid}/workouts/{자동ID}
//   date("YYYY-MM-DD"), place,
//   blocks: [ 적은 순서대로
//     { type: "cardio",   name, durationSec, course, distanceKm, calorie, avgHr }
//     { type: "strength", durationSec, exercises: [{ name, sets: [{ kg, reps, sets }] }], calorie, avgHr }
//     { type: "other",    name, durationSec, reps, sets, calorie, memo }
//   ],
//   totalSec, totalCalorie, totalTimeManual, totalCalorieManual, createdAt
//
// users/{uid}/workoutFavorites/{자동ID}   (칼로리·심박수는 애플워치 실측값이라 저장하지 않아요)
//   { kind: "block", blockType: "cardio" | "other", name, course, durationSec, distanceKm, reps, sets, memo, updatedAt }
//   { kind: "exercise", name, sets: [{ kg, reps, sets }], updatedAt }
//
// users/{uid}/workoutSummaries/{운동 기록과 같은 id}   ← 그룹 친구에게 보여주는 요약 (In2Size에만 있음)
//   date, kinds: [{ type, name }], totalSec, totalCalorie, comment(한마디), createdAt(기록과 같음), updatedAt
//   상세 기록은 본인만 읽고, 친구는 이 요약만 읽어요. 한마디는 eatsylog 구조를 지키려고 요약에만 저장해요.
//   기록을 저장·수정·삭제할 때 같은 batch로 같이 바꾸고, 로그인할 때 syncSummaries()가 빠진 요약을 채워요.
import {
  db, doc, collection, onSnapshot, setDoc, addDoc, deleteDoc, serverTimestamp,
  writeBatch, query, where, getDocs,
} from './firebase.js';

export const COMMENT_MAX = 50; // 한마디 최대 글자 수 (firestore.rules와 같게)

// ---------- 구독 (로그인한 동안 한 번만 구독하고 화면들이 같이 씀) ----------
// 기록 양이 많지 않아서 eatsylog처럼 전체를 한 번에 구독하고, 날짜 목록·무게 추이 둘 다 여기서 걸러 써요.
const store = {
  uid: null,
  workouts: [],
  favs: [],
  summaries: [], // 내 요약 (한마디 읽기 + 요약 맞추기용)
  workoutsReady: false,
  favsReady: false,
  summariesReady: false,
  workoutsSynced: false, // 서버 값까지 확인됨 (캐시만 본 게 아님)
  summariesSynced: false,
  syncFailed: false,
  unsubs: [],
  listeners: new Set(),
};

const ready = () => store.workoutsReady && store.summariesReady;
const notify = () => { if (ready()) store.listeners.forEach((fn) => fn(store)); };
const isSynced = (snap) => !snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
const TS = { serverTimestamps: 'estimate' }; // 방금 저장해서 아직 서버 시각이 없는 값은 추정치로

function start(uid) {
  if (store.uid === uid) return;
  stopWorkoutStore();
  store.uid = uid;
  // 서버 확인 여부(fromCache)만 바뀔 때도 알아야 요약을 맞출 수 있어서 includeMetadataChanges
  const meta = { includeMetadataChanges: true };
  store.unsubs = [
    onSnapshot(collection(db, 'users', uid, 'workouts'), meta, (snap) => {
      const first = !store.workoutsReady;
      store.workouts = snap.docs.map((d) => ({ id: d.id, ...d.data(TS) }));
      store.workoutsReady = true;
      store.workoutsSynced = isSynced(snap);
      if (first || snap.docChanges().length) notify();
      syncSummaries();
    }, (err) => console.error('운동 기록 불러오기 실패:', err)),
    onSnapshot(collection(db, 'users', uid, 'workoutFavorites'), (snap) => {
      store.favs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      store.favsReady = true;
      notify();
    }, (err) => console.error('운동 즐겨찾기 불러오기 실패:', err)),
    onSnapshot(collection(db, 'users', uid, 'workoutSummaries'), meta, (snap) => {
      const first = !store.summariesReady;
      store.summaries = snap.docs.map((d) => ({ id: d.id, ...d.data(TS) }));
      store.summariesReady = true;
      store.summariesSynced = isSynced(snap);
      if (first || snap.docChanges().length) notify();
      syncSummaries();
    }, (err) => {
      console.error('운동 요약 불러오기 실패:', err);
      store.summariesReady = true; // 요약을 못 읽어도 내 기록 화면은 떠야 해요
      notify();
    }),
  ];
}

// 로그인하면 app.js가 불러요 (요약 맞추기가 기록 탭을 열지 않아도 돌도록)
export function startWorkoutStore(uid) {
  start(uid);
}

// 화면에서 구독: listener(store)가 처음 한 번 + 바뀔 때마다 불려요. 돌려받은 함수로 해제.
export function watchWorkouts(uid, listener) {
  start(uid);
  store.listeners.add(listener);
  if (ready()) listener(store);
  return () => store.listeners.delete(listener);
}

// 로그아웃하거나 계정이 바뀌면 (app.js)
export function stopWorkoutStore() {
  store.unsubs.forEach((u) => u());
  Object.assign(store, {
    uid: null, workouts: [], favs: [], summaries: [], unsubs: [],
    workoutsReady: false, favsReady: false, summariesReady: false,
    workoutsSynced: false, summariesSynced: false, syncFailed: false,
  });
}

export function summaryOf(workoutId) {
  return store.summaries.find((s) => s.id === workoutId) || null;
}

// ---------- 요약 ----------
const KIND_NAME_MAX = 30;

// 운동 종류: 적은 순서대로, 같은 건 한 번만. 근력은 "근력", 유산소·기타는 블록 이름
export function summaryKindsOf(w) {
  const kinds = [];
  const seen = new Set();
  workoutBlocksOf(w).forEach((b) => {
    const type = b.type === 'cardio' || b.type === 'strength' ? b.type : 'other';
    const fallback = { cardio: '유산소', strength: '근력', other: '기타' }[type];
    const name = type === 'strength' ? fallback : ((b.name || '').trim().slice(0, KIND_NAME_MAX) || fallback);
    const key = `${type}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    kinds.push({ type, name });
  });
  return kinds.slice(0, 20);
}

// 기록에서 계산되는 요약 칸 (한마디·시각 제외). migrate.js도 같은 값으로 요약을 만들어요
export function summaryFields(w) {
  return {
    date: w.date,
    kinds: summaryKindsOf(w),
    totalSec: workoutTotalSec(w) ?? null,
    totalCalorie: typeof w.totalCalorie === 'number' ? w.totalCalorie : null,
  };
}

// 저장된 map은 키 순서가 바뀌어 올 수 있어서 JSON 비교 대신 값으로 비교해요
const kindsKey = (kinds) => (kinds || []).map((k) => `${k.type}|${k.name}`).join('\n');
const sameFields = (s, f) => s.date === f.date && (s.totalSec ?? null) === f.totalSec
  && (s.totalCalorie ?? null) === f.totalCalorie && kindsKey(s.kinds) === kindsKey(f.kinds);

// 기록과 요약이 어긋난 게 있으면 맞춰요: 없는 요약은 만들고(예전 기록, 옮겨온 기록),
// 내용이 다르면 고치고(한마디는 그대로), 기록이 없어진 요약은 지워요.
// 서버 값을 확인한 뒤에만 돌고, 다 맞으면 아무것도 쓰지 않아요.
let syncing = false;
async function syncSummaries() {
  if (syncing || store.syncFailed || !store.workoutsSynced || !store.summariesSynced) return;
  const uid = store.uid;
  const byId = new Map(store.summaries.map((s) => [s.id, s]));
  const ops = [];
  store.workouts.forEach((w) => {
    if (!w.date) return;
    const fields = summaryFields(w);
    const s = byId.get(w.id);
    const ref = doc(db, 'users', uid, 'workoutSummaries', w.id);
    if (!s) ops.push((b) => b.set(ref, { ...fields, comment: '', createdAt: w.createdAt ?? null, updatedAt: serverTimestamp() }));
    else if (!sameFields(s, fields)) ops.push((b) => b.update(ref, { ...fields, updatedAt: serverTimestamp() }));
  });
  const ids = new Set(store.workouts.map((w) => w.id));
  store.summaries.forEach((s) => {
    if (!ids.has(s.id)) ops.push((b) => b.delete(doc(db, 'users', uid, 'workoutSummaries', s.id)));
  });
  if (ops.length === 0) return;

  syncing = true;
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  } catch (err) {
    // 실패하면 이번 로그인 동안은 다시 시도하지 않아요 (되돌려진 값 때문에 계속 반복되지 않게)
    console.error('운동 요약 맞추기 실패:', err);
    if (uid === store.uid) store.syncFailed = true;
  } finally {
    syncing = false;
  }
}

// ---------- 저장 ----------
// 운동 기록과 요약을 한 번에 저장해요. comment는 "오늘 한마디" (요약에만 저장)
export function saveWorkout(uid, id, data, createdAt, comment = '') {
  const ref = id ? doc(db, 'users', uid, 'workouts', id) : doc(collection(db, 'users', uid, 'workouts'));
  const created = (id && createdAt) || serverTimestamp();
  const batch = writeBatch(db);
  // setDoc처럼 통째로 덮어써서, 예전 형식(cardio/strength) 칸은 이때 사라져요
  batch.set(ref, { ...data, createdAt: created });
  batch.set(doc(db, 'users', uid, 'workoutSummaries', ref.id), {
    ...summaryFields(data),
    comment: comment.trim().slice(0, COMMENT_MAX),
    createdAt: created,
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

// 기록 + 요약 + 그 기록에 받은 응원을 같이 지워요
export async function deleteWorkout(uid, id) {
  let cheers = [];
  try {
    cheers = (await getDocs(query(collection(db, 'users', uid, 'cheers'), where('workoutId', '==', id)))).docs;
  } catch (err) {
    console.warn('응원 정리 건너뜀:', err); // 응원이 남아도 요약이 없으면 화면에 안 보여요
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'workouts', id));
  batch.delete(doc(db, 'users', uid, 'workoutSummaries', id));
  cheers.slice(0, 400).forEach((c) => batch.delete(c.ref));
  return batch.commit();
}

// 저장·수정 둘 다: 같은 즐겨찾기가 있으면 그 문서를 덮어쓰고, 없으면 새로 만들어요
export function putWorkoutFavorite(uid, data, existing) {
  const payload = { ...data, updatedAt: serverTimestamp() };
  if (existing) return setDoc(doc(db, 'users', uid, 'workoutFavorites', existing.id), payload);
  return addDoc(collection(db, 'users', uid, 'workoutFavorites'), payload);
}

export function deleteWorkoutFavorite(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'workoutFavorites', id));
}

// ---------- 즐겨찾기 찾기 ----------
export const blockFavs = (favs) => favs.filter((f) => f.kind === 'block');
export const exerciseFavs = (favs) => favs.filter((f) => f.kind === 'exercise');
const sameName = (a, b) => (a || '').trim() === (b || '').trim();

export function findExerciseFav(favs, name) {
  return name && name.trim() ? exerciseFavs(favs).find((f) => sameName(f.name, name)) : null;
}

// 유산소는 이름+코스명, 기타는 이름이 같으면 같은 즐겨찾기로 보고 덮어써요
export function findBlockFav(favs, fav) {
  return blockFavs(favs).find((f) => f.blockType === fav.blockType && sameName(f.name, fav.name) &&
    (fav.blockType !== 'cardio' || sameName(f.course, fav.course)));
}

// ---------- 날짜 ----------
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return todayStr(d);
}

// "9월 28일 (일)" / 오늘이면 "오늘"
export function formatDateLabel(dateStr) {
  if (dateStr === todayStr()) return '오늘';
  if (dateStr === addDays(todayStr(), -1)) return '어제';
  const d = new Date(`${dateStr}T00:00:00`);
  const day = '일월화수목금토'[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${day})`;
}

// ---------- 예전 형식 호환 ----------
const createdAtMs = (w) => (w.createdAt && w.createdAt.toMillis ? w.createdAt.toMillis() : 0);

// 예전 형식(cardio/strength 두 칸 고정)도 blocks 모양으로 맞춰서 돌려줘요
export function workoutBlocksOf(w) {
  if (Array.isArray(w.blocks)) return w.blocks;
  const toSec = (m) => (typeof m === 'number' ? Math.round(m * 60) : null);
  const blocks = [];
  if (w.cardio) {
    blocks.push({
      type: 'cardio', name: w.cardio.type || '', durationSec: toSec(w.cardio.minutes),
      course: w.cardio.course || '', distanceKm: w.cardio.distanceKm ?? null,
      calorie: w.cardio.totalCalorie ?? w.cardio.calorie ?? null, avgHr: w.cardio.avgHr ?? null,
    });
  }
  if (w.strength) {
    blocks.push({
      type: 'strength', durationSec: toSec(w.strength.minutes), exercises: w.strength.exercises || [],
      calorie: w.strength.totalCalorie ?? w.strength.calorie ?? null, avgHr: w.strength.avgHr ?? null,
    });
  }
  return blocks;
}

export function workoutTotalSec(w) {
  if (typeof w.totalSec === 'number') return w.totalSec;
  if (typeof w.totalMinutes === 'number') return Math.round(w.totalMinutes * 60);
  return null;
}

export function strengthExercisesOf(w) {
  return workoutBlocksOf(w).filter((b) => b.type === 'strength').flatMap((b) => b.exercises || []);
}

export function workoutsOn(workouts, date) {
  return workouts.filter((w) => w.date === date).sort((a, b) => createdAtMs(a) - createdAtMs(b));
}

// ---------- 표시용 ----------
export function formatAmount(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// 1250초 → "20분 50초", 1200초 → "20분"
export function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m && s) return `${m}분 ${s}초`;
  return s ? `${s}초` : `${m}분`;
}

export function formatTimeCalorie(sec, calorie) {
  return [formatDuration(sec), typeof calorie === 'number' ? `${Math.round(calorie)}kcal` : '']
    .filter(Boolean).join(' · ') || '-';
}

const sumBlockSec = (blocks) => blocks.reduce((sum, b) => sum + (b.durationSec || 0), 0);

// 목록 요약: 유산소는 종류마다 한 줄씩, 근력·기타는 각각 한 줄로 묶고, 마지막에 총합 한 줄
export function workoutSummaryRows(w) {
  const blocks = workoutBlocksOf(w);
  const sumCal = (bs) => (bs.some((b) => typeof b.calorie === 'number')
    ? bs.reduce((sum, b) => sum + (b.calorie || 0), 0) : null);
  const rows = [];
  blocks.filter((b) => b.type === 'cardio').forEach((b) => {
    rows.push({ type: 'cardio', label: b.name || '유산소', sec: b.durationSec, calorie: b.calorie ?? null });
  });
  const strength = blocks.filter((b) => b.type === 'strength');
  if (strength.length) rows.push({ type: 'strength', label: '근력', sec: sumBlockSec(strength), calorie: sumCal(strength) });
  const others = blocks.filter((b) => b.type === 'other');
  if (others.length) {
    const names = [...new Set(others.map((b) => (b.name || '').trim()).filter(Boolean))];
    rows.push({ type: 'other', label: names.join('/') || '기타', sec: sumBlockSec(others), calorie: sumCal(others) });
  }
  rows.push({ type: 'total', label: '총합', sec: workoutTotalSec(w), calorie: w.totalCalorie ?? null });
  return rows;
}

// "5kg, 10개×2세트 / 7.5kg, 8개×1세트"
export function formatSetGroups(sets) {
  return (sets || []).map((g) => {
    const kg = typeof g.kg === 'number' ? `${formatAmount(g.kg)}kg` : '';
    const rs = [typeof g.reps === 'number' ? `${g.reps}개` : '', typeof g.sets === 'number' ? `${g.sets}세트` : '']
      .filter(Boolean).join('×');
    return [kg, rs].filter(Boolean).join(', ');
  }).filter(Boolean).join(' / ');
}

// 즐겨찾기 목록 한 줄 요약. 유산소: "A코스 · 20분 · 1.22km", 기타: "5분 · 5개×3세트"
export function favSummary(f) {
  if (f.kind === 'exercise') return formatSetGroups(f.sets);
  const reps = [typeof f.reps === 'number' ? `${f.reps}개` : '', typeof f.sets === 'number' ? `${f.sets}세트` : '']
    .filter(Boolean).join('×');
  return (f.blockType === 'cardio'
    // 거리는 1.22km처럼 소수 둘째 자리까지 적는 경우가 많아서 두 자리로
    ? [f.course, formatDuration(f.durationSec), typeof f.distanceKm === 'number' ? `${Math.round(f.distanceKm * 100) / 100}km` : '']
    : [formatDuration(f.durationSec), reps, f.memo]
  ).filter(Boolean).join(' · ');
}

// ---------- 무게 추이 (종목별 날짜마다 최고 무게) ----------
export function getExerciseNames(workouts) {
  const names = new Set();
  workouts.forEach((w) => strengthExercisesOf(w).forEach((ex) => {
    if (ex.name && ex.name.trim()) names.add(ex.name.trim());
  }));
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function maxWeightByDate(workouts, name) {
  const byDate = {};
  workouts.forEach((w) => strengthExercisesOf(w).forEach((ex) => {
    if ((ex.name || '').trim() !== name) return;
    (ex.sets || []).forEach((g) => {
      if (typeof g.kg === 'number' && (byDate[w.date] === undefined || g.kg > byDate[w.date])) byDate[w.date] = g.kg;
    });
  }));
  return Object.keys(byDate).sort().map((date) => ({ date, kg: byDate[date] }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dateMs = (date) => new Date(`${date}T00:00:00`).getTime();

// 한 달 전 대비 변화량: 가장 최근 기록 날짜에서 30일 전에 가장 가까운 기록과 비교해요.
// 최근 기록과 15일도 안 떨어진 기록은 "한 달 전"이라고 보기 어려워서 빼요.
// 그런 기록밖에 없으면(새로 시작한 운동) 처음 기록과 비교해요 (fromStart). 기록이 1번뿐이면 null.
export function monthAgoChange(data) {
  if (data.length < 2) return null;
  const last = data[data.length - 1];
  const lastMs = dateMs(last.date);
  const target = lastMs - 30 * DAY_MS;
  const candidates = data.slice(0, -1).filter((d) => lastMs - dateMs(d.date) >= 15 * DAY_MS);
  const fromStart = candidates.length === 0;
  const base = fromStart ? data[0] : candidates.reduce((best, d) =>
    (Math.abs(dateMs(d.date) - target) < Math.abs(dateMs(best.date) - target) ? d : best));
  return { diff: Math.round((last.kg - base.kg) * 10) / 10, baseDate: base.date, fromStart };
}

// "+5kg"(늘었으면 강조) / "-2.5kg"·"±0kg"(연한 글자). 줄어도 경고색은 쓰지 않아요
export function formatKgChange(diff) {
  if (diff > 0) return { text: `+${formatAmount(diff)}kg`, cls: 'up' };
  if (diff < 0) return { text: `-${formatAmount(-diff)}kg`, cls: 'down' };
  return { text: '±0kg', cls: 'down' };
}

// 종목 목록: 최근에 한 종목이 위로
export function progressRows(workouts) {
  const lastDate = (data) => (data.length ? data[data.length - 1].date : '');
  return getExerciseNames(workouts)
    .map((name) => ({ name, data: maxWeightByDate(workouts, name) }))
    .sort((a, b) => lastDate(b.data).localeCompare(lastDate(a.data)) || a.name.localeCompare(b.name, 'ko'));
}
