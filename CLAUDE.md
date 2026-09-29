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
js/workout-data.js    운동 기록 구독·저장, 예전 형식 변환, 합계·무게 추이 계산 (eatsylog에서 옮김) + 요약 저장·맞추기
js/together-data.js   같이 탭 데이터: 내 그룹들 → 멤버 → 요약·응원 구독, 반응 누르기, 달력, 멤버 색, 종류 이모지
js/chart.js           작은 SVG 선 그래프 (라이브러리 없이)
js/courses.js         영상 코스: courses.json 읽기(틀린 칸은 건너뜀), 완료 기록 데이터 만들기
courses.json          영상 코스 목록 (GitHub에서 직접 고치는 파일. 아래 "영상 코스" 참고)
js/ui.js              esc, toast, withLoading, copyText, 아이콘 SVG
js/screens/*.js       화면 하나 = 파일 하나
assets/               로고, assets/icons/ 에 PWA 아이콘·파비콘
```

### 화면 추가하는 법

1. `js/screens/새화면.js`에 `export function render(el, ctx)` 작성 (필요하면 정리 함수를 return).
   같은 화면에서 프로필만 바뀔 때 처리하려면 `export function update(ctx)`.
2. `js/app.js`의 `ROUTES`에 등록: `access`(볼 수 있는 상태 배열: guest / no-group / member. 로그인한 사람 모두면 `SIGNED_IN`), `layout`(plain / tabs / sub).
3. `sw.js`의 `APP_SHELL`에 파일 추가하고 `CACHE` 버전 올리기.
4. 내 그룹 목록은 항상 `groupIdsOf(ctx.profile)`(`js/group.js`)로 읽을 것. 그룹이 0개일 때를 꼭 처리할 것.

`ctx`: `ctx.user`(Firebase 사용자), `ctx.profile`(users 문서), `ctx.params`(주소 `?id=..&date=..` 값), `ctx.go('route')`, `ctx.nextRoute('route')`(상태가 바뀐 다음 한 번만 갈 화면 예약, `null`이면 취소).
주소 뒤 `?...`가 다르거나 내 그룹 목록이 바뀌면 화면을 새로 그림 (`#/record-edit?id=a` → `?id=b`, 그룹 나가기 등).

### 화면 흐름

```
스플래시(logo-short) → 로그인 상태 확인
  로그인 안 됨 → #/login ↔ #/signup, #/forgot
  가입 직후   → #/group?welcome=1 (한 번만) → 새 그룹 만들기(이름) → #/group-created?id= / 코드로 들어가기 → #/together?g= / "혼자 먼저 시작할게요"
  로그인 됨   → #/workout(첫 화면) · #/together · #/records   + 헤더 ⚙ → #/settings   (그룹이 없어도 전부 사용 가능)
                #/records → #/record-edit?date=YYYY-MM-DD (새 기록) / ?id=... (수정)
                #/workout → 코스 카드 → #/course?v=유튜브ID (상세) → [시작] #/course-play?v= (재생 → 완료 폼 → 저장 → #/records)
                          → [+ 직접 기록] #/record-edit?date=오늘
                #/together = 전체(기본) / ?g=그룹id (위쪽 칩으로 고름). 운동하기 탭 친구 소식 한 줄 → #/together
  그룹 추가   → 같이 탭·설정의 [새 그룹 만들기] → #/group?back=.., [초대 코드 입력] → #/group?focus=code&back=.. ("돌아가기")
                3개가 다 찼으면 #/group은 "그룹이 벌써 3개예요" 안내만
  설정        → 그룹마다 이름 바꾸기 / 초대 코드 복사 / 멤버 / 그룹 나가기
```

`app.js`가 상태에 맞지 않는 주소로 들어오면 알아서 그 상태의 기본 화면(`HOME`)으로 보냄.
그룹을 만들거나 들어간 직후엔 내 프로필(`groupIds`)이 조금 늦게 바뀔 수 있어서, `#/group-created?id=`·`#/together?g=`는 주소의 id를 먼저 믿고, 프로필이 바뀌면 화면을 새로 그림.

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
  groupIds: [groupId, ...]   // 내 그룹 목록, 최대 3개 (없으면 [])
  createdAt: timestamp

groups/{groupId}
  name: string (1~20자)   // 멤버 누구나 바꿀 수 있음. 예전 그룹은 없을 수 있음 → "이름 없는 그룹"
  code: "K7P2QX"
  ownerId: uid            // 만든 사람 (지금은 표시·권한에 안 씀. 만든 사람이 나가도 그대로 둠)
  memberIds: [uid, ...]   // 최대 5명
  colors: { uid: 1~5 }    // 멤버 색. 들어올 때 남은 색 중 무작위, 나가면 그 칸만 빠짐. 예전 그룹은 없을 수 있음
  createdAt: timestamp

inviteCodes/{code}        // 문서 id가 코드. 코드 → 그룹 찾기용
  groupId: string
  createdAt: timestamp
```

- **`users.groupIds`와 `groups.memberIds`는 항상 한 트랜잭션에서 같이 바꿈.** 보안 규칙이 둘이 맞는지 검사함 (한쪽만 바꾸면 거부).
- 그룹 만들기·들어가기·나가기 전에 `waitForPendingWrites`로 가입 때 쓴 프로필이 서버에 올라갔는지 기다림 (오프라인 캐시 때문에 화면은 먼저 넘어가는데, 트랜잭션은 서버 값만 봄).
- 그룹 만들기: 트랜잭션 한 번에 `groups`(이름·내 색 포함) + `inviteCodes` + 내 `groupIds`에 추가. 코드가 겹치면 새로 뽑아 재시도.
- 들어가기: `inviteCodes/{code}` 조회 → 트랜잭션으로 인원(5명)·내 그룹 수(3개) 확인 후 `memberIds`에 나 추가 + `colors`에 남은 색 하나 + 내 `groupIds`에 추가.
- 나가기: `memberIds`·`colors`에서 나 빼기 + 내 `groupIds`에서 빼기. 남은 사람 색은 그대로. **마지막 한 명이 나가면 그룹과 초대 코드를 지움.** 운동 기록은 `users/{uid}` 아래라 나가도 그대로.
- 멤버 프로필 가져오기: `group.memberIds`로 `users/{id}`를 하나씩 get (`group.js`의 `getMembers`).
- **예전 형식**(`groupId` 하나, 여러 그룹 이전)도 `groupIdsOf()`와 규칙의 `idsOf()`가 목록으로 읽음. 그 사람이 로그인하면 `app.js`가 `groupIds`로 한 번 바꿔 저장함 (규칙의 `isMigration`).

### 운동 기록 (2단계) — ⚠️ eatsylog와 똑같은 구조

eatsylog(`yeinariakim/eatsylog`, 다른 Firebase 프로젝트)의 기록을 그대로 옮겨올 예정이라 **경로·필드 이름·단위·null 처리를 eatsylog와 한 글자도 다르게 하지 않음.** 바꾸고 싶으면 eatsylog 쪽도 같이 바뀌는지 먼저 확인할 것.

```
users/{uid}/workouts/{자동ID}         운동 한 번
  date("YYYY-MM-DD", 기기 현지 날짜), place,
  blocks: [ 적은 순서대로
    { type: "cardio",   name, durationSec, course, distanceKm, calorie, avgHr }
    { type: "strength", durationSec, exercises: [{ name, sets: [{ kg, reps, sets }] }], calorie, avgHr }
    { type: "other",    name, durationSec, reps, sets, calorie, memo }
  ],
  totalSec, totalCalorie,
  totalTimeManual, totalCalorieManual   (true면 자동 합계 대신 직접 적은 값), createdAt
  (비운 칸은 null. 시간은 모두 "초". 근력의 sets 안 "sets"는 세트 수)

users/{uid}/workoutFavorites/{자동ID}  (칼로리·심박수는 애플워치 실측값이라 저장 안 함)
  { kind: "block", blockType: "cardio" | "other", name, course, durationSec, distanceKm, reps, sets, memo, updatedAt }
  { kind: "exercise", name, sets: [{ kg, reps, sets }], updatedAt }   (근력은 종목 하나 단위)
```

- **예전 형식**(eatsylog 옛 기록: `cardio`/`strength`/`totalMinutes`)은 `workoutBlocksOf()`·`workoutTotalSec()`가 읽을 때 새 형식으로 바꿔 줌. 수정해서 저장하면 `setDoc`으로 통째로 덮어써서 새 형식이 됨.
- **옮겨오기 (끝남, 페이지는 지움)**: eatsylog와 In2Size는 Firebase 프로젝트가 달라서 같은 사람이어도 uid가 다름. 한 번 쓰고 지운 `migrate.html`(PR #5에 코드 있음)에서 두 계정에 로그인해서 "eatsylog 로그인한 uid → In2Size 로그인한 uid"로 짝을 지음. 서버·관리자 키 없음.
  - eatsylog는 이름 붙인 두 번째 Firebase 앱(`initializeApp(설정, 'eatsylog')`, 로그인은 메모리에만)으로 읽기만 함(`getDocsFromServer`). 설정값은 eatsylog `js/firebase-config.js`와 같음.
  - 미리보기(개수·예전 형식 수·날짜 범위·덮어쓸 것) → 확인 버튼 → 저장. 기록은 **문서 id·내용 그대로** 복사(예전 형식도 그대로)라 두 번 옮겨도 중복 없이 덮어씀.
  - 요약은 같은 batch에서 `summaryFields()`로 만듦(날짜 없는 기록은 요약 없음). 다시 옮길 때 그 사이 적은 한마디는 남김.
  - 즐겨찾기는 같은 id → 같은 이름(`findBlockFav`/`findExerciseFav`) 순으로 찾아 덮어쓰고, 없으면 eatsylog id로 새로 만듦.
  - 보안 규칙 변경 없음 (`workouts`·`workoutFavorites`는 본인이면 쓰기 가능, 요약은 기존 `validSummary` 통과).
- 구독은 `workout-data.js`의 `watchWorkouts()` 하나로. 로그인한 동안 전체 기록·즐겨찾기를 한 번 구독해서 목록·무게 추이·종목 추천이 같이 씀. 로그아웃하면 `app.js`가 `stopWorkoutStore()`.
- 동작 규칙 (eatsylog와 같게 유지):
  - 시간은 분·초(10초 단위) 선택. 블록 최대 180분, 총합 최대 300분.
  - 총 시간·칼로리는 블록 합계를 자동으로 넣지만 직접 고칠 수 있음(`totalTimeManual`/`totalCalorieManual`). 칼로리 칸을 비우면 다시 자동.
  - "+ 무게 추가"는 바로 위 줄의 횟수·세트를 복사하고 새 kg 칸에 포커스.
  - 즐겨찾기: 유산소·기타는 "즐겨찾기에 저장" 체크 후 기록을 저장할 때 같이 저장. 근력은 종목마다 ☆ 버튼. 같은 이름(유산소는 이름+코스명)이면 덮어씀.
  - 종목 이름 추천은 `<datalist>` 대신 직접 만든 목록 (아이폰에서 datalist가 들쭉날쭉).
  - 입력 중에는 다시 그리지 않음 (다시 그리면 휴대폰 키보드가 닫힘). 블록·종목 추가/삭제 때만 다시 그림.
  - 무게 추이: 종목마다 "그날 최고 무게". 한 달 전 대비 변화량(`monthAgoChange`)은 최근 기록 날짜의 30일 전에 가장 가까운 기록과 비교하되, 15일 미만 떨어진 기록은 빼고, 그런 기록밖에 없으면 처음 기록과 비교. 기록 1번뿐이면 안 보여줌.
  - 무게가 늘면 파란 알약, 줄거나 같으면 연한 회색 글자. **경고색(빨강)은 쓰지 않음.**
  - 오늘 이후 날짜로는 이동·기록 불가.
- eatsylog와 다르게 한 것 (겉모습만): 팝업 대신 전체 화면(`#/record-edit`), 이모지 대신 선 아이콘, 세이지그린 대신 Primary Blue, Chart.js 대신 `js/chart.js`(SVG), 기록한 날에 점이 찍히는 달력 대신 기본 날짜 선택기 (점 달력은 4단계 공유 달력 때 같이).

### 영상 코스 (요청서의 "5단계")

**`courses.json` 고치는 법** (GitHub에서 파일 열기 → 연필 아이콘 → 수정 → Commit)
```json
{
  "categories": ["스트레칭", "전신", "하체", "상체·복근", "필라테스"],   ← 칩 순서
  "courses": [
    {
      "emoji": "🔥",
      "name": "전신 30분 (빅씨스)",
      "category": "전신",            ← categories 중 하나 (없는 이름이면 칩 맨 끝에 자동으로 붙음)
      "desc": "쉽고 재밌는 유산소 전신", ← 없으면 ""
      "youtube": "VFyBl2hYKH8",      ← 영상 ID. 유튜브 주소를 통째로 붙여 넣어도 됨
      "minutes": 30                  ← 대략 시간(분). 모르면 null (따옴표 없이)
    }
  ]
}
```
- 목록에 보이는 순서 = 파일 순서. 코스 사이에는 쉼표, **마지막 코스 뒤에는 쉼표 없음** (JSON 규칙. 틀리면 "코스를 불러오지 못했어요").
- 코스 id가 따로 없고 **유튜브 영상 ID가 주소**(`#/course?v=`)라서 같은 영상을 두 번 넣으면 뒤의 것은 무시됨. 이름·영상 ID가 없는 코스도 건너뜀 (콘솔에 경고).
- 네트워크 우선 캐시라 커밋 후 GitHub Pages 배포가 끝나면 앱을 다시 열 때 반영됨. `sw.js` 버전은 안 올려도 됨.

**재생** (`js/screens/course-play.js`)
- 유튜브 IFrame Player API(`https://www.youtube.com/iframe_api`)를 처음 재생할 때 한 번 불러옴. `playsinline`이라 아이폰에서도 앱 안에서 재생. 아이폰은 자동 재생이 막혀 있어서 영상의 재생 버튼을 한 번 눌러야 함.
- 세로: 영상(화면 폭 가득) + 아래 [완료]. 가로(높이 540px 이하): `body.is-course-playing`으로 헤더를 숨기고 영상을 화면 높이에 맞춤, 오른쪽에 [완료]·나가기.
- 화면 꺼짐 방지: 처음 재생(PLAYING)하면 Wake Lock을 켜고, 잠깐 멈춰도 유지. 다른 앱에 다녀오면 다시 요청, 완료·화면을 떠나면 풂. 지원 안 되거나 거부되면 조용히 넘어감.
- 퍼가기가 막힌 영상(`onError`: 101·150·153 등)이나 유튜브 스크립트를 12초 안에 못 불러오면 영상 자리에 "앱 안에서 재생할 수 없는 영상이에요" + [유튜브에서 보기](새 창). [완료]는 그대로 있어서 유튜브에서 하고 와서 기록 가능.

**완료 → 저장**
- 영상이 끝나거나(ENDED) [완료]를 누르면 같은 화면이 완료 폼으로 바뀜: 운동 시간(분·10초 단위, 최대 180분), 칼로리(선택), 오늘 한마디(선택, 50자).
  - 시간은 영상 길이(`getDuration`)로 채움. 플레이어가 없으면(퍼가기 막힘) `minutes`, 그것도 없으면 0 → 골라야 저장됨.
- 저장은 기존 `saveWorkout()` → 기록 + 요약(+한마디) 한 batch. 보안 규칙 변경 없음. 기록은 **기타(other) 블록 하나**:
  ```
  { date: 오늘, place: "", blocks: [{ type: "other", durationSec, calorie, name: "홈트", reps: null, sets: null, memo: 코스 이름 }],
    totalSec, totalCalorie, totalTimeManual: false, totalCalorieManual: false }
  ```
  → 요약 `kinds`는 `[{ type: "other", name: "홈트" }]`라 피드엔 근력처럼 "🏠 홈트 32분"만 보임 (코스 이름은 본인 기록 메모에만). `kindEmoji`에 `홈트 → 🏠`. 이름은 `courses.js`의 `HOME_WORKOUT_NAME`.
  - eatsylog 구조 그대로(기록 화면의 기타 블록과 같은 칸)라 "내 기록"에서 보통 기록처럼 고치고 지울 수 있음.
- **중간에 나가면 기록 없음**: 완료 폼은 재생 화면 안의 상태라, 저장 전에 뒤로·탭 이동·새로고침하면 사라짐. 폼에 "기록하지 않고 나가기"도 있음.

### 같이 탭 · 요약 공유 (요청서의 "6단계")

**공유 원칙: 상세 기록은 본인만, 그룹 친구에게는 요약만.**

```
users/{uid}/workoutSummaries/{운동 기록과 같은 id}   ← 요약 (In2Size에만 있음. eatsylog에는 없음)
  date, kinds: [{ type: "cardio"|"strength"|"other", name }]   적은 순서, 같은 건 한 번 (근력은 name "근력")
  totalSec, totalCalorie (없으면 null), comment (한마디, 0~50자, 없으면 ""),
  createdAt (운동 기록의 createdAt과 같음. 예전 기록에 없으면 null), updatedAt

users/{owner}/cheers/{workoutId}_{누른uid}_{emoji}      ← 받은 응원 하나 = 문서 하나
  workoutId, from, emoji: "clap"|"fire"|"muscle"|"heart" (👏🔥💪❤️), createdAt
users/{uid}.cheersSeenAt                                 ← 이 시각 이후 받은 반응 = 새 반응
```

- **한마디는 요약에만 저장**함. `workouts`에 칸을 추가하면 eatsylog 구조와 달라지기 때문. 기록 수정 화면은 내 요약에서 한마디를 읽어 옴.
- 기록 저장·수정·삭제는 `workout-data.js`에서 `writeBatch` 한 번으로 **기록 + 요약을 같이** 바꿈. 삭제할 땐 그 기록에 받은 응원도 같이 지움.
- **요약 맞추기(`syncSummaries`)**: 로그인하면(`app.js` → `startWorkoutStore`) 내 기록과 요약을 비교해서, 없는 요약은 만들고, 내용이 다르면 고치고(한마디는 그대로), 기록이 없어진 요약은 지움. 서버 값을 확인한 뒤에만 돌고, 다 맞으면 아무것도 안 씀. 실패하면 그 로그인 동안은 다시 안 함. 이미 있던 기록의 요약도 이걸로 만들어짐 → **친구의 예전 기록은 그 친구가 새 버전을 한 번 열어야 피드에 보임.**
- 요약 칸이 바뀌면 `summaryFields()`·`sameFields()`·규칙의 `validSummary`를 같이 고칠 것.
- 요약을 사용자 아래에 두는 이유: 그룹마다 복사하면 3개 그룹에 따로 쓰고, 들어가고 나갈 때 복사·정리가 필요함. 사용자 아래 하나 + "그룹이 하나라도 겹치는 사람만 읽기" 규칙이면 새 그룹에 들어가자마자 예전 요약도 보임.
- `together-data.js`: 로그인한 동안 `app.js`가 `syncTogether(uid, profile)`로 시작. 내 그룹 문서들을 구독 → 나 + 모든 멤버(중복 없이, 최대 13명)마다 프로필·요약(최근 30개)·받은 응원(최근 300개) 구독. 같이 탭·운동하기 탭·탭 점이 같이 씀. 로그아웃하면 `stopTogether()`.
- 같이 탭 화면(`#/together`): 새 반응(보면 `cheersSeenAt` 저장해서 읽음, 목록은 화면을 떠날 때까지 남음) → 그룹 칩 [전체 | 그룹 이름들] (기본 "전체", 마지막 그룹 기억 안 함) → 그룹 하나일 때만 한 달 달력(멤버 색 점 나란히 + 범례, 이번 달 이후로는 못 감) → 피드(날짜 → 저장 시각 최신순, 최대 50개).
- 응원: 한 사람이 한 기록에 이모지마다 한 번, 다시 누르면 취소(문서 삭제). 내 기록 카드엔 버튼 없이 받은 수만. "누가"는 이름 + 이모지 한 줄("지수 🔥👏 · 나 💪"). 나와 그룹이 안 겹치는 사람(친구의 다른 그룹 멤버)은 이름을 읽을 권한이 없어서 이름 대신 자물쇠 아이콘(🔒 ❤️, 읽기 프로그램에는 "다른 그룹 친구").
- 피드·칩은 내용이 같으면 다시 그리지 않음(`setHtml`). 다른 데이터가 바뀔 때마다 새로 그리면 그 순간 누른 반응 버튼이 사라져서 눌림이 씹혔음.
- 새 반응 점: 내 받은 응원 중 `from`이 내가 아니고 `createdAt > cheersSeenAt`인 게 있으면 "같이" 탭 아이콘에 `.has-dot`.
- 운동하기 탭 `#friend-news`: 모든 그룹 중 가장 최근 친구 요약 하나("지수님이 오늘 러닝 20분 했어요 · 👏 1"), 누르면 `#/together`. 안 본 반응(탭 점과 같은 `unreadCheers`)이 있으면 오른쪽 끝에 파란 알약 "새 반응 N" → 같이 탭에서 보면(읽음) 사라짐. 알약이 있을 땐 자리가 좁아서 친구 기록의 반응 수(· 👏 1)는 뺌.
- 멤버 색: 그룹 문서 `colors`에 저장. 만들기·들어가기 때 남은 색 중 무작위(`pickColor`), 나가면 그 칸만 비움 → 한 번 정해진 색은 다른 사람이 들고 나도 안 바뀜. 색 기능 전에 만든 그룹은 각자 같이 탭 데이터를 처음 불러올 때 자기 색을 저장(`claimColor`, 트랜잭션), 저장 전엔 남은 색을 임시로 보여줌. 색은 `tokens.css`의 `--c-member-1~5`, 개수는 `MEMBER_COLORS`(규칙의 `validColor`와 같이 바꿀 것).
- 종류 이모지는 저장하지 않고 화면에서 이름으로 고름(`kindEmoji`: 러닝 🏃, 걷기 🚶, 자전거 🚴, 요가 🧘 …, 근력 🏋️, 모르는 유산소 🏃 / 기타 ✨).

### 보안 규칙 요점 (`firestore.rules`)

- users: 본인만 생성·수정. 읽기는 본인 + **그룹이 하나라도 겹치는 사람**. 수정은 다섯 가지만: 닉네임 / 예전 형식 바꾸기 / `groupIds`에 하나 추가(최대 3개, 그 그룹 `memberIds`에 내가 실제로 들어가야 함) / 하나 빼기(그 그룹에서도 빠지거나 그룹이 지워져야 함) / `cheersSeenAt`(서버 시각만).
- groups: `get`은 로그인한 누구나(id는 코드로만 알 수 있음), `list` 불가. 수정은 네 가지만: 들어가기(나 자신만 추가, 5명 이하, 내 `groupIds`에도 추가, `colors`에 내 색 추가) / 나가기(나 자신만 빠짐, 내 `groupIds`에서도 빠짐, `colors`에서 내 칸만 빠짐) / 이름 바꾸기(멤버 누구나, 1~20자) / 내 색 넣기(예전 그룹, 멤버만). 색은 1~5, 다른 멤버가 쓰는 색 불가, 남의 색은 못 바꿈. 삭제는 마지막 한 명이 나갈 때 초대 코드와 같이.
- inviteCodes: `get`만 가능. 그룹 생성 요청 안에서만 생성, 그룹 삭제 요청 안에서만 삭제, 수정 불가.
- users/{uid}/workouts, workoutFavorites: **본인만** 읽고 씀. 그룹 멤버도 못 읽음 (무게·세트·심박수 등 상세).
- users/{uid}/workoutSummaries: 읽기는 `sharesGroupWith(uid)`(본인 또는 그룹이 겹치는 사람. `resource.data`를 안 봐서 목록 조회 가능), 쓰기는 본인만(`validSummary`: 필드 7개만, 한마디 50자 이하, `updatedAt`은 서버 시각).
- users/{uid}/cheers: 읽기는 `sharesGroupWith(uid)`. 만들기는 그룹이 겹치는 다른 사람만(내 기록엔 못 누름), `from`은 나, 이모지 4개 중 하나, 문서 id = `workoutId_나_emoji`, 요약이 실제로 있어야 함. 지우기는 누른 사람(취소) 또는 주인(기록 삭제 때 정리). 수정 불가.
- 그 밖의 하위 컬렉션은 규칙이 없어서 막혀 있음.
- 필드를 추가하면 규칙의 `keys().hasOnly([...])`와 `affectedKeys().hasOnly([...])`도 같이 고쳐야 함.
- 규칙을 바꾼 뒤에는 Firebase 콘솔에 다시 붙여넣어 게시해야 적용됨.

## 결정 사항 / 알려진 한계

- **그룹 없이도 앱을 다 쓸 수 있음.** 운동 기록은 그룹이 아니라 `users/{uid}` 아래에 저장돼서, 나중에 그룹에 들어가도 옮길 필요 없음. 그룹 선택 화면은 가입 직후 한 번만 자동으로 뜸.
- **한 사람은 그룹 최대 3개** (`MAX_GROUPS`, 규칙의 `after.size() <= 3`과 같이 바꿀 것), 그룹 하나는 최대 5명. 그룹마다 이름이 있음.
- 그룹 나가기는 있음. **멤버 내보내기, 그룹장 권한은 없음** (누구나 이름을 바꿀 수 있고, 만든 사람도 다른 멤버와 같음).
- 같이 탭 데이터(요약·응원)는 그룹이 아니라 **사람 아래**에 있고, 화면에서 그룹으로 걸러 봄("전체" = 내 모든 그룹 멤버). 나중에 그룹 하위 컬렉션(`groups/{id}/...`)이 필요하면 규칙은 그 그룹 `memberIds` 기준으로.
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
- [x] **2단계 — 운동 기록**: eatsylog의 운동 기능을 옮겨옴 (블록 방식: 유산소 / 근력 / 기타, 즐겨찾기, 무게 추이). "내 기록" 탭. 위 "운동 기록" 참고
  - [x] eatsylog 기존 기록 옮기기: `migrate.html`로 `workouts`·`workoutFavorites` 복사 + 요약 생성, 결과 확인 후 페이지 지움 (위 "옮겨오기" 참고)
- [x] **3단계 — 영상 코스** (요청서의 "5단계"): `courses.json` 코스 목록·카테고리 칩, 상세, 앱 안 재생(IFrame Player API), 화면 꺼짐 방지, 퍼가기 막힘 → 유튜브에서 보기, 완료 폼 → "홈트" 기록 + 요약. 운동하기 탭 "+ 직접 기록". 위 "영상 코스" 참고
- [x] **4단계 — 같이 탭** (요청서의 "6단계"로 먼저 진행): 요약 공유, 한마디, 피드, 응원 반응 4개, 새 반응 점·목록, 그룹 달력(멤버 색), 운동하기 탭 친구 소식. 위 "같이 탭 · 요약 공유" 참고
  - [ ] "내 기록" 날짜 고르기도 점 달력으로 바꾸기
  - [ ] 푸시 알림 (아래 "푸시 알림" 참고)
- [ ] **5단계 — 따라하기 코스**: 동작 사전 + 타이머 플레이어

## 테스트 방법 (참고)

빌드 도구가 없어서 저장소에는 테스트 코드를 두지 않음. 작업 때 임시 폴더에서 다음 방법으로 확인함.
- 보안 규칙: Firebase 에뮬레이터 + `@firebase/rules-unit-testing` (가입, 그룹 만들기·들어가기·나가기·이름 바꾸기, 5명·3개 제한, 겹치는 그룹만 읽기, 예전 형식 바꾸기, 초대 코드 형식, 운동 기록 본인만 등 88개 항목)
- 화면: 로컬 서버 + Playwright(iPhone 13, iPhone SE 화면) + Auth/Firestore 에뮬레이터
  - 가입·그룹: 그룹 없이 쓰기, 그룹 3개·칩 전환·이름 바꾸기·나가기·다시 들어가기, 5명 가득 참, 예전 형식 프로필 바꾸기, 로그인·재설정 등 48개 항목
  - 2단계: 기록 추가·수정·삭제, 저장된 문서가 eatsylog 형식과 똑같은지, 예전 형식 기록 읽기·변환, 즐겨찾기, 종목 추천, 무게 추이 등 46개 항목
  - 같이 탭: 예전 기록 요약 채우기, 기록+요약+한마디 저장(기록엔 한마디 없음), 친구 소식, 피드(상세 안 보임), 반응 누르기·취소, 탭 점·새 반응·읽음, 그룹 달력·멤버 색(저장·나가도 유지·예전 그룹 채우기), 그룹 밖 반응 자물쇠, 수정·삭제 때 요약·응원 따라 바뀜 (12개 흐름, 세 사용자)
- 멤버 색 규칙 19개 항목 (만들기·들어가기 때 색 필수, 겹치는 색·남의 색 불가, 나가면 내 칸만 빠짐, 예전 그룹 색 넣기)
- 같이 탭 규칙: 요약 읽기(겹치는 그룹만), 상세는 여전히 본인만, 반응 한 번만·취소·내 기록 불가·그룹 밖 불가, 한마디 50자(한글), 읽음 표시 등 29개 항목
- 영상 코스: 유튜브 API를 가짜 스크립트로 가로채서 Playwright(iPhone 13 세로·가로). 칩 거르기, 영상 끝 → 시간 자동 입력 → 저장한 기록이 기타 블록 형식·요약 "홈트"·한마디, 중간에 나가면 기록 없음·플레이어 정리, 퍼가기 막힘/스크립트 실패 → 유튜브에서 보기·`minutes`로 채움, Wake Lock 요청·해제·없는 기기 (26개 항목)
- 기록 옮기기: 에뮬레이터에 프로젝트 두 개(eatsylog/in2size) + Playwright. 새 형식·예전 형식·날짜 없는 기록, 즐겨찾기 이름 겹침, 미리보기 문구, 내용 그대로 복사, 요약 규칙 통과, 두 번 옮겨도 중복 없음·한마디 유지, eatsylog 데이터 안 바뀜
- 가입 직후 바로 다른 탭으로 넘어가는 타이밍 문제가 있었어서, 운동 기록 흐름은 여러 번 반복해서 돌려 볼 것
- Firebase JS를 에뮬레이터로 돌리려면 gstatic 주소를 npm `firebase` 패키지의 같은 이름 파일로 가로채고, `js/firebase.js` 끝에 `connectAuthEmulator`·`connectFirestoreEmulator`를 붙여서 띄움
