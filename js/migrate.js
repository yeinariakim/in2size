// eatsylog → In2Size 운동 기록 옮기기 (migrate.html, 한 번만 쓰고 지울 페이지)
// - eatsylog 계정과 In2Size 계정에 각각 로그인해서, 관리자 키 없이 브라우저에서 복사해요.
// - eatsylog 쪽은 getDocsFromServer(읽기)만 써요. 쓰기·지우기는 In2Size db에만 해요.
// - 문서 id를 eatsylog와 같게 저장해서 두 번 옮겨도 같은 문서를 덮어써요 (중복 없음).
// - 기록 내용은 그대로 복사하고(예전 형식 포함), 요약(workoutSummaries)은 앱과 같은 summaryFields()로 같이 만들어요.
import {
  auth, db, initializeApp, initializeAuth, inMemoryPersistence, getFirestore,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  collection, doc, getDocsFromServer, writeBatch, serverTimestamp,
} from './firebase.js';
import { summaryFields, findBlockFav, findExerciseFav } from './workout-data.js';
import { errorMessage } from './auth.js';
import { esc, withLoading } from './ui.js';

// eatsylog 저장소 js/firebase-config.js와 같은 값
const EATSYLOG_CONFIG = {
  apiKey: 'AIzaSyDkqwEI86fHvDoJmFWsVpTZLr7rmL9j3R0',
  authDomain: 'eatsylog.firebaseapp.com',
  projectId: 'eatsylog',
  storageBucket: 'eatsylog.firebasestorage.app',
  messagingSenderId: '1090563435414',
  appId: '1:1090563435414:web:0f13027e6b2d0598ac8bb7',
};

// 이름을 붙인 두 번째 앱. 로그인은 메모리에만 둬서 페이지를 닫으면 사라져요.
const eApp = initializeApp(EATSYLOG_CONFIG, 'eatsylog');
const eAuth = initializeAuth(eApp, { persistence: inMemoryPersistence });
const eDb = getFirestore(eApp);

const BATCH_OPS = 400; // 한 batch 최대 500개보다 여유 있게
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const state = {
  eUser: null,
  iUser: undefined, // undefined = 아직 확인 중
  plan: null, // 미리보기 결과
  result: null, // 옮긴 결과
};

const $ = (id) => document.getElementById(id);

// ---------- 화면 ----------
function loginForm(kind, desc) {
  return `
    <p class="card-desc">${desc}</p>
    <form class="stack" data-login="${kind}" novalidate>
      <label class="field">
        <span class="field-label">이메일</span>
        <input class="input" name="email" type="email" autocomplete="email" inputmode="email" required>
      </label>
      <label class="field">
        <span class="field-label">비밀번호</span>
        <input class="input" name="password" type="password" autocomplete="current-password" required>
      </label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">로그인</button>
    </form>`;
}

function signedIn(user, logoutAttr) {
  return `
    <p class="card-desc"><b>${esc(user.email)}</b> 로 로그인했어요</p>
    <button class="link-btn link-btn--muted" type="button" ${logoutAttr} style="align-self:flex-start">다른 계정으로 로그인</button>`;
}

function renderEatsylog() {
  $('step-eatsylog').innerHTML = `<h2 class="card-title">① eatsylog 로그인</h2>` + (state.eUser
    ? signedIn(state.eUser, 'data-logout="eatsylog"')
    : loginForm('eatsylog', 'eatsylog에서 쓰던 이메일과 비밀번호예요. 이 페이지를 닫으면 로그인이 사라져요.'));
}

function renderIn2size() {
  const el = $('step-in2size');
  const title = `<h2 class="card-title">② In2Size 로그인</h2>`;
  if (state.iUser === undefined) el.innerHTML = title + `<p class="card-desc">확인 중…</p>`;
  else if (state.iUser) el.innerHTML = title + signedIn(state.iUser, 'data-logout="in2size"');
  else el.innerHTML = title + loginForm('in2size', '기록을 넣을 In2Size 계정이에요.');
}

