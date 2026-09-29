# In2Size — 작업 노트

> **Into Fitness. Into Shape. 2gether.**
> 나와 친구(최대 5명 그룹)가 운동 코스를 따라 하고, 기록하고, 서로 응원하는 앱.

- 배포: GitHub Pages — https://yeinariakim.github.io/in2size/
- Firebase 프로젝트: `in2size` (Auth + Firestore만. Analytics 안 씀)

## 기술 원칙 (바꾸지 말 것)

- **바닐라 HTML/CSS/JS**. 프레임워크, 빌드 도구, npm 의존성 없음. 파일 그대로 배포.
- Firebase SDK는 gstatic CDN ES 모듈. **CDN 주소는 `js/firebase.js`에만** 쓰고, 다른 파일은 여기서 re-export한 함수를 가져다 씀. 새 Firebase 함수가 필요하면 `firebase.js`의 import/export에 추가.
  - 현재 버전 `12.18.0`. 올릴 때는 `firebase.js`의 세 URL을 함께 바꿀 것.
- **모든 경로는 상대 경로** (`assets/...`, `./sw.js`). `/`로 시작하는 절대 경로 금지. 앱이 `/in2size/` 아래에서 돌아감.
- 라우팅은 **해시 방식**(`#/workout`). GitHub Pages에서 새로고침해도 404가 나지 않음.
- 사용자 입력(닉네임 등)을 `innerHTML`에 넣을 때는 반드시 `esc()` (`js/ui.js`) 사용.

## 파일 구조

```
index.html            스플래시 + #app 하나. js/app.js를 불러옴
manifest.json, sw.js  PWA
firestore.rules       보안 규칙 (콘솔에 직접 붙여넣음. README 참고)
css/tokens.css        디자인 토큰(색·글꼴·간격·모양). 색 값은 여기서만 정의
css/base.css          리셋, 기본 글자, 입력칸 16px 규칙
css/components.css    버튼·입력칸·카드·헤더·탭바·토스트 등
js/firebase.js        초기화 + SDK 함수 re-export
js/app.js             로그인/그룹 상태 → 화면 결정(라우터), 레이아웃(헤더·탭바)
js/auth.js            가입/로그인/재설정/로그아웃, 한국어 에러 메시지(errorMessage)
js/group.js           그룹 만들기/들어가기(트랜잭션), 초대 코드
js/ui.js              esc, toast, withLoading, copyText, 아이콘 SVG
js/screens/*.js       화면 하나 = 파일 하나
assets/               로고, assets/icons/ 에 PWA 아이콘·파비콘
```

### 화면 추가하는 법

1. `js/screens/새화면.js`에 `export function render(el, ctx)` 작성 (필요하면 정리 함수를 return).
   같은 화면에서 프로필만 바뀔 때 처리하려면 `export function update(ctx)`.
2. `js/app.js`의 `ROUTES`에 등록: `access`(guest / no-group / member), `layout`(plain / tabs / sub).
3. `sw.js`의 `APP_SHELL`에 파일 추가하고 `CACHE` 버전 올리기.

`ctx`: `ctx.user`(Firebase 사용자), `ctx.profile`(users 문서), `ctx.go('route')`, `ctx.afterJoin('route')`.

### 화면 흐름

```
스플래시(logo-short) → 로그인 상태 확인
  로그인 안 됨 → #/login ↔ #/signup, #/forgot
  그룹 없음   → #/group (새 그룹 만들기 → #/group-created / 초대 코드 입력)
  그룹 있음   → #/workout(첫 화면) · #/together · #/records   + 헤더 ⚙ → #/settings
```

`app.js`가 상태에 맞지 않는 주소로 들어오면 알아서 그 상태의 기본 화면으로 보냄.

## 디자인 규칙

| 토큰 | 값 | 용도 |
|---|---|---|
| `--c-primary` | `#365CF5` Primary Blue | 버튼, 강조, 선택된 탭 |
| `--c-navy` | `#172033` Deep Navy | 본문 글자, 제목 |
| `--c-bg` | `#F7F8FC` Soft Off-White | 배경 |
| `--c-gray` | `#A9B0C3` Cool Gray | 플레이스홀더, 비활성 탭, 짧은 보조 글자 |
| `--c-text-sub` | `#6B7389` | 길게 읽어야 하는 보조 설명 (Cool Gray는 밝은 배경에서 대비가 약해서 한 톤 진하게 만든 파생 색) |
| `--c-primary-soft` | `#EBEFFE` | 연한 파랑 배경(보조 버튼, 아이콘 배경, 안내 박스) |
| `--c-line` | `#E4E7EF` | 입력칸 테두리, 구분선 |

