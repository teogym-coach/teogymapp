// 회원앱 "앱 복귀 시 최신 수업일지 재확인" 회귀 테스트
// 실행: npm run regression (또는 NODE_ENV=development node tests/render/member-session-return-sync.test.js)
//
// App.jsx의 복귀 동기화 useEffect 원본과 db.js의 refreshPublishedSessions 원본을 그대로 슬라이스해 실행한다.
// 확인 범위(A~F):
//   A 복귀(hidden→visible) 시 60초 경과 후 최신 세션(횟수·중량·운동 추가/삭제)이 sessions state에 반영된다
//   B 60초 이내 재복귀·동시 이벤트는 재조회하지 않는다 / 최초 load 전(at=0)에도 조회하지 않는다
//   C 열린 상세 화면(sessions state에서 그려짐)이 복귀 후 최신 내용으로 바뀐다
//   D memberFeedback은 sessionId 기준으로 보존되고 다른 수업과 섞이지 않는다 / 조회 실패 시 기존 목록 유지
//   E 로그아웃(언마운트·auth 없음) 뒤에는 이벤트가 와도 조회하지 않는다
//   F 다른 회원으로 바뀌면 이전 회원 조회·늦게 도착한 이전 회원 응답이 반영되지 않는다
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
const DB = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');

