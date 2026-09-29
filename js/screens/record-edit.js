// 운동 기록 입력/수정 화면 (#/record-edit?date=YYYY-MM-DD 새 기록, ?id=... 수정)
// 동작은 eatsylog의 운동 기록 모달과 같게 맞췄어요. 기록 하나 = 운동 블록(유산소/근력/기타) 여러 개.
// 입력값은 blockDraft에 문자열로 들고 있다가 저장할 때 숫자로 바꿔요.
// 입력할 때마다 다시 그리면 휴대폰 키보드가 닫혀서, 블록·종목을 추가/삭제할 때만 다시 그려요.
import {
  watchWorkouts, saveWorkout, putWorkoutFavorite, deleteWorkoutFavorite,
  workoutBlocksOf, workoutTotalSec, getExerciseNames, formatDateLabel, todayStr,
  blockFavs, exerciseFavs, findExerciseFav, findBlockFav, favSummary, summaryOf, COMMENT_MAX,
} from '../workout-data.js';
import { errorMessage } from '../auth.js';
import { esc, icons, toast, withLoading } from '../ui.js';

const BLOCK_TYPES = {
  cardio: { icon: icons.cardio, label: '유산소' },
  strength: { icon: icons.workout, label: '근력' },
  other: { icon: icons.sparkle, label: '기타' },
};
const SECOND_OPTIONS = [0, 10, 20, 30, 40, 50];
const BLOCK_MAX_MINUTES = 180;
const TOTAL_MAX_MINUTES = 300;

const strOf = (v) => (v === null || v === undefined ? '' : String(v));
const numOf = (v) => {
  const s = strOf(v).trim();
  return s === '' ? null : Number(s);
};

function newExercise() {
  return { name: '', sets: [{ kg: '', reps: '', sets: '' }] };
}

// 저장된 블록 → 편집용 초안. 초 선택이 10초 단위라, 딱 안 맞는 예전 값은 가까운 10초로 맞춰요
function blockToDraft(b) {
  const sec = Math.round((b.durationSec || 0) / 10) * 10;
  return {
    type: BLOCK_TYPES[b.type] ? b.type : 'other',
    name: b.name || '', course: b.course || '', memo: b.memo || '',
    min: String(Math.floor(sec / 60)), sec: String(sec % 60),
    distanceKm: strOf(b.distanceKm), calorie: strOf(b.calorie), avgHr: strOf(b.avgHr),
    reps: strOf(b.reps), sets: strOf(b.sets),
    saveFav: false, // 유산소·기타: "즐겨찾기에 저장" 체크 (기록을 저장할 때 같이 저장)
    exercises: (b.exercises || []).map((ex) => ({
      name: ex.name || '',
      sets: (ex.sets && ex.sets.length ? ex.sets : [{}]).map((g) => ({ kg: strOf(g.kg), reps: strOf(g.reps), sets: strOf(g.sets) })),
    })),
  };
}

function newBlock(type) {
  const d = blockToDraft({ type });
  if (type === 'strength') d.exercises = [newExercise()];
  return d;
}

const draftSec = (d) => (Number(d.min) || 0) * 60 + (Number(d.sec) || 0);

function blockHasInput(d) {
  return draftSec(d) > 0 ||
    ['name', 'course', 'memo', 'distanceKm', 'calorie', 'avgHr', 'reps', 'sets'].some((f) => strOf(d[f]).trim() !== '') ||
    d.exercises.some((ex) => ex.name.trim() || ex.sets.some((g) => g.kg !== '' || g.reps !== '' || g.sets !== ''));
}

function collectExercises(exercises) {
  return exercises
    .map((ex) => ({
      name: ex.name.trim(),
      sets: ex.sets
        .map((g) => ({ kg: numOf(g.kg), reps: numOf(g.reps), sets: numOf(g.sets) }))
        .filter((g) => g.kg !== null || g.reps !== null || g.sets !== null),
    }))
    .filter((ex) => ex.name || ex.sets.length);
}

