import { auth, db, doc, updateDoc, updateProfile } from '../firebase.js';
import { logOut, errorMessage, validateNickname, NICKNAME_MAX } from '../auth.js';
import {
  getGroups, getMembers, leaveGroup, renameGroup, groupIdsOf, groupNameOf,
  MAX_MEMBERS, MAX_GROUPS, GROUP_NAME_MAX,
} from '../group.js';
import { unshareGroup } from '../course-data.js';
import { withLoading, copyText, toast, esc, icons, groupConnectButtons } from '../ui.js';
import { isPremium, setPremium } from '../youtube-app.js';

export function render(el, ctx) {
  const ids = groupIdsOf(ctx.profile);
  el.innerHTML = `
    <h2 class="section-label">닉네임</h2>
    <form class="card stack" novalidate data-form="nickname">
      <div class="row">
        <input class="input" name="nickname" type="text" autocomplete="nickname" maxlength="${NICKNAME_MAX}" value="${esc(ctx.profile.nickname)}" aria-label="닉네임">
        <button class="btn btn--primary btn--sm" type="submit">저장</button>
      </div>
      <p class="form-error" role="alert"></p>
    </form>

    <h2 class="section-label">내 그룹 (${ids.length}/${MAX_GROUPS})</h2>
    <div class="stack" data-groups>
      ${ids.length ? ids.map(() => '<div class="card"><p class="card-desc" style="margin-top:0">불러오는 중…</p></div>').join('') : `
        <div class="card"><p class="card-desc" style="margin-top:0">아직 그룹이 없어요. 친구와 연결하면 서로의 운동을 볼 수 있어요.</p></div>`}
    </div>
    ${ids.length < MAX_GROUPS ? `<div style="margin-top:var(--sp-3)">${groupConnectButtons('settings')}</div>` : `
      <p class="field-hint" style="margin-top:var(--sp-2)">그룹은 최대 ${MAX_GROUPS}개까지 들어갈 수 있어요.</p>`}

    <h2 class="section-label">영상</h2>
    <div class="card">
      <label class="switch-row">
        <span class="switch-text">
          <span class="switch-title">유튜브 프리미엄 사용 중</span>
          <span class="card-desc">유튜브 앱에서 광고 없이 재생해요</span>
        </span>
        <input class="switch" type="checkbox" role="switch" data-premium${isPremium() ? ' checked' : ''}>
      </label>
    </div>

    <h2 class="section-label">계정</h2>
    <div class="card stack">
      <p class="card-desc" style="margin-top:0">${esc(ctx.user.email)}</p>
      <button class="btn btn--ghost" type="button" data-action="logout">로그아웃</button>
    </div>

    <p class="app-version">In2Size · Into Fitness. Into Shape. 2gether.</p>`;

  // ---------- 닉네임 수정 ----------
  const form = el.querySelector('[data-form=nickname]');
  const errorEl = form.querySelector('.form-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = form.nickname.value.trim();
    const problem = validateNickname(nickname);
    if (problem) {
      errorEl.textContent = problem;
      return;
    }
    if (nickname === ctx.profile.nickname) return;
    errorEl.textContent = '';
    withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        await updateDoc(doc(db, 'users', ctx.user.uid), { nickname });
        await updateProfile(auth.currentUser, { displayName: nickname });
        toast('닉네임을 바꿨어요');
        loadGroups(); // 멤버 목록의 내 이름도 갱신
      } catch (error) {
        errorEl.textContent = errorMessage(error);
      }
    });
  });

  // ---------- 그룹 ----------
  const groupsEl = el.querySelector('[data-groups]');
  let groups = [];
  let alive = true; // 화면을 떠난 뒤(로그아웃 등) 늦게 온 결과는 무시

  const openIds = new Set(); // 펼친 그룹. 화면에 들어올 때마다 전부 접힌 상태로 시작

  function groupCardHtml(g) {
    const open = openIds.has(g.id);
    const bodyId = `group-body-${esc(g.id)}`;
    return `
      <div class="card group-card${open ? ' is-open' : ''}" data-group="${esc(g.id)}">
        <button class="group-toggle" type="button" data-act="toggle" aria-expanded="${open}" aria-controls="${bodyId}">
          <span class="group-toggle-text">
            <span class="card-title group-card-name" data-name>${esc(groupNameOf(g))}</span>
            <span class="group-toggle-count">멤버 ${g.memberIds.length}/${MAX_MEMBERS}명</span>
          </span>
          <span class="group-toggle-arrow" aria-hidden="true">${icons.chevronRight}</span>
        </button>
        <div class="group-body" id="${bodyId}"${open ? '' : ' inert'}>
          <div class="group-body-inner stack">
            <div>
              <p class="card-desc" style="margin-top:0">초대 코드</p>
              <div class="row" style="margin-top:var(--sp-1)">
                <span class="code-inline">${esc(g.code || '—')}</span>
                <button class="btn btn--secondary btn--sm" type="button" data-act="copy">${icons.copy}복사</button>
              </div>
            </div>
            <div>
              <p class="card-desc" style="margin-top:0">멤버</p>
              <ul class="member-list" data-members></ul>
            </div>
            <div>
              <button class="link-btn" type="button" data-act="rename-toggle">이름 바꾸기</button>
              <form class="stack" novalidate data-form="rename" style="margin-top:var(--sp-2)" hidden>
                <div class="row">
                  <input class="input" name="name" type="text" autocomplete="off" maxlength="${GROUP_NAME_MAX}" value="${esc(g.name || '')}" placeholder="그룹 이름" aria-label="그룹 이름">
                  <button class="btn btn--primary btn--sm" type="submit">저장</button>
                </div>
                <p class="form-error" role="alert"></p>
              </form>
            </div>
            <button class="link-btn link-btn--danger group-leave" type="button" data-act="leave">그룹 나가기</button>
          </div>
        </div>
      </div>`;
  }

  async function loadGroups() {
    if (ids.length === 0) return;
    try {
      groups = await getGroups(ids);
      if (!alive) return;
      groupsEl.innerHTML = groups.map(groupCardHtml).join('');
      await Promise.all(groups.map(async (g) => {
        const members = await getMembers(g.memberIds);
        if (!alive) return;
        const list = groupsEl.querySelector(`[data-group="${CSS.escape(g.id)}"] [data-members]`);
        if (!list) return;
        list.innerHTML = members.map((m) => `
          <li class="member">
            <span class="member-avatar" aria-hidden="true">${esc([...m.nickname][0] ?? '?')}</span>
            <span>${esc(m.nickname)}</span>
            ${m.id === ctx.user.uid ? '<span class="member-me">나</span>' : ''}
          </li>`).join('');
      }));
    } catch (error) {
      if (alive) toast(errorMessage(error));
    }
  }
  loadGroups();

  groupsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('[data-group]');
    const group = groups.find((g) => g.id === card?.dataset.group);
    if (!group) return;
    switch (btn.dataset.act) {
      case 'toggle': {
        const open = !card.classList.contains('is-open');
        card.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        card.querySelector('.group-body').inert = !open;
        if (open) openIds.add(group.id);
        else openIds.delete(group.id);
        break;
      }
      case 'copy':
        if (group.code) copyText(group.code);
        break;
      case 'rename-toggle': {
        const f = card.querySelector('[data-form=rename]');
        f.hidden = !f.hidden;
        if (!f.hidden) f.name.focus();
        break;
      }
      case 'leave': {
        const last = group.memberIds.length <= 1;
        const message = last
          ? `'${groupNameOf(group)}'에서 나갈까요?\n마지막 멤버라서 나가면 그룹이 없어져요. 내 운동 기록은 그대로 남아요.`
          : `'${groupNameOf(group)}'에서 나갈까요?\n내 운동 기록은 그대로 남아요. 다시 들어오려면 초대 코드가 필요해요.`;
        if (!confirm(message)) return;
        withLoading(btn, async () => {
          try {
            await leaveGroup(ctx.user.uid, group.id);
            toast('그룹에서 나왔어요');
            // 내가 올린 코스에서 이 그룹 공유를 빼요 (실패해도 친구 화면엔 이미 안 보여요)
            unshareGroup(ctx.user.uid, group.id).catch((err) => console.warn('코스 공유 정리 실패:', err.code || err));
            // 내 그룹 목록이 바뀌면 app.js가 이 화면을 새로 그려요
          } catch (error) {
            toast(errorMessage(error));
          }
        });
        break;
      }
      default:
    }
  });

  groupsEl.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form=rename]');
    if (!f) return;
    e.preventDefault();
    const card = f.closest('[data-group]');
    const group = groups.find((g) => g.id === card.dataset.group);
    const err = f.querySelector('.form-error');
    err.textContent = '';
    withLoading(f.querySelector('[type=submit]'), async () => {
      try {
        await renameGroup(group.id, f.name.value);
        group.name = f.name.value.trim();
        card.querySelector('[data-name]').textContent = groupNameOf(group);
        f.hidden = true;
        toast('그룹 이름을 바꿨어요');
      } catch (error) {
        err.textContent = errorMessage(error);
      }
    });
  });

  // ---------- 유튜브 프리미엄 (이 기기에만 저장) ----------
  el.querySelector('[data-premium]').addEventListener('change', (e) => setPremium(e.target.checked));

  // ---------- 로그아웃 ----------
  const logoutBtn = el.querySelector('[data-action=logout]');
  logoutBtn.addEventListener('click', () => {
    if (!confirm('로그아웃할까요?')) return;
    withLoading(logoutBtn, () => logOut());
  });

  return () => { alive = false; };
}
