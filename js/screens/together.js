// 같이 탭: 그룹별로 보기 (#/together?g=그룹id). 그룹이 여러 개면 위쪽 칩으로 바꿔 봐요.
// 4단계에서 여기에 그룹 피드·응원·공유 달력이 들어가요.
import { getGroups, getMembers, groupIdsOf, groupNameOf, MAX_GROUPS, MAX_MEMBERS } from '../group.js';
import { errorMessage } from '../auth.js';
import { esc, icons, toast, groupConnectButtons } from '../ui.js';

const LAST_GROUP_KEY = 'in2size:lastGroup'; // 마지막으로 본 그룹 (이 기기에서만)

function readLastGroup() {
  try { return localStorage.getItem(LAST_GROUP_KEY); } catch { return null; }
}

function saveLastGroup(id) {
  try { localStorage.setItem(LAST_GROUP_KEY, id); } catch { /* 저장 못 해도 괜찮음 */ }
}

export function render(el, ctx) {
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

  const pick = [ctx.params.g, readLastGroup()].find((id) => ids.includes(id)) || ids[0];
  saveLastGroup(pick);

  el.innerHTML = `
    <h1 class="page-title">같이</h1>
    <div class="group-chips" data-chips ${ids.length > 1 ? '' : 'hidden'}></div>
    <div class="card stack group-card">
      <p class="card-title" data-group-name>&nbsp;</p>
      <ul class="member-row" data-members aria-label="멤버"></ul>
    </div>
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.together}</span>
      <p class="empty-state-title">곧 만들어져요</p>
      <p class="empty-state-desc">친구들의 운동 소식을 보고 응원을 보낼 수 있어요.</p>
    </div>
    ${ids.length < MAX_GROUPS ? `
      <div class="skip-row"><a class="link-btn" href="#/group?back=together">${icons.plus}그룹 추가</a></div>` : ''}`;

  let alive = true;
  (async () => {
    try {
      const groups = await getGroups(ids);
      if (!alive) return;
      el.querySelector('[data-chips]').innerHTML = groups.map((g) => `
        <a class="chip group-chip" href="#/together?g=${encodeURIComponent(g.id)}" ${g.id === pick ? 'aria-current="true"' : ''}>${esc(groupNameOf(g))}</a>`).join('');
      const group = groups.find((g) => g.id === pick);
      if (!group) return;
      el.querySelector('[data-group-name]').textContent = `${groupNameOf(group)} · ${group.memberIds.length}/${MAX_MEMBERS}명`;
      const members = await getMembers(group.memberIds);
      if (!alive) return;
      el.querySelector('[data-members]').innerHTML = members.map((m) => `
        <li class="member-chip">
          <span class="member-avatar" aria-hidden="true">${esc([...m.nickname][0] ?? '?')}</span>
          <span>${esc(m.nickname)}${m.id === ctx.user.uid ? ' <span class="member-me">나</span>' : ''}</span>
        </li>`).join('');
    } catch (error) {
      if (alive) toast(errorMessage(error));
    }
  })();

  return () => { alive = false; };
}
