// HistoryScreen 4상태(조회 중 / 조회 실패 / 진짜 기록 없음 / 기록 있음) 렌더 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/history-screen-states.test.js)
// App.jsx 원본을 그대로 슬라이스해 실제로 렌더하므로, 빈 화면 문구 조건이 되돌아가면 즉시 실패한다.
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // babel-preset-react-app 요구사항
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.jsx'), 'utf8');
const START = 'function HistoryScreen({ sessions: rawSessions';
const END = '// ── 수업 리포트 모달 ─';
const si = APP.indexOf(START), ei = APP.indexOf(END);
if (si < 0 || ei < 0 || ei < si) { console.error('slice boundary 실패', si, ei); process.exit(1); }
if (APP.indexOf(START, si + 1) !== -1) { console.error('START 마커가 2회 이상 등장'); process.exit(1); }
const slice = APP.slice(si, ei);

const wrapper = `
${slice}
window.__HistoryScreen = HistoryScreen;
`;

const out = babel.transformSync(wrapper, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'harness.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

// ── 외부 의존 스텁 ──────────────────────────────────────────
const DB = { bg:'#F6F7F9', card:'#FFF', border:'#EEE', text:'#0F172A', sub:'#64748B', faint:'#94A3B8',
  mint:'#39C7B8', mintSoft:'#0F9488', mintTint:'rgba(57,199,184,.10)', shadow:'none', radius:24, radiusSm:18, font:'sans-serif' };
const stubs = {
  React,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
  DB,
  SH: ({ title, right }) => React.createElement('div', null, React.createElement('h1', null, title), right),
  Btn: ({ children, onClick }) => React.createElement('button', { onClick }, children),
  Mo: ({ children }) => React.createElement('span', null, children),
  getBodyWeightRecords: () => [],
  getKcalLogs: () => [],
  isOwner: () => false,
  canUseMemberLinkedFeatures: () => true,
  getSessionReadStatus: () => ({ isRead: false }),
  formatHistoryDateParts: (d) => ({ month: 1, day: 2, raw: String(d || ''), weekday: '월요일' }),
  calcPartVolumes: () => [],
  formatTypes: (t) => (Array.isArray(t) ? t.join(' · ') : String(t || '')),
  mColor: () => '#39C7B8',
  histDark: () => '#0F9488',
  IC: {}, CC: { 상: '#fff' },
  HistNum: ({ children }) => React.createElement('span', null, children),
  HistPublishBadge: () => null,
  SessionReadBadge: () => null,
  SessionReportModal: () => React.createElement('div', null, 'REPORT'),
  PartSetBadges: () => null,
  PartVolBadges: () => null,
  isValidSet: () => true,
  calcTotalSets: () => 0,
  calcPartSets: () => [],
  getMemberExerciseName: (e) => e?.name || '',
  isFuncEx: () => false,
  normalizeWorkoutPart: (p) => p,
  getFilledSets: (e) => (e?.sets || []),
  toPositiveNumber: (v) => (Number(v) > 0 ? Number(v) : 0),
  formatCompactDate: (d) => String(d || ''),
  scrollMemberAppToTop: () => {},
  // 목록 카드 내부에서만 쓰이는 보조 컴포넌트 — 빠지면 ReferenceError로 즉시 드러난다
  HistExerciseTags: () => null,
  isTrialSessionNo: () => false,
};

const names = Object.keys(stubs);
// 슬라이스 안에서 참조되지만 스텁에 없는 식별자는 undefined로 두면 렌더 시 ReferenceError가 난다 →
// 필요한 것만 위에서 채우고, 나머지는 Proxy로 잡아 어떤 식별자가 빠졌는지 즉시 알 수 있게 한다.
let loaded;
try {
  loaded = new dom.window.Function(...names, out);
  loaded(...names.map(n => stubs[n]));
} catch (e) {
  console.error('로드 실패:', e.message);
  process.exit(1);
}
const HistoryScreen = dom.window.__HistoryScreen;

const root = ReactDOM.createRoot(document.getElementById('root'));
function render(props) {
  act(() => {
    root.render(React.createElement(HistoryScreen, Object.assign({
      sessions: [], sessionReadsMap: {}, bodyData: null, nutritionData: null, cardioLogs: [],
      loading: false, error: null, onRetry: () => {}, onBack: () => {}, member: { id: 'm1', name: '홍길동' },
    }, props)));
  });
  return document.getElementById('root').textContent;
}

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra) console.log('   ↳', extra); };

