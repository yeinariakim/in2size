// 그룹 만들기 / 초대 코드로 들어가기
// 가입 직후(?welcome=1)에 한 번 자동으로 뜨고, 그 뒤로는 같이 탭·설정에서 들어와요 (?back=돌아갈 화면).
// 그룹 없이도 앱은 다 쓸 수 있어서 언제든 건너뛸 수 있어요. 한 사람은 그룹 최대 3개.
import { createGroup, joinGroup, groupIdsOf, MAX_GROUPS, GROUP_NAME_MAX } from '../group.js';
import { errorMessage } from '../auth.js';
import { withLoading, toast, esc, icons } from '../ui.js';

export function render(el, ctx) {
  const welcome = ctx.params.welcome === '1';
  const back = ctx.params.back || 'workout';
  const count = groupIdsOf(ctx.profile).length;
  const full = count >= MAX_GROUPS;

  const skipLink = `
    <div class="skip-row">
      <a class="link-btn link-btn--muted" href="#/${esc(back)}">${welcome ? '혼자 먼저 시작할게요' : '돌아가기'}</a>
      ${welcome ? '<p class="field-hint">그룹은 나중에 같이 탭이나 설정에서 만들 수 있어요</p>' : ''}
    </div>`;

  if (full) {
    el.innerHTML = `
      <h1 class="page-title">그룹이 벌써 ${MAX_GROUPS}개예요</h1>
      <p class="page-desc">그룹은 최대 ${MAX_GROUPS}개까지 들어갈 수 있어요. 새 그룹에 들어가려면 설정에서 그룹 하나를 나가 주세요.</p>
      ${skipLink}`;
    return;
  }

  el.innerHTML = `
    <h1 class="page-title">${esc(ctx.profile.nickname)}님,<br>함께할 친구를 연결해요</h1>
    <p class="page-desc">그룹은 최대 5명까지, 서로의 운동을 보며 응원할 수 있어요.${
      count ? ` 지금 ${count}/${MAX_GROUPS}개 그룹에 들어가 있어요.` : ''}</p>

    <div class="stack" style="margin-top:var(--sp-8)">
      <form class="card stack" novalidate data-form="create">
        <div class="choice-card choice-card--primary">
          <span class="choice-icon">${icons.plus}</span>
          <span>
            <span class="card-title" style="display:block">새 그룹 만들기</span>
            <span class="card-desc" style="display:block">이름을 정하면 초대 코드가 만들어져요</span>
          </span>
        </div>
        <input class="input" name="name" type="text" autocomplete="off" maxlength="${GROUP_NAME_MAX}" placeholder="그룹 이름 (예: 운동 메이트)" aria-label="그룹 이름">
        <p class="form-error" role="alert"></p>
        <button class="btn btn--primary" type="submit">만들기</button>
      </form>

      <p class="divider-text">또는</p>

      <form class="card stack" novalidate data-form="join">
        <div class="choice-card">
          <span class="choice-icon">${icons.key}</span>
          <span>
            <span class="card-title" style="display:block">초대 코드로 들어가기</span>
            <span class="card-desc" style="display:block">친구에게 받은 코드를 입력해요</span>
          </span>
        </div>
        <input class="input input--code" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6글자 코드" aria-label="초대 코드" maxlength="20">
        <p class="form-error" role="alert"></p>
        <button class="btn btn--secondary" type="submit">들어가기</button>
      </form>
    </div>
    ${skipLink}`;

  const createForm = el.querySelector('[data-form=create]');
  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = createForm.querySelector('.form-error');
    errorEl.textContent = '';
    withLoading(createForm.querySelector('[type=submit]'), async () => {
      try {
        const { groupId } = await createGroup(ctx.user.uid, createForm.name.value);
        location.replace(`#/group-created?id=${encodeURIComponent(groupId)}`);
      } catch (error) {
        errorEl.textContent = errorMessage(error);
      }
    });
  });

  const joinForm = el.querySelector('[data-form=join]');
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = joinForm.querySelector('.form-error');
    errorEl.textContent = '';
    withLoading(joinForm.querySelector('[type=submit]'), async () => {
      try {
        const { groupId } = await joinGroup(ctx.user.uid, joinForm.code.value);
        toast('그룹에 들어왔어요! 같이 시작해요');
        location.replace(`#/together?g=${encodeURIComponent(groupId)}`);
      } catch (error) {
        errorEl.textContent = errorMessage(error);
      }
    });
  });

  // 같이 탭·설정의 "초대 코드 입력"으로 들어오면 바로 입력칸에
  if (ctx.params.focus === 'code') joinForm.code.focus();
}