- 느낌: 깔끔·미니멀 + 에너지. 큰 굵은 제목(800), 알약 모양 파란 버튼, 흰 카드 + 옅은 그림자.
- 글꼴: Pretendard (jsDelivr CDN). 없으면 시스템 글꼴로 대체됨.
- **모바일 우선** (아이폰 기준). 내용 최대 폭 480px. 노치/홈 바는 `--safe-top`, `--safe-bottom`으로 처리.
- **입력칸 글자는 16px 이상** (아이폰에서 입력칸을 누를 때 확대 방지). `base.css`에서 강제함.
- 새 색이 필요하면 `tokens.css`에 변수로 추가하고, 다른 CSS에는 hex를 직접 쓰지 않기.
- 문구: 부드러운 해요체. 에러도 쉽게 ("비밀번호가 맞지 않아요").

### 로고

| 파일 | 내용 | 사용처 |
|---|---|---|
| `assets/logo-full.png` | 슬로건 포함, 어두운 글자 | 로그인·가입 화면 |
| `assets/logo.png` | 슬로건 없음 | 상단 헤더 |
| `assets/logo-full-dark.png` | 슬로건 포함, 흰 글자 | **보관 중.** 어두운 배경 화면이 생기면 사용 |
| `assets/logo-short.png` | I2S 약칭 | 스플래시(로딩), 파비콘 원본 |
| `assets/icon.png` | 파란 배경 I2S 앱 아이콘 원본 (배경 `#155DFC`) | PWA 아이콘 원본 |

`assets/icons/`는 원본에서 만든 파일: `apple-touch-icon-180.png`(불투명), `icon-192/512.png`, `icon-maskable-512.png`(안전 영역 안으로 축소), `favicon-32/64.png`(logo-short). 원본이 바뀌면 다시 만들 것.

## Firestore 데이터 구조

```
users/{uid}
  nickname: string (1~12자)
  email: string
  groupId: string | null
  createdAt: timestamp

groups/{groupId}
  code: "K7P2QX"
  ownerId: uid
  memberIds: [uid, ...]   // 최대 5명
  createdAt: timestamp

inviteCodes/{code}        // 문서 id가 코드. 코드 → 그룹 찾기용
  groupId: string
  createdAt: timestamp
```

- 그룹 만들기: 트랜잭션 한 번에 `groups` + `inviteCodes` + 내 `users.groupId`. 코드가 겹치면 새로 뽑아 재시도.
- 들어가기: `inviteCodes/{code}` 조회 → 트랜잭션으로 인원 확인 후 `memberIds`에 나 추가 + 내 `groupId` 설정.
- 멤버 프로필 가져오기: `group.memberIds`로 `users/{id}`를 하나씩 get (`group.js`의 `getMembers`). `where('groupId','==',내그룹)` 쿼리도 규칙상 허용됨.

### 보안 규칙 요점 (`firestore.rules`)

- users: 본인만 생성·수정. 읽기는 본인 + 같은 그룹. `groupId`는 null → 그룹 id로 **한 번만** 바꿀 수 있고, 그 그룹 `memberIds`에 내가 실제로 들어가야 함.
- groups: `get`은 로그인한 누구나(id는 코드로만 알 수 있음), `list` 불가. 수정은 "나 자신만 추가 + 5명 이하 + 내 groupId도 같이 설정"만 허용.
- inviteCodes: `get`만 가능, 그룹 생성 요청 안에서만 생성, 수정·삭제 불가.
- 필드를 추가하면 규칙의 `keys().hasOnly([...])`와 `affectedKeys().hasOnly([...])`도 같이 고쳐야 함.
- 규칙을 바꾼 뒤에는 Firebase 콘솔에 다시 붙여넣어 게시해야 적용됨.

## 결정 사항 / 알려진 한계

