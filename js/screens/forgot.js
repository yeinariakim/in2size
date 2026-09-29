import { sendReset, errorMessage } from '../auth.js';
import { withLoading, icons } from '../ui.js';

export function render(el) {
  el.innerHTML = `
    <a class="back-link" href="#/login">${icons.back}로그인</a>
    <h1 class="page-title">비밀번호 재설정</h1>
    <p class="page-desc">가입한 이메일을 적어주시면 새 비밀번호를 만들 수 있는 링크를 보내드려요.</p>
    <form class="stack" novalidate style="margin-top:var(--sp-8)">
      <label class="field">
        <span class="field-label">이메일</span>
        <input class="input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
      </label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">재설정 메일 보내기</button>
    </form>
    <div class="notice" hidden style="margin-top:var(--sp-5)">
      <span class="notice-icon">${icons.info}</span>
      <span>메일을 보냈어요. 메일함을 확인해 주세요. 안 보이면 스팸함도 한번 봐주세요.</span>
    </div>`;

  const form = el.querySelector('form');
  const errorEl = form.querySelector('.form-error');
  const doneEl = el.querySelector('.notice');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) {
      errorEl.textContent = '이메일을 입력해 주세요';
      return;
    }
    errorEl.textContent = '';
    doneEl.hidden = true;
    withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        await sendReset(email);
        doneEl.hidden = false;
      } catch (error) {
        errorEl.textContent = errorMessage(error);
      }
    });
  });
}
