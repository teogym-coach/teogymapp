# PT Journal — Vercel 배포 가이드

## 폴더 구조
```
ptjournal/
├── public/
│   ├── index.html       ← PWA 메타태그 포함
│   ├── manifest.json    ← 홈 화면 추가용 설정
│   ├── icon-192.png     ← 앱 아이콘 (직접 추가)
│   └── icon-512.png     ← 앱 아이콘 (직접 추가)
├── src/
│   ├── index.js         ← React 진입점
│   ├── App.jsx          ← 전체 앱 (UI + Firebase 연동)
│   ├── db.js            ← Firestore CRUD 함수
│   └── firebase-config.js ← Firebase 설정
├── package.json
├── vercel.json
└── README.md
```

---

## 1단계 — Firebase 설정 확인

`src/firebase-config.js` 에 본인 Firebase 프로젝트 값이 맞는지 확인하세요.

Firebase 콘솔에서 해야 할 것:
- **Authentication** → 이메일/비밀번호 사용 설정 → 사용자 추가 (트레이너 계정)
- **Firestore Database** → 데이터베이스 만들기 → 테스트 모드 → 서울(asia-northeast3)

---

## 2단계 — 아이콘 파일 추가 (선택)

`public/` 폴더에 아이콘 파일 2개를 직접 추가해야 합니다.
- `icon-192.png` (192×192px)
- `icon-512.png` (512×512px)

없으면 홈 화면 추가 시 기본 아이콘이 사용됩니다.

---

## 3단계 — 설치 및 로컬 테스트

```bash
# 1. 폴더로 이동
cd ptjournal

# 2. 패키지 설치
npm install

# 3. 로컬에서 실행 (http://localhost:3000)
npm start
```

---

## 4단계 — Vercel 배포

### 방법 A: Vercel CLI (터미널)
```bash
# Vercel CLI 설치
npm install -g vercel

# 배포
vercel

# 이후 질문:
# Set up and deploy? → Y
# Which scope? → 본인 계정 선택
# Link to existing project? → N
# Project name? → ptjournal (또는 원하는 이름)
# In which directory? → ./ (그냥 엔터)
# Build Command? → npm run build
# Output Directory? → build
```

### 방법 B: GitHub 연동 (더 편함)
1. GitHub에 ptjournal 폴더를 새 레포지토리로 올리기
2. vercel.com → New Project → GitHub 레포 선택
3. Framework Preset: **Create React App** 선택
4. Deploy 클릭

---

## 5단계 — iPhone/iPad 홈 화면에 추가

1. Safari에서 배포된 URL 접속 (예: `https://ptjournal.vercel.app`)
2. 하단 **공유 버튼** (네모+화살표) 탭
3. **"홈 화면에 추가"** 탭
4. 이름 확인 후 **추가**

이제 앱처럼 전체 화면으로 사용 가능합니다!

---

## Firebase Firestore 보안 규칙 (선택 — 실제 서비스 전 적용)

Firebase 콘솔 → Firestore → 규칙 탭에서 아래로 교체:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /members/{memberId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.trainerUid;
      match /sessions/{sessionId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```
