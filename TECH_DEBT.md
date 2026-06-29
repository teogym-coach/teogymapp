# TEO GYM — 기술 부채 및 장기 개선 계획

> 출시 후 안정화 시 참조 문서 | 작성일: 2026-06-29

---

## 1. App.jsx 분리 전략

### 현황
App.jsx: 13,000+ 줄, 283개 함수, 328개 useState, 23개 화면 컴포넌트가 단일 파일에 존재.

### 원칙 (대규모 리팩터 금지)

1. **기존 App.jsx 한 번에 쪼개지 말 것** — 회귀 위험이 너무 큼, 테스트 없이 불가
2. **신규 기능은 별도 파일부터** — 새 화면/컴포넌트는 처음부터 `src/components/`에 작성
3. **기존 기능 수정 시 틈새 분리** — 해당 화면 수정 작업 기회에 함께 파일 분리
4. **공통 UI 먼저 분리** — `Btn`, `Mo`, `Bdg`, `Card`, `Spin` 등 유틸 컴포넌트부터

### 권장 분리 순서 (출시 후 점진적)

```
1단계 (출시 후 1개월): 공통 UI 컴포넌트
   src/components/ui/Button.jsx
   src/components/ui/Badge.jsx
   src/components/ui/Card.jsx
   src/components/ui/Spinner.jsx

2단계 (출시 후 2-3개월): 독립적인 화면
   src/screens/NoticeAdminScreen.jsx  ← 다른 상태 의존성 가장 적음
   src/screens/HomeScreen.jsx
   src/screens/LibraryScreen.jsx

3단계 (회원 100명): 핵심 화면
   src/screens/HubScreen.jsx          ← 가장 크고 복잡, 마지막에
   src/screens/SessionScreen.jsx
   src/screens/MemberForm.jsx

4단계: 데이터 레이어 훅
   src/hooks/useMembers.js
   src/hooks/useSessions.js
   src/hooks/useMemberData.js
```

### 분리 시 주의사항

- `showToast`, `setScreen`, `loadMembers` 같은 콜백은 props로 전달하거나 Context로 이전
- 분리 후 반드시 `npm run regression` + 수동 UI 테스트 필수
- 한 PR에서 한 화면씩만 분리 (여러 파일 동시 이전 금지)

---

## 2. BodyCheck 구조 개선 (100명 전 마이그레이션 필요)

### 현재 구조

```
members/{memberId}/bodyCheck/main
  └─ records: [{date, weight, fatMass, muscleMass, ...}, ...]  ← 배열 누적
```

### 장점 (현재)
- 단일 문서 1회 읽기로 전체 이력 조회
- 구현이 단순

### 위험

| 상황 | 위험 |
|------|------|
| 매일 기록 시 | 1년 = 365건, 5년 = 1,825건 |
| 문서 크기 제한 | Firestore 문서 최대 1MB |
| 한 건당 평균 크기 | ~500 bytes |
| 위험 도달 시점 | 약 2,000건 (일 2회 기록 시 약 3년) |

### 권장 구조 (마이그레이션 후)

```
members/{memberId}/bodyCheckRecords/{dateId}
  └─ { date, weight, fatMass, muscleMass, bmi, ..., recordedAt }
```

- 날짜별 독립 문서 → 크기 제한 없음
- 범위 쿼리 가능: `where("date", ">=", startDate).limit(90)` 
- 특정 날짜 수정/삭제가 쉬워짐

### 마이그레이션 계획 (출시 후 별도 작업)

1. 새 subcollection에 기존 records 배열 이전 (스크립트 작성)
2. saveMemberHealthInputs → 새 경로로 쓰기
3. getBodyCheck → 새 경로에서 쿼리 (최근 90일 기본)
4. 구 문서 유지 기간: 6개월 후 삭제
5. **Firestore Rules 변경 필요 → 사전 승인 후 진행**

---

## 3. Push Notification 설계 (FCM)

### 목표
회원이 앱을 직접 열지 않아도 중요 알림을 받을 수 있게 함.
재방문율 향상에 가장 큰 영향을 주는 단일 기능.

### 알림 시나리오

| 트리거 | 알림 내용 | 우선순위 |
|--------|----------|---------|
| 트레이너가 수업일지 발행 | "수업일지가 등록되었습니다. 확인해보세요!" | 상 |
| 트레이너 코멘트 등록 | "대표님 코멘트가 등록되었습니다" | 상 |
| 새 공지사항 게시 | "새 공지사항이 있습니다" | 중 |
| 주 1회 건강 기록 독려 | "이번 주 체중을 기록해보세요" | 중 |
| 생일 | "생일 축하드립니다! 오늘도 건강하게!" | 하 |
| 다음 수업 1시간 전 | "1시간 후 수업이 있습니다" | 하 |

### 기술 스택

```
Firebase Cloud Messaging (FCM)
  ← 웹 PWA 지원 (Service Worker 필요)
  ← Firebase Functions에서 서버 측 발송
  ← 회원 FCM Token을 members/{id} 에 저장
```

### 구현 단계

```
1단계: FCM Token 수집
   - 회원 로그인 시 FCM Token 요청/저장
   - members/{id}/fcmToken 필드 추가
   - Firestore Rules 업데이트

2단계: Firebase Functions 발송 함수
   - functions/index.js 에 sendNotification 함수 추가
   - 트리거: Firestore onWrite (sessions, notices)

3단계: Service Worker 설정
   - public/firebase-messaging-sw.js 작성
   - HTTPS 필수 (Vercel 배포 환경은 이미 HTTPS)

4단계: 회원 알림 설정 화면
   - 회원이 알림 종류 on/off 가능
```

