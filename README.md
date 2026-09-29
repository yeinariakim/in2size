# In2Size

**Into Fitness. Into Shape. 2gether.**
친구(최대 5명)와 함께 운동 코스를 따라 하고, 기록하고, 서로 응원하는 웹앱.

https://yeinariakim.github.io/in2size/

바닐라 HTML/CSS/JS + Firebase(Auth, Firestore). 빌드 과정 없이 파일 그대로 GitHub Pages에 올립니다.
작업 규칙과 데이터 구조는 [CLAUDE.md](CLAUDE.md)에 있어요.

## 처음 한 번만: Firebase 콘솔 설정

[Firebase 콘솔](https://console.firebase.google.com/) → `in2size` 프로젝트에서 진행합니다.

1. **로그인 방법 켜기**
   빌드 → Authentication → 시작하기 → Sign-in method → **이메일/비밀번호** → 사용 설정 → 저장
2. **승인된 도메인 추가**
   Authentication → 설정 → 승인된 도메인 → 도메인 추가 → `yeinariakim.github.io`
3. **Firestore 만들기** (아직 없다면)
   빌드 → Firestore Database → 데이터베이스 만들기 → 위치 선택(예: `asia-northeast3` 서울) → **프로덕션 모드**로 시작
4. **(선택) 비밀번호 재설정 메일 문구**
   Authentication → 템플릿 → 비밀번호 재설정 → 템플릿 언어를 한국어로. 앱에서도 한국어로 요청합니다.

## 보안 규칙 붙여넣기

`firestore.rules`를 바꿀 때마다 이 과정을 다시 해야 적용돼요.

1. 이 저장소의 [`firestore.rules`](firestore.rules) 파일을 열고 **내용 전체를 복사**합니다.
   GitHub에서 파일을 연 다음 오른쪽 위의 "Copy raw file" 버튼을 쓰면 편해요.
2. Firebase 콘솔 → **Firestore Database** → 위쪽 **규칙** 탭으로 갑니다.
3. 편집기에 있던 내용을 **모두 지우고**(Ctrl/Cmd + A → Delete) 복사한 내용을 붙여넣습니다.
4. 오른쪽 위 **게시**를 누릅니다. 빨간 오류 표시가 없으면 끝이에요. 적용까지 1분 정도 걸릴 수 있어요.

## GitHub Pages 배포

저장소 → Settings → Pages → Build and deployment
- Source: **Deploy from a branch**
- Branch: **main** / **/(root)** → Save

`main`에 푸시하면 1~2분 뒤 자동으로 반영돼요.
홈 화면 앱은 서비스 워커 캐시를 쓰지만 온라인이면 항상 새 파일을 먼저 받아요.

## 로컬에서 보기

ES 모듈이라 파일을 더블클릭하면 안 되고, 간단한 서버가 필요해요.

```bash
python3 -m http.server 8000
# http://localhost:8000 열기
```

`localhost`는 Firebase 승인된 도메인에 기본으로 들어 있어요.

## 아이폰 홈 화면에 추가

Safari로 주소를 열고 → 공유 버튼 → **홈 화면에 추가**. 주소창 없이 앱처럼 열려요.
