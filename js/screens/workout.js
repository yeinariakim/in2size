import { esc, icons, localGet, localSet } from '../ui.js';
import { groupIdsOf } from '../group.js';
import { watchTogether, latestFriendSummary, cheersOf, nicknameOf, feedReady, unreadCheers, CHEERS } from '../together-data.js';
import { formatDuration, todayStr, addDays } from '../workout-data.js';
import { loadCourses, minutesText, courseQuery } from '../courses.js';
import { watchCourses, uploaderText } from '../course-data.js';

const ALL = ''; // 카테고리 칩 "전체"
let selectedCategory = ALL; // 다른 화면에 다녀와도 기억 (앱을 새로 열면 전체). 두 칸에 같이 적용
const CLOSED_KEY = 'in2size.courseSectionsClosed'; // 접어 둔 칸 ["uploaded", "basic"]

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
    <!-- 영상 코스: 카테고리 칩(두 칸 모두에 적용) + 올린 코스(courses 컬렉션) + 기본 코스(courses.json) -->
    <nav class="course-chips" data-chips aria-label="카테고리 고르기"></nav>
    ${sectionHtml('uploaded', '올린 코스')}
    ${sectionHtml('basic', '기본 코스')}
    <div class="course-actions">
      <a class="btn btn--secondary" href="#/course-edit">${icons.plus}영상 추가</a>
      <a class="btn btn--secondary" href="#/record-edit?date=${todayStr()}">${icons.plus}직접 기록</a>
    </div>`;
  el.querySelector('[data-section=basic] [data-list]').innerHTML = '<li class="workout-empty">코스를 불러오는 중…</li>';

  const stopCourses = renderCourses(el, ctx);
  if (!hasGroup) return stopCourses;
  const newsEl = el.querySelector('[data-news]');
  const badgeEl = el.querySelector('[data-news-badge]');
  const stopNews = watchTogether((s) => {
    // 같이 탭에서 보면 읽음 처리(cheersSeenAt)되어 사라져요
    const unread = unreadCheers(s).length;
    newsEl.innerHTML = friendNewsHtml(s, unread === 0);
    badgeEl.hidden = unread === 0;
    badgeEl.textContent = `새 반응 ${unread}`;
    badgeEl.setAttribute('aria-label', `새 반응 ${unread}개`);
  });
  return () => {
    stopCourses();
    stopNews();
  };
}

// 첫 줄: 이모지 + 이름 (유튜버) / 둘째 줄: 카테고리 · N분 (올린 코스는 · 내가 올림) / 셋째 줄: 한 줄 설명 (있을 때만)
function courseCardHtml(c, uploader = '') {
  const meta = [c.category, minutesText(c)].filter(Boolean).join(' · ');
  return `
    <li>
      <a class="card course-card" href="#/course?${courseQuery(c)}">
        <span class="course-card-body">
          <span class="course-card-name"><span aria-hidden="true">${esc(c.emoji)}</span> ${esc(c.name)}</span>
          ${meta || uploader ? `<span class="course-card-meta">${esc(meta)}${uploader
            ? `<span class="course-card-uploader">${meta ? ' · ' : ''}${esc(uploader)}</span>` : ''}</span>` : ''}
          ${c.desc ? `<span class="course-card-desc">${esc(c.desc)}</span>` : ''}
        </span>
        <span class="course-card-chevron">${icons.chevronRight}</span>
      </a>
    </li>`;
}

// 칸 접힘 상태는 기기에 기억해요 (접은 칸 이름 목록)
function closedSections() {
  try {
    const v = JSON.parse(localGet(CLOSED_KEY) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

function sectionHtml(key, title) {
  const open = !closedSections().has(key);
  return `
    <section class="course-section${open ? ' is-open' : ''}" data-section="${key}"${key === 'uploaded' ? ' hidden' : ''}>
      <h2 class="course-section-head">
        <button class="course-section-toggle" type="button" aria-expanded="${open}" aria-controls="course-list-${key}">
          <span>${title} <span class="course-section-count" data-count></span></span>
          <span class="course-section-arrow" aria-hidden="true">${icons.chevronRight}</span>
        </button>
      </h2>
      <ul class="course-list" id="course-list-${key}" data-list${open ? '' : ' hidden'}></ul>
    </section>`;
}

// 내용이 같으면 다시 그리지 않아요 (누르는 순간 다시 그려져서 눌림이 씹히지 않게)
function setHtml(target, html) {
  if (target.dataset.html === html) return;
  target.dataset.html = html;
  target.innerHTML = html;
}

// 칩 [전체 | 카테고리들] + "올린 코스"(친구·내가 올린 것, 없으면 숨김) + "기본 코스"(courses.json)
function renderCourses(el, ctx) {
  const chipsEl = el.querySelector('[data-chips]');
  const uploadedEl = el.querySelector('[data-section=uploaded]');
  const basicEl = el.querySelector('[data-section=basic]');
  let data = null; // courses.json (못 불러오면 { error })
  let view = null; // 올린 코스

  const draw = () => {
    if (!data || !view) return;
    const basic = data.courses || [];
    const uploaded = view.courses;
    // 칩: courses.json 순서 + 올린 코스에만 있는 카테고리(기타 등)는 뒤에
    const categories = [...(data.categories || [])];
    uploaded.forEach((c) => { if (c.category && !categories.includes(c.category)) categories.push(c.category); });
    if (selectedCategory !== ALL && !categories.includes(selectedCategory)) selectedCategory = ALL;
    setHtml(chipsEl, [ALL, ...categories].map((c) => `
      <button type="button" class="chip course-chip" data-category="${esc(c)}"
        aria-pressed="${c === selectedCategory}">${c === ALL ? '전체' : esc(c)}</button>`).join(''));

    const pick = (list) => list.filter((c) => selectedCategory === ALL || c.category === selectedCategory);
    const fill = (section, list, cardOf, emptyText) => {
      section.querySelector('[data-count]').textContent = list.length;
      setHtml(section.querySelector('[data-list]'), list.length ? list.map(cardOf).join('') : `<li class="workout-empty">${emptyText}</li>`);
    };
    uploadedEl.hidden = uploaded.length === 0;
    fill(uploadedEl, pick(uploaded), (c) => courseCardHtml(c, uploaderText(view, c, ctx.user.uid)), '이 카테고리엔 올린 코스가 없어요');
    if (data.error) {
      basicEl.querySelector('[data-count]').textContent = '';
      setHtml(basicEl.querySelector('[data-list]'), '<li class="workout-empty">코스를 불러오지 못했어요</li>');
    } else {
      fill(basicEl, pick(basic), (c) => courseCardHtml(c), '아직 코스가 없어요');
    }
  };

  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    selectedCategory = chip.dataset.category;
    draw();
  });
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.course-section-toggle');
    if (!btn) return;
    const section = btn.closest('[data-section]');
    const open = !section.classList.contains('is-open');
    section.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    section.querySelector('[data-list]').hidden = !open;
    const closed = closedSections();
    if (open) closed.delete(section.dataset.section);
    else closed.add(section.dataset.section);
    localSet(CLOSED_KEY, closed.size ? JSON.stringify([...closed]) : null);
  });

  loadCourses().then((d) => { data = d; }, (err) => {
    console.error('코스 불러오기 실패:', err);
    data = { error: true };
  }).then(() => { if (el.isConnected) draw(); });

  return watchCourses((v) => {
    view = v;
    draw();
  });
}

// 닉네임이 바뀌면 인사말만 갱신
export function update(ctx) {
  const greeting = document.querySelector('[data-greeting]');
  if (greeting) greeting.textContent = `${ctx.profile.nickname}님, 오늘도 같이 움직여요`;
}
