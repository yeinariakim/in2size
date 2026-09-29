// 앱 시작점: 로그인 상태와 그룹 여부를 보고 알맞은 화면을 띄웁니다.
// 주소는 해시(#/workout)만 쓰기 때문에 GitHub Pages의 /in2size/ 아래에서도 새로고침이 안전합니다.
import { auth, db, onAuthStateChanged, doc, onSnapshot, updateDoc, deleteField, getDocFromServer } from './firebase.js';
import { isSigningUp, createProfile } from './auth.js';
import { groupIdsOf } from './group.js';
import { hideSplash, icons, toast } from './ui.js';
import { startWorkoutStore, stopWorkoutStore } from './workout-data.js';
import { syncTogether, stopTogether, watchTogether, unreadCheers } from './together-data.js';

// access: 이 화면을 볼 수 있는 상태 목록 (guest=로그인 전, no-group=그룹 없음, member=그룹 1개 이상)
// 그룹이 없어도 앱은 다 쓸 수 있어요. 그룹 코드 안내는 그룹이 있을 때만.
// layout: plain=로고·폼만, tabs=헤더+아래 탭, sub=뒤로가기 헤더 (back: 돌아갈 화면, 주소 값에 따라 다르면 함수)
const SIGNED_IN = ['no-group', 'member'];
const ROUTES = {
  login: { access: ['guest'], layout: 'plain', load: () => import('./screens/login.js') },
  signup: { access: ['guest'], layout: 'plain', load: () => import('./screens/signup.js') },
  forgot: { access: ['guest'], layout: 'plain', load: () => import('./screens/forgot.js') },
  // 그룹 만들기/들어가기 (그룹이 있어도 3개까지 더 추가할 수 있어서 모두에게 열려 있음)
  group: { access: SIGNED_IN, layout: 'plain', load: () => import('./screens/group-choice.js') },
  // 만든 직후엔 내 프로필(groupIds)이 아직 안 바뀌었을 수 있어서, 주소의 ?id=로 그룹을 읽음
  'group-created': { access: SIGNED_IN, layout: 'plain', load: () => import('./screens/group-created.js') },
  workout: { access: SIGNED_IN, layout: 'tabs', load: () => import('./screens/workout.js') },
  together: { access: SIGNED_IN, layout: 'tabs', load: () => import('./screens/together.js') },
  records: { access: SIGNED_IN, layout: 'tabs', load: () => import('./screens/records.js') },
  'record-edit': { access: SIGNED_IN, layout: 'sub', title: '운동 기록', back: 'records', load: () => import('./screens/record-edit.js') },
  // 영상 코스: 상세 → 재생(+ 완료 폼). 주소의 ?v=는 유튜브 영상 ID
  course: { access: SIGNED_IN, layout: 'sub', title: '영상 코스', back: 'workout', load: () => import('./screens/course.js') },
  'course-play': {
    access: SIGNED_IN, layout: 'sub', title: '영상 코스',
    back: (p) => `course?v=${encodeURIComponent(p.v || '')}`,
    load: () => import('./screens/course-play.js'),
  },
  settings: { access: SIGNED_IN, layout: 'sub', title: '설정', back: 'workout', load: () => import('./screens/settings.js') },
};

// 그룹 선택 화면은 가입 직후에만 자동으로 뜨고(signup.js가 nextRoute로 예약), 그 뒤로는 운동하기가 첫 화면
const HOME = { guest: 'login', 'no-group': 'workout', member: 'workout' };

const TABS = [
  { route: 'workout', label: '운동하기', icon: icons.workout },
  { route: 'together', label: '같이', icon: icons.together },
  { route: 'records', label: '내 기록', icon: icons.records },
];

const state = {
  user: undefined, // undefined = 아직 확인 중, null = 로그인 안 됨
  profile: undefined, // users/{uid} 문서 내용
  nextRoute: null, // 상태가 바뀐 다음 한 번만 갈 화면 (가입 직후 → 그룹 선택, 그룹 만든 직후 → 코드 안내)
};

