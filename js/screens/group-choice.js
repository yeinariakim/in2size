// 가입 후 그룹이 없을 때: 새 그룹 만들기 / 초대 코드로 들어가기
import { createGroup, joinGroup } from '../group.js';
import { errorMessage } from '../auth.js';
import { withLoading, toast, esc, icons } from '../ui.js';

export function render(el, ctx) {
  el.innerHTML = `
    <h1 class="page-title">${esc(ctx.profile.nickname)}님,<br>함께할 친구를 연결해요</h1>
    <p class="page-desc">그룹은 최대 5명까지, 서로의 운동을 보며 응원할 수 있어요.</p>

    <div class="stack" style="margin-top:var(--sp-8)">
      <button class="card choice-card choice-card--primary" type="button" data-action="create">
        <span class="choice-icon">${icons.plus}</span>
        <span>
          <span class="card-title" style="display:block">새 그룹 만들기</span>
          <span class="card-desc" style="display:block">초대 코드를 만들어 친구에게 보내요</span>
        </span>
      </button>
      <p class="form-error" role="alert" data-error="create"></p>

      <p class="divider-text">또는</p>

      <form class="card stack" novalidate>
        <div class="choice-card">
          <span class="choice-icon">${icons.key}</span>
          <span>
            <span class="card-title" style="display:block">초대 코드로 들어가기</span>
            <span class="card-desc" style="display:block">친구에게 받은 코드를 입력해요</span>
          </span>
        </div>
        <input class="input input--code" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6글자 코드" aria-label="초대 코드" maxlength="20">
        <p class="form-error" role="alert" data-error="join"></p>
        <button class="btn btn--secondary" type="submit">들어가기</button>
      </form>
    </div>`;

  const createBtn = el.querySelector('[data-action=create]');
  const createError = el.querySelector('[data-error=create]');
  createBtn.addEventListener('click', () => {
    createError.textContent = '';
    ctx.afterJoin('group-created'); // 그룹이 생기면 코드 안내 화면으로
    withLoading(createBtn, async () => {
      try {
        await createGroup(ctx.user.uid);
      } catch (error) {
        ctx.afterJoin(null);
        createError.textContent = errorMessage(error);
      }
    });
  });

  const form = el.querySelector('form');
  const joinError = el.querySelector('[data-error=join]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    joinError.textContent = '';
    withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        await joinGroup(ctx.user.uid, form.code.value);
        toast('그룹에 들어왔어요! 같이 시작해요');
      } catch (error) {
        joinError.textContent = errorMessage(error);
      }
    });
  });
}