function renderMove() {
  const el = $('step-move');
  const title = `<h2 class="card-title">③ 미리보기 · 옮기기</h2>`;
  if (state.result) {
    const r = state.result;
    el.innerHTML = title + `
      <div class="notice"><span>운동 기록 <b>${r.workouts}개</b>, 즐겨찾기 <b>${r.favs}개</b> 옮겼어요.</span></div>
      <p class="card-desc">앱의 "내 기록" 탭에서 확인해 보세요. 확인이 끝나면 이 페이지는 지워도 돼요.</p>
      <a class="btn btn--secondary" href="./#/records">In2Size 열기</a>`;
    return;
  }
  if (!state.eUser || !state.iUser) {
    el.innerHTML = title + `<p class="card-desc">두 계정에 모두 로그인하면 미리보기를 볼 수 있어요.</p>`;
    return;
  }
  if (!state.plan) {
    el.innerHTML = title + `
      <p class="card-desc">몇 개를 옮기는지 먼저 보여드려요. 아직 아무것도 저장하지 않아요.</p>
      <p class="form-error" role="alert"></p>
      <button class="btn btn--primary" type="button" data-action="preview">미리보기</button>`;
    return;
  }
  const p = state.plan;
  const lines = [
    `운동 기록 <b>${p.workouts.length}개</b>${p.legacy ? ` (예전 "유산소·근력" 형식 ${p.legacy}개 포함)` : ''}`,
    p.first ? `날짜 <b>${p.first} ~ ${p.last}</b>` : '',
    `즐겨찾기 <b>${p.favs.length}개</b>`,
  ].filter(Boolean);
  const notes = [
    p.overwrite ? `이미 옮긴 기록 ${p.overwrite}개는 eatsylog 내용으로 덮어써요 (한마디는 그대로).` : '',
    p.favOverwrite ? `In2Size에 같은 이름이 있는 즐겨찾기 ${p.favOverwrite}개는 덮어써요.` : '',
    p.badDate ? `날짜가 없는 기록 ${p.badDate}개는 그대로 복사하지만 친구 피드(요약)에는 안 나와요.` : '',
    p.bothDays.length ? `In2Size에 따로 적은 기록이 있는 날: ${p.bothDays.map(esc).join(', ')} (합치지 않고 둘 다 남아요)` : '',
  ].filter(Boolean);
  const empty = !p.workouts.length && !p.favs.length;
  el.innerHTML = title + `
    <ul class="stack" style="gap:var(--sp-1);padding-left:1.2em;list-style:disc">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
    ${notes.map((n) => `<p class="card-desc">${n}</p>`).join('')}
    <p class="form-error" role="alert"></p>
    ${empty
      ? `<p class="card-desc">옮길 기록이 없어요.</p>`
      : `<button class="btn btn--primary" type="button" data-action="migrate">확인했어요, 옮기기</button>`}
    <button class="link-btn link-btn--muted" type="button" data-action="preview" style="align-self:center">미리보기 다시 보기</button>`;
}

function render() {
  renderEatsylog();
  renderIn2size();
  renderMove();
}

// ---------- 미리보기 ----------
const byId = (snap) => new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

async function preview() {
  const eUid = state.eUser.uid;
  const iUid = state.iUser.uid;
  const [eW, eF, iW, iS, iF] = await Promise.all([
    getDocsFromServer(collection(eDb, 'users', eUid, 'workouts')),
    getDocsFromServer(collection(eDb, 'users', eUid, 'workoutFavorites')),
    getDocsFromServer(collection(db, 'users', iUid, 'workouts')),
    getDocsFromServer(collection(db, 'users', iUid, 'workoutSummaries')),
    getDocsFromServer(collection(db, 'users', iUid, 'workoutFavorites')),
  ]);
  const workouts = eW.docs.map((d) => ({ id: d.id, data: d.data() }));
  const iWorkouts = byId(iW);
  const iSummaries = byId(iS);
  const iFavs = [...byId(iF).values()];

  const dates = workouts.map((w) => w.data.date).filter((d) => typeof d === 'string' && DATE_RE.test(d)).sort();
  const eIds = new Set(workouts.map((w) => w.id));
  const eDates = new Set(dates);
  const bothDays = [...new Set([...iWorkouts.values()]
    .filter((w) => !eIds.has(w.id) && eDates.has(w.date)).map((w) => w.date))].sort();

  // 즐겨찾기: 같은 id(이미 옮김) → 같은 이름(앱의 "같은 즐겨찾기" 기준) → 없으면 eatsylog id로 새로
  const favs = eF.docs.map((d) => {
    const data = d.data();
    const same = iFavs.find((f) => f.id === d.id)
      || (data.kind === 'exercise' ? findExerciseFav(iFavs, data.name) : findBlockFav(iFavs, data));
    return { id: d.id, targetId: same ? same.id : d.id, overwrite: !!same, data };
  });

  return {
    eUid,
    iUid,
    workouts,
    favs,
    comments: new Map([...iSummaries.values()].map((s) => [s.id, s.comment || ''])),
    legacy: workouts.filter((w) => !Array.isArray(w.data.blocks)).length,
    first: dates[0] || '',
    last: dates[dates.length - 1] || '',
    badDate: workouts.length - workouts.filter((w) => DATE_RE.test(w.data.date || '')).length,
    overwrite: workouts.filter((w) => iWorkouts.has(w.id)).length,
    favOverwrite: favs.filter((f) => f.overwrite).length,
    bothDays,
  };
}

