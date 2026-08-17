# 회원앱 테스트 계정 가이드

회원앱 로그인 / 상태 차단 / 공지 / 2:1 수업을 실제 회원 데이터를 건드리지 않고 검증하기 위한 테스트 회원 운영 가이드다.

**운영 방식**: 각 계정을 만들어두고 관리자앱에서 `status`만 `active` ↔ `paused` ↔ `ended` ↔ `waiting`으로 바꿔가며 재사용한다. 1인 시나리오(로그인/상태 차단/공지)는 A 하나로 충분하지만, **2:1(듀오) 조합·팀 상태(teamStatus) 테스트에는 서로 다른 회원 문서 2개가 필요**해 B를 추가로 둔다.

---

## 1. 테스트 회원 정보

| 이름 | 이메일 | isTestMember | 용도 |
|---|---|---|---|
| 🧪 TEST MEMBER (A) | teogymapptest@gmail.com | `true` | 1인 시나리오(로그인/상태 차단/공지) + 2:1 상대 A |
| 🧪 TEST MEMBER B | teogym12+testb@gmail.com | `true` | 2:1 상대 B — A와 독립된 개인 status·회원앱 계정 |

- 두 계정 모두 `isTestMember: true`로 표시되어 실제 회원과 구분된다. 판별 함수(`isExcludedAdminMember`, `findTestMemberDoc` 등)는 이 필드 하나만 공유하며 이메일을 하드코딩해 판별하지 않는다 — `TEST_MEMBER_PRESETS` 배열은 어디까지나 "🧪 테스트 회원 관리" 패널에 표시할 프리셋 목록일 뿐, 실제 테스트 회원 여부 판정에는 쓰이지 않는다.
- B의 이메일 `teogym12+testb@gmail.com`은 대표님 Gmail(`teogym12@gmail.com`)의 plus 별칭이다 — 같은 편지함으로 수신되지만 Firebase Auth·Firestore에서는 완전히 별도의 계정/문서로 인식된다. 별도 이메일을 새로 만들 필요가 없다.
- A와 B는 각각 독립된 `members` 문서·독립된 `memberUid`(Auth 계정)를 가지며, 개인 `status`는 서로 완전히 독립적으로 바꿀 수 있다(예: A=active, B=waiting 동시 가능). 2:1 조합의 `teamStatus`는 이 개인 `status`와 별개 필드로 저장되어 서로 영향을 주지 않는다.

---

## 2. 테스트 회원 생성 방법 (최초 1회, A/B 각각 동일한 절차)

### 2-1. members 문서 생성 (관리자앱, 원클릭)

관리자앱 → **회원 목록** 화면 → `🧪 테스트 회원 관리 ▼` 펼치기 → A/B 각 행에서 **생성** 버튼 클릭.

버튼 클릭 시 `addMember()`를 통해 아래 필드로 문서가 생성된다 (App.jsx `handleAddTestMember`, db.js `addMember`) — `TEST_MEMBER_PRESETS` 배열의 해당 프리셋(name/email/status) 값을 그대로 사용한다:

- `name`: 🧪 TEST MEMBER (A) / 🧪 TEST MEMBER B
- `email`: teogymapptest@gmail.com / teogym12+testb@gmail.com
- `status`: `active` (최초 생성 시 기본값 — 이후 필요할 때마다 변경)
- `trainerUid` — 현재 로그인한 관리자 uid (자동)
- `memberUid` — 생성 시점엔 비어 있음 (Auth 계정 연결 전이므로)
- `isTestMember: true`
- `createdAt`, `updatedAt` — `serverTimestamp()`

이미 같은 이메일의 회원 문서가 있으면 해당 프리셋의 버튼이 "생성됨"으로 비활성화되어 중복 생성을 막는다(A/B는 이메일이 달라 서로 독립적으로 생성된다). 이 버튼은 새 문서를 **생성**만 하며 기존 회원 문서를 수정하지 않는다. **각 계정 최초 1회만 누르면 되고, 이후에는 이 문서를 계속 재사용한다.**

### 2-2. Firebase Auth 계정 생성 (서비스 계정 키 사용 금지, 최초 1회, A/B 각각)

memberUid는 실제 Firebase Auth 계정의 UID여야 한다. 아래 두 방법 중 하나를 쓰고, **서비스 계정 키 JSON은 생성·다운로드하지 않는다.**

**방법 A — 관리자앱 "회원앱 초대" 버튼 (권장)**