// 편집용 초안 → 저장할 블록 (유형에 맞는 칸만 남기고, 비운 칸은 null)
function collectBlock(d) {
  const base = { type: d.type, durationSec: draftSec(d) || null, calorie: numOf(d.calorie) };
  if (d.type === 'cardio') {
    return { ...base, name: d.name.trim(), course: d.course.trim(), distanceKm: numOf(d.distanceKm), avgHr: numOf(d.avgHr) };
  }
  if (d.type === 'strength') {
    return { ...base, exercises: collectExercises(d.exercises), avgHr: numOf(d.avgHr) };
  }
  return { ...base, name: d.name.trim(), reps: numOf(d.reps), sets: numOf(d.sets), memo: d.memo.trim() };
}

function blockFavData(d) {
  const b = collectBlock(d);
  const data = { kind: 'block', blockType: b.type, name: b.name, durationSec: b.durationSec };
  if (b.type === 'cardio') Object.assign(data, { course: b.course, distanceKm: b.distanceKm });
  else Object.assign(data, { reps: b.reps, sets: b.sets, memo: b.memo });
  return data;
}

function favToDraft(f) {
  return blockToDraft({
    type: f.blockType, name: f.name, course: f.course, durationSec: f.durationSec,
    distanceKm: f.distanceKm, reps: f.reps, sets: f.sets, memo: f.memo,
  });
}

function favToExercise(f) {
  return blockToDraft({ type: 'strength', exercises: [{ name: f.name, sets: f.sets }] }).exercises[0];
}

function minuteOptions(max, selected) {
  const sel = Number(selected) || 0;
  let html = '';
  for (let m = 0; m <= Math.max(max, sel); m++) html += `<option value="${m}"${m === sel ? ' selected' : ''}>${m}</option>`;
  return html;
}

function secondOptions(selected) {
  const sel = Number(selected) || 0;
  return SECOND_OPTIONS.map((s) => `<option value="${s}"${s === sel ? ' selected' : ''}>${s}</option>`).join('');
}

// ---------- 블록 그리기 ----------
const bind = (i, f) => `data-b="${i}" data-f="${f}"`;

function timeField(d, i) {
  return `
    <div class="field field--wide">
      <span class="field-label">시간</span>
      <span class="time-selects">
        <select class="input select" ${bind(i, 'min')} aria-label="분">${minuteOptions(BLOCK_MAX_MINUTES, d.min)}</select><span>분</span>
        <select class="input select" ${bind(i, 'sec')} aria-label="초">${secondOptions(d.sec)}</select><span>초</span>
      </span>
    </div>`;
}

