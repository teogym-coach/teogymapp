# 회원앱 배포 점검 체크리스트

## 기술 준비 상태: 완료 ✅

**기준 커밋**: `5d3b5bc` (2026-07-01)  
**배포 환경**: Firebase `teocoach-a7fa0` / Vercel

---

## 완료된 기술 항목

| 항목 | 내용 | 상태 |
|------|------|------|
| Firestore Rules 배포 | `firebase deploy --only firestore:rules` 완료 | ✅ |
| 진행중 회원만 접근 허용 | `getMemberAppProfile` 상태 게이트 + Rules `isMemberStatusActive` | ✅ |
| 회원 pairSessions 생성 차단 | Rules `isTrainerOfMember(memberAId)` 검증 | ✅ |
| 회원 notices 생성 차단 | Rules `isVerifiedTrainer()` — `settings/trainers.uids` 검증 | ✅ |
| settings/trainers 문서 생성 | Firebase Console에서 수동 생성 완료 | ✅ |
| 트레이너 UID 등록 | `uids: ["EECG1ZAKdZh1ZbLIOh9BdTc8sSw1"]` | ✅ |
| 콘솔 민감 정보 제거 | auth.uid, memberId, Firestore 경로 로그 제거 | ✅ |
| Emulator Rules 테스트 | **103 passing, 0 failing** | ✅ |
| 빌드 확인 | `npm run build` 성공 | ✅ |
| Regression 확인 | `npm run regression` 전체 통과 | ✅ |

---

## 수동 브라우저 테스트 체크리스트

배포 전 실제 계정으로 브라우저에서 직접 확인해야 하는 항목입니다.

### 접근 제어 테스트

- [ ] **1. 진행중 회원 로그인**
  - 계정: 상태값 `active` / `pt` / `진행중` 중 하나인 회원 계정
  - 기대: 정상 로그인 → 수업일지, 건강관리, 공지 접근 가능

- [ ] **2. 휴식중 회원 로그인**
  - 계정: 상태값 `paused` / `휴식중`인 회원 계정
  - 기대: 로그인 직후 "현재 회원앱 이용이 제한된 상태입니다" 메시지 표시, 앱 내부 접근 불가

- [ ] **3. 종료 회원 로그인**
  - 계정: 상태값 `ended` / `종료`인 회원 계정
  - 기대: 위와 동일하게 접근 차단

### 관리자앱 기능 테스트

- [ ] **4. 관리자 공지 생성**
  - 방법: 관리자앱 로그인 → 공지사항 → 새 공지 작성 및 발행
  - 기대: 정상 저장, 회원앱 공지 탭에 표시됨

- [ ] **5. 관리자 2:1 수업 생성**
  - 방법: 관리자앱 → 2:1 수업 → 신규 수업 생성
  - 기대: 정상 저장, 목록에 표시됨

### 회원앱 데이터 연동 테스트

- [ ] **6. 회원앱 공지 열람**
  - 계정: 진행중 회원
  - 기대: 4번에서 발행한 공지만 표시, 다른 트레이너 공지 미표시

---

## 핵심 Rules 구조 요약

```
pairSessions create/update/delete
  → trainerUid == uid()
  → isTrainerOfMember(memberAId)   ← members 컬렉션 실제 검증

notices create/update/delete
  → trainerUid == uid()
  → isVerifiedTrainer()             ← settings/trainers.uids 목록 검증

회원앱 접근
  → getMemberAppProfile() 상태 게이트 (프론트)
  → isMemberSelfActive() (Firestore Rules)
  → 휴식중/종료/상태없음 → 모두 차단
```

---

## 참고

- 테스트 파일: `tests/rules/firestore.rules.test.mjs`
- 실행 명령: `npm run test:rules`
- settings/trainers 문서 경로: Firestore → `settings` 컬렉션 → `trainers` 문서
- 트레이너 추가 시: `uids` 배열에 Firebase UID 추가 (Firebase Console에서 직접 수정)
