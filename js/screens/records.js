import { icons } from '../ui.js';

export function render(el) {
  el.innerHTML = `
    <h1 class="page-title">내 기록</h1>
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.records}</span>
      <p class="empty-state-title">곧 만들어져요</p>
      <p class="empty-state-desc">운동 기록과 무게 추이를 여기서 볼 수 있어요.</p>
    </div>`;
}