1. 방금 생성한 🧪 TEST MEMBER (A 또는 B) 상세 화면으로 이동
2. `회원앱 관리 ▼` 펼치기 → **회원앱 초대** 버튼 클릭
3. 내부적으로 Firebase Auth REST API(`accounts:signUp`, 공개 API 키 사용 — 서비스 계정 불필요)로 계정을 생성하고 비밀번호 재설정 메일을 발송한 뒤, 생성된 UID를 `memberUid`에 자동 저장한다 (App.jsx `AdminMemberAppInviteButton`).
4. 각 계정 이메일(`teogymapptest@gmail.com` 또는 `teogym12+testb@gmail.com`) 편지함에서 비밀번호 재설정 메일을 열어 비밀번호를 설정한다. B는 대표님 Gmail의 plus 별칭이므로 메일은 `teogym12@gmail.com` 편지함에서 받되, 로그인 시 아이디는 반드시 `teogym12+testb@gmail.com` 전체를 입력해야 한다.

**방법 B — Firebase 콘솔에서 수동 생성**

1. Firebase 콘솔 → Authentication → Users → **사용자 추가**
2. 이메일 + 임시 비밀번호 입력해 계정 생성
3. 생성된 UID를 복사
4. 관리자앱 → 해당 TEST MEMBER 상세 → `회원앱 관리 ▼` → `상세 진단 보기` → **memberUid 저장** 입력창에 UID 붙여넣고 저장

두 방법 모두 서비스 계정 키나 Auth 전체 export가 필요 없다. **Auth 계정도 최초 1회만 만들면 되고, 로그인 정보는 계속 재사용한다** (비밀번호를 안다면 이후 테스트에서 다시 로그인만 하면 됨). 비밀번호는 Claude Code가 대신 설정하거나 저장하지 않는다 — 항상 사용자가 직접 재설정 메일을 통해 설정한다.

---

## 3. 상태 전환 방법 (매 테스트마다 반복, A/B 각각 독립)

🧪 TEST MEMBER(`isTestMember: true`)는 `isExcludedAdminMember()`에 의해 일반 회원 목록·검색·모든 상태 필터에서 항상 제외된다(2026-07-15부터 있던 기존 동작, A/B 공통). 그래서 일반 회원 카드의 **`···` 상태 변경 메뉴로는 접근할 수 없다** — 대신 관리자 앱의 **`🧪 테스트 회원 관리` 패널** 안에서 A/B 각각 상태를 확인하고 변경한다.

1. 관리자앱 → 회원 목록 → `🧪 테스트 회원 관리 ▼` 펼치기
2. A/B 각 행 아래에 표시되는 **현재 상태**와 회원 ID를 확인 (두 계정은 서로 다른 행으로 완전히 분리되어 표시된다)
3. 원하는 계정의 상태 버튼 클릭(활성/휴식/종료/수업 대기) → "테스트 회원 상태를 변경할까요?" 확인 모달에서 **상태 변경** 클릭
   - **활성** → `status: "active"`
   - **휴식** → `status: "paused"`
   - **종료** → `status: "ended"`
   - **수업 대기** → `status: "waiting"`
4. 저장 후 패널이 회원 목록을 다시 조회(re-fetch)해 실제 Firestore에 저장된 상태를 그대로 보여주고 "✓ …(으)로 변경 완료 · 재조회로 확인됨" 메시지를 표시한다
5. 상태 변경 후 해당 계정 이메일로 회원앱에 로그인해 해당 상태의 동작을 확인

이 패널의 상태 변경 버튼은 `isTestMember===true`이면서 프리셋 이메일·이름이 모두 일치하는 문서에만 동작한다(`findTestMemberDoc`) — 일반 회원 상태를 이 패널에서 바꿀 수 없고, A의 버튼은 A 문서만, B의 버튼은 B 문서만 건드린다(프리셋별로 완전히 분리).

---

## 4. 테스트 순서

1. 패널에서 **활성**으로 변경 → 회원앱 로그인
   - 기대 결과: 정상 로그인, 프로필/수업일지/건강관리/공지 탭 정상 접근
2. 패널에서 **휴식**으로 변경 → 회원앱 로그인 (기존 로그인 세션이 남아있다면 새로고침 후 확인)
   - 기대 결과: "잠시 쉬어가고 있어요" 안내 화면, 내부 데이터 접근 불가
3. 패널에서 **종료**로 변경 → 회원앱 로그인
   - 기대 결과: "함께한 운동 기록을 보관하고 있어요" 안내 화면, 내부 데이터 접근 불가(휴식과 문구만 다르고 차단 정책은 동일)
4. 패널에서 **수업 대기**로 변경 → 회원앱 로그인
   - 기대 결과: 차단 없이 정상 로그인, 기존 수업일지·개인운동·건강 기록·분석 화면 조회 가능. 관리자 회원 목록의 "수업 대기" 필터에는 이 테스트 회원이 뜨지 않아야 한다(테스트 회원은 `isExcludedAdminMember`로 일반 목록·필터에서 항상 제외되기 때문)
