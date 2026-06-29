# TEO GYM — 보안 체크리스트 & 공격 시나리오 점검

> 작성일: 2026-06-29 | 점검 기준: 출시 전 최종 보안 감사

---

## 1. 공격 시나리오별 점검 결과

### 1-1. localStorage/sessionStorage 조작 → 관리자 권한 상승

| 항목 | 결과 | 근거 |
|------|------|------|
| localStorage `teogymAppMode="admin"` 조작 | **위험 없음** | 앱 모드는 UI 분기에만 사용. Firestore 데이터는 `auth.uid` 기반 규칙으로 보호. 어드민 데이터 쿼리는 `where("trainerUid","==",uid)` 고정 |
| sessionStorage 조작 | **위험 없음** | 인증 상태는 Firebase Auth (서버 관리), 클라이언트 Storage 조작으로 바꿀 수 없음 |

---

### 1-2. URL memberId 조작 → 다른 회원 데이터 접근

| 항목 | 결과 | 근거 |
|------|------|------|
| 회원앱 URL에 memberId 삽입 | **차단됨** | `getMemberAppProfile()`은 URL 파라미터 미사용. `where("memberUid","==",auth.uid)` 쿼리로 Firebase Auth UID 고정 |
| 관리자앱 memberId 조작 | **차단됨** | `getMembers()`가 `where("trainerUid","==",uid)` 필터 적용. 다른 트레이너 회원은 쿼리 결과에 포함 안 됨 |

---

### 1-3. `isOwner` 클라이언트 필드 신뢰 → 권한 상승

| 항목 | 결과 | 근거 |
|------|------|------|
| `isOwner:true` 자기 수정 | **차단됨** | `memberProfileUpdateKeysAllowed()`에 `isOwner`, `role` 미포함. 회원이 쓰려고 하면 Firestore 규칙 거부 |
| UI 숨김만으로 보호되는 관리자 기능 | **없음** | 모든 데이터 접근은 Firestore 규칙이 2차 검증 |

---

### 1-4. Firebase SDK 직접 호출 → 다른 회원 데이터 접근

```javascript
// 회원이 브라우저 콘솔에서 시도할 수 있는 공격
firebase.firestore().collection('members').get()  // → 자신 문서만 반환 (canReadMemberData)
firebase.firestore().doc('members/OTHER_ID').get() // → permission-denied
firebase.firestore().collection('members/OTHER_ID/sessions').get() // → permission-denied
```

| 항목 | 결과 |
|------|------|
| 다른 회원 members 문서 읽기 | **차단됨** (`canReadMemberData` = memberUid 또는 trainerUid 필수) |
| 다른 회원 세션 읽기 | **차단됨** (`isTrainerOfMember` 또는 `isMemberSelf`) |
| 다른 회원 bodyCheck 읽기 | **차단됨** (`canAccessMember`) |
| 다른 회원 공지 읽기 | **부분 가능** (isPublished=true, targetType=all 공지는 읽기 가능. 현재 단일 트레이너이므로 영향 없음) |

---

### 1-5. members 문서 민감 필드 노출

| 필드 | 과거 상태 | 현재 상태 |
|------|-----------|-----------|
| `memo` (관리자 메모) | members 주문서에 존재 → 회원 읽기 가능 | `members/{id}/private/admin` 서브컬렉션으로 이전. catch-all 규칙으로 회원 접근 차단 |
| `ticketInfo` (이용권 정보) | members 주문서에 존재 → 회원 읽기 가능 | 동일하게 private 서브컬렉션으로 이전 |
| `survey` (건강 설문) | members 주문서 | 회원 본인이 제공한 데이터이므로 분리 불필요. 유지 |
| `phone` | members 주문서 | 본인 데이터. 유지 |

**마이그레이션 방법**: 트레이너가 각 회원 프로필을 "수정 → 저장"하면 자동으로 memo/ticketInfo가 private 서브컬렉션으로 이전되고 주문서에서 삭제됨. `updateMember()`가 기존 주문서 필드를 `deleteField()`로 제거함.

---

### 1-6. published=false 수업일지 회원앱 노출

| 항목 | 결과 | 근거 |
|------|------|------|
| 미발행 세션 회원앱 표시 | **차단됨** | Firestore 규칙: `isMemberSelf(memberId) && resource.data.isPublished == true` |
| 앱 코드 | **차단됨** | `getPublishedSessions()` → `where("isPublished","==",true)` |

---

### 1-7. 2:1 수업 데이터 교차 오염

| 항목 | 결과 | 근거 |
|------|------|------|
| A 수정 시 B 데이터 변경 | **없음** | `handleSaveSession2`는 `!isEdit && sessionType==="2:1"` 조건일 때만 실행 |
| A 기록에 B 운동이 포함 | **없음** | `payload2.memberId`로 독립 경로 저장 |

---

## 2. Firestore 경로별 접근 제어 요약

