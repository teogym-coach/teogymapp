// 관리자앱 "회원앱 자동 추천 미리보기" 화면 렌더 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-auto-routine-screen.test.js)
// App.jsx 원본 컴포넌트를 그대로 렌더해 (1) 런타임 오류 없이 그려지는지 (2) 추천 부위·운동·근거가
// 실제로 화면에 나오는지 (3) 대표 추천 루틴 노출 중일 때 안내가 바뀌는지 검증한다.
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // babel-preset-react-app 요구사항
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.jsx'), 'utf8');
const START = 'const AUTO_PREVIEW_PARTS';
const END = '// loading / error / (기록 없음)은 서로 다른 상태다';
const si = APP.indexOf(START), ei = APP.indexOf(END);
if (si < 0 || ei < 0 || ei < si) { console.error('slice 경계 실패', si, ei); process.exit(1); }
if (APP.indexOf(START, si + 1) !== -1) { console.error('시작 마커가 2회 이상 등장'); process.exit(1); }

const out = babel.transformSync(`${APP.slice(si, ei)}\nwindow.__Preview = MemberAutoRoutinePreviewScreen;\n`, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'preview.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

const today = new Date().toISOString().slice(0, 10);
const calls = { checkins: 0, routines: 0 };
let routineRows = [];

const DB = { bg:'#F6F7F9', card:'#FFF', border:'#EEE', text:'#0F172A', sub:'#64748B', faint:'#94A3B8',
  mint:'#39C7B8', mintSoft:'#0F9488', mintTint:'rgba(57,199,184,.10)', shadow:'none', radius:24, radiusSm:18, font:'sans-serif' };

// 추천 엔진은 member-auto-routine-parity.test.js가 원본으로 검증한다 —
// 이 테스트는 화면이 엔진 결과를 빠짐없이 그려내는지만 본다.
const stubs = {
  React,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
  DB,
  SH: ({ title, sub, right }) => React.createElement('div', null, React.createElement('h1', null, title), React.createElement('p', null, sub), right),
  Btn: ({ children, onClick }) => React.createElement('button', { onClick }, children),
  getMemberCheckins: () => { calls.checkins += 1; return Promise.resolve([{ date: today, soreness: '보통', condition: '좋음' }]); },
  getRoutineRecommendations: () => { calls.routines += 1; return Promise.resolve(routineRows); },
  toMemberVisibleSession: (s) => ({ ...s, sessionType: undefined, trainerUid: undefined }),
  getRecommendedPart: () => ({
    part: '하체',
    reason: '최근 4주 기록상 3분할 패턴으로 운동하고 있습니다.',
    cycle: ['하체', '가슴 · 어깨 · 삼두', '등 · 이두'],
    info: { part: '등', dateText: '9월 10일(목)', dDay: 'D-5', daysUntil: 5 },
    isPaired: false, inferred: ['하체', '가슴 · 어깨 · 삼두', '등 · 이두'],
    baseCycle: ['하체', '가슴 · 어깨 · 삼두', '등 · 이두'], sequence: ['등', '가슴', '하체'], lastPart: '등',
  }),
  buildReviewRoutine: () => ({
    selectedPart: ['하체'], hasClassSessions: true, hasData: true,
    routine: [{ name: '브이스쿼트', analyzedCount: 4, reason: '최근 기록 4회를 분석했습니다.',
      sets: [{ label: '1세트', weight: '40kg', reps: '12회' }, { label: '2세트', weight: '50kg', reps: '10회' }] }],
    goodStim: [], painFree: [], practice: [], comment: '자극이 좋았던 운동 위주로 추천합니다.',
    excluded: [{ name: '레그익스텐션', latestDate: '2026-08-20' }],
    ranked: [{ name: '브이스쿼트', muscleTop: '하체', count: 4, stim: 1, marked: false, latestDate: '2026-09-01' }],
  }),
  getKoreaDateString: () => today,
  isPublishedData: (r) => r?.status === 'published' && r?.visibility !== 'hidden',
  getPreSessionWarmup: () => ['고관절 가동성', '둔근 활성화'],
  formatPartsForMember: (r) => (r?.targetParts || []).join(' + '),
  exerciseMatchesPart: (e, p) => e?.muscleTop === p,
  getPartRecoveryHours: () => ({ hoursSince: 24, requiredHours: 60 }),
  getRecentPartCounts: () => ({ 하체: 3, 등: 2 }),
  normalizeWorkoutPart: (p) => p,
};

const names = Object.keys(stubs);
new dom.window.Function(...names, out)(...names.map(n => stubs[n]));
const Preview = dom.window.__Preview;

const sessions = [
  { id: 's1', sessionNo: 1, date: '2026-09-01', isPublished: true, sessionType: '1:1', selectedTypes: ['하체'],
    exercises: [{ name: '브이스쿼트', muscleTop: '하체', sets: [{ weight: '40', reps: '12' }] }] },
  { id: 's2', sessionNo: 2, date: '2026-09-03', isPublished: false, sessionType: '1:1', selectedTypes: ['등'], exercises: [] },
];
const member = { id: 'm1', name: '홍길동' };

const root = ReactDOM.createRoot(document.getElementById('root'));
async function render(props) {
  await act(async () => {
    root.render(React.createElement(Preview, Object.assign({ member, sessions, onBack: () => {} }, props)));
  });
  return document.getElementById('root').textContent;
}

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 400)); };

(async () => {
  let t = await render({});

  check('미리보기 화면이 런타임 오류 없이 렌더된다', t.includes('회원앱 자동 추천 미리보기'), t.slice(0, 200));
  check('자동 추천 부위와 근거 문구가 표시된다', t.includes('자동 추천 부위') && t.includes('하체') && t.includes('3분할 패턴으로 운동하고 있습니다'), t.slice(0, 400));
  check('추천 운동 이름·세트·중량·횟수가 표시된다', t.includes('브이스쿼트') && t.includes('1세트') && t.includes('40kg') && t.includes('12회'), t.slice(0, 400));
  check('추천 근거(최근 부위 순서 · 다음 PT · 부위별 마지막 운동일)가 표시된다',
    t.includes('최근 수업 부위 순서') && t.includes('다음 PT 예정') && t.includes('회복 중'), t.slice(0, 600));
  check('관리자 추천 루틴과의 구분 안내가 보인다',
    t.includes('관리자 추천 루틴') && t.includes('루틴 추천 전송'), t.slice(0, 400));
  check('대표 추천 루틴이 없으면 "자동 추천 루틴"을 보여주고 있다고 안내한다', t.includes('자동 추천 루틴을 보여주고 있습니다'), t.slice(0, 600));
  check('회원앱과 동일한 입력을 실제로 읽는다(체크인 · 대표 추천 루틴 각 1회)', calls.checkins === 1 && calls.routines === 1, JSON.stringify(calls));

  // 대표 추천 루틴이 노출 중이면 회원앱은 자동 추천 대신 대표 루틴을 보여준다 → 안내가 바뀐다
  routineRows = [{ id: 'r1', date: today, status: 'published', visibility: 'visible', targetParts: ['가슴'] }];
  t = await render({ member: { id: 'm2', name: '김철수' } });
  check('대표 추천 루틴 노출 중이면 "자동 추천 대신 대표 추천 루틴" 안내로 바뀐다',
    t.includes('자동 추천 대신 대표 추천 루틴'), t.slice(0, 600));

  let failed = 0;
  for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
  console.log(failed ? `\n${failed} 건 실패` : '\n전부 통과');
  process.exit(failed ? 1 : 0);
})();
