import { esc, icons } from '../ui.js';
import { groupIdsOf } from '../group.js';
import { watchTogether, latestFriendSummary, cheersOf, nicknameOf, feedReady, unreadCheers, CHEERS } from '../together-data.js';
import { formatDuration, todayStr, addDays } from '../workout-data.js';
import { loadCourses, minutesText } from '../courses.js';

const ALL = ''; // 카테고리 칩 "전체"
let selectedCategory = ALL; // 다른 화면에 다녀와도 기억 (앱을 새로 열면 전체)

// "오늘" / "어제" / "9월 28일에"
function whenText(date) {
  if (date === todayStr()) return '오늘';
  if (date === addDays(todayStr(), -1)) return '어제';
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일에`;
}

// "지수님이 오늘 러닝·근력 51분 했어요 · 👏 1"
// 새 반응 표시가 있을 때는 자리가 좁아서 친구 기록의 반응 수(· 👏 1)는 빼요
function friendNewsHtml(s, withCheers = true) {
  const w = latestFriendSummary(s);
  if (!w) return feedReady(s) && s.groups.size ? '<span>아직 친구 소식이 없어요</span>' : '<span>친구 소식을 불러오는 중…</span>';
  const name = nicknameOf(s, w.owner) || '친구';
  const what = [(w.kinds || []).map((k) => k.name).join('·'), formatDuration(w.totalSec)].filter(Boolean).join(' ');
  const cheers = cheersOf(s, w);
  const counts = CHEERS.map((c) => [c.emoji, cheers.filter((x) => x.emoji === c.key).length])
    .filter(([, n]) => n).map(([e, n]) => `${e} ${n}`).join(' ');
  return `<span class="friend-news-text">${esc(name)}님이 ${whenText(w.date)} ${esc(what || '운동')} 했어요</span>
    ${withCheers && counts ? `<span class="friend-news-cheers">· ${counts}</span>` : ''}`;
}

export function render(el, ctx) {
  const hasGroup = groupIdsOf(ctx.profile).length > 0;
  el.innerHTML = `
    <!-- 친구 소식 한 줄: 내 모든 그룹 중 가장 최근 친구 기록 + 안 본 반응 수. 누르면 같이 탭 -->
    <a class="friend-news${hasGroup ? ' is-live' : ''}" id="friend-news" href="#/together" aria-live="polite">
      <span class="friend-news-dot"></span>
      <span class="friend-news-body" data-news>${hasGroup ? '친구 소식을 불러오는 중…' : '친구와 연결하면 소식이 여기에 떠요'}</span>
      <span class="friend-news-badge" data-news-badge hidden></span>
    </a>
    <p class="greeting" data-greeting>${esc(ctx.profile.nickname)}님, 오늘도 같이 움직여요</p>
    <h1 class="page-title">운동하기</h1>
    <!-- 영상 코스: 카테고리 칩 + 코스 카드 (courses.json) -->
    <nav class="course-chips" data-chips aria-label="카테고리 고르기"></nav>
    <ul class="course-list" data-courses><li class="workout-empty">코스를 불러오는 중…</li></ul>
    <a class="btn btn--secondary course-manual" href="#/record-edit?date=${todayStr()}">${icons.plus}직접 기록</a>`;

  renderCourses(el);
  if (!hasGroup) return undefined;
  const newsEl = el.querySelector('[data-news]');
  const badgeEl = el.querySelector('[data-news-badge]');
  return watchTogether((s) => {
    // 같이 탭에서 보면 읽음 처리(cheersSeenAt)되어 사라져요
    const unread = unreadCheers(s).length;
    newsEl.innerHTML = friendNewsHtml(s, unread === 0);
    badgeEl.hidden = unread === 0;
    badgeEl.textContent = `새 반응 ${unread}`;
    badgeEl.setAttribute('aria-label', `새 반응 ${unread}개`);
  });
}

// 첫 줄: 이모지 + 이름 (유튜버) / 둘째 줄: 카테고리 · N분 / 셋째 줄: 한 줄 설명 (있을 때만)
function courseCardHtml(c) {
  const meta = [c.category, minutesText(c)].filter(Boolean).join(' · ');
  return `
    <li>
      <a class="card course-card" href="#/course?v=${encodeURIComponent(c.id)}">
        <span class="course-card-body">
          <span class="course-card-name"><span aria-hidden="true">${esc(c.emoji)}</span> ${esc(c.name)}</span>
          ${meta ? `<span class="course-card-meta">${esc(meta)}</span>` : ''}
          ${c.desc ? `<span class="course-card-desc">${esc(c.desc)}</span>` : ''}
        </span>
        <span class="course-card-chevron">${icons.chevronRight}</span>
      </a>
    </li>`;
}

async function renderCourses(el) {
  const chipsEl = el.querySelector('[data-chips]');
  const listEl = el.querySelector('[data-courses]');
  let data;
  try {
    data = await loadCourses();
  } catch (err) {
    console.error('코스 불러오기 실패:', err);
    listEl.innerHTML = '<li class="workout-empty">코스를 불러오지 못했어요</li>';
    return;
  }
  if (!listEl.isConnected) return; // 그사이 다른 화면으로 이동함
  if (selectedCategory !== ALL && !data.categories.includes(selectedCategory)) selectedCategory = ALL;

  const draw = () => {
    chipsEl.innerHTML = [ALL, ...data.categories].map((c) => `
      <button type="button" class="chip course-chip" data-category="${esc(c)}"
        aria-pressed="${c === selectedCategory}">${c === ALL ? '전체' : esc(c)}</button>`).join('');
    const list = data.courses.filter((c) => selectedCategory === ALL || c.category === selectedCategory);
    listEl.innerHTML = list.length ? list.map(courseCardHtml).join('') : '<li class="workout-empty">아직 코스가 없어요</li>';
  };
  draw();
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    selectedCategory = chip.dataset.category;
    draw();
  });
}

// 닉네임이 바뀌면 인사말만 갱신
export function update(ctx) {
  const greeting = document.querySelector('[data-greeting]');
  if (greeting) greeting.textContent = `${ctx.profile.nickname}님, 오늘도 같이 움직여요`;
}
