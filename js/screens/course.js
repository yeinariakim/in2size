// 영상 코스 상세 (#/course?v=유튜브ID 기본 코스 / ?c=문서id 올린 코스): 이름·설명·시간 + [시작]
// 유튜브 프리미엄 모드면 [시작]이 유튜브 앱을 열어요 (돌아오면 app.js가 완료 화면으로 보냄)
// 올린 코스: "내가 올림 / 지수님이 올림", 올린 사람에게만 [수정]
import { esc, icons } from '../ui.js';
import { minutesText, youtubeWatchUrl, youtubeThumbUrl, courseQuery } from '../courses.js';
import { findCourseByParams, watchCourses, uploaderText } from '../course-data.js';
import { isPremium, openInYouTube } from '../youtube-app.js';

export function render(el, ctx) {
  el.innerHTML = '<p class="workout-empty">코스를 불러오는 중…</p>';
  let stop = null;
  let disposed = false;

  findCourseByParams(ctx.params).then((c) => {
    if (disposed || !el.isConnected) return;
    if (!c) {
      el.innerHTML = `
        <div class="card empty-state">
          <span class="empty-state-icon">${icons.info}</span>
          <p class="empty-state-title">코스를 찾을 수 없어요</p>
          <a class="btn btn--secondary" href="#/workout">코스 목록으로</a>
        </div>`;
      return;
    }
    const meta = [c.category, minutesText(c)].filter(Boolean).join(' · ');
    const premium = isPremium();
    const mine = c.uploaded && c.ownerId === ctx.user.uid;
    el.innerHTML = `
      <div class="course-thumb">
        <img src="${esc(youtubeThumbUrl(c.video))}" alt="" loading="lazy">
        <span class="course-thumb-emoji" aria-hidden="true">${esc(c.emoji)}</span>
      </div>
      <h1 class="page-title course-title">${esc(c.name)}</h1>
      ${meta ? `<p class="course-meta">${esc(meta)}</p>` : ''}
      ${c.uploaded ? '<p class="course-uploader" data-uploader></p>' : ''}
      ${c.desc ? `<p class="page-desc">${esc(c.desc)}</p>` : ''}
      <a class="btn btn--primary course-start" href="#/course-play?${courseQuery(c)}">시작</a>
      <a class="btn btn--secondary course-web" href="${esc(youtubeWatchUrl(c.video))}" target="_blank" rel="noopener" data-web hidden>유튜브 웹에서 열기</a>
      <p class="field-hint course-hint">${premium
        ? '유튜브에서 운동하고 돌아오면 바로 기록할 수 있어요.'
        : '영상이 끝나거나 [완료]를 누르면 기록할 수 있어요.'}</p>
      ${mine ? `<a class="btn btn--secondary course-edit-btn" href="#/course-edit?id=${encodeURIComponent(c.id)}">수정</a>` : ''}`;
    if (premium) {
      const webBtn = el.querySelector('[data-web]');
      el.querySelector('.course-start').addEventListener('click', (e) => {
        e.preventDefault();
        // 유튜브 앱도 없고 새 창도 막히면, 직접 누를 수 있는 웹 버튼을 보여줘요
        openInYouTube(c, () => { webBtn.hidden = false; });
      });
    }
    // 썸네일을 못 불러오면 이모지만
    el.querySelector('.course-thumb img').addEventListener('error', (e) => e.target.remove());
    // 올린 사람 이름은 친구 정보가 늦게 올 수 있어서 따로 채워요
    const uploaderEl = el.querySelector('[data-uploader]');
    if (uploaderEl) stop = watchCourses((view) => { uploaderEl.textContent = uploaderText(view, c, ctx.user.uid); });
  }).catch((err) => {
    console.error('코스 불러오기 실패:', err);
    if (!disposed && el.isConnected) el.innerHTML = '<p class="workout-empty">코스를 불러오지 못했어요</p>';
  });

  return () => {
    disposed = true;
    stop?.();
  };
}