let stopProfile = null;
let profileFallbackTried = false; // 기본 프로필 만들기는 로그인 한 번에 한 번만 시도
let heldSnap = null; // 가입 중에 미뤄 둔 프로필 스냅샷
let current = { key: '', cleanup: null, screen: null };
let renderToken = 0;

// 화면에서 쓰는 공용 기능
export const appCtx = {
  get user() { return state.user; },
  get profile() { return state.profile; },
  go(route) { location.hash = `#/${route}`; },
  // 주소 뒤 ?id=...&date=... 값 (예: #/record-edit?id=abc)
  get params() { return Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || '')); },
  // 가입·그룹 만들기처럼 상태가 바뀐 다음 갈 화면을 예약 (null이면 취소)
  nextRoute(route) { state.nextRoute = route; },
};

function status() {
  if (state.user === undefined) return 'loading';
  if (!state.user) return 'guest';
  if (!state.profile) return 'loading';
  return groupIdsOf(state.profile).length ? 'member' : 'no-group';
}

function currentRouteName() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}

async function render() {
  const st = status();
  if (st === 'loading') return; // 스플래시가 계속 떠 있음

  const name = currentRouteName();
  const route = ROUTES[name];
  if (!route || !route.access.includes(st)) {
    let target = HOME[st];
    if (st !== 'guest' && state.nextRoute) {
      target = state.nextRoute; // 맞지 않는 화면이면 다음 render에서 다시 HOME으로 감
      state.nextRoute = null;
    }
    location.replace(`#/${target}`); // hashchange가 다시 render를 부릅니다
    return;
  }

  // 같은 화면에서 프로필만 바뀐 경우(닉네임 수정 등)는 다시 그리지 않고 알려만 줌.
  // 주소(?id= 포함)나 내 그룹 목록이 바뀌면 새로 그림
  const key = `${groupIdsOf(state.profile).join(',')}:${location.hash}`;
  if (key === current.key) {
    current.screen?.update?.(appCtx);
    return;
  }

  const token = ++renderToken;
  const screen = await route.load();
  if (token !== renderToken) return; // 그사이 다른 화면으로 이동함

  current.cleanup?.();
  const root = document.getElementById('app');
  const outlet = mountLayout(root, name, route);
  current = { key, screen, cleanup: screen.render(outlet, appCtx) ?? null };
  window.scrollTo(0, 0);
  hideSplash();
}

function mountLayout(root, name, route) {
  if (route.layout === 'plain') {
    root.innerHTML = '<main class="page page--plain" id="outlet"></main>';
  } else if (route.layout === 'sub') {
    const back = typeof route.back === 'function' ? route.back(appCtx.params) : route.back;
    root.innerHTML = `
      <header class="app-header">
        <div class="app-header-inner">
          <a class="icon-btn" href="#/${back}" aria-label="뒤로">${icons.back}</a>
          <h1 class="app-header-title">${route.title}</h1>
          <span class="icon-btn" aria-hidden="true"></span>
        </div>
      </header>
      <main class="page" id="outlet"></main>`;
  } else {
    root.innerHTML = `
      <header class="app-header">
        <div class="app-header-inner">
          <a href="#/workout" aria-label="In2Size 홈"><img class="app-header-logo" src="assets/logo.png" alt="In2Size"></a>
          <a class="icon-btn" href="#/settings" aria-label="설정">${icons.settings}</a>
        </div>
      </header>
      <main class="app-main"><div class="page" id="outlet"></div></main>
      <nav class="tabbar" aria-label="메인 메뉴">
        <div class="tabbar-inner">
          ${TABS.map((t) => `
            <a class="tab" href="#/${t.route}" ${t.route === name ? 'aria-current="page"' : ''}>
              ${t.icon}<span>${t.label}</span>
            </a>`).join('')}
        </div>
      </nav>`;
    updateTabDot();
  }
  return root.querySelector('#outlet');
}