function slice(text, start, end) {
  const si = text.indexOf(start);
  if (si < 0) { console.error('[session-return-sync] slice 시작 마커 없음:', start); process.exit(1); }
  if (text.indexOf(start, si + 1) !== -1) { console.error('[session-return-sync] 시작 마커가 2회 이상 등장:', start); process.exit(1); }
  const ei = text.indexOf(end, si);
  if (ei < 0) { console.error('[session-return-sync] slice 끝 마커 없음:', end); process.exit(1); }
  return text.slice(si, ei);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
let babel, React, ReactDOM, JSDOM;
try {
  babel = require('@babel/core'); React = require('react'); ReactDOM = require('react-dom/client'); ({ JSDOM } = require('jsdom'));
} catch (e) { console.error('[session-return-sync] 렌더 의존 모듈 로드 실패 — 건너뜁니다:', e.message); process.exit(0); }
const { act } = React;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;

let visibility = 'visible';
Object.defineProperty(dom.window.document, 'visibilityState', { get: () => visibility, configurable: true });
let now = 1_000_000;
dom.window.Date.now = () => now;
const fire = async (state) => { visibility = state; await act(async () => { dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')); }); };


const effectSrc = slice(APP, '// 앱 복귀(hidden→visible) 시 최신 공개 수업일지 재확인', '  const load=useCallback(');
// 슬라이스 앞부분의 주석 4줄을 건너뛰고 useEffect부터 사용한다.
const effectBody = effectSrc.slice(effectSrc.indexOf('useEffect(()=>{'));
const harnessSrc = `
function H({ profile, initial, syncAt }) {
  const [sessions, setSessions] = React.useState(initial);
  const sessionsRef = React.useRef([]); sessionsRef.current = sessions;
  const sessionsSyncRef = React.useRef({ at: syncAt, busy: false });
  window.__sync = sessionsSyncRef.current;
  window.__sessions = sessions;
  ${effectBody}
  const s1 = sessions.find(s => s.id === 's1');
  return React.createElement('div', { id: 'detail' }, s1 ? (s1.exercises || []).map(e => e.name + ':' + e.reps).join('|') : '(없음)');
}
window.__H = H;`;
const out = babel.transformSync(harnessSrc, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'return-sync-harness.jsx',
}).code;

const calls = [];
let refreshImpl = async () => [];
const authState = { currentUser: { uid: 'uid-1' } };
const env = {
  React, useEffect: React.useEffect, auth: authState,
  SESSION_RESYNC_MIN_INTERVAL_MS: 60 * 1000,
  refreshPublishedSessions: (memberId, ids) => { calls.push([memberId, [...ids]]); return refreshImpl(memberId, ids); },
};
// eslint-disable-next-line no-new-func
new dom.window.Function(...Object.keys(env), out)(...Object.values(env));
const H = dom.window.__H;
const root = ReactDOM.createRoot(dom.window.document.getElementById('root'));
const P1 = { id: 'm1', memberUid: 'uid-1' };
const fb = (id, m) => ({ id, memo: m });
const base = () => [
  { id: 's1', sessionNo: 1, exercises: [{ name: '스쿼트', reps: '10' }], memberFeedback: fb('uid-1', 'A메모'), memberFeedbackList: [fb('uid-1', 'A메모')] },
  { id: 's2', sessionNo: 2, exercises: [{ name: '데드', reps: '8' }], memberFeedback: fb('uid-1', 'B메모'), memberFeedbackList: [fb('uid-1', 'B메모')] },
];
const render = async (profile, initial, syncAt) => act(async () => { root.render(React.createElement(H, { profile, initial, syncAt, key: profile ? profile.id : 'none' })); });
const detail = () => dom.window.document.getElementById('detail')?.textContent;
let pass = 0; const ok = (name, fn) => { fn(); pass++; console.log('PASS ' + name); };

(async () => {
  const T0 = now;
  await render(P1, base(), T0);

  // B: 60초 이내 재복귀는 조회하지 않는다
  now = T0 + 30_000; await fire('hidden'); await fire('visible'); await fire('visible');
  ok('B 60초 이내 재복귀 3회 → 재조회 0회', () => assert.strictEqual(calls.length, 0));

  // A/C/D: 60초 경과 후 복귀 — 횟수 수정·운동 추가, 세션 비공개/신규 공개, feedback 보존
  refreshImpl = async () => [
    { id: 's1', sessionNo: 1, exercises: [{ name: '스쿼트', reps: '12' }, { name: '런지', reps: '15' }] }, // feedback 키 없음(세션 문서만 조회)
    { id: 's3', sessionNo: 3, exercises: [{ name: '플랭크', reps: '1' }], memberFeedback: null, memberFeedbackList: [] },
  ];
  now = T0 + 61_000; await fire('hidden'); await fire('visible');
  ok('A 복귀 후 재조회 1회, 이미 아는 세션 id(s1,s2)만 known으로 전달', () => { assert.strictEqual(calls.length, 1); assert.deepStrictEqual(calls[0], ['m1', ['s1', 's2']]); });
  ok('A/C 횟수 수정·운동 추가가 sessions state와 열린 상세 화면에 반영', () => assert.strictEqual(detail(), '스쿼트:12|런지:15'));
  ok('A 비공개된 s2는 빠지고 새 s3가 들어온다', () => assert.deepStrictEqual(dom.window.__sessions.map(s => s.id), ['s1', 's3']));
  ok('D s1의 feedback은 s1 것으로만 보존(s2 feedback과 섞이지 않음)', () => {
    const s1 = dom.window.__sessions[0];
    assert.strictEqual(s1.memberFeedback.memo, 'A메모');
    assert.deepStrictEqual(s1.memberFeedbackList.map(f => f.memo), ['A메모']);
    assert.ok(!dom.window.__sessions.some(s => s.memberFeedback && s.memberFeedback.memo === 'B메모'));
    assert.strictEqual(dom.window.__sessions[1].memberFeedback, null);
  });

  now = T0 + 90_000; await fire('visible');
  ok('B 동기화 직후 30초 뒤 복귀 → 재조회 없음', () => assert.strictEqual(calls.length, 1));
  now = T0 + 200_000; await fire('hidden');
  ok('B hidden 전환은 조회하지 않는다', () => assert.strictEqual(calls.length, 1));

  // D: 조회 실패 → 기존 목록 유지, 실패는 throttle을 소모하지 않음
  refreshImpl = async () => { throw new Error('network'); };
  const before = JSON.stringify(dom.window.__sessions);
  const origWarn = console.warn; console.warn = () => {};
  await fire('visible');
  console.warn = origWarn;
  ok('D 조회 실패 시 기존 sessions·feedback 유지, busy 해제', () => { assert.strictEqual(calls.length, 2); assert.strictEqual(JSON.stringify(dom.window.__sessions), before); assert.strictEqual(dom.window.__sync.busy, false); });
  refreshImpl = async () => [{ id: 's1', sessionNo: 1, exercises: [{ name: '스쿼트', reps: '20' }] }];
  await fire('hidden'); await fire('visible');
  ok('D 실패 직후 재복귀는 다시 조회한다', () => { assert.strictEqual(calls.length, 3); assert.strictEqual(detail(), '스쿼트:20'); });

  // B: 진행 중 중복 이벤트
  let release; refreshImpl = () => new Promise(r => { release = () => r([{ id: 's1', sessionNo: 1, exercises: [{ name: '스쿼트', reps: '21' }] }]); });
  now = T0 + 400_000; const n0 = calls.length;
  await act(async () => { visibility = 'visible'; const ev = () => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')); ev(); ev(); });
  ok('B 진행 중 중복 이벤트는 무시(조회 1회)', () => assert.strictEqual(calls.length - n0, 1));
  await act(async () => { release(); });

  // F: 다른 회원으로 전환
  now = T0 + 600_000;
  let releaseOld; refreshImpl = () => new Promise(r => { releaseOld = () => r([{ id: 'old', sessionNo: 1, exercises: [{ name: '이전회원', reps: '1' }] }]); });
  const n1 = calls.length;
  await fire('visible');
  const P2 = { id: 'm2', memberUid: 'uid-1' };
  await render(P2, [{ id: 's9', sessionNo: 1, exercises: [{ name: '새회원', reps: '5' }] }], now - 120_000);
  await act(async () => { releaseOld(); });
  ok('F 이전 회원(m1)의 늦은 응답은 새 회원 화면에 반영되지 않는다', () => { assert.strictEqual(calls.length - n1, 1); assert.ok(!dom.window.__sessions.some(s => s.id === 'old')); });
  refreshImpl = async () => [{ id: 's9', sessionNo: 1, exercises: [{ name: '새회원', reps: '6' }] }];
  const n2 = calls.length;
  await fire('hidden'); await fire('visible');
  ok('F 전환 뒤 복귀 조회는 새 회원 id(m2)만 사용', () => { assert.strictEqual(calls.length - n2, 1); assert.strictEqual(calls[calls.length - 1][0], 'm2'); assert.deepStrictEqual(calls[calls.length - 1][1], ['s9']); });

  // E: 로그아웃
  authState.currentUser = null; now += 200_000;
  const n3 = calls.length;
  await fire('hidden'); await fire('visible');
  ok('E auth 없음 상태에서 visibilitychange → 조회 없음', () => assert.strictEqual(calls.length, n3));
  authState.currentUser = { uid: 'uid-1' };
  await act(async () => { root.unmount(); });
  const n4 = calls.length; now += 200_000;
  await fire('hidden'); await fire('visible');
  ok('E 언마운트 후 이벤트가 와도 조회 없음(리스너 cleanup)', () => assert.strictEqual(calls.length, n4));

  // 최초 load 완료 전(at=0)
  const root2 = ReactDOM.createRoot(dom.window.document.createElement('div'));
  await act(async () => { root2.render(React.createElement(H, { profile: P1, initial: [], syncAt: 0 })); });
  const n5 = calls.length; now += 200_000;
  await fire('hidden'); await fire('visible');
  ok('B 최초 load 완료 전(at=0)에는 조회하지 않는다', () => assert.strictEqual(calls.length, n5));
  await act(async () => { root2.unmount(); });

  // db.js refreshPublishedSessions 원본: feedback은 새 세션만 조회
  const fnSrc = slice(DB, 'export async function refreshPublishedSessions(', 'export async function getPublishedSessions(').replace('export async function', 'async function');
  const attachCalls = [];
  const dbEnv = {
    requireUid: () => 'u', db: {}, collection: () => 'col', where: () => 'w', query: () => 'q',
    getDocs: async () => ({ docs: [
      { id: 'b', data: () => ({ sessionNo: 2, date: '2026-09-02' }) },
      { id: 'a', data: () => ({ sessionNo: 1, date: '2026-09-01' }) },
      { id: 'c', data: () => ({ sessionNo: 3, date: '2026-09-03' }) },
    ] }),
    normalizeSessionForRead: (d) => d, publicSession: (s) => s,
    attachSessionMemberFeedback: async (mid, list) => { attachCalls.push(list.map(s => s.id)); return list.map(s => ({ ...s, memberFeedback: null, memberFeedbackList: [] })); },
  };
  // eslint-disable-next-line no-new-func
  const mk = () => new Function(...Object.keys(dbEnv), `${fnSrc}; return refreshPublishedSessions;`)(...Object.values(dbEnv));
  const res = await mk()('m1', ['a', 'b']);
  ok('DB refreshPublishedSessions: 정렬 유지, feedback 조회는 처음 보는 세션(c) 1건만', () => {
    assert.deepStrictEqual(res.map(s => s.id), ['a', 'b', 'c']);
    assert.deepStrictEqual(attachCalls, [['c']]);
    assert.ok(!('memberFeedback' in res[0]) && ('memberFeedback' in res[2]));
  });
  dbEnv.getDocs = async () => { throw new Error('permission-denied'); };
  let threw = false; try { await mk()('m1', []); } catch { threw = true; }
  ok('DB refreshPublishedSessions: 읽기 실패는 []로 삼키지 않고 throw(화면 목록 보호)', () => assert.ok(threw));

  console.log(`\n${pass}건 통과`);
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
