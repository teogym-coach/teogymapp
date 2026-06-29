# TEO GYM — 출시 최종 체크리스트

> 이 목록을 위에서부터 순서대로 완료한 후 회원에게 링크를 공유하세요.

---

## 사전 준비 (대표 직접 수행)

- [ ] **Firebase Console → HTTP Referrer 제한 설정** (`FIREBASE_SECURITY_SETUP.md` 참조)
- [ ] **Vercel 환경변수 확인** — `.env.example` 항목 반영 여부 확인
- [ ] **serviceAccount.json 확인** — `scripts/` 폴더에 있는지 확인 (백업용)

---

## 1. 빌드 및 배포 확인

- [ ] `npm run build` — 에러 없음 확인
- [ ] `npm run regression` — 전체 PASS 확인
- [ ] Vercel 최신 배포 URL 접속 확인
- [ ] 배포 URL이 `teogymapp.vercel.app` 또는 실제 도메인인지 확인

---

## 2. Firebase 설정 확인

- [ ] **Firestore Rules 배포 완료** — Firebase Console → Firestore → Rules 탭에서 최신 날짜 확인
- [ ] **Firebase Authentication 승인 도메인** — `teogymapp.vercel.app` 포함 여부 확인
- [ ] **Firestore 인덱스** — Firebase Console → Firestore → Indexes 탭에서 에러 없음 확인

---

## 3. 관리자 계정 테스트

- [ ] 관리자 계정으로 로그인
- [ ] 브라우저 콘솔 열기 (F12) → "[TEO GYM] Private 마이그레이션 점검" 확인
  - "✅ 마이그레이션 완료" 이면 OK
  - "⚠️ 잔류" 회원 있으면 해당 회원 → 수정 → 저장 후 재확인
- [ ] 회원 목록 정상 표시 확인
- [ ] 회원 1명 선택 → HubScreen 진입 확인
- [ ] 수업일지 작성 → 저장 → 목록 반영 확인
- [ ] 수업일지 발행(게시) 동작 확인
- [ ] 공지사항 등록 → 저장 → 목록 반영 확인
- [ ] 공지사항 게시/숨김 전환 확인
- [ ] Console Error 0개 확인

---

## 4. 회원 계정 테스트

- [ ] 회원 계정으로 로그인
- [ ] 회원앱 홈 정상 진입 확인 (로딩 2초 이내)
- [ ] 발행된 수업일지 열람 확인
- [ ] 건강관리 → 체중 입력 → 저장 확인
- [ ] 온보딩/프로필 수정 → 저장 확인
- [ ] 공지사항 목록 확인 (관리자가 게시한 공지만 표시)
- [ ] 변화분석 화면 확인
- [ ] 로그아웃 후 재로그인 확인
- [ ] Console Error 0개 확인

---

## 5. 관리자 URL 보안 확인

- [ ] 회원 계정으로 루트 URL(`/`) 접속 → 자동으로 회원앱(`/?app=member`)으로 이동되는지 확인
- [ ] 회원앱에서 `private/admin` 데이터가 노출되지 않는지 확인 (콘솔에 getMemberPrivate 호출 없음)

---

## 6. 모바일 테스트

- [ ] **iPhone Safari** — 로그인, 홈, 건강관리 저장 테스트
- [ ] **Android Chrome** — 로그인, 홈, 건강관리 저장 테스트
- [ ] **iPad** — 관리자앱 레이아웃 확인
- [ ] PWA 설치 ("홈 화면에 추가") 동작 확인

---

## 7. 데이터 무결성 확인

- [ ] 회원 추가 → Firestore Console에서 members 문서 생성 확인
- [ ] 수업일지 저장 → Firestore Console에서 sessions 서브컬렉션 확인
- [ ] 건강관리 저장 → Firestore Console에서 bodyCheck/main 확인
- [ ] 회원 삭제 → Firestore Console에서 모든 서브컬렉션(private 포함) 삭제 확인

---

## 8. 백업

- [ ] `serviceAccount.json` 설정 완료 확인 (최초 1회)
- [ ] `node scripts/backup-firestore.js` 실행 → `backups/` 폴더 생성 확인
- [ ] 백업 파일 외부 저장소 (USB, iCloud 등) 복사

---

## 9. 오류 모니터링

- [ ] Sentry 계정 생성 (sentry.io)
- [ ] 프로젝트 생성 → DSN 복사
- [ ] Vercel 환경변수에 `REACT_APP_SENTRY_DSN` 추가
- [ ] Vercel 재배포 후 Sentry 대시보드에서 연결 확인
- [ ] 테스트 에러 발생시켜 Sentry에 수집되는지 확인

---

## 10. 최종 체크

- [ ] `npm run regression` — **50개 이상 PASS**
- [ ] `npm run build` — **에러 없음**
- [ ] Console Error — **0개**
- [ ] 모바일 테스트 — **완료**
- [ ] 백업 — **완료**
- [ ] 관리자 마이그레이션 점검 — **완료**

---

## 공유 후 1주일 체크리스트

- [ ] Sentry 대시보드에서 실제 운영 오류 확인
- [ ] 회원 피드백 수집 (불편함, 오류 신고)
- [ ] Firebase Console → Usage에서 읽기/쓰기 수 확인 (무료 한도 초과 여부)
- [ ] 주 1회 수동 백업 실행

---

> **문서 위치**
> - 보안 설정: `FIREBASE_SECURITY_SETUP.md`
> - 기술 부채 및 로드맵: `TECH_DEBT.md`  
> - 보안 점검 체크리스트: `SECURITY_CHECKLIST.md`
> - 백업 스크립트: `scripts/backup-firestore.js`
