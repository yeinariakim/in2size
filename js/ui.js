// 화면에서 같이 쓰는 작은 도우미들

// 사용자가 입력한 글자(닉네임 등)를 HTML에 넣기 전에 꼭 거칩니다.
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  // 한 프레임 쉬어야 처음 뜰 때도 애니메이션이 보입니다.
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2400);
}

// 버튼을 누르는 동안 로딩 표시 + 중복 클릭 방지
export async function withLoading(button, task) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="sr-only">처리 중</span>';
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API를 못 쓰는 환경(오래된 브라우저 등)용
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('복사했어요');
}

// 같이 탭·설정의 그룹 연결 버튼 (둘 다 #/group 화면으로, back=돌아올 화면)
export function groupConnectButtons(back = 'workout') {
  return `
    <div class="stack">
      <a class="btn btn--primary" href="#/group?back=${back}">${icons.plus}새 그룹 만들기</a>
      <a class="btn btn--secondary" href="#/group?focus=code&back=${back}">${icons.key}초대 코드 입력</a>
    </div>`;
}

export function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash || splash.classList.contains('is-hidden')) return;
  splash.classList.add('is-hidden');
  setTimeout(() => splash.remove(), 400);
}

// 선 아이콘 (24x24, currentColor)
const svg = (paths) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  workout: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>'),
  together: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  records: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  key: svg('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9z"/>'),
  cardio: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  chevronLeft: svg('<path d="M15 18l-6-6 6-6"/>'),
  chevronRight: svg('<path d="M9 18l6-6-6-6"/>'),
  star: svg('<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>'),
  starFill: svg('<path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>'),
};
