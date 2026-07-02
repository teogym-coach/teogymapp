# 회원앱 테스트 계정 가이드

회원앱 로그인 / 상태 차단 / 공지 / 2:1 수업을 실제 회원 데이터를 건드리지 않고 검증하기 위한 테스트 회원 운영 가이드다.

---

## 1. 테스트 회원 목록

| 이름 | 이메일 | status | 목적 |
|---|---|---|---|
| TEST 진행중 | teogym.test+active@gmail.com | `active` | 회원앱 정상 로그인 테스트 |
| TEST 휴식 | teogym.test+paused@gmail.com | `paused` | 휴식중 회원앱 접근 차단 테스트 |
| TEST 종료 | teogym.test+ended@gmail.com | `ended` | 종료 회원앱 접근 차단 테스트 |

- 세 계정 모두 Gmail의 `+` 별칭(plus addressing)을 사용한다. 실제로는 같은 Gmail 계정으로 수신되지만 Firebase Auth·Firestore에는 서로 다른 이메일로 등록되어 완전히 분리된 계정으로 동작한다.
- 세 문서 모두 `isTestMember: true`로 표시되어 실제 회원과 구분된다.

---

## 2. 테스트 회원 생성 방법

### 2-1. members 문서 생성 (관리자앱, 원클릭)

관리자앱 → **회원 목록** 화면 → `🧪 테스트 회원 관리 ▼` 펼치기 → 원하는 프리셋의 **생성** 버튼 클릭.

버튼 클릭 시 `addMember()`를 통해 아래 필드로 문서가 생성된다 (App.jsx `handleAddTestMember`, db.js `addMember`):

- `name` — 프리셋 이름 (TEST 진행중 / TEST 휴식 / TEST 종료)
- `email` — 프리셋 이메일
- `status` — 프리셋 상태값 (active / paused / ended)
- `trainerUid` — 현재 로그인한 관리자 uid (자동)
- `memberUid` — 생성 시점엔 비어 있음 (Auth 계정 연결 전이므로)
- `isTestMember: true`
- `createdAt`, `updatedAt` — `serverTimestamp()`

이미 같은 이메일의 회원 문서가 있으면 버튼이 "생성됨"으로 비활성화되어 중복 생성을 막는다. 이 버튼은 새 문서를 **생성**만 하며 기존 회원 문서를 수정하지 않는다.

### 2-2. Firebase Auth 계정 생성 (서비스 계정 키 사용 금지)

memberUid는 실제 Firebase Auth 계정의 UID여야 한다. 아래 두 방법 중 하나를 쓰고, **서비스 계정 키 JSON은 생성·다운로드하지 않는다.**

**방법 A — 관리자앱 "회원앱 초대" 버튼 (권장)**

1. 방금 생성한 TEST 회원 상세 화면으로 이동
2. `회원앱 관리 ▼` 펼치기 → **회원앱 초대** 버튼 클릭
3. 내부적으로 Firebase Auth REST API(`accounts:signUp`, 공개 API 키 사용 — 서비스 계정 불필요)로 계정을 생성하고 비밀번호 재설정 메일을 발송한 뒤, 생성된 UID를 `memberUid`에 자동 저장한다 (App.jsx `AdminMemberAppInviteButton`).
4. 테스트 이메일함(Gmail `+` 별칭이므로 전부 같은 편지함으로 수신됨)에서 비밀번호 재설정 메일을 열어 비밀번호를 설정한다.

**방법 B — Firebase 콘솔에서 수동 생성**

1. Firebase 콘솔 → Authentication → Users → **사용자 추가**
2. 이메일 + 임시 비밀번호 입력해 계정 생성
3. 생성된 UID를 복사
4. 관리자앱 → 해당 TEST 회원 상세 → `회원앱 관리 ▼` → `상세 진단 보기` → **memberUid 저장** 입력창에 UID 붙여넣고 저장

두 방법 모두 서비스 계정 키나 Auth 전체 export가 필요 없다.

---

## 3. 테스트 순서

1. **TEST 진행중** 계정 생성 → Auth 연결 → 회원앱(`teogym.test+active@gmail.com`) 로그인
   - 기대 결과: 정상 로그인, 프로필/수업일지/건강관리/공지 탭 정상 접근
2. **TEST 휴식** 계정 생성 → Auth 연결 → 회원앱(`teogym.test+paused@gmail.com`) 로그인
   - 기대 결과: "현재 회원앱 이용이 제한된 상태입니다. 이용이 필요하시면 대표에게 문의해주세요." 메시지, 내부 데이터 접근 불가
3. **TEST 종료** 계정 생성 → Auth 연결 → 회원앱(`teogym.test+ended@gmail.com`) 로그인
   - 기대 결과: 휴식중과 동일하게 접근 차단
4. 관리자앱에서 **TEST 진행중** 회원에게 공지 발행 → TEST 진행중 계정으로 회원앱 접속해 공지 탭에서 확인
5. 관리자앱에서 **TEST 진행중** 회원을 포함한 2:1 수업 생성 → 정상 저장·목록 표시 확인 (2:1 상대방은 실제 회원으로 섞지 말고 임시로 두 번째 TEST 계정을 추가로 만들어 사용하거나, 저장 후 바로 삭제)

---

## 4. 테스트 후 확인할 것

