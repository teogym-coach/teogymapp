import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

// ── Sentry 오류 모니터링 ───────────────────────────────────────────────────
// 활성화: Vercel 또는 .env.local 에 REACT_APP_SENTRY_DSN=<dsn> 추가
// DSN이 없으면 Sentry는 완전히 비활성화됩니다. 앱 동작에 영향 없음.
// DSN 발급: sentry.io → 프로젝트 생성 → Settings → Client Keys
window.__sentryInitialized = false;
try {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (dsn) {
    import('@sentry/react').then(Sentry => {
      Sentry.init({
        dsn,
        // production 환경에서만 오류 수집 (개발 중 노이즈 방지)
        enabled: process.env.NODE_ENV === 'production',
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1,
        release: process.env.REACT_APP_VERSION || '1.0.0',
      });
      window.__sentryInitialized = true;
      console.log('[TEO GYM] Sentry 초기화 완료');
    }).catch(() => {});
  }
} catch {}

// ── 앱 렌더 ───────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
