// 유튜브 프리미엄 모드: 코스 [시작]을 누르면 유튜브 앱(없으면 웹)에서 열고, In2Size로 돌아오면 완료 화면을 띄워요.
// - 켜기/끄기는 기기마다 localStorage에 저장 (설정 화면)
// - 유튜브로 넘어가기 직전에 "하고 있는 코스"를 적어 두고, 돌아왔을 때 app.js가 takeReturnedCourse()로 한 번 꺼내요.
//   아이폰이 그사이 앱을 끄고 새로 띄워도 localStorage라 남아 있어요.
import { localGet, localSet } from './ui.js';
import { youtubeWatchUrl, courseQuery } from './courses.js';

const PREMIUM_KEY = 'in2size.youtubePremium';
const PENDING_KEY = 'in2size.pendingCourse';
const PENDING_MAX_MS = 6 * 60 * 60 * 1000; // 이보다 오래 지나서 돌아오면 완료 화면을 띄우지 않아요
const APP_WAIT_MS = 1500; // 이 시간 안에 화면이 안 가려지면 유튜브 앱이 없다고 봐요

const pageLoadedAt = Date.now();
let wentAway = false; // 코스를 연 뒤 이 화면이 한 번이라도 가려졌는지

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') wentAway = true;
});

export const isPremium = () => localGet(PREMIUM_KEY) === '1';
export const setPremium = (on) => localSet(PREMIUM_KEY, on ? '1' : null);

// noopener를 주면 성공해도 null이 와서, 열린 창에서 opener만 끊어요
function openWindow(url) {
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  return !!w;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 유튜브로 넘어가기 직전에 부름: 돌아오면 이 코스의 완료 화면을 띄워요
// q: 주소 뒤 값 (기본 코스 "v=영상ID", 올린 코스 "c=문서id")
export function rememberCourse(course) {
  localSet(PENDING_KEY, JSON.stringify({ q: courseQuery(course), at: Date.now() }));
  wentAway = false;
}

// 유튜브 앱에서 열기. 앱이 안 열렸으면(아이폰, 앱 없음) 웹으로.
// onNoApp: 새 창이 막혔을 때 부름 → 화면에 "유튜브 웹에서 열기" 버튼을 보여줘요
export function openInYouTube(course, onNoApp) {
  rememberCourse(course);
  const id = course.video;
  const webUrl = youtubeWatchUrl(id);
  if (!isIOS()) {
    // 안드로이드는 https 주소를 유튜브 앱으로 넘겨 줘요 (앱이 없으면 그대로 웹)
    if (!openWindow(webUrl)) onNoApp?.();
    return;
  }
  location.href = `youtube://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  setTimeout(() => {
    if (wentAway || document.visibilityState !== 'visible') return; // 앱이 열렸어요
    if (!openWindow(webUrl)) onNoApp?.();
  }, APP_WAIT_MS);
}

// 유튜브에 다녀왔으면 그 코스의 주소 뒤 값("v=.." / "c=..")을 한 번만 돌려줘요 (없으면 null)
export function takeReturnedCourse() {
  let pending = null;
  try {
    pending = JSON.parse(localGet(PENDING_KEY) || 'null');
  } catch { /* 틀린 값은 지움 */ }
  if (!pending) {
    localSet(PENDING_KEY, null);
    return null;
  }
  // 이 화면에서 연 거면 한 번 가려졌다가 돌아왔을 때만, 앱이 새로 떴으면 바로
  if (!wentAway && pending.at >= pageLoadedAt) return null;
  localSet(PENDING_KEY, null);
  if (!(Date.now() - pending.at < PENDING_MAX_MS)) return null;
  if (typeof pending.q === 'string' && /^[vc]=[^&]+$/.test(pending.q)) return pending.q;
  if (typeof pending.v === 'string') return `v=${encodeURIComponent(pending.v)}`; // 예전 형식
  return null;
}