function numField(d, i, f, label, step = 'any') {
  const mode = step === '1' ? 'numeric' : 'decimal';
  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <input class="input" type="number" step="${step}" inputmode="${mode}" value="${esc(d[f])}" ${bind(i, f)}>
    </label>`;
}

function textField(d, i, f, placeholder) {
  return `<input class="input" type="text" placeholder="${placeholder}" value="${esc(d[f])}" ${bind(i, f)} autocomplete="off">`;
}

// 유산소·기타 블록의 "즐겨찾기에 저장" 체크박스
function favCheck(d, i) {
  return `
    <label class="check-row">
      <input type="checkbox" ${bind(i, 'saveFav')} ${d.saveFav ? 'checked' : ''}>
      <span>즐겨찾기에 저장</span>
    </label>`;
}

function favRowHtml(f, pickAttrs, delAttrs) {
  const summary = favSummary(f);
  const icon = f.kind === 'exercise' ? '' : (BLOCK_TYPES[f.blockType]?.icon ?? '');
  return `
    <li>
      <button type="button" class="fav-pick" ${pickAttrs}>
        ${icon}<span><span class="fav-name">${esc(f.name || '(이름 없음)')}</span>${
          summary ? `<span class="fav-summary"> · ${esc(summary)}</span>` : ''}</span>
      </button>
      <button type="button" class="fav-del" ${delAttrs} aria-label="즐겨찾기 삭제">×</button>
    </li>`;
}

export function render(el, ctx) {
  const uid = ctx.user.uid;
  const { id: editingId, date: dateParam } = ctx.params;
  let store = null;
  let built = false;
  let date = dateParam && dateParam <= todayStr() ? dateParam : todayStr();
  let editingCreatedAt = null;
  let blockDraft = [];
  let totalTimeManual = false; // 합계를 직접 고쳤으면 자동 합계로 덮어쓰지 않아요
  let totalCalorieManual = false;

  el.innerHTML = '<p class="workout-empty">불러오는 중…</p>';

  const favs = () => store?.favs ?? [];

  // ---------- 화면 뼈대 ----------
  function build() {
    built = true;
    let w = null;
    if (editingId) {
      w = store.workouts.find((x) => x.id === editingId);
      if (!w) {
        toast('기록을 찾을 수 없어요');
        location.replace('#/records');
        return;
      }
      date = w.date;
      editingCreatedAt = w.createdAt || null;
      blockDraft = workoutBlocksOf(w).map(blockToDraft);
      totalTimeManual = !!(w.totalTimeManual ?? w.totalMinutesManual);
      totalCalorieManual = !!w.totalCalorieManual;
    }

    el.innerHTML = `
      <p class="record-date">${esc(formatDateLabel(date))} 운동</p>
      <form class="stack" novalidate>
        <input class="input" name="place" type="text" placeholder="장소 (선택)" autocomplete="off" value="${esc(w?.place ?? '')}">

        <div class="stack" data-blocks></div>

        <button type="button" class="btn btn--secondary" data-toggle-picker>${icons.plus}운동 블록 추가</button>
        <div class="card stack" data-picker hidden>
          <div class="chip-row">
            ${Object.entries(BLOCK_TYPES).map(([type, t]) => `
              <button type="button" class="chip" data-add-block="${type}">${t.icon}${t.label}</button>`).join('')}
          </div>
          <!-- 유산소·기타 즐겨찾기: 누르면 값이 채워진 블록이 추가돼요 (칼로리·심박수는 비어 있음) -->
          <div data-block-fav-section hidden>
            <p class="fav-title">${icons.star}즐겨찾기</p>
            <ul class="fav-list" data-block-fav-list></ul>
          </div>
        </div>

        <!-- 합계: 자동으로 더하지만 직접 고칠 수 있음 -->
        <div class="card stack total-card">
          <div class="field">
            <span class="field-label">총 운동시간</span>
            <span class="time-selects">
              <select class="input select" data-total="min" aria-label="총 운동시간 분">${minuteOptions(TOTAL_MAX_MINUTES, 0)}</select><span>분</span>
              <select class="input select" data-total="sec" aria-label="총 운동시간 초">${secondOptions(0)}</select><span>초</span>
            </span>
          </div>
          <label class="field">
            <span class="field-label">총 소모 칼로리 (kcal)</span>
            <input class="input" type="number" step="any" inputmode="decimal" data-total="calorie">
          </label>
          <button type="button" class="link-btn" data-total-reset hidden>자동 합계로 되돌리기</button>
        </div>

        <!-- 그룹 친구에게 요약과 같이 보이는 한마디 (요약 문서에만 저장) -->
        <label class="field">
          <span class="field-label">오늘 한마디 (선택)</span>
          <input class="input" name="comment" type="text" maxlength="${COMMENT_MAX}" autocomplete="off"
            placeholder="친구들에게 보일 한 줄" value="${esc(editingId ? summaryOf(editingId)?.comment ?? '' : '')}">
        </label>

        <p class="form-error" role="alert"></p>
        <button class="btn btn--primary" type="submit">저장</button>
      </form>`;

    const form = el.querySelector('form');
    const blocksEl = el.querySelector('[data-blocks]');
    const picker = el.querySelector('[data-picker]');
    const totalMin = el.querySelector('[data-total="min"]');
    const totalSecEl = el.querySelector('[data-total="sec"]');
    const totalCal = el.querySelector('[data-total="calorie"]');
    const resetBtn = el.querySelector('[data-total-reset]');
    const errorEl = form.querySelector('.form-error');

    // ---------- 블록 ----------
    function exFavButton(ex, i, k) {
      const saved = !!findExerciseFav(favs(), ex.name);
      return `<button type="button" class="ex-fav-btn${saved ? ' is-saved' : ''}" data-act="fav-ex" data-b="${i}" data-ex="${k}"
        aria-label="이 종목 즐겨찾기에 저장">${saved ? icons.starFill : icons.star}</button>`;
    }

    function exerciseFavListHtml(i) {
      return exerciseFavs(favs()).map((f) =>
        favRowHtml(f, `data-act="add-fav-ex" data-b="${i}" data-fav-id="${esc(f.id)}"`,
          `data-act="del-fav" data-b="${i}" data-fav-id="${esc(f.id)}"`)).join('');
    }

    function renderExercises(d, i) {
      return `
        <div class="exercise-list">${d.exercises.map((ex, k) => `
          <div class="exercise-item">
            <div class="exercise-head">
              <input class="input exercise-name-input" type="text" placeholder="종목 이름" value="${esc(ex.name)}"
                ${bind(i, 'name')} data-ex="${k}" autocomplete="off">
              ${exFavButton(ex, i, k)}
              <button type="button" class="link-btn link-btn--danger" data-act="remove-ex" data-b="${i}" data-ex="${k}">삭제</button>
            </div>
            <div class="set-row set-row--labels"><span>kg</span><span>횟수</span><span>세트</span><span></span></div>
            ${ex.sets.map((g, j) => `
              <div class="set-row">
                <input class="input" type="number" step="any" inputmode="decimal" value="${esc(g.kg)}" ${bind(i, 'kg')} data-ex="${k}" data-set="${j}" aria-label="무게">
                <input class="input" type="number" step="1" inputmode="numeric" value="${esc(g.reps)}" ${bind(i, 'reps')} data-ex="${k}" data-set="${j}" aria-label="횟수">
                <input class="input" type="number" step="1" inputmode="numeric" value="${esc(g.sets)}" ${bind(i, 'sets')} data-ex="${k}" data-set="${j}" aria-label="세트">
                <button type="button" class="set-remove" data-act="remove-set" data-b="${i}" data-ex="${k}" data-set="${j}"
                  aria-label="이 무게 삭제" ${ex.sets.length === 1 ? 'disabled' : ''}>×</button>
              </div>`).join('')}
            <button type="button" class="link-btn" data-act="add-set" data-b="${i}" data-ex="${k}">+ 무게 추가</button>
          </div>`).join('')}
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-act="add-ex" data-b="${i}">${icons.plus}종목 추가</button>
        <div class="ex-fav-section"${exerciseFavs(favs()).length ? '' : ' hidden'}>
          <p class="fav-title">${icons.star}즐겨찾기</p>
          <ul class="fav-list ex-fav-list" data-b="${i}">${exerciseFavListHtml(i)}</ul>
        </div>`;
    }

    function renderBlockBody(d, i) {
      if (d.type === 'cardio') {
        return `
          ${textField(d, i, 'name', '운동 종류')}
          ${timeField(d, i)}
          <textarea class="input textarea" rows="2" placeholder="코스명" ${bind(i, 'course')}>${esc(d.course)}</textarea>
          <div class="field-grid">
            ${numField(d, i, 'distanceKm', '거리 (km, 선택)')}
            ${numField(d, i, 'calorie', '소모 칼로리 (kcal)')}
            ${numField(d, i, 'avgHr', '평균 심박수 (선택)')}
          </div>
          ${favCheck(d, i)}`;
      }
      if (d.type === 'strength') {
        return `
          ${timeField(d, i)}
          ${renderExercises(d, i)}
          <div class="field-grid">
            ${numField(d, i, 'calorie', '소모 칼로리 (kcal)')}
            ${numField(d, i, 'avgHr', '평균 심박수 (선택)')}
          </div>`;
      }
      return `
        ${textField(d, i, 'name', '이름 (웜업, 스트레칭 등)')}
        ${timeField(d, i)}
        <div class="field-grid">
          ${numField(d, i, 'reps', '횟수 (선택)', '1')}
          ${numField(d, i, 'sets', '세트 (선택)', '1')}
          ${numField(d, i, 'calorie', '소모 칼로리 (선택)')}
        </div>
        <textarea class="input textarea" rows="2" placeholder="메모 (선택)" ${bind(i, 'memo')}>${esc(d.memo)}</textarea>
        ${favCheck(d, i)}`;
    }

    function renderBlocks() {
      hideSuggest();
      blocksEl.innerHTML = blockDraft.map((d, i) => `
        <div class="card stack workout-block" data-block-index="${i}">
          <div class="segmented" role="group" aria-label="블록 유형">${
            Object.entries(BLOCK_TYPES).map(([type, t]) => `
              <button type="button" class="segmented-item" aria-pressed="${d.type === type}"
                data-act="type" data-b="${i}" data-type="${type}">${t.icon}${t.label}</button>`).join('')
          }</div>
          ${renderBlockBody(d, i)}
          <div class="block-actions">
            <button type="button" class="link-btn link-btn--muted" data-act="up" data-b="${i}" ${i === 0 ? 'disabled' : ''}>↑ 위로</button>
            <button type="button" class="link-btn link-btn--muted" data-act="down" data-b="${i}" ${i === blockDraft.length - 1 ? 'disabled' : ''}>↓ 아래로</button>
            <button type="button" class="link-btn link-btn--danger" data-act="remove" data-b="${i}">블록 삭제</button>
          </div>
        </div>`).join('');
    }

    // ---------- 종목 이름 추천 ----------
    // 아이폰에서 datalist가 들쭉날쭉해서, 입력칸 바로 아래에 직접 목록을 띄워요.
    // 목록은 지금까지 저장한 종목 + 이 화면에서 이미 적은 종목에서 만들어요.
    const suggest = document.createElement('ul');
    suggest.className = 'exercise-suggest';
    let suggestInput = null;

    function hideSuggest() {
      suggest.remove();
      suggestInput = null;
    }

    function showSuggest(input) {
      const query = input.value.trim().toLowerCase();
      const drafted = blockDraft.flatMap((d) => d.exercises.map((ex) => ex.name.trim()));
      const names = [...new Set([...getExerciseNames(store.workouts), ...drafted])]
        .filter((n) => n && n.toLowerCase() !== query && n.toLowerCase().includes(query))
        .slice(0, 8);
      if (names.length === 0) { hideSuggest(); return; }
      suggest.innerHTML = names.map((n) => `<li><button type="button" data-suggest="${esc(n)}">${esc(n)}</button></li>`).join('');
      suggestInput = input;
      input.closest('.exercise-head').append(suggest);
    }

    // 누르는 순간 입력칸 포커스가 빠지지 않게 막아요 (빠지면 목록이 먼저 닫혀서 선택이 안 됨)
    suggest.addEventListener('pointerdown', (e) => e.preventDefault());
    suggest.addEventListener('mousedown', (e) => e.preventDefault());
    suggest.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-suggest]');
      if (!btn || !suggestInput) return;
      const input = suggestInput;
      input.value = btn.dataset.suggest;
      blockDraft[Number(input.dataset.b)].exercises[Number(input.dataset.ex)].name = input.value;
      hideSuggest();
      updateExFavButton(input);
      // 이름을 골랐으면 바로 첫 무게 칸으로
      input.closest('.exercise-item').querySelector('[data-f="kg"]')?.focus();
    });

    function updateExFavButton(input) {
      const btn = input.parentElement.querySelector('[data-act="fav-ex"]');
      if (!btn) return;
      const saved = !!findExerciseFav(favs(), input.value);
      btn.classList.toggle('is-saved', saved);
      btn.innerHTML = saved ? icons.starFill : icons.star;
    }

    // ---------- 입력 → blockDraft ----------
    function onBlockInput(e) {
      const t = e.target;
      if (t.dataset.b === undefined || t.dataset.f === undefined) return;
      const d = blockDraft[Number(t.dataset.b)];
      if (!d) return;
      if (t.dataset.ex !== undefined) {
        const ex = d.exercises[Number(t.dataset.ex)];
        if (t.dataset.set === undefined) ex.name = t.value;
        else ex.sets[Number(t.dataset.set)][t.dataset.f] = t.value;
      } else {
        d[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
      }
      if (t.classList.contains('exercise-name-input')) {
        if (e.type === 'input') showSuggest(t);
        updateExFavButton(t);
      }
      updateTotals();
    }
    blocksEl.addEventListener('input', onBlockInput);
    blocksEl.addEventListener('change', onBlockInput);
    blocksEl.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('exercise-name-input')) showSuggest(e.target);
    });
    blocksEl.addEventListener('focusout', (e) => {
      if (e.target === suggestInput) hideSuggest();
    });

    blocksEl.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      const i = Number(t.dataset.b);
      const d = blockDraft[i];
      if (!d) return;
      const k = Number(t.dataset.ex);
      // 즐겨찾기 저장/삭제는 Firestore만 바꾸고, 화면은 구독(refreshFavUI)이 알아서 고쳐요
      if (t.dataset.act === 'fav-ex') { saveExerciseFavorite(d.exercises[k]); return; }
      if (t.dataset.act === 'del-fav') { removeFavorite(t.dataset.favId); return; }
      let focusSelector = null;
      switch (t.dataset.act) {
        case 'add-fav-ex': {
          const fav = favs().find((f) => f.id === t.dataset.favId);
          if (!fav) return;
          const ex = favToExercise(fav);
          // 새 블록의 빈 종목 하나만 있으면 그 자리에 채우고, 아니면 맨 아래에 추가
          const only = d.exercises.length === 1 ? d.exercises[0] : null;
          const onlyEmpty = only && !only.name.trim() && only.sets.every((g) => g.kg === '' && g.reps === '' && g.sets === '');
          if (onlyEmpty) d.exercises[0] = ex;
          else d.exercises.push(ex);
          break;
        }
        case 'type':
          d.type = t.dataset.type;
          if (d.type === 'strength' && d.exercises.length === 0) d.exercises.push(newExercise());
          break;
        case 'up':
        case 'down': {
          const j = t.dataset.act === 'up' ? i - 1 : i + 1;
          [blockDraft[i], blockDraft[j]] = [blockDraft[j], blockDraft[i]];
          break;
        }
        case 'remove':
          if (blockHasInput(d) && !confirm('이 블록을 삭제할까요?')) return;
          blockDraft.splice(i, 1);
          if (blockDraft.length === 0) picker.hidden = false;
          break;
        case 'add-ex':
          d.exercises.push(newExercise());
          focusSelector = `[data-b="${i}"][data-f="name"][data-ex="${d.exercises.length - 1}"]`;
          break;
        case 'remove-ex':
          d.exercises.splice(k, 1);
          break;
        case 'add-set': {
          // 무게만 바꿔서 이어가는 경우가 많아서, 횟수·세트는 바로 위 값을 그대로 채워 줌
          const sets = d.exercises[k].sets;
          const last = sets[sets.length - 1] || {};
          sets.push({ kg: '', reps: last.reps ?? '', sets: last.sets ?? '' });
          focusSelector = `[data-b="${i}"][data-f="kg"][data-ex="${k}"][data-set="${sets.length - 1}"]`;
          break;
        }
        case 'remove-set':
          d.exercises[k].sets.splice(Number(t.dataset.set), 1);
          break;
        default:
          return;
      }
      renderBlocks();
      updateTotals();
      if (focusSelector) blocksEl.querySelector(focusSelector)?.focus();
    });

    function appendBlock(draft) {
      blockDraft.push(draft);
      picker.hidden = true;
      renderBlocks();
      updateTotals();
      blocksEl.querySelector(`[data-block-index="${blockDraft.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    el.querySelector('[data-toggle-picker]').addEventListener('click', () => { picker.hidden = !picker.hidden; });
    picker.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-block]');
      if (add) { appendBlock(newBlock(add.dataset.addBlock)); return; }
      const del = e.target.closest('[data-del-fav]');
      if (del) { removeFavorite(del.dataset.delFav); return; }
      // 유산소·기타 즐겨찾기를 누르면 그 값이 채워진 블록을 추가 (칼로리·심박수는 비어 있음)
      const pick = e.target.closest('[data-pick-fav]');
      const fav = pick && favs().find((f) => f.id === pick.dataset.pickFav);
      if (fav) appendBlock(favToDraft(fav));
    });

    // ---------- 즐겨찾기 ----------
    async function saveExerciseFavorite(ex) {
      if (!ex || !ex.name.trim()) {
        toast('종목 이름을 먼저 적어 주세요');
        return;
      }
      const [collected] = collectExercises([ex]);
      const existing = findExerciseFav(favs(), ex.name);
      try {
        await putWorkoutFavorite(uid, { kind: 'exercise', name: collected.name, sets: collected.sets }, existing);
        toast(existing ? '즐겨찾기를 지금 값으로 바꿨어요' : '즐겨찾기에 저장했어요');
      } catch (error) {
        toast(errorMessage(error));
      }
    }

    async function removeFavorite(id) {
      if (!id || !confirm('이 즐겨찾기를 삭제할까요?')) return;
      try {
        await deleteWorkoutFavorite(uid, id);
      } catch (error) {
        toast(errorMessage(error));
      }
    }

    // 즐겨찾기가 바뀌면 목록·★ 표시만 고쳐요 (블록 전체를 다시 그리면 입력 중인 키보드가 닫혀서)
    refreshFavUI = () => {
      const bf = blockFavs(favs());
      el.querySelector('[data-block-fav-section]').hidden = bf.length === 0;
      el.querySelector('[data-block-fav-list]').innerHTML = bf.map((f) =>
        favRowHtml(f, `data-pick-fav="${esc(f.id)}"`, `data-del-fav="${esc(f.id)}"`)).join('');

      const hasEx = exerciseFavs(favs()).length > 0;
      blocksEl.querySelectorAll('.ex-fav-list').forEach((ul) => {
        ul.innerHTML = exerciseFavListHtml(ul.dataset.b);
        ul.closest('.ex-fav-section').hidden = !hasEx;
      });
      blocksEl.querySelectorAll('.exercise-name-input').forEach(updateExFavButton);
    };

    // ---------- 합계 (자동으로 더하지만 직접 고칠 수 있음) ----------
    function autoTotals() {
      let sec = 0;
      let calorie = 0;
      blockDraft.forEach((d) => {
        sec += draftSec(d);
        calorie += Number(d.calorie) || 0;
      });
      return { sec, calorie: Math.round(calorie) };
    }

    function setTotalTime(sec) {
      const r = Math.round((sec || 0) / 10) * 10;
      const m = Math.floor(r / 60);
      if (m >= totalMin.options.length) totalMin.innerHTML = minuteOptions(m, m);
      totalMin.value = String(m);
      totalSecEl.value = String(r % 60);
    }

    const totalTimeSec = () => (Number(totalMin.value) || 0) * 60 + (Number(totalSecEl.value) || 0);

    function updateTotals() {
      const auto = autoTotals();
      if (!totalTimeManual) setTotalTime(auto.sec);
      if (!totalCalorieManual) totalCal.value = auto.calorie || '';
      resetBtn.hidden = !(totalTimeManual || totalCalorieManual);
    }

    [totalMin, totalSecEl].forEach((sel) => sel.addEventListener('change', () => {
      totalTimeManual = true;
      updateTotals();
    }));
    // 칼로리 합계를 직접 고치면 그 값을 유지 (비우면 다시 자동 계산)
    totalCal.addEventListener('input', () => {
      totalCalorieManual = totalCal.value.trim() !== '';
      updateTotals();
    });
    resetBtn.addEventListener('click', () => {
      totalTimeManual = false;
      totalCalorieManual = false;
      updateTotals();
    });

    // ---------- 저장 ----------
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      if (blockDraft.length === 0) {
        errorEl.textContent = '운동 블록을 하나 이상 추가해 주세요';
        return;
      }
      const favDrafts = blockDraft.filter((d) => d.saveFav && d.type !== 'strength');
      if (favDrafts.some((d) => !d.name.trim())) {
        errorEl.textContent = '즐겨찾기에 저장하려면 운동 종류나 이름을 적어 주세요';
        return;
      }
      const data = {
        date,
        place: form.place.value.trim(),
        blocks: blockDraft.map(collectBlock),
        totalSec: totalTimeSec() || null,
        totalCalorie: numOf(totalCal.value),
        totalTimeManual,
        totalCalorieManual,
      };
      withLoading(form.querySelector('[type=submit]'), async () => {
        try {
          await saveWorkout(uid, editingId, data, editingCreatedAt, form.comment.value);
        } catch (error) {
          errorEl.textContent = errorMessage(error);
          return;
        }
        // 운동 기록은 이미 저장됐으니, 즐겨찾기가 실패해도 기록은 그대로 두고 알려만 줘요
        try {
          for (const d of favDrafts) {
            const fav = blockFavData(d);
            await putWorkoutFavorite(uid, fav, findBlockFav(favs(), fav));
          }
          toast('저장했어요');
        } catch (error) {
          console.error(error);
          toast('운동 기록은 저장했지만, 즐겨찾기 저장에 실패했어요');
        }
        location.replace('#/records');
      });
    });

    // ---------- 처음 그리기 ----------
    renderBlocks();
    refreshFavUI();
    // 새 기록은 블록이 없으니 유형 고르는 버튼을 바로 펼쳐 둬요
    picker.hidden = blockDraft.length > 0;
    if (totalTimeManual) setTotalTime(workoutTotalSec(w) || 0);
    if (totalCalorieManual) totalCal.value = w.totalCalorie ?? '';
    updateTotals();
  }

  let refreshFavUI = () => {};

  return watchWorkouts(uid, (s) => {
    store = s;
    if (!built) build();
    else refreshFavUI();
  });
}
