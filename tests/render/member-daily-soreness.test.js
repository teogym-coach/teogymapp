// 회원앱 "근육통 상시 기록" 렌더/저장 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-daily-soreness.test.js)
//
// App.jsx 원본을 그대로 슬라이스해 실행한다 — 저장/판정 로직을 테스트용으로 복제하지 않는다.
// 확인 범위:
//   1) 개인운동·PT 기록이 하나도 없어도 근육통 입력 카드가 항상 노출된다
//   2) 오늘 최초 저장 → members/{id}/memberCheckins/{오늘} 한 문서에 저장(날짜별 upsert)
//   3) 같은 날 재저장 → 새 기록이 생기지 않고 오늘 기록만 갱신, 과거 날짜 기록은 그대로 유지
//   4) 저장 후 전체 재조회(load) 없이 로컬 체크인 상태만 갱신된다
//   5) 저장 실패 → 예외를 올리고 기존 체크인 데이터를 덮어쓰지 않는다
//   6) 저장 중 중복 클릭 차단
//   7) 레거시 문서(soreness 문자열만 있는 경우)도 오류 없이 읽힌다
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // babel-preset-react-app 요구사항
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

function slice(src, start, end, tag) {
  const si = src.indexOf(start), ei = src.indexOf(end);
  if (si < 0 || ei < 0 || ei < si) { console.error(`[${tag}] slice 경계 실패`, si, ei); process.exit(1); }
  if (src.indexOf(start, si + 1) !== -1) { console.error(`[${tag}] 시작 마커가 2회 이상 등장`); process.exit(1); }
  return src.slice(si, ei);
}

const sliceSore = slice(APP, 'const SORENESS_LEVELS=', '// 통증 성격 선택 UI', 'SorenessInput');
const sliceTiles = slice(APP, 'function buildTodayStatusTiles(p,today,open){', '// 회원앱 식단 기록', 'buildTodayStatusTiles');
// saveDailySoreness는 MemberApp 안의 화살표 함수라 JSX가 없다 — 자유 변수를 주입해 원본 그대로 실행한다.
const sliceSave = slice(APP, 'const saveDailySoreness=async(patch={})=>{', 'const deleteHealthRecord=async(dateKey)=>{', 'saveDailySoreness');

const out = babel.transformSync([
  sliceSore,
  sliceTiles,
  'window.__SORENESS_LEVELS = SORENESS_LEVELS;',
  'window.__getCheckinSoreness = getCheckinSoreness;',
  'window.__SorenessInput = SorenessInput;',
  'window.__buildTodayStatusTiles = buildTodayStatusTiles;',
].join('\n'), {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'soreness.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

const TODAY = '2026-09-09';
const PAST = '2026-09-01';

const stubs = {
  React,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
  SjIcon: () => null,
  HEALTH_TILE_ICONS: {},
  CONDITION_EMOJI: { '좋음': '😊' },
  getBodyWeightRecords: (body) => (body && body.records) || [],
  InputLine: ({ label, value, onChange }) => React.createElement('label', null, label,
    React.createElement('input', { className: 'stub-input', value: value || '', onChange: e => onChange(e.target.value) })),
};
const names = Object.keys(stubs);
new dom.window.Function(...names, out)(...names.map(n => stubs[n]));

const SORENESS_LEVELS = dom.window.__SORENESS_LEVELS;
const getCheckinSoreness = dom.window.__getCheckinSoreness;
const SorenessInput = dom.window.__SorenessInput;
const buildTodayStatusTiles = dom.window.__buildTodayStatusTiles;

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 500)); };

// ── saveDailySoreness 실행 하네스 ──────────────────────────────
// 자유 변수를 전부 주입한다. load / reloadMemberApp은 일부러 넣지 않는다 —
// 원본이 저장 후 전체 재조회를 호출하면 ReferenceError로 즉시 드러난다.
function makeSaver({ checkins = [], saving = false, fail = null, formDate = '' } = {}) {
  const calls = [];
  let state = checkins;
  const setCheckins = updater => { state = typeof updater === 'function' ? updater(state) : updater; };
  const fn = new dom.window.Function(
    'sorenessSaving', 'form', 'today', 'SORENESS_LEVELS', 'setSorenessSaving',
    'assertOwnMember', 'profile', 'saveMemberCheckin', 'setCheckins',
    'logMemberSaveError', 'memberSaveErrorMessage',
    sliceSave + '\nreturn saveDailySoreness;'
  )(
    saving, { date: formDate }, TODAY, SORENESS_LEVELS, () => {},
    () => {}, { id: 'm1', memberUid: 'u1' },
    async (memberId, dateKey, payload) => { calls.push({ memberId, dateKey, payload }); if (fail) throw fail; },
    setCheckins,
    () => {},
    (e, fallback) => (e && e.message) || fallback
  );
  return { fn, calls, get checkins() { return state; } };
}

