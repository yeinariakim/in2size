import { auth, db, doc, updateDoc, updateProfile } from '../firebase.js';
import { logOut, errorMessage, validateNickname, NICKNAME_MAX } from '../auth.js';
import { getGroup, getMembers, MAX_MEMBERS } from '../group.js';
import { withLoading, copyText, toast, esc, icons } from '../ui.js';

export function render(el, ctx) {
  el.innerHTML = `
    <h2 class="section-label">닉네임</h2>
    <form class="card stack" novalidate data-form="nickname">
      <div class="row">
        <input class="input" name="nickname" type="text" autocomplete="nickname" maxlength="${NICKNAME_MAX}" value="${esc(ctx.profile.nickname)}" aria-label="닉네임">
        <button class="btn btn--primary btn--sm" type="submit">저장</button>
      </div>
      <p class="form-error" role="alert"></p>
    </form>

    <h2 class="section-label">내 그룹</h2>
    <div class="card">
      <p class="card-desc" style="margin-top:0">초대 코드</p>
      <div class="row" style="margin-top:var(--sp-1)">
        <span class="code-inline" data-code>····</span>
        <button class="btn btn--secondary btn--sm" type="button" data-action="copy">${icons.copy}복사</button>
      </div>
      <p class="card-desc" style="margin-top:var(--sp-5)" data-count>멤버</p>
      <ul class="member-list" data-members></ul>
    </div>

    <h2 class="section-label">계정</h2>
    <div class="card stack">
      <p class="card-desc" style="margin-top:0">${esc(ctx.user.email)}</p>
      <button class="btn btn--ghost" type="button" data-action="logout">로그아웃</button>
    </div>

    <p class="app-version">In2Size · Into Fitness. Into Shape. 2gether.</p>`;

  // 닉네임 수정
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
        loadGroup(); // 멤버 목록의 내 이름도 갱신
      } catch (error) {
        errorEl.textContent = errorMessage(error);
      }
    });
  });

  // 그룹 정보
  const codeEl = el.querySelector('[data-code]');
  const countEl = el.querySelector('[data-count]');
  const listEl = el.querySelector('[data-members]');
  let code = '';

  async function loadGroup() {
    try {
      const group = await getGroup(ctx.profile.groupId);
      if (!group) return;
      code = group.code;
      codeEl.textContent = code;
      countEl.textContent = `멤버 ${group.memberIds.length}/${MAX_MEMBERS}명`;
      const members = await getMembers(group.memberIds);
      listEl.innerHTML = members
        .map((m) => `
          <li class="member">
            <span class="member-avatar" aria-hidden="true">${esc([...m.nickname][0] ?? '?')}</span>
            <span>${esc(m.nickname)}</span>
            ${m.id === ctx.user.uid ? '<span class="member-me">나</span>' : ''}
          </li>`)
        .join('');
    } catch (error) {
      toast(errorMessage(error));
    }
  }
  loadGroup();

  el.querySelector('[data-action=copy]').addEventListener('click', () => code && copyText(code));

  const logoutBtn = el.querySelector('[data-action=logout]');
  logoutBtn.addEventListener('click', () => {
    if (!confirm('로그아웃할까요?')) return;
    withLoading(logoutBtn, () => logOut());
  });
}