5. 패널에서 **활성**으로 변경(원상복구) → 관리자앱에서 🧪 TEST MEMBER에게 공지 발행 → 회원앱 공지 탭에서 확인
6. **2:1 수업 조합 테스트(A+B)**: 관리자앱 2:1 새 수업 생성 화면에서 A 회원 선택 → B 회원 선택 → 조합 생성. 실제 회원과 섞을 필요 없이 A/B 두 테스트 계정만으로 완결된다.
   - 운동 기록 입력 → 저장 → 수업일지 전송(발행) → 각 회원앱 계정(A/B)으로 로그인해 각자 수업일지 확인
   - A/B 각각 다음 수업 부위(`nextWorkoutPart`) 자동 반영 확인
   - 2:1 조합의 `teamStatus` 변경(예: 종료 처리) 후 A/B 개인 `status`가 그대로 유지되는지 확인 — `teamStatus`와 개인 `status`는 저장 위치가 다른 완전히 독립된 필드다(회귀 테스트로 보호됨, 아래 "관련 코드 위치" 참고)
   - A/B 각각 서로 다른 개인 `status`(예: A=active, B=waiting)로 설정한 뒤에도 2:1 수업 생성·기록·조회가 정상 동작하는지 확인
   - 테스트 후 2:1 기록을 정리하고 싶다면 `PairSessionListScreen`에서 삭제(실제 회원과 섞이지 않으므로 남겨둬도 무방)

각 단계 사이에 브라우저 캐시로 이전 상태가 남아 보일 수 있으니, 상태를 바꾼 뒤에는 회원앱을 새로고침(강력 새로고침)하고 다시 로그인해서 확인한다.

---

## 5. 테스트 후 확인할 것

- [ ] 브라우저 콘솔에 에러가 남아있지 않은지 (특히 `[MemberProfileDebug]` 로그로 실패 지점이 의도한 분기와 일치하는지)
- [ ] 관리자앱 **회원 목록**에서 A/B 카드 모두 `🧪 TEST` 배지가 표시되는지
- [ ] 관리자앱 홈 화면 "진행중 회원" 통계, **유입 분석**(방문 경로 통계) 화면에 A/B 모두 섞여 있지 않은지 (`isTestMember` 기준으로 제외됨 — 6번 항목 참고)
- [ ] 실제 회원 목록/수업일지/공지에 테스트 데이터가 노출되지 않는지
- [ ] 2:1 `teamStatus` 변경이 A/B 개인 `status`에 영향을 주지 않는지 (독립 필드 회귀 테스트 참고 — 관련 코드 위치)
- [ ] 모든 테스트가 끝나면 **A/B 모두 상태를 `active`로 되돌려 놓기** (다음 테스트 때 바로 로그인 가능한 상태로 유지) — 계정을 삭제할 필요는 없다. 계속 재사용하는 것이 이 가이드의 핵심이다.
- [ ] 회원 문서/Auth 계정을 완전히 정리하고 싶을 때만 관리자앱에서 삭제(회원 카드 🗑) + Firebase 콘솔 Authentication에서 계정 삭제 (A/B 각각 개별 삭제)

---

## 6. 실제 회원 데이터와 섞이지 않도록 주의할 점

- 테스트 이메일은 `teogymapptest@gmail.com`(A), `teogym12+testb@gmail.com`(B) 두 개만 사용한다. 실제 회원 이메일과 겹치지 않도록 생성 버튼이 이메일 중복을 사전 차단한다.
- `🧪 테스트 회원 관리` 패널의 생성 버튼은 **새 문서 생성(addDoc)** 만 수행하며 기존 회원 문서를 업데이트하지 않는다 — 실제 회원을 실수로 덮어쓸 수 없는 구조다.
- 상태 전환(`···` 메뉴)은 🧪 TEST MEMBER A/B 카드에서만 클릭한다 — 실제 회원 카드와 혼동하지 않도록 이름 앞 `🧪` 이모지와 `🧪 TEST` 배지로 항상 구분되어 표시된다.
- TEO(대표 운동 기록용 owner 계정)는 이 테스트 계정과 완전히 별개다. 8번 항목 참고.
- 회원 통계(홈 화면 "진행중 회원" 카운트) / 유입 분석(방문 경로 통계) 화면은 `isTestMember` 필드로 A/B 모두 제외하도록 이미 반영했다 — 판별 함수가 이메일이 아닌 필드 하나만 보므로 새 테스트 계정을 추가해도 별도 코드 수정이 필요 없다. 그 외 화면(회원 목록, 공지 대상, 2:1 수업 상대 선택 등)은 테스트 목적상 의도적으로 정상 노출되도록 그대로 두었다 — "실제 기능처럼 동작하는지" 확인하는 것이 테스트 목적이기 때문이다.