(async () => {
  // 1) 개인운동·PT 기록이 전혀 없어도 근육통 카드가 항상 있다
  const emptyTiles = buildTodayStatusTiles({ checkins: [], body: null }, TODAY, {});
  const soreTile = emptyTiles.find(t => t.key === 'soreness');
  check('오늘 개인운동·PT 기록이 없어도 근육통 입력 카드가 항상 노출된다',
    !!soreTile && soreTile.done === false && soreTile.value === '—', JSON.stringify(emptyTiles.map(t => t.key)));
  check('근육통 카드는 체중·컨디션·통증과 같은 "오늘 상태" 그룹에 함께 놓인다',
    emptyTiles.map(t => t.key).join(',') === 'weight,condition,pain,soreness');

  // 2) 오늘 최초 저장 — 오늘 날짜 문서 1건에만 저장된다
  const first = makeSaver({ checkins: [{ id: PAST, date: PAST, soreness: '보통', sorenessParts: ['등'] }] });
  await first.fn({ level: '심함', parts: ['어깨', '등'], memo: '계단 오를 때 뻐근' });
  check('오늘 근육통 최초 저장 → memberCheckins/{오늘} 문서 한 건에 저장(날짜별 upsert)',
    first.calls.length === 1 && first.calls[0].dateKey === TODAY && first.calls[0].memberId === 'm1' &&
    first.calls[0].payload.soreness === '심함' &&
    JSON.stringify(first.calls[0].payload.sorenessParts) === JSON.stringify(['어깨', '등']) &&
    first.calls[0].payload.sorenessMemo === '계단 오를 때 뻐근', JSON.stringify(first.calls));
  check('저장 후 전체 재조회(load) 없이 로컬 오늘 체크인만 갱신된다',
    first.checkins.length === 2 && first.checkins[0].date === TODAY && first.checkins[0].soreness === '심함');
  check('기존 과거 근육통 기록은 그대로 유지된다',
    first.checkins.some(c => c.date === PAST && c.soreness === '보통' && c.sorenessParts[0] === '등'));

  // 3) 같은 날 다시 저장 → 중복 생성 없이 오늘 기록만 수정
  await first.fn({ level: '약간', parts: ['등'], memo: '' });
  const todayRows = first.checkins.filter(c => (c.date || c.id) === TODAY);
  check('오늘 근육통 재저장 → 새 기록을 만들지 않고 오늘 기록만 수정',
    first.calls.length === 2 && first.calls[1].dateKey === TODAY && todayRows.length === 1 &&
    todayRows[0].soreness === '약간' && JSON.stringify(todayRows[0].sorenessParts) === JSON.stringify(['등']) &&
    todayRows[0].sorenessMemo === '', JSON.stringify(first.checkins));

  // 4) 같은 날 컨디션·통증이 이미 있어도 근육통 필드만 전달해 덮어쓰지 않는다
  const merge = makeSaver({ checkins: [{ id: TODAY, date: TODAY, condition: '좋음', painPart: '무릎', painVas: 3 }] });
  await merge.fn({ level: '보통', parts: ['허벅지 앞'], memo: '' });
  check('근육통 저장은 근육통 필드만 전달해 같은 날 컨디션·통증 기록을 건드리지 않는다',
    Object.keys(merge.calls[0].payload).join(',') === 'soreness,sorenessParts,sorenessMemo' &&
    merge.checkins[0].condition === '좋음' && merge.checkins[0].painPart === '무릎', JSON.stringify(merge.calls[0].payload));

  // 5) "없음" 저장 시 부위는 비워진다
  const none = makeSaver();
  await none.fn({ level: '없음', parts: ['어깨'], memo: '괜찮음' });
  check('근육통 "없음" 저장 시 부위는 비워서 저장된다',
    none.calls[0].payload.soreness === '없음' && none.calls[0].payload.sorenessParts.length === 0);

  // 6) 알 수 없는 값은 "없음"으로 정규화
  const bad = makeSaver();
  await bad.fn({ level: '엄청심함', parts: ['어깨'], memo: '' });
  check('허용되지 않은 근육통 정도 값은 "없음"으로 정규화된다', bad.calls[0].payload.soreness === '없음');

  // 7) 저장 실패 → 예외 + 기존 데이터 보존
  const failed = makeSaver({ checkins: [{ id: TODAY, date: TODAY, soreness: '보통', sorenessParts: ['등'] }], fail: new Error('permission-denied') });
  let threw = false;
  try { await failed.fn({ level: '심함', parts: ['어깨'], memo: 'x' }); } catch (e) { threw = true; }
  check('근육통 저장 실패 → 예외를 올리고 기존 체크인 데이터를 덮어쓰지 않는다',
    threw && failed.checkins.length === 1 && failed.checkins[0].soreness === '보통' &&
    JSON.stringify(failed.checkins[0].sorenessParts) === JSON.stringify(['등']));

  // 8) 저장 중 중복 클릭 차단
  const busy = makeSaver({ saving: true });
  await busy.fn({ level: '심함', parts: ['어깨'], memo: '' });
  check('저장 중에는 중복 클릭이 무시된다(추가 쓰기 없음)', busy.calls.length === 0);

  // 9) 앱 재진입 — 저장된 오늘 근육통이 카드에 그대로 표시된다
  const savedTiles = buildTodayStatusTiles({ checkins: [{ id: TODAY, date: TODAY, soreness: '심함', sorenessParts: ['어깨', '등'], sorenessMemo: 'x' }], body: null }, TODAY, {});
  const savedTile = savedTiles.find(t => t.key === 'soreness');
  check('앱 재진입 → 오늘 입력한 근육통이 카드에 표시되고 주의 표시가 붙는다',
    savedTile.done === true && savedTile.value === '어깨/등 · 심함' && savedTile.warn === true, JSON.stringify(savedTile));

  // 10) 레거시 문서(soreness 문자열만) 안전 처리
  check('레거시 체크인(soreness 문자열만 존재)도 오류 없이 읽힌다', (() => {
    const r = getCheckinSoreness({ soreness: '보통' });
    return r.has === true && r.level === '보통' && Array.isArray(r.parts) && r.parts.length === 0 && r.memo === '';
  })());
  check('근육통 기록이 없는 체크인은 미입력으로 판정된다', (() => {
    const r = getCheckinSoreness({ condition: '좋음' });
    return r.has === false && r.level === '없음';
  })());

  // 11) 입력 UI — 정도 선택 → 부위 선택 → "없음" 선택 시 부위 초기화
  const reactRoot = ReactDOM.createRoot(document.getElementById('root'));
  let form = { sorenessLevel: '없음', sorenessParts: [], sorenessMemo: '' };
  const setForm = next => { form = next; };
  let el = null;
  const renderInput = async () => {
    await act(async () => { reactRoot.render(React.createElement(SorenessInput, { form, setForm })); });
    el = document.getElementById('root');
    return el;
  };
  await renderInput();
  const btns = () => [...el.querySelectorAll('.choice-buttons button')].map(b => b.textContent);
  check('근육통 "없음" 상태에서는 부위 선택 UI를 감춘다', btns().join(',') === SORENESS_LEVELS.join(','), btns().join(','));

  const clickText = async (text) => {
    const b = [...el.querySelectorAll('button')].find(x => x.textContent === text);
    await act(async () => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await renderInput();
  };
  await clickText('보통');
  check('근육통 정도를 고르면 부위 선택 UI가 나타난다', form.sorenessLevel === '보통' && btns().length > SORENESS_LEVELS.length);
  await clickText('어깨');
  await clickText('등');
  check('부위는 여러 곳 선택된다', JSON.stringify(form.sorenessParts) === JSON.stringify(['어깨', '등']), JSON.stringify(form.sorenessParts));
  await clickText('등');
  check('선택한 부위를 다시 누르면 해제된다', JSON.stringify(form.sorenessParts) === JSON.stringify(['어깨']));
  await clickText('없음');
  check('"없음"으로 되돌리면 선택한 부위가 비워진다', form.sorenessLevel === '없음' && form.sorenessParts.length === 0);

  let failedCount = 0;
  for (const [name, ok] of results) {
    if (ok) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failedCount += 1; }
  }
  if (failedCount) { console.error(`\n${failedCount} check(s) failed.`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
