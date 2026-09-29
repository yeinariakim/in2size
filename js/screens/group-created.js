// 새 그룹을 만든 직후: 초대 코드 보여주기
import { getGroup } from '../group.js';
import { copyText, esc, icons } from '../ui.js';

export function render(el, ctx) {
  el.innerHTML = `
    <h1 class="page-title">그룹이 생겼어요!</h1>
    <p class="page-desc">아래 코드를 친구에게 보내주세요. 친구는 가입 후 이 코드를 입력하면 들어올 수 있어요.</p>
    <div class="code-box" style="margin-top:var(--sp-8)">
      <span class="code-box-label">우리 그룹 초대 코드</span>
      <span class="code-box-code" data-code>····</span>
      <div class="row">
        <button class="btn btn--sm" type="button" data-action="copy">${icons.copy}복사</button>
        <button class="btn btn--sm" type="button" data-action="share" hidden>${icons.share}공유</button>
      </div>
    </div>
    <p class="field-hint" style="margin-top:var(--sp-4);text-align:center">코드는 설정에서 언제든 다시 볼 수 있어요</p>
    <div style="flex:1"></div>
    <button class="btn btn--primary" type="button" data-action="start" style="margin-top:var(--sp-8)">시작하기</button>`;

  const codeEl = el.querySelector('[data-code]');
  const shareBtn = el.querySelector('[data-action=share]');
  let code = '';

  getGroup(ctx.profile.groupId).then((group) => {
    code = group?.code ?? '';
    codeEl.textContent = code || '—';
  });

  el.querySelector('[data-action=copy]').addEventListener('click', () => code && copyText(code));

  if (navigator.share) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', () => {
      if (!code) return;
      navigator
        .share({
          title: 'In2Size',
          text: `In2Size에서 같이 운동해요! 초대 코드: ${code}`,
          url: new URL('./', location.href).href,
        })
        .catch(() => {}); // 공유 창을 닫은 경우
    });
  }

  el.querySelector('[data-action=start]').addEventListener('click', () => ctx.go('workout'));
}
