// 개인운동 카드 "운동 후 상태" 근육통 — D+1/D+2 창 제한 제거 렌더/저장 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-personal-workout-soreness-window.test.js)
//
// App.jsx 원본을 그대로 슬라이스해 실행한다 — 창 판정·저장 로직을 테스트용으로 복제하지 않는다.
// 확인 범위:
//   1) 완료 당일(D0)/D+1/D+2/D+3 이후 모두 근육통 신규 입력 UI가 항상 노출된다(창 제한 없음)
//   2) 이미 저장된 근육통은 창을 한참 지난 뒤에도(D+10) 기존 값이 채워진 채로 열려 수정할 수 있다
//   3) timing은 여전히 next_day/two_days_later 2값 스키마만 쓰고, 창 밖 날짜는 daysAfterWorkout로 가까운 값에 매핑된다
//   4) 저장 호출은 기존과 동일하게 onSaveSoreness(workout, {timing, overallLevel, bodyParts, memo})로 나간다
//   5) 레거시 personalWorkoutSoreness 문서(과거 데이터)도 정규화·표시에 문제가 없다
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // babel-preset-react-app 요구사항
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const DB_SRC = fs.readFileSync(path.join(root, 'src', 'db.js'), 'utf8');

function slice(src, start, end, tag) {
  const si = src.indexOf(start), ei = src.indexOf(end);
  if (si < 0 || ei < 0 || ei < si) { console.error(`[${tag}] slice 경계 실패`, si, ei); process.exit(1); }
  if (src.indexOf(start, si + 1) !== -1) { console.error(`[${tag}] 시작 마커가 2회 이상 등장`); process.exit(1); }
  return src.slice(si, ei);
}

const sliceLimits = slice(DB_SRC, 'export const PERSONAL_WORKOUT_LIMITS', 'export async function getPersonalWorkouts', 'PERSONAL_WORKOUT_LIMITS').replace('export const', 'const');
const sliceKoreaDate = slice(APP, 'function getKoreaDateString', 'function getKoreaYesterdayDateString', 'getKoreaDateString');
const sliceRpeDesc = slice(APP, 'function rpeDescription', 'function MemberWorkout', 'rpeDescription');
// 날짜/창 판정 계층 — PERSONAL_WORKOUT_PART_OPTIONS(칩 옵션) ~ sorenessLevelDescription까지 한 번에 자른다.
// getPersonalWorkoutSorenessWindow 자체는 이번 작업에서 손대지 않았으므로 원본 그대로 실행해 값이 그대로인지 검증한다.
const sliceWindow = slice(APP, 'const PERSONAL_WORKOUT_PART_OPTIONS', 'function getPersonalWorkoutAttentionReasons', 'sorenessWindow');
const sliceSummary = slice(APP, 'function buildPersonalWorkoutStatusSummary', 'function PersonalWorkoutStatusSection', 'buildPersonalWorkoutStatusSummary');
const sliceSection = slice(APP, 'function PersonalWorkoutStatusSection', '// 운동 종목 선택 시트', 'PersonalWorkoutStatusSection');

const out = babel.transformSync([
  sliceLimits, sliceKoreaDate, sliceRpeDesc, sliceWindow, sliceSummary, sliceSection,
  'window.__getPersonalWorkoutSorenessWindow = getPersonalWorkoutSorenessWindow;',
  'window.__normalizePersonalWorkoutSoreness = normalizePersonalWorkoutSoreness;',
  'window.__sorenessTimingLabel = sorenessTimingLabel;',
  'window.__PersonalWorkoutStatusSection = PersonalWorkoutStatusSection;',
  'window.__getKoreaDateString = getKoreaDateString;', // 실제 KST 변환 로직을 그대로 써야 임의 날짜(daysAgo)의 완료일 계산이 맞는다 — 고정 문자열로 stub하면 안 됨
].join('\n'), {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'pwsoreness.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

// getKoreaDateString은 stub하지 않고 원본 그대로 실행한다 — 고정 문자열로 바꾸면 daysAgo별로 다른 날짜를
// 만들어 넘겨도 완료일(getPersonalWorkoutCompletionDateKey 내부에서 재호출됨) 계산이 전부 "오늘"로 뭉개진다.
const stubs = {
  React,
  useState: React.useState, useEffect: React.useEffect,
  SjIcon: () => null,
  SJ_PATHS: { squarePen: [], activity: [], flame: [], x: [], chevronUp: [], chevronDown: [] },
};
const names = Object.keys(stubs);
new dom.window.Function(...names, out)(...names.map(n => stubs[n]));

const getPersonalWorkoutSorenessWindow = dom.window.__getPersonalWorkoutSorenessWindow;
const normalizePersonalWorkoutSoreness = dom.window.__normalizePersonalWorkoutSoreness;
const sorenessTimingLabel = dom.window.__sorenessTimingLabel;
const PersonalWorkoutStatusSection = dom.window.__PersonalWorkoutStatusSection;
const TODAY = dom.window.__getKoreaDateString(); // 실제 오늘(KST) — 이 값을 기준으로 daysAgo만큼 뺀 완료일을 만든다

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 500)); };

