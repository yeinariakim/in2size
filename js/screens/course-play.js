// 영상 코스 재생 (#/course-play?v=유튜브ID) → 끝나거나 [완료]를 누르면 완료 폼 → 저장
// - 유튜브 IFrame Player API로 앱 안에서 재생 (playsinline). 가로로 돌리면 헤더를 숨기고 영상을 크게.
// - 재생하는 동안 화면 꺼짐 방지(Wake Lock). 지원 안 되는 기기는 조용히 넘어가요.
// - 퍼가기가 막힌 영상(오류 101·150·153 등)이나 유튜브를 못 불러오면 "유튜브에서 보기"로 대신 열어요.
//   누르면 코스를 적어 둬서, 돌아오면 ?done=1 완료 화면이 떠요 (유튜브 프리미엄 모드와 같음)
// - 영상 오른쪽 위 ⓘ: 아래에서 올라오는 도움말(광고 없이·가로로 보기). 처음 한 번만 자동으로 열려요.
// - ?done=1: 유튜브 프리미엄 모드로 유튜브 앱에 다녀온 경우. 영상 없이 "운동 끝났어요?" 폼부터 (app.js가 보냄)
// - 완료 폼은 이 화면 안의 상태라, 저장하기 전에 나가면(뒤로·탭 이동·새로고침) 기록이 남지 않아요.
import { esc, icons, toast, withLoading, localGet, localSet } from '../ui.js';
import { errorMessage } from '../auth.js';
import { findCourse, homeWorkoutData, youtubeWatchUrl } from '../courses.js';
import { saveWorkout, todayStr, COMMENT_MAX } from '../workout-data.js';
import { rememberCourse } from '../youtube-app.js';

const API_URL = 'https://www.youtube.com/iframe_api';
const API_TIMEOUT_MS = 12000;
const MAX_MINUTES = 180; // 기록 화면의 블록 최대 시간과 같게
const SECOND_OPTIONS = [0, 10, 20, 30, 40, 50];
const PLAYING_CLASS = 'is-course-playing'; // body에 붙이면 가로 화면에서 헤더를 숨겨요
const HELP_SEEN_KEY = 'in2size.playHelpSeen'; // 도움말을 한 번 자동으로 열었으면 '1'

let apiPromise = null;

// 유튜브 스크립트는 처음 재생할 때 한 번만 불러요
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.onerror = () => {
      script.remove();
      apiPromise = null;
      reject(new Error('유튜브 스크립트를 불러오지 못함'));
    };
    document.head.append(script);
  });
  return apiPromise;
}

function minuteOptions(selected) {
  let html = '';
  for (let m = 0; m <= MAX_MINUTES; m++) html += `<option value="${m}"${m === selected ? ' selected' : ''}>${m}</option>`;
  return html;
}

function notFound(el) {
  el.innerHTML = `
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.info}</span>
      <p class="empty-state-title">코스를 찾을 수 없어요</p>
      <a class="btn btn--secondary" href="#/workout">코스 목록으로</a>
    </div>`;
}

function helpSheetHtml() {
  return `
    <div class="sheet" data-help hidden>
      <div class="sheet-backdrop" data-help-close></div>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="play-help-title">
        <h2 class="sheet-title" id="play-help-title">재생 도움말</h2>
        <ul class="tips">
          <li>
            <p class="tip-title">광고 없이 보고 싶다면</p>
            <p class="tip-desc">유튜브 프리미엄이면 설정에서 켜주세요. 유튜브 앱에서 열리고, 돌아오면 바로 기록할 수 있어요.</p>
          </li>
          <li>
            <p class="tip-title">가로로 보고 싶다면</p>
            <p class="tip-desc">제어센터에서 화면 회전 잠금을 꺼주세요.</p>
          </li>
        </ul>
        <button class="btn btn--primary" type="button" data-help-close>확인</button>
      </div>
    </div>`;
}

