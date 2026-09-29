import { esc, icons } from '../ui.js';

export function render(el, ctx) {
  el.innerHTML = `
    <!-- 4단계: 친구 소식 한 줄이 들어갈 자리 -->
    <div class="friend-news" id="friend-news" aria-live="polite">
      <span class="friend-news-dot"></span>
      <span>친구 소식이 여기에 떠요</span>
    </div>
    <p class="greeting" data-greeting>${esc(ctx.profile.nickname)}님, 오늘도 같이 움직여요</p>
    <h1 class="page-title">운동하기</h1>
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.workout}</span>
      <p class="empty-state-title">곧 만들어져요</p>
      <p class="empty-state-desc">영상 코스와 따라하기 코스가 여기에 생길 거예요.</p>
    </div>`;
}

// 닉네임이 바뀌면 인사말만 갱신
export function update(ctx) {
  const greeting = document.querySelector('[data-greeting]');
  if (greeting) greeting.textContent = `${ctx.profile.nickname}님, 오늘도 같이 움직여요`;
}
