import React from 'react';

const DARK = '#0B1120';
const SURFACE = '#111827';
const TEAL = '#5EEAD4';
const MUTED = '#475569';
const BORDER = 'rgba(255,255,255,0.08)';

const styles = {
  shell: {
    minHeight: '100vh',
    background: DARK,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: "'DM Mono', monospace",
  },
  card: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: '32px 24px',
    maxWidth: 400,
    width: '100%',
    textAlign: 'center',
  },
  icon: { fontSize: 40, marginBottom: 16 },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontWeight: 800,
    fontSize: 18,
    color: '#fff',
    marginBottom: 8,
  },
  msg: { fontSize: 11, color: MUTED, lineHeight: 1.7, marginBottom: 24 },
  btn: {
    display: 'block',
    width: '100%',
    padding: '11px 16px',
    borderRadius: 8,
    border: 'none',
    background: TEAL,
    color: DARK,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    marginBottom: 8,
  },
  btnGhost: {
    display: 'block',
    width: '100%',
    padding: '11px 16px',
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: 'transparent',
    color: MUTED,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 8,
  },
  errBox: {
    marginTop: 20,
    background: 'rgba(255,80,80,0.06)',
    border: '1px solid rgba(255,80,80,0.15)',
    borderRadius: 8,
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: 9,
    color: '#f87171',
    wordBreak: 'break-all',
    lineHeight: 1.6,
  },
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[TEO GYM] ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });

    // Sentry 에러 리포트 (DSN 설정 시 자동 동작)
    try {
      if (window.__sentryInitialized) {
        import('@sentry/react').then(Sentry => {
          Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
        }).catch(() => {});
      }
    } catch {}
  }

  handleReload = () => window.location.reload();
  handleHome = () => { window.location.href = '/'; };
  handleMemberHome = () => { window.location.href = '/?app=member'; };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isMember = this.props.isMember ||
      window.location.search.includes('app=member') ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('teogymAppMode') === 'member');
    const isDev = process.env.NODE_ENV === 'development';

    return (
      <div style={styles.shell}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=DM+Mono&display=swap');`}</style>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <div style={styles.title}>
            {isMember ? '일시적인 오류가 발생했습니다' : '앱 오류가 발생했습니다'}
          </div>
          <p style={styles.msg}>
            {isMember
              ? '잠깐 문제가 생겼어요.\n새로고침하거나 홈으로 돌아가 주세요.\n문제가 계속되면 대표에게 문의해주세요.'
              : '예상치 못한 오류가 발생했습니다.\n새로고침하거나 홈으로 돌아가 주세요.'}
          </p>
          <button style={styles.btn} onClick={this.handleReload}>새로고침</button>
          {isMember
            ? <button style={styles.btnGhost} onClick={this.handleMemberHome}>홈으로</button>
            : <button style={styles.btnGhost} onClick={this.handleHome}>관리자 홈으로</button>
          }
          {(isDev || !isMember) && this.state.error && (
            <div style={styles.errBox}>
              <strong>오류:</strong> {this.state.error?.message || String(this.state.error)}
              {isDev && this.state.errorInfo?.componentStack && (
                <><br/><br/><strong>컴포넌트 스택:</strong>{this.state.errorInfo.componentStack.slice(0, 400)}</>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}