export function render(el, ctx) {
  const id = ctx.params.v || '';
  const askDone = ctx.params.done === '1'; // 유튜브 앱에서 돌아옴
  let disposed = false;
  let player = null;
  let finished = false;
  let wakeLock = null;
  let locking = false;
  let wantLock = false; // 한 번이라도 재생을 시작했으면 화면을 켜 둠 (잠깐 멈춰도 유지)
  let apiTimer = null;
  let cleanupHelp = null;

  if (!askDone) document.body.classList.add(PLAYING_CLASS);
  el.innerHTML = '<p class="workout-empty">코스를 불러오는 중…</p>';

  // ---------- 화면 꺼짐 방지 ----------
  async function lockScreen() {
    if (!wantLock || disposed || finished || wakeLock || locking) return;
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    locking = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (disposed || finished) {
        lock.release().catch(() => {});
      } else {
        wakeLock = lock;
        lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      }
    } catch {
      // 지원 안 함·배터리 절약 모드 등: 조용히 넘어가요
    } finally {
      locking = false;
    }
  }

  function unlockScreen() {
    wantLock = false;
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  // 다른 앱에 다녀오면 화면 잠금이 풀려서 다시 요청해요
  const onVisible = () => { if (document.visibilityState === 'visible') lockScreen(); };
  document.addEventListener('visibilitychange', onVisible);

  // ---------- 재생 ----------
  function startPlayer(course) {
    const watchUrl = youtubeWatchUrl(course.id);
    el.innerHTML = `
      <section class="player-screen">
        <div class="player-frame">
          <div data-player></div>
          <button class="player-help" type="button" aria-label="재생 도움말" data-help-open>${icons.info}</button>
          <div class="player-fallback" data-fallback hidden>
            <p>앱 안에서 재생할 수 없는 영상이에요</p>
            <a class="btn btn--primary" href="${esc(watchUrl)}" target="_blank" rel="noopener" data-watch>유튜브에서 보기</a>
          </div>
        </div>
        <div class="player-side">
          <p class="player-name"><span aria-hidden="true">${esc(course.emoji)}</span> ${esc(course.name)}</p>
          <button class="btn btn--primary" type="button" data-finish>완료</button>
          <a class="link-btn link-btn--muted player-exit" href="#/course?v=${encodeURIComponent(course.id)}">나가기</a>
        </div>
      </section>
      ${helpSheetHtml()}`;

    const fallbackEl = el.querySelector('[data-fallback]');
    const showFallback = () => {
      if (disposed || finished) return;
      clearTimeout(apiTimer);
      player?.destroy();
      player = null;
      el.querySelector('[data-player]')?.remove();
      fallbackEl.hidden = false;
    };

    el.querySelector('[data-finish]').addEventListener('click', () => finish(course));
    // 유튜브에서 하고 돌아오면 프리미엄 모드처럼 "운동 끝났어요?" 화면으로 (app.js)
    el.querySelector('[data-watch]').addEventListener('click', () => rememberCourse(course.id));

    // ---------- 도움말 ----------
    const sheet = el.querySelector('[data-help]');
    const openBtn = el.querySelector('[data-help-open]');
    let playWhenClosed = false; // 도움말이 열린 채로 플레이어가 준비되면 닫을 때 재생
    const onKey = (e) => { if (e.key === 'Escape') closeHelp(); };
    function openHelp() {
      sheet.hidden = false;
      document.addEventListener('keydown', onKey);
      sheet.querySelector('button[data-help-close]').focus();
    }
    function closeHelp() {
      if (sheet.hidden) return;
      sheet.hidden = true;
      document.removeEventListener('keydown', onKey);
      openBtn.focus({ preventScroll: true });
      if (playWhenClosed) {
        playWhenClosed = false;
        try { player?.playVideo(); } catch { /* 플레이어 정리됨 */ }
      }
    }
    openBtn.addEventListener('click', openHelp);
    sheet.addEventListener('click', (e) => { if (e.target.closest('[data-help-close]')) closeHelp(); });
    cleanupHelp = () => document.removeEventListener('keydown', onKey);
    // 처음 한 번만 자동으로 (저장소를 못 읽으면 안 열어요: 매번 뜨는 것보다 나아서)
    if (localGet(HELP_SEEN_KEY) === null) {
      try {
        localStorage.setItem(HELP_SEEN_KEY, '1');
        openHelp();
      } catch { /* 저장 못 함 */ }
    }

    apiTimer = setTimeout(showFallback, API_TIMEOUT_MS);
    loadYouTubeApi().then((YT) => {
      if (disposed || finished || !fallbackEl.hidden) return;
      clearTimeout(apiTimer); // 스크립트만 제때 오면 영상이 느리게 떠도 기다려요
      player = new YT.Player(el.querySelector('[data-player]'), {
        videoId: course.id,
        playerVars: { playsinline: 1, rel: 0, fs: 1, origin: location.origin },
        events: {
          onReady: (e) => {
            if (!sheet.hidden) {
              playWhenClosed = true; // 도움말을 읽는 동안은 기다려요
              return;
            }
            e.target.playVideo(); // 아이폰은 자동 재생이 막혀 있어서, 안 되면 영상의 재생 버튼을 누르면 돼요
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              wantLock = true;
              lockScreen();
            } else if (e.data === YT.PlayerState.ENDED) {
              finish(course);
            }
          },
          // 2: 잘못된 ID, 5: 재생 오류, 100: 없는 영상, 101·150: 퍼가기 막힘, 153: 퍼가기 설정 문제
          onError: showFallback,
        },
      });
    }).catch((err) => {
      console.warn(err);
      showFallback();
    });
  }

  // ---------- 완료 ----------
  function finish(course) {
    if (finished || disposed) return;
    let sec = 0;
    try {
      sec = player?.getDuration?.() || 0;
    } catch { /* 플레이어가 아직 준비 전 */ }
    if (!sec && course.minutes) sec = course.minutes * 60;
    finished = true;
    clearTimeout(apiTimer);
    player?.destroy();
    player = null;
    unlockScreen();
    cleanupHelp?.();
    document.body.classList.remove(PLAYING_CLASS);
    renderDoneForm(course, Math.min(Math.round(sec / 10) * 10, MAX_MINUTES * 60));
    window.scrollTo(0, 0);
  }

  function renderDoneForm(course, sec) {
    el.innerHTML = `
      <div class="done-head">
        <span class="done-emoji" aria-hidden="true">${askDone ? '💪' : '🎉'}</span>
        <h1 class="page-title">${askDone ? '운동 끝났어요?' : '잘했어요!'}</h1>
        <p class="page-desc">${esc(course.name)}</p>
      </div>
      <form class="stack" novalidate>
        <div class="field">
          <span class="field-label">운동 시간</span>
          <span class="time-selects">
            <select class="input select" name="min" aria-label="분">${minuteOptions(Math.floor(sec / 60))}</select><span>분</span>
            <select class="input select" name="sec" aria-label="초">
              ${SECOND_OPTIONS.map((s) => `<option value="${s}"${s === sec % 60 ? ' selected' : ''}>${s}</option>`).join('')}
            </select><span>초</span>
          </span>
        </div>
        <label class="field">
          <span class="field-label">칼로리 (kcal, 선택)</span>
          <input class="input" name="calorie" type="number" step="any" min="0" inputmode="decimal" autocomplete="off">
        </label>
        <label class="field">
          <span class="field-label">오늘 한마디 (선택)</span>
          <input class="input" name="comment" type="text" maxlength="${COMMENT_MAX}" autocomplete="off" placeholder="친구들에게 보일 한 줄">
        </label>
        <p class="form-error" role="alert"></p>
        <button class="btn btn--primary" type="submit">저장</button>
        ${askDone
          ? `<a class="link-btn link-btn--muted done-skip" href="#/course?v=${encodeURIComponent(course.id)}">아직이에요</a>`
          : '<a class="link-btn link-btn--muted done-skip" href="#/workout">기록하지 않고 나가기</a>'}
      </form>`;

    const form = el.querySelector('form');
    const errorEl = form.querySelector('.form-error');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const total = (Number(form.min.value) || 0) * 60 + (Number(form.sec.value) || 0);
      if (!total) {
        errorEl.textContent = '운동 시간을 골라 주세요';
        return;
      }
      const calText = form.calorie.value.trim();
      const calorie = calText === '' ? null : Number(calText);
      if (calorie !== null && !(calorie >= 0)) {
        errorEl.textContent = '칼로리는 숫자로 적어 주세요';
        return;
      }
      const data = homeWorkoutData(course, todayStr(), total, calorie);
      withLoading(form.querySelector('[type=submit]'), async () => {
        try {
          await saveWorkout(ctx.user.uid, null, data, null, form.comment.value);
        } catch (error) {
          errorEl.textContent = errorMessage(error);
          return;
        }
        toast('기록했어요');
        location.replace('#/records');
      });
    });
  }

  findCourse(id).then((course) => {
    if (disposed) return;
    if (!course) {
      document.body.classList.remove(PLAYING_CLASS);
      notFound(el);
      return;
    }
    if (askDone) {
      // 유튜브 앱에서 돌아옴: 영상 길이를 모르니 코스 시간으로 채워요 (고칠 수 있음)
      finished = true;
      renderDoneForm(course, Math.min(Math.round((course.minutes || 0) * 6) * 10, MAX_MINUTES * 60));
      return;
    }
    startPlayer(course);
  }).catch((err) => {
    console.error('코스 불러오기 실패:', err);
    if (disposed) return;
    document.body.classList.remove(PLAYING_CLASS);
    el.innerHTML = '<p class="workout-empty">코스를 불러오지 못했어요</p>';
  });

  // 화면을 떠나면 (저장 안 했으면 기록은 남지 않아요)
  return () => {
    disposed = true;
    clearTimeout(apiTimer);
    try { player?.destroy(); } catch { /* 이미 정리됨 */ }
    player = null;
    unlockScreen();
    cleanupHelp?.();
    document.removeEventListener('visibilitychange', onVisible);
    document.body.classList.remove(PLAYING_CLASS);
  };
}
