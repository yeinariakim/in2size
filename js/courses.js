// 영상 코스: courses.json 읽기 + 완료 기록 만들기
// courses.json은 GitHub에서 직접 고치는 파일이라, 칸이 조금 틀려도 앱이 죽지 않게 읽어요.
//   categories: 칩 순서 (["스트레칭", "전신", ...])
//   courses: [{ emoji, name, category, desc, youtube(영상 ID 또는 주소), minutes(대략 시간, 없으면 null) }]
// 코스 id는 따로 없고 유튜브 영상 ID를 주소에 써요 (#/course?v=영상ID).

export const HOME_WORKOUT_NAME = '홈트'; // 저장할 때 블록 이름 (피드에 "🏠 홈트 32분")

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// "VFyBl2hYKH8", "https://youtu.be/VFyBl2hYKH8", "https://www.youtube.com/watch?v=VFyBl2hYKH8" 모두 받아요
export function youtubeIdOf(value) {
  const s = String(value ?? '').trim();
  if (ID_RE.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

function normalize(data) {
  const courses = [];
  const seen = new Set();
  (Array.isArray(data?.courses) ? data.courses : []).forEach((c, i) => {
    const id = youtubeIdOf(c?.youtube);
    const name = String(c?.name ?? '').trim();
    if (!id || !name || seen.has(id)) {
      console.warn(`courses.json ${i + 1}번째 코스를 건너뜀 (이름·영상 ID가 없거나 겹침)`, c);
      return;
    }
    seen.add(id);
    const minutes = Number(c.minutes);
    courses.push({
      id,
      emoji: String(c.emoji ?? '').trim() || '▶️',
      name,
      category: String(c.category ?? '').trim(),
      desc: String(c.desc ?? '').trim(),
      minutes: c.minutes !== null && c.minutes !== '' && minutes > 0 ? minutes : null,
    });
  });
  // 칩: categories 순서대로 + 목록에 없는 카테고리는 뒤에 붙임
  const categories = (Array.isArray(data?.categories) ? data.categories : [])
    .map((c) => String(c ?? '').trim()).filter(Boolean);
  courses.forEach((c) => {
    if (c.category && !categories.includes(c.category)) categories.push(c.category);
  });
  return { categories: [...new Set(categories)], courses };
}

let loading = null;

// 앱을 켜 둔 동안 한 번만 읽어요 (실패하면 다음에 다시 시도)
export function loadCourses() {
  loading ??= fetch('courses.json', { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`courses.json ${res.status}`);
      return res.json();
    })
    .then(normalize)
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

export async function findCourse(id) {
  const { courses } = await loadCourses();
  return courses.find((c) => c.id === id) || null;
}

// "30분" (시간은 이름이 아니라 여기서만 보여줘요)
export const minutesText = (c) => (c.minutes ? `${c.minutes}분` : '');

// 완료 기록: 기타(other) 블록 하나. 이름은 "홈트", 메모에 코스 이름.
// 필드는 기록 화면(record-edit.js의 collectBlock)이 만드는 기타 블록과 같아요 (eatsylog 구조)
export function homeWorkoutData(course, date, durationSec, calorie) {
  return {
    date,
    place: '',
    blocks: [{
      type: 'other',
      durationSec: durationSec || null,
      calorie,
      name: HOME_WORKOUT_NAME,
      reps: null,
      sets: null,
      memo: course.name,
    }],
    totalSec: durationSec || null,
    totalCalorie: calorie,
    totalTimeManual: false,
    totalCalorieManual: false,
  };
}