// ---------- 옮기기 ----------
const isTimestamp = (v) => v && typeof v.toMillis === 'function';

async function migrate(p) {
  const uid = p.iUid;
  const ops = [];
  p.workouts.forEach(({ id, data }) => {
    // 기록은 그대로 복사 (예전 형식도 앱이 읽을 때 바꿔 줘요)
    ops.push((b) => b.set(doc(db, 'users', uid, 'workouts', id), data));
    if (!DATE_RE.test(data.date || '')) return;
    ops.push((b) => b.set(doc(db, 'users', uid, 'workoutSummaries', id), {
      ...summaryFields(data),
      comment: p.comments.get(id) || '', // 다시 옮길 때 그 사이 적은 한마디는 남겨요
      createdAt: isTimestamp(data.createdAt) ? data.createdAt : null,
      updatedAt: serverTimestamp(),
    }));
  });
  p.favs.forEach((f) => ops.push((b) => b.set(doc(db, 'users', uid, 'workoutFavorites', f.targetId), f.data)));

  for (let i = 0; i < ops.length; i += BATCH_OPS) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_OPS).forEach((op) => op(batch));
    await batch.commit();
  }
  return { workouts: p.workouts.length, favs: p.favs.length };
}

// ---------- 이벤트 ----------
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-login]');
  if (!form) return;
  e.preventDefault();
  const email = form.email.value.trim();
  const password = form.password.value;
  const errorEl = form.querySelector('.form-error');
  if (!email || !password) {
    errorEl.textContent = '이메일과 비밀번호를 입력해 주세요';
    return;
  }
  errorEl.textContent = '';
  const eatsylog = form.dataset.login === 'eatsylog';
  withLoading(form.querySelector('[type=submit]'), async () => {
    try {
      await signInWithEmailAndPassword(eatsylog ? eAuth : auth, email, password);
    } catch (error) {
      errorEl.textContent = errorMessage(error);
    }
  });
});

document.addEventListener('click', (e) => {
  const logout = e.target.closest('[data-logout]');
  if (logout) {
    signOut(logout.dataset.logout === 'eatsylog' ? eAuth : auth);
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const errorEl = $('step-move').querySelector('.form-error');
  const run = btn.dataset.action === 'preview'
    ? async () => { state.plan = await preview(); }
    : async () => {
      const p = state.plan;
      state.result = await migrate(p);
      state.plan = null;
      await signOut(eAuth); // 끝나면 eatsylog 로그인은 바로 정리
    };
  if (errorEl) errorEl.textContent = '';
  withLoading(btn, async () => {
    try {
      await run();
      renderMove();
    } catch (error) {
      if (errorEl) errorEl.textContent = errorMessage(error);
    }
  });
});

// 계정이 바뀌면 미리보기는 다시 봐야 해요
onAuthStateChanged(eAuth, (user) => {
  state.eUser = user;
  if (!user && state.result) { renderEatsylog(); return; } // 옮긴 뒤 로그아웃은 결과 화면 그대로
  state.plan = null;
  state.result = null;
  render();
});
onAuthStateChanged(auth, (user) => {
  state.iUser = user;
  state.plan = null;
  state.result = null;
  render();
});
