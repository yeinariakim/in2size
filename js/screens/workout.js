import { esc, icons } from '../ui.js';
import { groupIdsOf } from '../group.js';
import { watchTogether, latestFriendSummary, cheersOf, nicknameOf, feedReady, CHEERS } from '../together-data.js';
import { formatDuration, todayStr, addDays } from '../workout-data.js';

// "오늘" / "어제" / "9월 28일에"
function whenText(date) {
  if (date === todayStr()) return '오늘';
  if (date === addDays(todayStr(), -1)) return '어제';
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일에`;
}

// "지수님이 오늘 러닝·근력 51분 했어요 · 👏 1"
function friendNewsHtml(s) {
  const w = latestFriendSummary(s);
  if (!w) return feedReady(s) && s.groups.size ? '<span>아직 친구 소식이 없어요</span>' : '<span>친구 소식을 불러오는 중…</span>';
  const name = nicknameOf(s, w.owner) || '친구';
  const what = [(w.kinds || []).map((k) => k.name).join('·'), formatDuration(w.totalSec)].filter(Boolean).join(' ');
  const cheers = cheersOf(s, w);
  const counts = CHEERS.map((c) => [c.emoji, cheers.filter((x) => x.emoji === c.key).length])
    .filter(([, n]) => n).map(([e, n]) => `${e} ${n}`).join(' ');
  return `<span class="friend-news-text">${esc(name)}님이 ${whenText(w.date)} ${esc(what || '운동')} 했어요</span>
    ${counts ? `<span class="friend-news-cheers">· ${counts}</span>` : ''}`;
}

export function render(el, ctx) {
  const hasGroup = groupIdsOf(ctx.profile).length > 0;
  el.innerHTML = `
    <!-- 친구 소식 한 줄: 내 모든 그룹 중 가장 최근 친구 기록. 누르면 같이 탭 -->
    <a class="friend-news${hasGroup ? ' is-live' : ''}" id="friend-news" href="#/together" aria-live="polite">
      <span class="friend-news-dot"></span>
      <span class="friend-news-body" data-news>${hasGroup ? '친구 소식을 불러오는 중…' : '친구와 연결하면 소식이 여기에 떠요'}</span>
    </a>
    <p class="greeting" data-greeting>${esc(ctx.profile.nickname)}님, 오늘도 같이 움직여요</p>
    <h1 class="page-title">운동하기</h1>
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.workout}</span>
      <p class="empty-state-title">곧 만들어져요</p>
      <p class="empty-state-desc">영상 코스와 따라하기 코스가 여기에 생길 거예요.</p>
    </div>`;

  if (!hasGroup) return undefined;
  const newsEl = el.querySelector('[data-news]');
  return watchTogether((s) => { newsEl.innerHTML = friendNewsHtml(s); });
}

// 닉네임이 바뀌면 인사말만 갱신
export function update(ctx) {
  const greeting = document.querySelector('[data-greeting]');
  if (greeting) greeting.textContent = `${ctx.profile.nickname}님, 오늘도 같이 움직여요`;
}
