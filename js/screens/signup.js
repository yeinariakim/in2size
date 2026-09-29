import { signUp, errorMessage, validateNickname, NICKNAME_MAX } from '../auth.js';
import { withLoading, icons } from '../ui.js';

export function render(el, ctx) {
  el.innerHTML = `
    <a class="back-link" href="#/login">${icons.back}로그인</a>
    <img class="auth-logo" src="assets/logo-full.png" alt="In2Size — Into Fitness. Into Shape. 2gether." style="margin-top:0">
    <form class="stack" novalidate>
      <label class="field">
        <span class="field-label">닉네임</span>
        <input class="input" name="nickname" type="text" autocomplete="nickname" maxlength="${NICKNAME_MAX}" placeholder="친구들에게 보일 이름" required>
      </label>
      <label class="field">
        <span class="field-label">이메일</span>
        <input class="input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
      </label>
      <p class="notice"><span class="notice-icon">${icons.info}</span><span>비밀번호를 잊었을 때 이 이메일로 재설정 링크가 가요. 실제 쓰는 이메일을 넣어주세요.</span></p>
      <label class="field">
        <span class="field-label">비밀번호</span>
        <input class="input" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="6자 이상" required>
      </label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">가입하기</button>
    </form>
    <p class="auth-footer">이미 계정이 있나요? <a class="link-btn" href="#/login">로그인</a></p>`;

  const form = el.querySelector('form');
  const errorEl = form.querySelector('.form-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = form.nickname.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const problem =
      validateNickname(nickname) ||
      (!email && '이메일을 입력해 주세요') ||
      (password.length < 6 && '비밀번호는 6자 이상으로 만들어 주세요');
    if (problem) {
      errorEl.textContent = problem;
      return;
    }
    errorEl.textContent = '';
    // 가입 직후 한 번만 그룹 선택 화면을 보여줘요 ("혼자 먼저 시작할게요"로 건너뛸 수 있음)
    ctx.nextRoute('group?welcome=1');
    withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        await signUp({ nickname, email, password });
      } catch (error) {
        ctx.nextRoute(null);
        errorEl.textContent = errorMessage(error);
      }
    });
  });
}
