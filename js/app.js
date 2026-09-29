// 앱 시작점: 로그인 상태와 그룹 여부를 보고 알맞은 화면을 띄웁니다.
// 주소는 해시(#/workout)만 쓰기 때문에 GitHub Pages의 /in2size/ 아래에서도 새로고침이 안전합니다.
import { auth, db, onAuthStateChanged, doc, onSnapshot } from './firebase.js';
import { isSigningUp, createProfile } from './auth.js';
import { hideSplash, icons, toast } from './ui.js';

// access: 이 화면을 볼 수 있는 상태 (guest=로그인 전, no-group=그룹 없음, member=그룹 있음)
// layout: plain=로고·폼만, tabs=헤더+아래 탭, sub=뒤로가기 헤더
const ROUTES = {
  login: { access: 'guest', layout: 'plain', load: () => import('./screens/login.js') },
  signup: { access: 'guest', layout: 'plain', load: () => import('./screens/signup.js') },
  forgot: { access: 'guest', layout: 'plain', load: () => import('./screens/forgot.js') },
  group: { access: 'no-group', layout: 'plain', load: () => import('./screens/group-choice.js') },
  'group-created': { access: 'member', layout: 'plain', load: () => import('./screens/group-created.js') },
  workout: { access: 'member', layout: 'tabs', load: () => import('./screens/workout.js') },
  together: { access: 'member', layout: 'tabs', load: () => import('./screens/together.js') },
  records: { access: 'member', layout: 'tabs', load: () => import('./screens/records.js') },
  settings: { access: 'member', layout: 'sub', title: '설정', back: 'workout', load: () => import('./screens/settings.js') },
};

const HOME = { guest: 'login', 'no-group': 'group', member: 'workout' };

const TABS = [
  { route: 'workout', label: '운동하기', icon: icons.workout },
  { route: 'together', label: '같이', icon: icons.together },
  { route: 'records', label: '내 기록', icon: icons.records },
];

const state = {
  user: undefined, // undefined = 아직 확인 중, null = 로그인 안 됨
  profile: undefined, // users/{uid} 문서 내용
  nextMemberRoute: null, // 그룹을 막 만들었을 때 한 번만 갈 화면
};

let stopProfile = null;
let current = { key: '', cleanup: null, screen: null };
let renderToken = 0;

// 화면에서 쓰는 공용 기능
export const appCtx = {
  get user() { return state.user; },
  get profile() { return state.profile; },
  go(route) { location.hash = `#/${route}`; },
  // 그룹을 만든 직후처럼 상태가 바뀐 다음 갈 화면을 예약
  afterJoin(route) { state.nextMemberRoute = route; },
};

function status() {
  if (state.user === undefined) return 'loading';
  if (!state.user) return 'guest';
  if (!state.profile) return 'loading';
  return state.profile.groupId ? 'member' : 'no-group';
}

function currentRouteName() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}

async function render() {
  const st = status();
  if (st === 'loading') return; // 스플래시가 계속 떠 있음

  const name = currentRouteName();
  const route = ROUTES[name];
  if (!route || route.access !== st) {
    let target = HOME[st];
    if (st === 'member' && state.nextMemberRoute) {
      target = state.nextMemberRoute;
      state.nextMemberRoute = null;
    }
    location.replace(`#/${target}`); // hashchange가 다시 render를 부릅니다
    return;
  }

  // 같은 화면에서 프로필만 바뀐 경우(닉네임 수정 등)는 다시 그리지 않고 알려만 줌
  const key = `${st}:${name}`;
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
    root.innerHTML = `
      <header class="app-header">
        <div class="app-header-inner">
          <a class="icon-btn" href="#/${route.back}" aria-label="뒤로">${icons.back}</a>
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
  }
  return root.querySelector('#outlet');
}

function watchProfile(user) {
  stopProfile?.();
  stopProfile = onSnapshot(
    doc(db, 'users', user.uid),
    (snap) => {
      if (snap.exists()) {
        state.profile = snap.data();
        render();
      } else if (!isSigningUp() && !snap.metadata.fromCache) {
        // 가입 중 프로필 저장이 실패했던 계정 등: 기본 프로필을 만들어 줌
        const nickname = user.displayName || user.email.split('@')[0].slice(0, 12);
        createProfile(user, nickname).catch((e) => console.error(e));
      }
    },
    (error) => {
      console.error(error);
      toast('정보를 불러오지 못했어요. 인터넷 연결을 확인해 주세요');
    },
  );
}

onAuthStateChanged(auth, (user) => {
  state.user = user;
  state.profile = undefined;
  current.key = ''; // 계정이 바뀌면 화면을 새로 그림
  if (user) {
    watchProfile(user);
  } else {
    stopProfile?.();
    stopProfile = null;
  }
  render();
});

window.addEventListener('hashchange', render);

// PWA: 서비스 워커 등록 (상대 경로라 /in2size/ 범위로 등록됩니다)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 등록 실패', e));
  });
}