### 사전 조건
- Firebase 프로젝트 Blaze 플랜 (Functions 사용 시 필요)
- HTTPS 도메인 (Vercel 기본 제공)
- 회원 브라우저에서 알림 권한 허용

---

## 4. 관리자 홈 운영 대시보드 설계

### 현재 HomeScreen (src/App.jsx:1969)
- TEO GYM 브랜드 헤더
- 회원 관리 버튼
- 공지사항 버튼

### 목표 구조 (출시 후 1개월 구현)

```jsx
// src/screens/HomeScreen.jsx (분리 후)
function HomeScreen({ setScreen, loadMembers, members }) {
  return (
    <>
      <BrandHeader />
      <TodayCheckpoint members={members} />   // 오늘 현황 요약
      <QuickActions setScreen={setScreen} loadMembers={loadMembers} />
    </>
  );
}
```

### TodayCheckpoint 컴포넌트가 보여줄 정보

| 항목 | 데이터 소스 | 구현 난이도 |
|------|------------|------------|
| 전체 회원 수 | members.length | 쉬움 |
| 활성 회원 수 | members.filter(status==="active") | 쉬움 |
| 생일인 회원 | members.filter(birthday===today) | 쉬움 |
| 미발행 수업일지 | sessionsMap 순회 | 중간 |
| 최근 가입 회원 | members.sort(createdAt).slice(0,3) | 쉬움 |
| 이번 주 수업 예정 | sessions 필드 없음 — 별도 schedule 구현 필요 | 어려움 |

### 구현 전 필요한 변경
1. `loadMembers()` 를 HomeScreen 진입 시 자동 호출 (현재는 회원관리 버튼 클릭 시만)
2. HomeScreen props에 `members`, `sessionsMap` 추가
3. App.jsx 렌더링에서 `<HomeScreen members={members} sessionsMap={sessionsMap} ...>`

---

## 5. 다중 트레이너 지원

### 현재 구조의 한계
- 모든 데이터가 `trainerUid = 단일 UID`로 연결
- 직원 추가 시 별도 Firebase 프로젝트 또는 구조 변경 필요

### 미래 구조 (결정 전 논의 필요)

```
Option A: 팀(Gym) 개념 추가
  gyms/{gymId}/members/{memberId}
  gyms/{gymId}/trainers/{uid}
  → 구조 변경 최대, 완전 마이그레이션 필요

Option B: 역할 필드 추가
  members/{id}.trainerUid = 담당 트레이너 uid
  trainers/{uid}.gymId = 소속 체육관
  → 현재 구조 유지, 트레이너 간 공유 기능만 추가

Option C: 현행 유지 (단일 관리자)
  → 개인 PT샵에는 현재로도 충분
  → 확장 시 재논의
```

**현재 권고: Option C (현행 유지)** — 회원 100명 이후 실제 필요성 확인 후 결정.

---

## 6. 에러 모니터링 성숙화

### 현재 (출시 시점)
- Sentry 연동 코드 준비 완료 (DSN만 설정하면 활성화)
- console.error 로 오류 출력

### 출시 후 1개월
- Sentry DSN 설정 후 운영 오류 수집 시작
- 주 1회 Sentry 대시보드 확인

### 출시 후 3개월
- Sentry alerting 설정 (오류 발생 시 이메일/Slack 알림)
- 오류 빈도 기반 우선순위 패치 진행
- Performance monitoring 추가 (느린 Firestore 쿼리 탐지)

---

## 7. 성능 최적화 로드맵

### 현재 번들 현황
- main.js: 1.7MB (gzip 후 약 435KB)
- 모든 화면 코드가 첫 로딩에 포함됨

### React.lazy + Suspense 적용 (App.jsx 분리 후 가능)

```jsx
// 분리 후 적용 예시
const HubScreen = React.lazy(() => import('./screens/HubScreen'));
const SessionScreen = React.lazy(() => import('./screens/SessionScreen'));

// 예상 효과: 초기 bundle 40-60% 감소
```

### getMembers() 최적화 (회원 100명+)

```javascript
// 현재: 전량 로드
const snap = await getDocs(query(...));

// 개선: 페이지네이션 또는 실시간 리스너
const q = query(..., limit(30), startAfter(lastDoc));
// 또는
const unsub = onSnapshot(query(...), snap => setMembers(...));
```

---

## 8. 백업 자동화 로드맵

### 현재: 수동 실행
```bash
node scripts/backup-firestore.js
```

### 단기 (출시 후 1개월): GitHub Actions
```yaml
# .github/workflows/backup.yml
on:
  schedule:
    - cron: '0 1 * * 1'  # 매주 월요일 오전 10시 (KST)
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: node scripts/backup-firestore.js
        env:
          GOOGLE_APPLICATION_CREDENTIALS_JSON: ${{ secrets.SERVICE_ACCOUNT_JSON }}
```

### 장기 (회원 100명+): Firebase Export
```bash
# Cloud Scheduler로 자동화
gcloud scheduler jobs create http teogym-weekly-backup \
  --schedule="0 1 * * 1" \
  --uri="https://firestore.googleapis.com/v1/projects/[PROJECT]/databases/(default):exportDocuments" \
  --message-body='{"outputUriPrefix":"gs://teogym-backups/"}'
```