function makeWorkout(daysAgo) {
  const doneDate = new Date(`${TODAY}T12:00:00+09:00`);
  doneDate.setDate(doneDate.getDate() - daysAgo);
  const dateKey = doneDate.toISOString().slice(0, 10);
  return { id: 'w1', status: 'completed', endedAt: { seconds: Math.floor(doneDate.getTime() / 1000) }, workoutDate: dateKey, workoutParts: ['가슴'], rpe: null };
}

const reactRoot = ReactDOM.createRoot(document.getElementById('root'));
async function render(el) { await act(async () => { reactRoot.render(el); }); return document.getElementById('root'); }
function openAndGetEl(container) {
  const toggle = container.querySelector('.sj-fb-toggle');
  return toggle;
}

(async () => {
  // ── 1) getPersonalWorkoutSorenessWindow 자체는 이번 작업으로 변경되지 않았음을 확인(회귀 방지) ──
  const w0 = getPersonalWorkoutSorenessWindow(makeWorkout(0), TODAY);
  const w1 = getPersonalWorkoutSorenessWindow(makeWorkout(1), TODAY);
  const w2 = getPersonalWorkoutSorenessWindow(makeWorkout(2), TODAY);
  const w3 = getPersonalWorkoutSorenessWindow(makeWorkout(3), TODAY);
  const w10 = getPersonalWorkoutSorenessWindow(makeWorkout(10), TODAY);
  check('창 함수 자체는 그대로: D0은 timing null·withinAutoWindow false', w0.timing === null && w0.withinAutoWindow === false && w0.isSameDay === true);
  check('창 함수 자체는 그대로: D+1은 timing next_day·withinAutoWindow true', w1.timing === 'next_day' && w1.withinAutoWindow === true);
  check('창 함수 자체는 그대로: D+2는 timing two_days_later·withinAutoWindow true', w2.timing === 'two_days_later' && w2.withinAutoWindow === true);
  check('창 함수 자체는 그대로: D+3 이상은 timing null·withinAutoWindow false(isPast true)', w3.timing === null && w3.withinAutoWindow === false && w3.isPast === true);
  check('창 함수 자체는 그대로: D+10도 timing null·isPast true', w10.timing === null && w10.isPast === true);

  // ── 2) 완료 당일(D0)~D+3 이후까지, 근육통 신규 입력 UI가 항상 렌더된다(창 제한 제거) ──
  for (const days of [0, 1, 2, 3, 10]) {
    const workout = makeWorkout(days);
    const sorenessWindow = getPersonalWorkoutSorenessWindow(workout, TODAY);
    const saved = [];
    // key로 매 반복마다 새 인스턴스를 강제 마운트한다 — key 없이 같은 루트를 재렌더하면 React가 이전 반복의
    // open(펼침) state를 그대로 이어받아 클릭이 열기/닫기로 번갈아 동작하는 오탐을 만든다.
    let el = await render(React.createElement(PersonalWorkoutStatusSection, {
      key: `vis_${days}`, workout, soreness: null, sorenessWindow,
      onSaveRpe: async () => {}, onSaveSoreness: async (w, data) => { saved.push(data); },
    }));
    await act(async () => { openAndGetEl(el).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    el = document.getElementById('root');
    const hasLevelGrid = !!el.querySelector('.pw-level-grid');
    const hasBlockedHint = (el.textContent || '').includes('기록 기간') || (el.textContent || '').includes('지나 새로 기록할 수 없어요');
    check(`D+${days}: 근육통 신규 입력 UI가 항상 노출된다(막다른 안내 없음)`, hasLevelGrid && !hasBlockedHint, el.textContent.slice(0, 200));
  }

  // ── 3) timing 매핑: 창 안(D+1/D+2)은 기존과 동일, 창 밖(D0/D+3+)은 daysAfterWorkout로 가까운 값에 매핑(스키마 확장 없음) ──
  const expectTiming = { 0: 'next_day', 1: 'next_day', 2: 'two_days_later', 3: 'two_days_later', 10: 'two_days_later' };
  for (const days of [0, 1, 2, 3, 10]) {
    const workout = makeWorkout(days);
    const sorenessWindow = getPersonalWorkoutSorenessWindow(workout, TODAY);
    const saved = [];
    let el = await render(React.createElement(PersonalWorkoutStatusSection, {
      key: `timing_${days}`, workout, soreness: null, sorenessWindow,
      onSaveRpe: async () => {}, onSaveSoreness: async (w, data) => { saved.push(data); },
    }));
    await act(async () => { openAndGetEl(el).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    el = document.getElementById('root');
    // 전체 근육통 정도 3(보통) 선택 → 근육통 저장
    const levelBtns = [...el.querySelectorAll('.pw-level-grid')][0].querySelectorAll('button');
    await act(async () => { levelBtns[3].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    el = document.getElementById('root');
    const saveBtn = [...el.querySelectorAll('.sj-fb-section-save')].find(b => b.textContent.includes('근육통 저장'));
    await act(async () => { saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    check(`D+${days}: 저장 시 timing이 ${expectTiming[days]}(next_day/two_days_later 2값 스키마 유지)으로 나간다`,
      saved.length === 1 && saved[0].timing === expectTiming[days] && saved[0].overallLevel === 3,
      JSON.stringify(saved));
  }

  // ── 4) 이미 저장된 근육통은 D+10에도 기존 값이 채워진 채로 열리고, 수정·재저장이 된다 ──
  const oldWorkout = makeWorkout(10);
  const savedRaw = { workoutId: 'w1', workoutDate: oldWorkout.workoutDate, timing: 'next_day', daysAfterWorkout: 1, overallLevel: 2, bodyParts: [{ part: '가슴', level: 2 }], memo: '살짝 뻐근함' };
  const existingSoreness = normalizePersonalWorkoutSoreness(savedRaw);
  const sorenessWindowOld = getPersonalWorkoutSorenessWindow(oldWorkout, TODAY);
  const editedSaves = [];
  let editEl = await render(React.createElement(PersonalWorkoutStatusSection, {
    key: 'existing_d10', workout: oldWorkout, soreness: existingSoreness, sorenessWindow: sorenessWindowOld,
    onSaveRpe: async () => {}, onSaveSoreness: async (w, data) => { editedSaves.push(data); },
  }));
  await act(async () => { openAndGetEl(editEl).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  editEl = document.getElementById('root');
  const memoField = editEl.querySelector('.pw-memo');
  check('D+10 기존 근육통 기록: 저장된 메모·부위·정도가 채워진 채로 열린다', memoField && memoField.value === '살짝 뻐근함');
  const levelBtnsEdit = [...editEl.querySelectorAll('.pw-level-grid')][0].querySelectorAll('button');
  await act(async () => { levelBtnsEdit[4].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); // 정도 4로 수정
  editEl = document.getElementById('root');
  const saveBtnEdit = [...editEl.querySelectorAll('.sj-fb-section-save')].find(b => b.textContent.includes('근육통 저장'));
  await act(async () => { saveBtnEdit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  check('D+10 기존 근육통 기록: 창을 한참 지나도 수정·재저장이 가능하고, 저장된 timing(next_day)이 그대로 유지된다(재계산되지 않음)',
    editedSaves.length === 1 && editedSaves[0].timing === 'next_day' && editedSaves[0].overallLevel === 4,
    JSON.stringify(editedSaves));

  // ── 5) 레거시 personalWorkoutSoreness 문서(과거 데이터, 신규 필드 없음)도 정규화가 안전하게 처리한다 ──
  const legacyRaw = { workoutId: 'w2', workoutDate: '2026-08-01', bodyParts: [{ part: '등' }] }; // timing/overallLevel/memo 없음
  const legacyNormalized = normalizePersonalWorkoutSoreness(legacyRaw);
  check('레거시 personalWorkoutSoreness 문서(timing/overallLevel 없음)도 오류 없이 정규화된다',
    legacyNormalized.timing === 'next_day' && legacyNormalized.overallLevel === 0 && legacyNormalized.bodyParts[0].part === '등' && legacyNormalized.bodyParts[0].level === 0,
    JSON.stringify(legacyNormalized));
  check('sorenessTimingLabel은 여전히 next_day/two_days_later 2값만 라벨링한다(신규 값 없음)',
    sorenessTimingLabel('next_day') === '다음 날 근육통' && sorenessTimingLabel('two_days_later') === '다다음 날 근육통');

  let failedCount = 0;
  for (const [name, ok] of results) {
    if (ok) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failedCount += 1; }
  }
  if (failedCount) { console.error(`\n${failedCount} check(s) failed.`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