function handleProfileSnap(user, snap) {
  if (snap.exists()) {
    // cheersSeenAt을 막 저장했을 때도 새 반응 점이 깜빡이지 않게 서버 시각 추정치로 읽어요
    const data = snap.data({ serverTimestamps: 'estimate' });
    // 예전 형식(groupId 하나) 프로필은 groupIds 목록으로 한 번 바꿔요. 바뀐 값이 다시 들어오면 그때 그림
    if (!Array.isArray(data.groupIds) && !snap.metadata.hasPendingWrites) {
      updateDoc(snap.ref, { groupIds: groupIdsOf(data), groupId: deleteField() })
        .catch((e) => console.error('프로필 형식 바꾸기 실패:', e));
      return;
    }
    state.profile = data;
    // 로그인한 동안 계속: 운동 기록(요약 맞추기) + 같이 탭 데이터(새 반응 점, 친구 소식)
    startWorkoutStore(user.uid);
    syncTogether(user.uid, data);
    render();
  } else if (!snap.metadata.fromCache && !profileFallbackTried) {
    // 가입 중 프로필 저장이 실패했던 계정 등: 서버에도 정말 없을 때만, 한 번만 기본 프로필을 만들어 줌
    profileFallbackTried = true;
    getDocFromServer(snap.ref)
      .then((server) => {
        if (server.exists()) return;
        const nickname = user.displayName || user.email.split('@')[0].slice(0, 12);
        return createProfile(user, nickname);
      })
      .catch((e) => {
        console.error('기본 프로필 만들기 실패:', e);
        toast('정보를 불러오지 못했어요. 앱을 다시 열어 주세요');
      });
  }
}

function watchProfile(user) {
  stopProfile?.();
  heldSnap = null;
  stopProfile = onSnapshot(
    doc(db, 'users', user.uid),
    (snap) => {
      // 가입하는 동안(프로필이 서버에 저장될 때까지)은 화면을 넘기지 않고 기다려요.
      // 저장이 끝나기 전에 다른 화면으로 넘어가면 연결이 꼬여서 프로필이 없다고 나올 수 있었음.
      if (isSigningUp()) {
        heldSnap = snap;
        return;
      }
      handleProfileSnap(user, snap);
    },
    (error) => {
      console.error(error);
      toast('정보를 불러오지 못했어요. 인터넷 연결을 확인해 주세요');
    },
  );
}

window.addEventListener('in2size:signup-done', () => {
  if (heldSnap && state.user) handleProfileSnap(state.user, heldSnap);
  heldSnap = null;
});

onAuthStateChanged(auth, (user) => {
  state.user = user;
  state.profile = undefined;
  current.key = ''; // 계정이 바뀌면 화면을 새로 그림
  stopWorkoutStore();
  stopTogether();
  profileFallbackTried = false;
  if (user) {
    watchProfile(user);
  } else {
    stopProfile?.();
    stopProfile = null;
  }
  render();
});

window.addEventListener('hashchange', render);

window.addEventListener('in2size:before-logout', () => {
  stopProfile?.();
  stopProfile = null;
  current.cleanup?.();
  current = { key: '', cleanup: null, screen: null };
  stopWorkoutStore();
  stopTogether();
});

// 누가 내 기록에 반응하면 "같이" 탭 아이콘에 작은 점
let hasUnread = false;
function updateTabDot() {
  document.querySelector('.tab[href="#/together"]')?.classList.toggle('has-dot', hasUnread);
}
watchTogether((s) => {
  hasUnread = unreadCheers(s).length > 0;
  updateTabDot();
});

// PWA: 서비스 워커 등록 (상대 경로라 /in2size/ 범위로 등록됩니다)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 등록 실패', e));
  });
}
