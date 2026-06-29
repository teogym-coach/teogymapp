# Firebase 보안 설정 가이드

> TEO GYM 운영자 전용 — Firebase Console 설정 항목

---

## 1. API Key HTTP Referrer 제한

Firebase API Key는 클라이언트 번들에 포함되는 것이 Firebase의 정상 설계입니다.
실제 보안은 Firestore Rules가 담당하지만, API Key에 **HTTP Referrer 제한**을 추가하면
다른 도메인에서 Key를 무단으로 사용하는 시도를 차단할 수 있습니다.

### 설정 위치

```
Firebase Console
  → 프로젝트 설정 (⚙️ 톱니바퀴)
  → 일반 탭
  → 하단 "내 앱" 섹션에서 웹 앱 선택
  
또는

Google Cloud Console (더 세밀한 제어)
  → APIs & Services
  → Credentials
  → API key 목록에서 "Browser key (auto created by Firebase)" 선택
  → "API restrictions" 또는 "Application restrictions" 설정
```

### 허용할 Referrer 목록 (Application restrictions → HTTP referrers)

```
# 현재 운영 도메인
teogymapp.vercel.app/*
*.vercel.app/*

# 개발 환경 (반드시 포함해야 로컬 개발 가능)
localhost:3000/*
localhost/*
127.0.0.1:3000/*

# 실제 도메인 연결 후 추가
teogym.co.kr/*
www.teogym.co.kr/*
```

### 주의사항

> **경고**: Referrer 제한을 잘못 설정하면 회원앱 로그인이 완전히 차단됩니다.

- 설정 후 반드시 **시크릿 창**에서 회원 로그인 테스트 필수
- `localhost:3000`을 제외하면 개발 환경에서 Firebase 연결 불가
- Vercel 프리뷰 URL (`*.vercel.app`)도 포함하지 않으면 배포 프리뷰 테스트 불가
- 도메인 변경 시 이 목록도 함께 업데이트 필요

### 설정 후 테스트 체크리스트

- [ ] teogym 관리자 계정으로 관리자앱 로그인 확인
- [ ] 회원 계정으로 회원앱 로그인 확인
- [ ] 개발 환경(localhost:3000)에서 로그인 확인
- [ ] Vercel 배포 URL에서 로그인 확인

---

## 2. Firebase Authentication 설정 확인

### 승인된 도메인 목록

```
Firebase Console
  → Authentication
  → Settings 탭
  → Authorized domains
```

현재 있어야 할 도메인:
```
localhost
teogymapp.vercel.app
(실제 도메인 연결 후 추가)
```

> 이 목록에 없는 도메인에서는 로그인 팝업/리디렉션이 차단됩니다.

---

## 3. Firestore Rules 배포 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-29 | v7 — birthYear/Month/Day 필드 허용, private 서브컬렉션 보호 |
| 2026-06-20 | v6 — memberUid 쿼리 허용, bodyCheck 분리 |

### 현재 배포된 핵심 보호 규칙

- `members/{id}`: trainerUid 또는 memberUid 본인만 읽기 허용
- `members/{id}/private/admin`: trainerUid만 읽기/쓰기 허용 (회원 완전 차단)
- `members/{id}/sessions`: 미발행(isPublished=false) 세션은 회원 읽기 차단
- `members/{id}/sessions`: 회원은 sorenessReport 필드만 수정 가능
- `members/{id}` 쓰기: isOwner, role, memberUid, trainerUid 자기수정 차단

---

## 4. Firebase 프로젝트 보안 체크리스트

### 지금 할 것
- [ ] HTTP Referrer 제한 설정 (위 1번 참조)
- [ ] Authentication 승인 도메인 확인

### 출시 후 1개월
- [ ] Firebase 콘솔 → Usage 탭에서 Firestore 읽기/쓰기 수 모니터링
- [ ] Spark(무료) 플랜 한도 확인: 읽기 5만/일, 쓰기 2만/일, 삭제 2만/일
- [ ] 한도 초과 예상 시 Blaze(종량제) 플랜으로 업그레이드

### 회원 100명 시
- [ ] Firebase App Check 설정 검토 (봇/자동화 요청 차단)
- [ ] 월별 Firebase 비용 모니터링 알림 설정
