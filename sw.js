// In2Size 서비스 워커
// - 앱 파일(HTML/CSS/JS/이미지)을 캐시해서 홈 화면 앱이 빨리 열리고, 오프라인에서도 화면은 뜨게 합니다.
// - 네트워크 우선: 온라인이면 항상 최신 파일을 받고, 실패할 때만 캐시를 씁니다.
// - Firebase·글꼴 등 다른 도메인 요청은 건드리지 않습니다.
// 파일 목록이나 캐시 방식을 바꾸면 CACHE 버전을 올려주세요.
const CACHE = 'in2size-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './js/firebase.js',
  './js/auth.js',
  './js/group.js',
  './js/ui.js',
  './js/workout-data.js',
  './js/chart.js',
  './js/together-data.js',
  './js/screens/login.js',
  './js/screens/signup.js',
  './js/screens/forgot.js',
  './js/screens/group-choice.js',
  './js/screens/group-created.js',
  './js/screens/workout.js',
  './js/screens/together.js',
  './js/screens/records.js',
  './js/screens/record-edit.js',
  './js/screens/settings.js',
  './assets/logo.png',
  './assets/logo-full.png',
  './assets/logo-short.png',
  './assets/icons/icon-192.png',
  './assets/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined)),
      ),
  );
});

// ---------------------------------------------------------------------------
// 푸시 알림 자리 (아직 구현 안 함 — CLAUDE.md "푸시 알림" 참고)
// 나중에 FCM을 붙이면 이 서비스 워커를 getToken(messaging, { serviceWorkerRegistration })에 넘겨
// 같은 파일에서 push / notificationclick을 처리합니다.
//
// self.addEventListener('push', (event) => {
//   const data = event.data?.json() ?? {};
//   event.waitUntil(
//     self.registration.showNotification(data.title ?? 'In2Size', {
//       body: data.body,
//       icon: './assets/icons/icon-192.png',
//       data: { url: data.url ?? './#/together' },
//     }),
//   );
// });
//
// self.addEventListener('notificationclick', (event) => {
//   event.notification.close();
//   event.waitUntil(self.clients.openWindow(event.notification.data.url));
// });
