# TEO GYM — 출시 최종 체크리스트

> 마지막 업데이트: 2026-06-29 | 상태: 출시 준비 완료

---

## 현재 완료된 항목 (코드 반영 완료)

- [x] **Private 마이그레이션 완료** — F12 콘솔에서 "전체 24명 회원 — 민감 필드 마이그레이션 완료" 확인됨 (회원 재저장 불필요)
- [x] **Regression 53/53 PASS**
- [x] **Build 성공** (439.8 kB gzip, 경고 없음)
- [x] **ErrorBoundary 추가** — `src/ErrorBoundary.jsx`, 앱 전체 감싸기 완료
- [x] **Sentry 연동 코드 준비** — DSN만 설정하면 즉시 활성화 (production 전용)
- [x] **Firestore Rules 배포 완료** (v7)
- [x] **manifest.json `start_url` 수정** (`/?app=member` → `/member`, 회원앱 공식 주소로 정리)
- [x] **Firestore read 최적화** — 회원 목록 세션 95% 절감, 회원앱 병렬 로드
- [x] **보안 강화** — private 서브컬렉션 분리, 관리자 URL 차단, URL memberId 조작 차단

---

## 대표가 직접 해야 할 항목 (코드 변경 없음)

### 출시 전 필수 (30-60분)

- [ ] **회원 계정으로 전체 플로우 테스트** (아래 4번 참조)
- [ ] **관리자 계정으로 전체 플로우 테스트** (아래 3번 참조)
- [ ] **Firebase Console HTTP Referrer 제한 설정** (`FIREBASE_SECURITY_SETUP.md` 참조)

### 출시 전 권장 (1시간)

- [ ] **Sentry DSN 설정** — sentry.io 가입 → 프로젝트 생성 → Vercel 환경변수에 `REACT_APP_SENTRY_DSN` 추가 → 재배포
  - DSN 없어도 앱 동작에 영향 없음. 하지만 설정하면 운영 오류 실시간 파악 가능.

---

## 1. 빌드 및 배포 확인 ✅

- [x] `npm run regression` — 53/53 PASS
- [x] `npm run build` — 에러 없음, 439.8 kB
- [ ] Vercel 최신 배포 URL 접속 확인 (배포 후 확인)
- [ ] 배포 URL이 `teogymapp.vercel.app` 또는 실제 도메인인지 확인

---

## 2. Firebase 설정 확인

- [x] **Firestore Rules 배포 완료** (v7 — 2026-06-29)
- [ ] **Firebase Console HTTP Referrer 제한** — `FIREBASE_SECURITY_SETUP.md` §1 참조
- [ ] **Firebase Authentication 승인 도메인** — `teogymapp.vercel.app` 포함 여부 확인
- [ ] **Firestore 인덱스** — Firebase Console → Firestore → Indexes 에러 없음 확인

---

## 3. 관리자 계정 테스트

- [ ] 관리자 계정으로 로그인
- [ ] F12 Console → "[TEO GYM] Private 마이그레이션 점검" → "✅ 완료" 확인
- [ ] 회원 목록 정상 표시
- [ ] 회원 선택 → HubScreen 진입
- [ ] 수업일지 작성 → 저장 → 목록 반영
- [ ] 수업일지 발행(게시) 동작
- [ ] 공지사항 등록/수정/삭제
- [ ] **Console Error 0개 확인**
  - Vercel SSO CORS 오류는 앱 오류가 아님 — 무시 가능 (아래 콘솔 오류 참조)

---

## 4. 회원 계정 테스트

- [ ] 회원 계정으로 로그인
- [ ] 회원앱 홈 정상 진입 (로딩 1초 이내 — 병렬 로드 최적화 완료)
- [ ] 발행된 수업일지 열람
- [ ] 건강관리 → 체중 입력 → 저장
- [ ] 온보딩/프로필 수정 → 저장
- [ ] 공지사항 목록 확인 (관리자 게시 공지만 표시)
- [ ] 변화분석 화면 확인
- [ ] 로그아웃 후 재로그인
- [ ] **Console Error 0개 확인**

---

## 5. 관리자 URL 보안 확인

- [ ] 회원 계정으로 루트 URL(`/`) 접속 → 자동 `/member` 리디렉션 확인
- [ ] 회원앱에서 `private/admin` 데이터 미노출 확인 (콘솔에 getMemberPrivate 호출 없음)

---

## 6. 모바일 테스트

- [ ] **iPhone Safari** — 로그인, 홈, 건강관리 저장
- [ ] **Android Chrome** — 로그인, 홈, 건강관리 저장
- [ ] **PWA 설치** ("홈 화면에 추가") → `/member` 진입 확인 (manifest.json `start_url` 반영)

---

## 7. 백업

- [ ] `serviceAccount.json` 설정 확인
- [ ] `node scripts/backup-firestore.js` 실행 → `backups/` 생성 확인
- [ ] 백업 파일 USB/iCloud 복사

---

## 8. Sentry 오류 모니터링 (선택)

- [ ] sentry.io 가입 → React 프로젝트 생성
- [ ] DSN 복사 → Vercel 환경변수 `REACT_APP_SENTRY_DSN` 추가
- [ ] Vercel 재배포 → Sentry 대시보드에서 연결 확인

---

## 콘솔 오류 판단 기준

| 오류 종류 | 원인 | 조치 |
|----------|------|------|
| `Vercel SSO CORS` | Vercel 자체 인증 관련 — 앱 코드 무관 | **무시 가능** |
| `Firebase permission-denied` | 로그인 전 쿼리 또는 잘못된 회원 연결 | 개별 확인 필요 |
| `[TEO GYM] getSessions error` | 특정 회원 세션 읽기 실패 | 해당 회원 Firestore 확인 |
| `Failed to fetch` | 일시적 네트워크 오류 | 새로고침으로 해결 |
| `manifest.json start_url` | 수정 완료 (`/member`) | 해결됨 ✅ |

---

## 공유 후 1주일 체크리스트

- [ ] Sentry 대시보드 오류 확인 (설정된 경우)
- [ ] 회원 피드백 수집 (불편함, 오류 신고)
- [ ] Firebase Console → Usage 읽기/쓰기 수 확인 (무료 한도: 읽기 5만/일)
- [ ] 주 1회 수동 백업 실행

---

## 참고 문서

| 문서 | 내용 |
|------|------|
| `FIREBASE_SECURITY_SETUP.md` | HTTP Referrer 제한, 승인 도메인 설정 |
| `SECURITY_CHECKLIST.md` | 공격 시나리오 점검, Firestore 경로별 보안 |
| `TECH_DEBT.md` | App.jsx 분리 전략, bodyCheck 마이그레이션, Push Notification 설계 |
| `scripts/backup-firestore.js` | 수동 백업 스크립트 |
