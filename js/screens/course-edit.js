// 영상 코스 올리기 (#/course-edit) / 고치기 (#/course-edit?id=문서id, 올린 사람만)
// 유튜브 주소 → 이름·카테고리·설명·이모지 → 공유 범위("나만 보기" 또는 내 그룹들, 여러 개 가능)
// 썸네일은 영상 ID로 바로 보여주고, 영상 길이는 올린 사람이 처음 재생할 때 저장돼요 (course-play.js)
import { esc, icons, toast, withLoading } from '../ui.js';
import { errorMessage } from '../auth.js';
import { groupIdsOf, getGroups, groupNameOf } from '../group.js';
import { loadCourses, youtubeIdOf, youtubeThumbUrl } from '../courses.js';
import {
  watchCourses, findCourseByParams, saveUploadedCourse, deleteUploadedCourse,
  MAX_UPLOADS, COURSE_NAME_MAX, COURSE_DESC_MAX, OTHER_CATEGORY, COURSE_EMOJIS,
} from '../course-data.js';

function notFound(el, title) {
  el.innerHTML = `
    <div class="card empty-state">
      <span class="empty-state-icon">${icons.info}</span>
      <p class="empty-state-title">${title}</p>
      <a class="btn btn--secondary" href="#/workout">코스 목록으로</a>
    </div>`;
}

