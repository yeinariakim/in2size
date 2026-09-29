// 같이 탭 (#/together = 전체, #/together?g=그룹id = 그룹 하나)
// 위에서부터: 새 반응 → 그룹 고르기 → (그룹 하나일 때만) 한 달 달력 → 피드
// 피드에는 요약만 보여요 (운동 종류·총 시간·칼로리·한마디). 무게·세트·심박수 같은 상세는 본인만.
import { groupIdsOf, groupNameOf, MAX_GROUPS } from '../group.js';
import {
  watchTogether, watchMonth, feedOf, feedReady, cheersOf, unreadCheers, summaryOfCheer, nicknameOf,
  toggleCheer, markCheersSeen, memberColors, kindsText, cheerEmoji, CHEERS,
} from '../together-data.js';
import { formatDateLabel, formatTimeCalorie, todayStr } from '../workout-data.js';
import { errorMessage } from '../auth.js';
import { esc, icons, toast, groupConnectButtons } from '../ui.js';

const FEED_MAX = 50;
let calMonth = todayStr().slice(0, 7); // 달력에서 보고 있는 달 ("YYYY-MM"), 다른 탭에 다녀와도 기억

const initial = (name) => esc([...(name || '?')][0] ?? '?');

export function render(el, ctx) {
  const uid = ctx.user.uid;
  const ids = groupIdsOf(ctx.profile);

  // 그룹이 없으면 친구 연결 안내
  if (ids.length === 0) {
    el.innerHTML = `
      <h1 class="page-title">같이</h1>
      <div class="card empty-state">
        <span class="empty-state-icon">${icons.together}</span>
        <p class="empty-state-title">친구와 연결해 보세요</p>
        <p class="empty-state-desc">그룹을 만들거나 초대 코드로 들어가면<br>서로의 운동을 보며 응원할 수 있어요.</p>
        <div class="empty-state-actions">${groupConnectButtons('together')}</div>
      </div>`;
    return;
  }

  const pick = ids.includes(ctx.params.g) ? ctx.params.g : null; // null = 전체
  if (calMonth > todayStr().slice(0, 7)) calMonth = todayStr().slice(0, 7);

  el.innerHTML = `
    <h1 class="page-title">같이</h1>
    <section class="card cheer-news" data-news hidden>
      <p class="cheer-news-title">새 반응</p>
      <ul class="cheer-news-list" data-news-list></ul>
    </section>
    <nav class="group-chips" data-chips aria-label="그룹 고르기"></nav>
    ${pick ? `
      <section class="card calendar-card" aria-label="이번 달 운동한 날">
        <div class="cal-head">
          <button class="icon-btn" type="button" data-month-step="-1" aria-label="이전 달">${icons.chevronLeft}</button>
          <span class="cal-title" data-month-label></span>
          <button class="icon-btn" type="button" data-month-step="1" aria-label="다음 달">${icons.chevronRight}</button>
        </div>
        <div class="cal-grid" data-cal-grid></div>
        <ul class="cal-legend" data-legend></ul>
      </section>` : ''}
    <h2 class="section-title">소식</h2>
    <ul class="feed" data-feed><li class="workout-empty">불러오는 중…</li></ul>
    ${ids.length < MAX_GROUPS ? `
      <div class="skip-row"><a class="link-btn" href="#/group?back=together">${icons.plus}그룹 추가</a></div>` : ''}`;

  const chipsEl = el.querySelector('[data-chips]');
  const feedEl = el.querySelector('[data-feed]');
  const newsEl = el.querySelector('[data-news]');
  let store = null;
  let colors = new Map();
  let monthDays = new Map();
  let stopMonth = null;
  let monthKey = '';
  const pending = new Set(); // 누르는 중인 반응 (두 번 눌림 방지)
  const shownNews = new Map(); // 이 화면에서 보여준 새 반응 (읽음 처리 뒤에도 화면을 떠날 때까지 남김)
  const markTried = new Set();

  // 내용이 같으면 다시 그리지 않아요. 다른 데이터가 바뀔 때마다 피드를 새로 그리면
  // 그 순간 누른 반응 버튼이 사라져서 눌림이 씹힐 수 있어요.
  const lastHtml = new WeakMap();
  function setHtml(target, html) {
    if (lastHtml.get(target) === html) return;
    lastHtml.set(target, html);
    target.innerHTML = html;
  }

  const groupOf = (s) => (pick ? s.groups.get(pick) : null);
  const nameOf = (s, id) => (id === uid ? '나' : nicknameOf(s, id));

  // ---------- 그룹 고르기 ----------
  function renderChips(s) {
    const groups = ids.map((id) => s.groups.get(id)).filter(Boolean);
    setHtml(chipsEl, `
      <a class="chip group-chip" href="#/together" ${pick ? '' : 'aria-current="true"'}>전체</a>
      ${groups.map((g) => `
        <a class="chip group-chip" href="#/together?g=${encodeURIComponent(g.id)}" ${g.id === pick ? 'aria-current="true"' : ''}>${esc(groupNameOf(g))}</a>`).join('')}`);
  }

  // ---------- 새 반응 (보면 읽음) ----------
  function renderNews(s) {
    const unread = unreadCheers(s);
    unread.forEach((c) => shownNews.set(c.id, c));
    const fresh = unread.filter((c) => !markTried.has(c.id));
    if (fresh.length) {
      fresh.forEach((c) => markTried.add(c.id));
      markCheersSeen(uid).catch((e) => console.warn('읽음 표시 실패:', e));
    }
    const list = [...shownNews.values()].slice(0, 20);
    newsEl.hidden = list.length === 0;
    if (!list.length) return;
    el.querySelector('[data-news-list]').innerHTML = list.map((c) => {
      const summary = summaryOfCheer(s, c);
      const about = summary
        ? `${formatDateLabel(summary.date)} ${(summary.kinds || []).map((k) => k.name).join('·')}`
        : '';
      return `
        <li class="cheer-news-item">
          <span class="cheer-news-emoji" aria-hidden="true">${cheerEmoji(c.emoji)}</span>
          <span>
            <span class="cheer-news-text">${esc(nicknameOf(s, c.from) || '친구')}님이 ${cheerEmoji(c.emoji)}를 보냈어요</span>
            ${about ? `<span class="cheer-news-sub">${esc(about)} 기록</span>` : ''}
          </span>
        </li>`;
    }).join('');
  }

  // ---------- 피드 ----------
  function avatarHtml(owner, name) {
    const color = colors.get(owner);
    return `<span class="member-avatar${color ? ` member-color-${color}` : ''}" aria-hidden="true">${initial(name)}</span>`;
  }

  function cheersHtml(s, summary) {
    const cheers = cheersOf(s, summary);
    const mine = summary.owner === uid;
    const count = (key) => cheers.filter((c) => c.emoji === key).length;
    const pressed = (key) => cheers.some((c) => c.emoji === key && c.from === uid);

    // 내 기록: 받은 반응만 보여주고 누를 수 없음
    const buttons = mine
      ? CHEERS.filter((c) => count(c.key)).map((c) => `
          <span class="cheer-chip">${c.emoji}<span>${count(c.key)}</span></span>`).join('')
      : CHEERS.map((c) => `
          <button type="button" class="cheer-btn" aria-pressed="${pressed(c.key)}"
            data-cheer="${c.key}" data-owner="${esc(summary.owner)}" data-wid="${esc(summary.id)}"
            aria-label="${c.emoji} 응원${pressed(c.key) ? ' 취소' : ''}">${c.emoji}${count(c.key) ? `<span>${count(c.key)}</span>` : ''}</button>`).join('');

    // 누가 눌렀는지: "지수 👏🔥 · 민호 💪"
    const byPerson = new Map();
    cheers.forEach((c) => byPerson.set(c.from, (byPerson.get(c.from) || '') + cheerEmoji(c.emoji)));
    // 나와 그룹이 안 겹치는 사람(친구의 다른 그룹 멤버)은 이름을 읽을 수 없어서 자물쇠로
    const who = [...byPerson].map(([from, emojis]) => {
      const name = nameOf(s, from);
      return name ? `${esc(name)} ${emojis}`
        : `<span class="cheer-who-lock" role="img" aria-label="다른 그룹 친구">${icons.lock}</span> ${emojis}`;
    }).join(' · ');

    return `${buttons ? `<div class="cheer-row">${buttons}</div>` : ''}
      ${who ? `<p class="cheer-who">${who}</p>` : ''}`;
  }

  function renderFeed(s) {
    const group = groupOf(s);
    if (pick && !group) {
      setHtml(feedEl, '<li class="workout-empty">불러오는 중…</li>');
      return;
    }
    const uids = group ? group.memberIds : null;
    const items = feedOf(s, uids).slice(0, FEED_MAX);
    if (items.length === 0) {
      setHtml(feedEl, feedReady(s, uids)
        ? '<li class="workout-empty">아직 운동 소식이 없어요.<br>운동을 기록하면 여기에 함께 보여요.</li>'
        : '<li class="workout-empty">불러오는 중…</li>');
      return;
    }
    setHtml(feedEl, items.map((w) => {
      const name = nameOf(s, w.owner) || '친구';
      const stats = formatTimeCalorie(w.totalSec, w.totalCalorie);
      return `
        <li class="card feed-card">
          <div class="feed-head">
            ${avatarHtml(w.owner, w.owner === uid ? nicknameOf(s, uid) : name)}
            <span class="feed-name">${esc(w.owner === uid ? nicknameOf(s, uid) || '나' : name)}</span>
            ${w.owner === uid ? '<span class="member-me">나</span>' : ''}
            <span class="feed-date">· ${esc(formatDateLabel(w.date))}</span>
          </div>
          <p class="feed-kinds">${esc(kindsText(w.kinds)) || '운동'}</p>
          ${stats !== '-' ? `<p class="feed-stats">${esc(stats)}</p>` : ''}
          ${w.comment ? `<p class="feed-comment">“${esc(w.comment)}”</p>` : ''}
          ${cheersHtml(s, w)}
        </li>`;
    }).join(''));
  }

  feedEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cheer]');
    if (!btn) return;
    const { cheer, owner, wid } = btn.dataset;
    const key = `${wid}_${cheer}`;
    if (pending.has(key)) return;
    pending.add(key);
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on)); // 바로 보이게 (구독이 곧 제대로 다시 그려요)
    try {
      await toggleCheer(owner, wid, cheer, on);
    } catch (error) {
      toast(errorMessage(error));
      lastHtml.delete(feedEl); // 바꿔 둔 눌림 표시를 되돌리려고 새로 그림
      if (store) renderFeed(store);
    } finally {
      pending.delete(key);
    }
  });

  // ---------- 달력 (그룹 하나일 때만) ----------
  function monthRange() {
    const [y, m] = calMonth.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { y, m, last, from: `${calMonth}-01`, to: `${calMonth}-${String(last).padStart(2, '0')}` };
  }

  function subscribeMonth(group) {
    const key = `${calMonth}|${group.memberIds.join(',')}`;
    if (key === monthKey) return;
    monthKey = key;
    stopMonth?.();
    monthDays = new Map();
    const { from, to } = monthRange();
    stopMonth = watchMonth(group.memberIds, from, to, (days) => {
      monthDays = days;
      renderCalendar();
    });
  }

  function renderCalendar() {
    if (!pick || !store) return;
    const group = groupOf(store);
    if (!group) return;
    const { y, m, last } = monthRange();
    const today = todayStr();
    el.querySelector('[data-month-label]').textContent = `${y}년 ${m}월`;
    el.querySelector('[data-month-step="1"]').disabled = calMonth >= today.slice(0, 7);

    const startDow = new Date(y, m - 1, 1).getDay();
    const cells = ['일', '월', '화', '수', '목', '금', '토'].map((d) => `<span class="cal-dow">${d}</span>`);
    for (let i = 0; i < startDow; i++) cells.push('<span class="cal-day is-blank"></span>');
    for (let d = 1; d <= last; d++) {
      const date = `${calMonth}-${String(d).padStart(2, '0')}`;
      const who = monthDays.get(date);
      const dots = who ? group.memberIds.filter((id) => who.has(id))
        .map((id) => `<span class="member-dot member-color-${colors.get(id)}"></span>`).join('') : '';
      const names = who ? group.memberIds.filter((id) => who.has(id)).map((id) => nameOf(store, id) || '친구').join(', ') : '';
      cells.push(`
        <span class="cal-day${date === today ? ' is-today' : ''}${date > today ? ' is-future' : ''}"
          ${names ? `aria-label="${d}일: ${esc(names)}"` : ''}>
          <span class="cal-num">${d}</span><span class="cal-dots">${dots}</span>
        </span>`);
    }
    el.querySelector('[data-cal-grid]').innerHTML = cells.join('');
  }

  function renderLegend(s, group) {
    el.querySelector('[data-legend]').innerHTML = group.memberIds.map((id) => `
      <li><span class="member-dot member-color-${colors.get(id)}"></span>${esc(nameOf(s, id) || '친구')}</li>`).join('');
  }

  if (pick) {
    el.querySelectorAll('[data-month-step]').forEach((btn) => btn.addEventListener('click', () => {
      const { y, m } = monthRange();
      const d = new Date(y, m - 1 + Number(btn.dataset.monthStep), 1);
      const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (next > todayStr().slice(0, 7)) return;
      calMonth = next;
      if (store && groupOf(store)) subscribeMonth(groupOf(store));
      renderCalendar();
    }));
  }

  // ---------- 그리기 ----------
  const stop = watchTogether((s) => {
    store = s;
    const group = groupOf(s);
    colors = group ? memberColors(group) : new Map();
    renderChips(s);
    renderNews(s);
    if (group) {
      subscribeMonth(group);
      renderLegend(s, group);
      renderCalendar();
    }
    renderFeed(s);
  });

  return () => {
    stop();
    stopMonth?.();
  };
}