const NONE = '수업 기록이 없습니다.';
const LOADING = '기록을 불러오는 중입니다';
const ERR = '기록을 불러오지 못했습니다';

// 1) 조회 중: 로딩 안내만, "기록 없음" 문구 금지
let t = render({ loading: true, sessions: [] });
check('조회 중에는 로딩 안내가 보이고 "수업 기록이 없습니다."는 보이지 않는다', t.includes(LOADING) && !t.includes(NONE), t.slice(0, 200));

// 2) 조회 실패: 오류 + 다시 불러오기, "기록 없음" 문구 금지
t = render({ loading: false, error: { code: 'permission-denied', message: 'x' }, sessions: [] });
check('조회 실패는 오류 상태로 구분되고 "수업 기록이 없습니다."는 보이지 않는다', t.includes(ERR) && !t.includes(NONE), t.slice(0, 200));
check('조회 실패 시 "다시 불러오기" 버튼이 제공된다', t.includes('다시 불러오기'));

// 3) 진짜 기록 없음
t = render({ loading: false, error: null, sessions: [] });
check('로딩도 오류도 아닐 때만 "수업 기록이 없습니다."가 보인다', t.includes(NONE) && !t.includes(LOADING) && !t.includes(ERR), t.slice(0, 200));

// 4) 기록 있음(1:1)
const s1 = { id: 's1', date: '2026-09-01', sessionNo: 12, selectedTypes: ['하체'], exercises: [{ name: '스쿼트', muscleTop: '하체', sets: [{ weight: '60', reps: '10' }] }], isPublished: true, sessionType: '1:1' };
t = render({ sessions: [s1] });
check('1:1 수업 기록이 있으면 목록이 렌더된다', !t.includes(NONE) && t.includes('하체'), t.slice(0, 200));

// 5) 기록 있음(2:1)도 동일하게 노출
const s2 = { ...s1, id: 's2', sessionNo: 13, sessionType: '2:1', selectedTypes: ['등'] };
t = render({ sessions: [s1, s2] });
check('2:1 수업 기록도 목록에 그대로 노출된다', t.includes('등') && t.includes('하체'));

// 6) 로딩 중 sessions가 비어 있어도(회원 전환 직후 stale 초기화 상태) 기록 없음으로 오인하지 않는다
t = render({ loading: true, sessions: [] });
check('회원 전환 직후(sessions=[] + 조회 중)에도 빈 화면 문구가 뜨지 않는다', !t.includes(NONE));

// 7) 데이터가 늦게 도착하는 경우 — 로딩 종료 후 목록으로 전환
render({ loading: true, sessions: [] });
t = render({ loading: false, sessions: [s1] });
check('늦게 도착한 데이터가 반영되면 로딩 → 목록으로 전환된다', !t.includes(LOADING) && !t.includes(NONE));

// 8) 필터로 0건인 경우와 원본 0건을 구분한다
// 비공개(회원 미전송) 기록만 있는 상태에서 '회원 미확인' 필터 → 원본은 있는데 필터 결과만 0건
t = render({ loading: false, sessions: [{ ...s1, isPublished: false }], initialReadFilter: 'unread' });
check('필터 결과만 0건이면 "조건에 맞는 기록이 없습니다."로 구분한다', t.includes('조건에 맞는 기록이 없습니다.'), t.slice(0, 200));

let failed = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
console.log(failed ? `\n${failed} 건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