- 한 사람은 그룹 하나에만. **그룹 나가기, 그룹 삭제, 멤버 내보내기는 아직 없음** (규칙에서도 막혀 있음). 필요해지면 규칙과 함께 추가.
- **초대 코드 형식: 6글자** (예: `K7P2QX`). 영어 대문자 + 숫자, 헷갈리는 `0 O 1 I L`은 뺌. 접두어(`SIZE-` 등)는 붙이지 않음: 보안에 도움이 안 되고 코드만 길어짐. 공유 메시지에 "In2Size 초대 코드"라고 이미 적혀 있음.
  - 쓰는 글자 31개: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` → 31⁶ ≈ 8억 8천만 가지라 추측하기 어려움.
  - 생성은 `crypto.getRandomValues` + 버림 샘플링(글자마다 확률 동일). 이미 있는 코드면 다시 뽑음.
  - 형식을 바꿀 때는 세 곳을 같이: `js/group.js`의 `CODE_CHARS`·`CODE_LENGTH`, `firestore.rules`의 `validCode` 정규식(`^[A-HJKMNP-Z2-9]{6}$`), 이 문서.
  - 입력은 대소문자·공백·하이픈과 상관없이 받음: `k7p2qx`, `K7P 2QX`, `K7P-2QX` → `K7P2QX` (`normalizeCode`). 앞에 `SIZE-`를 붙여 넣어도 떼고 받음. 형식이 틀리면 안내는 짧게 "초대 코드는 6글자예요"만. 코드는 복사해서 보내는 걸 전제로 하므로 쓰는 글자 규칙 같은 세부 설명은 사용자에게 보여주지 않음.
- Firebase의 이메일 열거 보호 때문에 실제 서버에서는 "비밀번호 틀림"과 "없는 이메일"이 구분되지 않음 → "이메일 또는 비밀번호가 맞지 않아요".
- Firestore는 오프라인 캐시(persistentLocalCache) 사용.
- 서비스 워커는 같은 도메인 파일만 네트워크 우선으로 캐시. Firebase 요청은 건드리지 않음.

## 푸시 알림 (나중에)

- 구조만 준비됨: `sw.js` 아래쪽에 `push` / `notificationclick` 핸들러가 주석으로 있음.
- 붙일 때: Firebase Cloud Messaging(`firebase-messaging.js`) + VAPID 키. 이미 등록된 `sw.js`를 `getToken(messaging, { vapidKey, serviceWorkerRegistration })`에 넘겨 별도 `firebase-messaging-sw.js` 없이 사용.
- 토큰은 `users/{uid}/private/...` 같은 본인만 읽는 곳에 저장. 실제 발송은 Cloud Functions가 필요함 (Blaze 요금제).
- 아이폰은 iOS 16.4 이상 + **홈 화면에 추가한 상태**에서만 웹 푸시 가능.

## 로드맵

- [x] **1단계 — 뼈대**: 로그인/가입/재설정, 그룹(초대 코드), 탭 3개, 설정, 디자인 시스템, PWA, 보안 규칙
- [ ] **2단계 — 운동 기록**: eatsylog의 운동 기능을 옮겨옴
  - 블록 방식: 유산소 / 근력 / 기타, 즐겨찾기, 무게 추이
  - **eatsylog 기존 기록도 옮겨올 예정이라 데이터 구조를 eatsylog와 똑같이 맞출 것.** 작업 전에 eatsylog의 Firestore 구조(컬렉션 경로, 필드 이름, 타입)를 먼저 확인하고 그대로 사용. 위치는 `users/{uid}/` 아래 하위 컬렉션을 우선 검토.
  - "내 기록" 탭에 표시. 규칙에 하위 컬렉션 추가 (본인 쓰기, 그룹 멤버 읽기 여부는 4단계 요약 방식에 맞춰 결정)
- [ ] **3단계 — 영상 코스**: 유튜브 영상 하나를 앱 안에서 재생(IFrame Player API). 끝나면(ENDED 이벤트) 완료 기록 저장. "운동하기" 탭.
- [ ] **4단계 — 같이 탭**
  - 그룹 멤버 기록 피드: 운동 종류·시간·칼로리만 요약해서 보여줌 (세부 무게 등은 비공개)
  - 한마디, 응원 이모지, 앱 안 알림
  - 멤버별 색 점이 찍히는 공유 달력 (멤버별 색 필요 → users 또는 groups에 색 필드 추가 검토)
  - "운동하기" 탭 맨 위 `#friend-news` 자리에 친구 소식 한 줄
- [ ] **5단계 — 따라하기 코스**: 동작 사전 + 타이머 플레이어

## 테스트 방법 (참고)

빌드 도구가 없어서 저장소에는 테스트 코드를 두지 않음. 1단계 작업 때 임시 폴더에서 다음 방법으로 확인함.
- 보안 규칙: Firebase 에뮬레이터 + `@firebase/rules-unit-testing` (가입, 그룹 생성·참여, 5명 제한, 다른 그룹 읽기 차단 등 33개 항목)
- 화면: 로컬 서버 + Playwright(iPhone 13 화면) + Auth/Firestore 에뮬레이터로 가입부터 그룹 가득 참까지 흐름 확인
