import { icons } from '../ui.js';

export function render(el) {
  el.innerHTML = `
    <h1 class="page-title">같이</h1>
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.together}</span>
      <p class="empty-state-title">곧 만들어져요</p>
      <p class="empty-state-desc">친구들의 운동 소식을 보고 응원을 보낼 수 있어요.</p>
    </div>`;
}