export function render(el, ctx) {
  const editId = ctx.params.id || null;
  const uid = ctx.user.uid;
  const myGroupIds = groupIdsOf(ctx.profile);
  let view = null; // 올린 코스 (겹치는 영상 안내·개수 제한)
  let basic = []; // courses.json 코스
  let disposed = false;
  el.innerHTML = '<p class="workout-empty">불러오는 중…</p>';

  const stopWatch = watchCourses((v) => { view = v; });

  Promise.all([
    loadCourses().catch(() => ({ categories: [], courses: [] })),
    editId ? findCourseByParams({ c: editId }) : Promise.resolve(null),
    getGroups(myGroupIds).catch(() => []),
  ]).then(([data, course, groups]) => {
    if (disposed) return;
    if (editId && (!course || course.ownerId !== uid)) {
      notFound(el, course ? '올린 사람만 고칠 수 있어요' : '코스를 찾을 수 없어요');
      return;
    }
    basic = data.courses;
    const categories = [...data.categories];
    if (!categories.includes(OTHER_CATEGORY)) categories.push(OTHER_CATEGORY);
    if (course?.category && !categories.includes(course.category)) categories.push(course.category);
    const emojis = course && !COURSE_EMOJIS.includes(course.emoji) ? [course.emoji, ...COURSE_EMOJIS] : COURSE_EMOJIS;
    const emoji = course?.emoji || COURSE_EMOJIS[0];
    // 그사이 나간 그룹은 목록에서 빠지고, 저장하면 공유도 풀려요
    const shared = new Set((course?.groupIds || []).filter((id) => myGroupIds.includes(id)));
    const groupList = myGroupIds.map((id) => groups.find((g) => g?.id === id)).filter(Boolean);
    drawForm({ course, categories, emojis, emoji, shared, groupList });
  }).catch((err) => {
    console.error('코스 불러오기 실패:', err);
    if (!disposed) el.innerHTML = '<p class="workout-empty">불러오지 못했어요</p>';
  });

  function drawForm({ course, categories, emojis, emoji, shared, groupList }) {
    el.innerHTML = `
      <h1 class="page-title">${course ? '영상 코스 고치기' : '영상 추가'}</h1>
      <p class="page-desc">유튜브 영상을 코스로 올려요. 친구들과 같이 볼 수도 있어요.</p>
      <form class="stack course-form" novalidate>
        <label class="field">
          <span class="field-label">유튜브 주소</span>
          <input class="input" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
            placeholder="https://youtu.be/..." value="${esc(course ? `https://youtu.be/${course.video}` : '')}">
          <span class="field-hint" data-url-hint>유튜브 앱에서 공유 → 링크 복사한 주소를 붙여 넣어 주세요</span>
        </label>
        <div class="course-thumb course-thumb--small" data-thumb hidden><img alt=""></div>

        <label class="field">
          <span class="field-label">이름</span>
          <input class="input" name="name" type="text" maxlength="${COURSE_NAME_MAX}" autocomplete="off"
            placeholder="예: 전신 유산소 (빅씨스)" value="${esc(course?.name || '')}">
          <span class="field-hint">운동 이름 (유튜버). 시간은 영상 길이로 자동으로 붙어요</span>
        </label>

        <fieldset class="field">
          <legend class="field-label">카테고리</legend>
          <div class="choice-chips">
            ${categories.map((c) => `
              <label class="choice-chip"><input type="radio" name="category" value="${esc(c)}"${c === course?.category ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('')}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend class="field-label">이모지</legend>
          <div class="emoji-choices">
            ${emojis.map((e) => `
              <label class="emoji-choice"><input type="radio" name="emoji" value="${esc(e)}"${e === emoji ? ' checked' : ''}><span>${esc(e)}</span></label>`).join('')}
          </div>
        </fieldset>

        <label class="field">
          <span class="field-label">한 줄 설명 (선택)</span>
          <input class="input" name="desc" type="text" maxlength="${COURSE_DESC_MAX}" autocomplete="off"
            placeholder="예: 쉽고 재밌는 유산소 전신" value="${esc(course?.desc || '')}">
        </label>

        <fieldset class="field">
          <legend class="field-label">누가 볼까요?</legend>
          <div class="share-choices">
            <label class="check-row"><input type="checkbox" name="private"${shared.size ? '' : ' checked'}>나만 보기</label>
            ${groupList.map((g) => `
              <label class="check-row"><input type="checkbox" name="group" value="${esc(g.id)}"${shared.has(g.id) ? ' checked' : ''}>${esc(groupNameOf(g))}</label>`).join('')}
          </div>
          <span class="field-hint">${groupList.length
            ? '그룹을 여러 개 고를 수 있어요. 고른 그룹 친구들 목록에 같이 보여요'
            : '그룹에 들어가면 친구들과 같이 볼 수 있어요'}</span>
        </fieldset>

        <p class="form-error" role="alert"></p>
        <button class="btn btn--primary" type="submit">${course ? '저장' : '올리기'}</button>
        ${course ? '<button class="link-btn link-btn--muted course-delete" type="button" data-delete>이 코스 지우기</button>' : ''}
      </form>`;

    const form = el.querySelector('form');
    const errorEl = form.querySelector('.form-error');
    const hintEl = form.querySelector('[data-url-hint]');
    const thumbEl = form.querySelector('[data-thumb]');
    const hintDefault = hintEl.textContent;

    // 주소를 넣으면 썸네일 미리보기 + 이미 목록에 있는 영상이면 알려줘요 (막지는 않아요)
    const checkUrl = () => {
      const video = youtubeIdOf(form.url.value);
      thumbEl.hidden = !video;
      if (video) {
        const img = thumbEl.querySelector('img');
        const src = youtubeThumbUrl(video);
        if (img.getAttribute('src') !== src) img.src = src;
      }
      const dup = video && [...basic, ...(view?.courses || [])].some((c) => c.video === video && c.id !== course?.id);
      hintEl.textContent = !form.url.value.trim() ? hintDefault
        : !video ? '유튜브 주소를 확인해 주세요'
          : dup ? '이미 목록에 있는 영상이에요. 그래도 올릴 수 있어요' : '영상을 찾았어요';
    };
    form.url.addEventListener('input', checkUrl);
    thumbEl.querySelector('img').addEventListener('error', () => { thumbEl.hidden = true; });
    checkUrl();

    // "나만 보기"와 그룹은 둘 중 하나: 그룹을 고르면 나만 보기가 풀리고, 나만 보기를 고르면 그룹이 풀려요
    form.addEventListener('change', (e) => {
      if (e.target.name === 'private' && e.target.checked) {
        form.querySelectorAll('[name=group]').forEach((b) => { b.checked = false; });
      } else if (e.target.name === 'group') {
        form.private.checked = !form.querySelector('[name=group]:checked');
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const video = youtubeIdOf(form.url.value);
      const name = form.name.value.trim();
      const category = form.querySelector('[name=category]:checked')?.value;
      const fail = (msg, input) => {
        errorEl.textContent = msg;
        input?.focus();
      };
      if (!video) return fail('유튜브 주소를 확인해 주세요', form.url);
      if (!name) return fail('이름을 적어 주세요', form.name);
      if (!category) return fail('카테고리를 골라 주세요');
      if (!course && view && view.mineCount >= MAX_UPLOADS) return fail(`코스는 ${MAX_UPLOADS}개까지 올릴 수 있어요`);
      const fields = {
        video,
        name: name.slice(0, COURSE_NAME_MAX),
        category,
        desc: form.desc.value.trim().slice(0, COURSE_DESC_MAX),
        emoji: form.querySelector('[name=emoji]:checked')?.value || COURSE_EMOJIS[0],
        groupIds: [...form.querySelectorAll('[name=group]:checked')].map((b) => b.value),
      };
      withLoading(form.querySelector('[type=submit]'), async () => {
        let id;
        try {
          id = await saveUploadedCourse(uid, course?.id || null, fields);
        } catch (error) {
          errorEl.textContent = errorMessage(error);
          return;
        }
        toast(course ? '저장했어요' : '올렸어요');
        location.replace(`#/course?c=${encodeURIComponent(id)}`);
      });
    });

    form.querySelector('[data-delete]')?.addEventListener('click', (e) => {
      if (!confirm('이 코스를 지울까요?\n이미 남긴 운동 기록은 그대로 남아요.')) return;
      withLoading(e.currentTarget, async () => {
        try {
          await deleteUploadedCourse(course.id);
        } catch (error) {
          errorEl.textContent = errorMessage(error);
          return;
        }
        toast('코스를 지웠어요');
        location.replace('#/workout');
      });
    });
  }

  return () => {
    disposed = true;
    stopWatch();
  };
}