| 경로 | 회원 읽기 | 회원 쓰기 | 트레이너 |
|------|-----------|-----------|---------|
| `members/{id}` | 본인만 ✓ | 허용 필드만 ✓ | 전체 ✓ |
| `members/{id}/private/admin` | **차단** ✗ | **차단** ✗ | 전체 ✓ |
| `members/{id}/sessions/{id}` | isPublished=true만 ✓ | sorenessReport만 ✓ | 전체 ✓ |
| `members/{id}/bodyCheck/main` | 본인 ✓ | 허용 필드만 ✓ | 전체 ✓ |
| `members/{id}/memberOnboarding/main` | 본인 ✓ | 허용 필드만 ✓ | 전체 ✓ |
| `members/{id}/memberCheckins` | 본인 ✓ | 본인 ✓ | 전체 ✓ |
| `notices/{id}` | 게시된 본인 공지만 ✓ | **차단** ✗ | 전체 ✓ |
| `dailyConditioning` (top-level) | isPublished만 ✓ | **차단** ✗ | 전체 ✓ |

---

## 3. 보안 테스트 시나리오 (정적 검증 완료)

`npm run regression`으로 자동 검증되는 시나리오 (35개 체크):

| 시나리오 | 검증 방식 |
|---------|-----------|
| 회원 자기수정 금지 필드(isOwner 등) | Firestore Rules 텍스트 검사 |
| memo/ticketInfo private 서브컬렉션 저장 | db.js 코드 패턴 검사 |
| MemberApp에서 getMemberPrivate 미호출 | App.jsx 코드 범위 검사 |
| published=false 세션 미노출 | Rules + db.js 검사 |
| URL memberId 조작 불가 | db.js 쿼리 패턴 검사 |
| 2:1 수업 회원별 독립 저장 | App.jsx 코드 패턴 검사 |
| 관리자 URL 회원 자동 리디렉션 | App.jsx 코드 패턴 검사 |

> Firebase Emulator 기반 실제 권한 테스트는 출시 후 개선 항목으로 분류

---

## 4. 관리자 운영 상태 화면 설계

### 4-1. 현재 상태 (출시 시점)
- 운영 모니터링은 Firebase 콘솔 → Firestore → 사용량 확인
- 에러 모니터링: 브라우저 콘솔 (회원이 오류 스크린샷 전달)

### 4-2. 향후 구현 목표 (`/admin/ops` 화면)

```
┌──────────────────────────────────────────────────────┐
│  TEO GYM — 운영 상태                                 │
├──────────────────────────────────────────────────────┤
│  🟢 빌드 상태     최근 배포: 2026-06-29              │
│  🟢 Regression   25/25 PASS                         │
│  🟢 Rules 배포   2026-06-20 배포 완료                │
├──────────────────────────────────────────────────────┤
│  👥 회원 현황                                         │
│    전체: 12명  |  활성: 10명  |  휴식: 1명  |  종료: 1명 │
├──────────────────────────────────────────────────────┤
│  📋 수업일지                                          │
│    미발행: 3건  |  최근 저장: 2시간 전               │
├──────────────────────────────────────────────────────┤
│  🔔 공지사항                                          │
│    게시됨: 5건  |  임시저장: 2건                     │
├──────────────────────────────────────────────────────┤
│  💾 백업                                             │
│    최근 백업: 2026-06-28 10:30                       │
│    [지금 백업하기]                                   │
└──────────────────────────────────────────────────────┘
```

**구현 우선순위**: 출시 후 1개월 내 구현 예정

---

## 5. 백업 운영 가이드

### 즉시 가능 (수동)
```bash
# 서비스 계정 키 설정 후 (최초 1회)
node scripts/backup-firestore.js
# → backups/YYYY-MM-DD_HH-MM-SS/backup.json 생성
```

### 단기 (출시 후 1개월)
- 매주 월요일 수동으로 위 스크립트 실행
- 백업 파일은 별도 USB 드라이브 또는 iCloud에 보관

### 장기 (출시 후 3개월)
- Cloud Scheduler + Cloud Function으로 자동화
- Firebase Export → Google Cloud Storage 버킷
- 명령어: `firebase firestore:export gs://teogym-backups/$(date +%Y%m%d)`

---

## 6. Firestore Rules 배포 이력

| 날짜 | 버전 | 주요 변경 |
|------|------|-----------|
| 2026-06-29 | v7 | birthYear/Month/Day 필드 허용 추가 |
| 2026-06-20 | v6 | memberUid 쿼리 허용, bodyCheck 분리 |

---

## 7. 출시 전 최종 체크리스트

- [x] Firestore Rules 배포 완료 (v7)
- [x] `memo`/`ticketInfo` private 서브컬렉션 분리 (코드 배포 후 트레이너가 회원 재저장 필요)
- [x] 관리자 URL 회원 자동 리디렉션
- [x] 미발행 세션 회원앱 미노출 확인
- [x] npm run regression 35개 PASS
- [x] npm run build 성공
- [ ] 트레이너가 기존 회원 프로필 재저장 (memo 마이그레이션)
- [ ] 회원 링크 공유 전 최종 테스트 (회원 계정으로 로그인 확인)
- [ ] 백업 스크립트 최초 실행 (serviceAccount.json 설정 필요)