- [ ] 브라우저 콘솔에 에러가 남아있지 않은지 (특히 `[MemberProfileDebug]` 로그로 실패 지점이 의도한 분기와 일치하는지)
- [ ] 관리자앱 **회원 목록**에서 TEST 회원 카드에 `🧪 TEST` 배지가 표시되는지
- [ ] 관리자앱 홈 화면 "진행중 회원" 통계, **유입 분석**(방문 경로 통계) 화면에 TEST 회원이 섞여 있지 않은지 (`isTestMember` 기준으로 제외됨 — 5번 항목 참고)
- [ ] 실제 회원 목록/수업일지/공지에 TEST 계정 데이터가 노출되지 않는지
- [ ] 테스트가 끝나면 TEST 회원 3개를 관리자앱에서 삭제하거나(회원 카드 🗑) `paused`/`ended`로 되돌려 방치하지 않기
- [ ] Firebase Auth의 테스트용 계정(3개)도 더 이상 필요 없으면 콘솔에서 삭제

---

## 5. 실제 회원 데이터와 섞이지 않도록 주의할 점

- TEST 이메일은 반드시 `teogym.test+*@gmail.com` 형식만 사용한다. 실제 회원 이메일과 절대 겹치지 않도록 생성 버튼이 이메일 중복을 사전 차단한다.
- `🧪 테스트 회원 관리` 패널의 생성 버튼은 **새 문서 생성(addDoc)** 만 수행하며 기존 회원 문서를 업데이트하지 않는다 — 실제 회원을 실수로 덮어쓸 수 없는 구조다.
- TEO(대표 운동 기록용 owner 계정)는 테스트 회원으로 사용하지 않는다. 7번 항목 참고.
- 회원 통계(홈 화면 "진행중 회원" 카운트) / 유입 분석(방문 경로 통계) 화면은 `isTestMember` 필드로 TEST 회원을 제외하도록 이미 반영했다. 그 외 화면(회원 목록, 공지 대상, 2:1 수업 상대 선택 등)은 테스트 목적상 의도적으로 TEST 회원이 정상 노출되도록 그대로 두었다 — "실제 기능처럼 동작하는지" 확인하는 것이 테스트 목적이기 때문이다.
- 테스트가 끝나면 반드시 TEST 회원 문서와 Auth 계정을 정리한다 (4번 체크리스트 참고). 남겨두면 회원 수 카운트 자체(전체 회원 수 등 `isTestMember` 필터를 적용하지 않은 일부 화면)에는 계속 포함될 수 있다.

---

## 6. 참고 — 통계/분석 화면 영향 범위 분석

| 화면 | members 배열 사용 방식 | TEST 회원 영향 | 조치 |
|---|---|---|---|
| 홈 화면 "진행중 회원" 카운트 | `members.filter(m=>(m.status||"active")!=="ended").length` | 포함될 뻔함 | `!m.isTestMember` 조건 추가 (App.jsx `activeCount`) |
| 유입 분석(방문 경로 통계) | `members` 전체를 그대로 집계 | 포함될 뻔함 | 진입부에서 `realMembers = members.filter(m=>!m.isTestMember)`로 제외 (App.jsx `ReferralStatsScreen`) |
| 회원 목록 화면 | 검색/필터 대상에 포함 | 의도적으로 포함 | `🧪 TEST` 배지로 시각적 구분만 처리 |
| 공지 대상(`isNoticeEligibleMember`) | 상태 기반 필터만 적용 | 의도적으로 포함 | 공지 테스트 목적상 그대로 둠 |
| 2:1 수업 상대 선택 | `!m.isOwner` 필터만 적용 | 의도적으로 포함 | 2:1 테스트 목적상 그대로 둠 |
| 매출/재등록 분석 | 코드베이스에 해당 기능 자체가 없음(확인 완료) | 해당 없음 | 추후 해당 기능 추가 시 `isTestMember` 제외 필터를 함께 넣을 것 |

---

## 7. TEO(대표 운동 기록용 owner 계정) — 테스트 계정과 분리 원칙

TEO는 이 가이드의 테스트 대상이 아니다. 아래 원칙은 절대 변경하지 않는다.

- TEO는 대표(teogym12@gmail.com)가 자신의 운동 기록을 남기기 위한 **owner 회원**이다.
- `memberUid` = `fitsroc@gmail.com` Firebase Auth UID
- `trainerUid` = `teogym12@gmail.com` Firebase Auth UID
- `isOwner: true` 유지
- `isTestMember`는 설정하지 않는다 (TEO는 테스트 회원이 아니다)
- 상태가 `paused`/`ended`로 잘못 바뀌면, 일반 회원 목록의 `···` 상태 변경 메뉴에는 owner 회원이 노출되지 않으므로(`members.filter(m=>!isOwner(m))`), 회원 상세 → `회원앱 관리 ▼` → `상세 진단 보기` → **"대표 기록 상태를 진행중으로 복구"** 버튼(owner 전용, `isOwnerMember` 조건 게이트)을 사용한다. 이 버튼은 `status`/`endedAt`만 바꾸고 `memberUid`·`trainerUid`·`isOwner`는 건드리지 않는다.

---

## 관련 코드 위치

- 테스트 회원 프리셋: `src/App.jsx` `TEST_MEMBER_PRESETS`
- 생성 버튼/패널: `src/App.jsx` `MembersScreen` 내 `🧪 테스트 회원 관리` 섹션
- 생성 핸들러: `src/App.jsx` `handleAddTestMember`
- owner 상태 복구 버튼: `src/App.jsx` `AdminMemberAppPanel` 내 `restoreOwnerActiveStatus`
- 회원앱 접근 게이트: `src/db.js` `getMemberAppProfile()`, `firestore.rules` `isMemberStatusActive`
