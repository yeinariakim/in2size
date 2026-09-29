import { logIn, errorMessage } from '../auth.js';
import { withLoading } from '../ui.js';

export function render(el) {
  el.innerHTML = `
    <img class="auth-logo" src="assets/logo-full.png" alt="In2Size — Into Fitness. Into Shape. 2gether.">
    <form class="stack" novalidate>
      <label class="field">
        <span class="field-label">이메일</span>
        <input class="input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
      </label>
      <label class="field">
        <span class="field-label">비밀번호</span>
        <input class="input" name="password" type="password" autocomplete="current-password" placeholder="비밀번호" required>
      </label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">로그인</button>
      <a class="link-btn link-btn--muted" href="#/forgot" style="align-self:center">비밀번호를 잊으셨나요?</a>
    </form>
    <p class="auth-footer">처음이신가요? <a class="link-btn" href="#/signup">가입하기</a></p>`;

  const form = el.querySelector('form');
  const errorEl = form.querySelector('.form-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      errorEl.textContent = '이메일과 비밀번호를 입력해 주세요';
      return;
    }
    errorEl.textContent = '';
    withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        await logIn({ email, password });
        // 로그인되면 app.js가 알아서 다음 화면으로 보냅니다.
      } catch (error) {
        errorEl.textContent = errorMessage(error);
      }
    });
  });
}
