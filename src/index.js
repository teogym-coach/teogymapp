import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Sentry 오류 모니터링 (REACT_APP_SENTRY_DSN 환경변수가 없으면 비활성화)
// 설정 방법: .env.local 에 REACT_APP_SENTRY_DSN=<your-dsn> 추가
// DSN 발급: https://sentry.io → 프로젝트 생성 → Client Keys
try {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (dsn) {
    import('@sentry/react').then(Sentry => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1,
        release: process.env.REACT_APP_VERSION || '1.0.0',
      });
      console.log('[TEO GYM] Sentry 초기화 완료 (env:', process.env.NODE_ENV, ')');
    }).catch(() => {});
  }
} catch {}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
