// 내 기록 탭: 날짜 이동 → 그날 운동 기록 목록 → 기록 추가 → 무게 추이
import {
  watchWorkouts, deleteWorkout, workoutsOn, workoutSummaryRows, strengthExercisesOf, formatTimeCalorie,
  todayStr, addDays, formatDateLabel, progressRows, monthAgoChange, formatKgChange, formatAmount,
} from '../workout-data.js';
import { renderLineChart } from '../chart.js';
import { esc, icons, toast } from '../ui.js';
import { errorMessage } from '../auth.js';

// 기록 화면에 다녀와도 보던 날짜·종목을 기억 (앱을 새로 열면 오늘부터)
let selectedDate = todayStr();
let progressSelected = null; // 크게 보고 있는 종목 이름 (null이면 목록)

export const ROW_ICONS = { cardio: icons.cardio, strength: icons.workout, other: icons.sparkle };

export function render(el, ctx) {
  if (selectedDate > todayStr()) selectedDate = todayStr(); // 자정을 넘겨 앱을 계속 켜둔 경우

  el.innerHTML = `
    <h1 class="page-title">내 기록</h1>
    <div class="date-nav">
      <button class="icon-btn" type="button" data-date-step="-1" aria-label="전날">${icons.chevronLeft}</button>
      <label class="date-nav-label">
        <span data-date-label></span>
        <input class="date-nav-input" type="date" aria-label="날짜 고르기">
      </label>
      <button class="icon-btn" type="button" data-date-step="1" aria-label="다음 날">${icons.chevronRight}</button>
    </div>

    <ul class="workout-list" data-list></ul>
    <button class="btn btn--primary" type="button" data-add>${icons.plus}운동 기록 추가</button>

    <h2 class="section-title">무게 추이</h2>
    <div class="card progress-card" data-progress></div>`;

  const listEl = el.querySelector('[data-list]');
  const progressEl = el.querySelector('[data-progress]');
  const labelEl = el.querySelector('[data-date-label]');
  const dateInput = el.querySelector('.date-nav-input');
  const nextBtn = el.querySelector('[data-date-step="1"]');
  let store = null;

  function setDate(date) {
    if (!date || date > todayStr()) return; // 오늘 이후는 막아요
    selectedDate = date;
    labelEl.textContent = formatDateLabel(date);
    dateInput.value = date;
    dateInput.max = todayStr();
    nextBtn.disabled = date >= todayStr();
    renderList();
  }

  function renderList() {
    if (!store) {
      listEl.innerHTML = '<li class="workout-empty">불러오는 중…</li>';
      return;
    }
    const items = workoutsOn(store.workouts, selectedDate);
    if (items.length === 0) {
      listEl.innerHTML = '<li class="workout-empty">아직 운동 기록이 없어요</li>';
      return;
    }
    listEl.innerHTML = items.map((w) => {
      const exerciseNames = strengthExercisesOf(w).map((ex) => ex.name).filter(Boolean);
      const detail = [w.place, exerciseNames.join(', ')].filter(Boolean).join(' · ');
      return `
        <li class="card workout-card">
          <button class="workout-rows" type="button" data-edit="${esc(w.id)}">
            ${workoutSummaryRows(w).map((r) => `
              <span class="workout-row${r.type === 'total' ? ' is-total' : ''}">
                <span class="workout-row-label">${ROW_ICONS[r.type] ?? ''}<span>${esc(r.label)}</span></span>
                <span class="workout-row-value">${esc(formatTimeCalorie(r.sec, r.calorie))}</span>
              </span>`).join('')}
          </button>
          <div class="workout-foot">
            <button class="workout-detail" type="button" data-edit="${esc(w.id)}">${esc(detail)}</button>
            <button class="link-btn link-btn--danger" type="button" data-remove="${esc(w.id)}">삭제</button>
          </div>
        </li>`;
    }).join('');
  }

  function renderProgress() {
    if (!store) return;
    const rows = progressRows(store.workouts);
    if (progressSelected && !rows.some((r) => r.name === progressSelected)) progressSelected = null; // 기록이 다 지워졌으면 목록으로

    if (rows.length === 0) {
      progressEl.innerHTML = '<p class="workout-empty">아직 근력운동 기록이 없어요</p>';
      return;
    }

    if (!progressSelected) {
      progressEl.innerHTML = `
        <ul class="progress-list">
          ${rows.map(({ name, data }) => {
            const last = data[data.length - 1];
            const change = monthAgoChange(data);
            const chg = change && formatKgChange(change.diff);
            return `
              <li>
                <button class="progress-row" type="button" data-progress-name="${esc(name)}">
                  <span class="progress-row-name">${esc(name)}</span>
                  ${last
                    ? `<span class="progress-row-kg">${formatAmount(last.kg)}<small>kg</small></span>`
                    : '<span class="progress-row-none">무게 없음</span>'}
                  <span class="progress-row-change">${chg ? `<span class="kg-change ${chg.cls}">${chg.text}</span>` : ''}</span>
                  <span class="progress-row-chevron" aria-hidden="true">${icons.chevronRight}</span>
                </button>
              </li>`;
          }).join('')}
        </ul>`;
      return;
    }

    const { data } = rows.find((r) => r.name === progressSelected);
    progressEl.innerHTML = `
      <div class="progress-detail-head">
        <button class="link-btn link-btn--muted progress-back" type="button" data-progress-back>${icons.chevronLeft}전체 종목</button>
        <span class="progress-detail-name">${esc(progressSelected)}</span>
      </div>
      <div class="chart-wrap" data-chart></div>
      <p class="progress-summary">${esc(progressSummary(data))}</p>`;
    renderLineChart(progressEl.querySelector('[data-chart]'),
      data.map((d) => ({ label: d.date.slice(5).replace('-', '/'), value: d.kg })),
      { unit: 'kg', ariaLabel: `${progressSelected} 날짜별 최고 무게` });
  }

  // 날짜 이동
  el.querySelectorAll('[data-date-step]').forEach((btn) =>
    btn.addEventListener('click', () => setDate(addDays(selectedDate, Number(btn.dataset.dateStep)))));
  dateInput.addEventListener('change', () => setDate(dateInput.value));

  el.querySelector('[data-add]').addEventListener('click', () => ctx.go(`record-edit?date=${selectedDate}`));

  listEl.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      ctx.go(`record-edit?id=${encodeURIComponent(edit.dataset.edit)}`);
      return;
    }
    const remove = e.target.closest('[data-remove]');
    // 운동 기록은 적을 게 많아서, 실수로 지우지 않게 한 번 물어봐요
    if (!remove || !confirm('이 운동 기록을 삭제할까요?')) return;
    try {
      await deleteWorkout(ctx.user.uid, remove.dataset.remove);
      toast('삭제했어요');
    } catch (error) {
      toast(errorMessage(error));
    }
  });

  progressEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-progress-back]')) {
      progressSelected = null;
      renderProgress();
      return;
    }
    const row = e.target.closest('[data-progress-name]');
    if (!row) return;
    progressSelected = row.dataset.progressName;
    renderProgress();
  });

  setDate(selectedDate);
  const stop = watchWorkouts(ctx.user.uid, (s) => {
    store = s;
    renderList();
    renderProgress();
  });
  return stop;
}

// "처음 60kg → 최근 70kg (+10kg)\n한 달 전(08/28) 대비 +5kg"
function progressSummary(data) {
  const md = (date) => date.slice(5).replace('-', '/');
  if (data.length === 0) return '무게를 적은 기록이 아직 없어요';
  if (data.length === 1) return `${md(data[0].date)} 최고 ${formatAmount(data[0].kg)}kg`;
  const first = data[0].kg;
  const last = data[data.length - 1].kg;
  const diff = Math.round((last - first) * 10) / 10;
  const change = monthAgoChange(data);
  // 새로 시작한 운동(fromStart)은 목록의 변화량이 곧 "처음 대비"라서, 첫 줄에 시작 날짜만 붙여요
  return `${change.fromStart ? `시작(${md(data[0].date)})` : '처음'} ${formatAmount(first)}kg → 최근 ${formatAmount(last)}kg`
    + (diff > 0 ? ` (+${formatAmount(diff)}kg)` : diff < 0 ? ` (${formatAmount(diff)}kg)` : '')
    + (change.fromStart ? '' : `\n한 달 전(${md(change.baseDate)}) 대비 ${formatKgChange(change.diff).text}`);
}