---

## 7. 참고 — 통계/분석 화면 영향 범위 분석

| 화면 | members 배열 사용 방식 | 테스트 회원 영향 | 조치 |
|---|---|---|---|
| 홈 화면 "진행중 회원" 카운트 | `members.filter(m=>(m.status||"active")!=="ended").length` | 포함될 뻔함 | `!m.isTestMember` 조건 추가 (App.jsx `activeCount`) |
| 유입 분석(방문 경로 통계) | `members` 전체를 그대로 집계 | 포함될 뻔함 | 진입부에서 `realMembers = members.filter(m=>!m.isTestMember)`로 제외 (App.jsx `ReferralStatsScreen`) |
| 회원 목록 화면 | 검색/필터 대상에 포함 | 의도적으로 포함 | `🧪 TEST` 배지로 시각적 구분만 처리 |
| 공지 대상(`isNoticeEligibleMember`) | 상태 기반 필터만 적용 | 의도적으로 포함 | 공지 테스트 목적상 그대로 둠 |
| 2:1 수업 상대 선택 | `!m.isOwner` 필터만 적용 | 의도적으로 포함 | 2:1 테스트 목적상 그대로 둠 |
| 매출/재등록 분석 | 코드베이스에 해당 기능 자체가 없음(확인 완료) | 해당 없음 | 추후 해당 기능 추가 시 `isTestMember` 제외 필터를 함께 넣을 것 |

---

## 8. TEO(대표 운동 기록용 owner 계정) — 테스트 계정과 분리 원칙

TEO는 이 가이드의 테스트 대상이 아니다. 아래 원칙은 절대 변경하지 않는다.

- TEO는 대표(teogym12@gmail.com)가 자신의 운동 기록을 남기기 위한 **owner 회원**이다.
- `memberUid` = `fitsroc@gmail.com` Firebase Auth UID
- `trainerUid` = `teogym12@gmail.com` Firebase Auth UID
- `isOwner: true` 유지
- `isTestMember`는 설정하지 않는다 (TEO는 테스트 회원이 아니다)
- 상태가 `paused`/`ended`로 잘못 바뀌면, 일반 회원 목록의 `···` 상태 변경 메뉴에는 owner 회원이 노출되지 않으므로(`members.filter(m=>!isOwner(m))`), 회원 상세 → `회원앱 관리 ▼` → `상세 진단 보기` → **"대표 기록 상태를 진행중으로 복구"** 버튼(owner 전용, `isOwnerMember` 조건 게이트)을 사용한다. 이 버튼은 `status`/`endedAt`만 바꾸고 `memberUid`·`trainerUid`·`isOwner`는 건드리지 않는다.

---

## 관련 코드 위치

- 테스트 회원 프리셋: `src/App.jsx` `TEST_MEMBER_PRESETS` (배열 — A/B 두 항목, `MembersScreen`의 테스트 패널이 이 배열을 그대로 map해서 렌더링하므로 프리셋을 추가하면 UI가 자동으로 확장된다)
- 2:1 `teamStatus` ↔ 개인 `member.status` 독립성 회귀 테스트: `scripts/regression-check.js` (2:1 종료 처리와 개인 회원 상태 분리를 보호)
- 생성 버튼/패널: `src/App.jsx` `MembersScreen` 내 `🧪 테스트 회원 관리` 섹션
- 생성 핸들러: `src/App.jsx` `handleAddTestMember`
- 일반 회원 목록·집계 제외: `src/App.jsx` `isExcludedAdminMember` (`isTestMember===true`면 항상 제외 — 테스트 패널과 별개로 유지되는 안전장치)
- 테스트 전용 상태 조회/변경: `src/App.jsx` `findTestMemberDoc`(방어적 판별) · `TEST_STATUS_OPTIONS`/`TEST_STATUS_LABELS` · `TestMemberStatusConfirmModal`(확인 모달) · `handleTestMemberStatusChange`(실행)
- 일반 회원 상태 전환: `src/App.jsx` `handleStatusChange` (일반 회원 `···` 드롭다운, window.confirm)
- 두 상태 변경 경로가 공유하는 저장 함수: `src/App.jsx` `applyMemberStatusChange` → `db.js` `updateMember()` (저장 경로 단일화)
- owner 상태 복구 버튼: `src/App.jsx` `AdminMemberAppPanel` 내 `restoreOwnerActiveStatus`
- 회원앱 접근 게이트: `src/db.js` `getMemberAppProfile()`, `firestore.rules` `isMemberStatusActive` (waiting은 차단하지 않음)
