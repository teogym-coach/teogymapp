// 회원앱 "식단 기록" 렌더/저장 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-diet-log.test.js)
//
// App.jsx / db.js 원본을 그대로 슬라이스해 실행한다 — 계산 로직을 테스트용으로 복제하지 않는다.
// 확인 범위:
//   1) 기록 없는 회원 / 레거시 총칼로리만 있는 회원 / 식단+레거시가 섞인 회원이 모두 정상 표시되는지
//   2) 텍스트 입력 → 예상 계산 → 회원이 수정 → 저장 흐름에서 "회원이 확인한 값"만 저장되는지
//   3) 같은 날 여러 끼 기록 / 음식 수정 / 음식 삭제 후 하루 총 kcal이 맞게 합산되는지
//   4) 회원앱 화면 합계(sumDayMeals)와 db.js 저장 합계(sumMealsForSave)가 어긋나지 않는지
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

const sliceNum = slice(APP, 'function toPositiveNumber', 'function getBodyWeightRecords', 'toPositiveNumber');
const sliceKcal = slice(APP, 'function getKcalLogs', 'function getRecentKcalLogsByDays', 'getKcalLogs');
const sliceFood = slice(APP, 'const FOOD_DB = [', 'function getSupplFeedback', 'FOOD_DB');
const sliceUi = slice(APP, '// 회원앱 식단 기록\n// ═'.replace('\n', '\r\n'), 'function MemberHealth(p){', 'MemberDietSection');
const sliceSave = slice(DB_SRC, 'function sumMealsForSave(meals = {})', 'export async function saveMemberDietMeal', 'sumMealsForSave');

const source = `
${sliceNum}
${sliceKcal}
${sliceFood}
${sliceUi}
${sliceSave}
window.__MemberDietSection = MemberDietSection;
window.__MemberDietSheet = MemberDietSheet;
window.__sumDayMeals = sumDayMeals;
window.__getKcalLogs = getKcalLogs;
window.__sumMealsForSave = sumMealsForSave;
window.__estimateFoodLines = estimateFoodLines;
`;

const out = babel.transformSync(source, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'diet.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

const TODAY = '2026-09-08';
const YESTERDAY = '2026-09-07';

// 권장 섭취 칼로리 공식(estimateMaintenance)은 다른 회귀 검사가 원본으로 검증한다 —
// 이 테스트는 "식단 기록 화면이 그 값을 그대로 보여주고, 저장 데이터가 맞게 만들어지는지"만 본다.
const stubs = {
  React,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
  getKoreaDateString: () => TODAY,
  getKoreaYesterdayDateString: () => YESTERDAY,
  estimateMaintenance: () => ({ bmr: 1600, maintenance: 2607, diet: 2107, maintain: 2607, bulk: 2907, basis: '공식 기반 초기값', confidence: 55 }),
  getGoalCalorieRecommendation: (a) => ({ label: '유지 권장 칼로리', shortLabel: '유지 목표 기준', value: a.maintain }),
  SjIcon: () => null,
  HM_PATHS: { clipboard: [] },
  MemberBottomSheet: ({ open, title, children }) => (open ? React.createElement('div', null, React.createElement('h3', null, title), children) : null),
};
const names = Object.keys(stubs);
new dom.window.Function(...names, out)(...names.map(n => stubs[n]));

const MemberDietSection = dom.window.__MemberDietSection;
const MemberDietSheet = dom.window.__MemberDietSheet;
const sumDayMeals = dom.window.__sumDayMeals;
const getKcalLogs = dom.window.__getKcalLogs;
const sumMealsForSave = dom.window.__sumMealsForSave;
const estimateFoodLines = dom.window.__estimateFoodLines;

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 500)); };

const reactRoot = ReactDOM.createRoot(document.getElementById('root'));
function names_of(container, sel){ return [...container.querySelectorAll(sel)].map(i=>i.value); }
let renderSeq = 0;
async function render(el) {
  await act(async () => { reactRoot.render(el); });
  return document.getElementById('root');
}
function setInput(el, value) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype === el.constructor.prototype
    ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function findButton(container, text) {
  return [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes(text));
}

function makeProps(nutrition, saved) {
  return {
    profile: { id: 'm1', name: '홍길동' },
    onboarding: { goal: '체중 유지' },
    body: { records: [{ date: TODAY, weight: 70 }] },
    nutrition,
    checkins: [], sessions: [],
    dietSaving: false,
    saveDietMeal: async (date, mealType, items) => { saved.push({ date, mealType, items }); },
  };
}

(async () => {
  // ── 1. 기록이 없는 회원 ─────────────────────────────────────────
  let saved = [];
  let el = await render(React.createElement(MemberDietSection, { p: makeProps({ logs: [], dates: {} }, saved) }));
  let text = el.textContent;
  check('기록 없는 회원: 오늘 섭취 0 / 권장 2,607 kcal을 보여준다',
    text.includes('0') && text.includes('/ 2,607 kcal'), text.slice(0, 300));
  check('기록 없는 회원: 아침·점심·저녁·간식 4개 끼니가 모두 "기록하기"로 나온다',
    ['아침', '점심', '저녁', '간식'].every(m => text.includes(m)) && (text.match(/기록하기/g) || []).length === 4, text.slice(0, 400));
  check('기록 없는 회원: 예상값 안내 문구가 항상 보인다', text.includes('예상값'), text.slice(0, 400));

  // ── 2. 레거시 총칼로리 기록만 있는 회원 ────────────────────────
  el = await render(React.createElement(MemberDietSection, { key: 'a2', p: makeProps({ logs: [], dates: { [TODAY]: { totalKcal: 1900, memberInputKcal: 1900 } } }, saved) }));
  text = el.textContent;
  check('레거시 회원: 직접 입력한 하루 총칼로리(1,900)가 그대로 표시된다', text.includes('1,900'), text.slice(0, 300));

  // ── 3. 식단 기록 + 레거시 총칼로리가 함께 있는 회원 ────────────
  const mixed = { logs: [], dates: { [TODAY]: { totalKcal: 2000, meals: { '점심': [{ id: 'a', name: '비빔밥', cal: 550, carb: 85, protein: 18, fat: 12 }] } } } };
  el = await render(React.createElement(MemberDietSection, { key: 'a3', p: makeProps(mixed, saved) }));
  text = el.textContent;
  check('혼합 회원: 총칼로리(2,000)를 우선 표시하고 식단 합계(550)를 함께 안내한다',
    text.includes('2,000') && text.includes('식단 기록 합계는 550kcal'), text.slice(0, 600));
  check('혼합 회원: 끼니 카드에 저장된 음식명과 합계가 보인다', text.includes('비빔밥') && text.includes('550 kcal'), text.slice(0, 600));

  // ── 4. 예상 계산 → 수정 → 저장 흐름 ─────────────────────────────
  saved = [];
  el = await render(React.createElement(MemberDietSheet, {
    key: 'sheet-new', p: makeProps({ logs: [], dates: {} }, saved), date: TODAY, mealType: '아침', onClose: () => {},
  }));
  const area = el.querySelector('textarea');
  await act(async () => { setInput(area, '현미밥 200g\n닭가슴살 100g\n계란 2개'); });
  await act(async () => { findButton(el, '예상 칼로리 계산하기').click(); });
  text = el.textContent;
  const foodNames = names_of(el, '.diet-item-name');
  check('예상 계산: 입력한 3개 음식이 모두 항목으로 나온다',
    foodNames.join('|') === '현미밥|닭가슴살|계란', JSON.stringify(foodNames));
  check('예상 계산: 계산 결과는 확정이 아니라 "예상값"으로 표시된다',
    (text.match(/예상값/g) || []).length >= 3, text.slice(0, 600));
  check('예상 계산: 현미밥 200g + 닭가슴살 100g + 계란 2개 = 481kcal 합계가 표시된다',
    text.includes('481 kcal'), text.slice(0, 800));

  // 회원이 계란 kcal을 150 → 200으로 직접 수정
  const numInputs = [...el.querySelectorAll('.diet-num input')];
  await act(async () => { setInput(numInputs[8], '200'); }); // 3번째 항목(계란)의 kcal 칸
  await act(async () => { findButton(el, '확인하고 저장').click(); });
  check('저장: 회원이 확인·수정한 값만 저장된다(계란 150 → 200 반영)',
    saved.length === 1 && saved[0].mealType === '아침' && saved[0].date === TODAY &&
    saved[0].items.length === 3 && Number(saved[0].items[2].cal) === 200,
    JSON.stringify(saved[0] && saved[0].items));
  check('저장: 저장 payload에는 화면 전용 필드(pending/raw)가 포함되지 않는다',
    saved.length === 1 && saved[0].items.every(f => f.pending === undefined && f.raw === undefined),
    JSON.stringify(saved[0] && saved[0].items[0]));
  check('저장: 추정값이라는 사실(estimated/source)이 기록에 남는다',
    saved.length === 1 && saved[0].items.every(f => f.estimated === true) && saved[0].items[0].source === '음식 DB',
    JSON.stringify(saved[0] && saved[0].items[0]));

  // ── 5. 음식 삭제 ────────────────────────────────────────────────
  saved = [];
  el = await render(React.createElement(MemberDietSheet, {
    key: 'sheet-saved', p: makeProps({ logs: [], dates: { [TODAY]: { meals: { '점심': [
      { id: 'x1', name: '비빔밥', cal: 550, carb: 85, protein: 18, fat: 12 },
      { id: 'x2', name: '된장찌개', cal: 150, carb: 10, protein: 12, fat: 5 },
    ] } } } }, saved), date: TODAY, mealType: '점심', onClose: () => {},
  }));
  check('기존 저장 항목은 "저장됨"으로 열리고 그대로 수정할 수 있다',
    el.textContent.includes('저장됨') && names_of(el, '.diet-item-name').join('|') === '비빔밥|된장찌개',
    JSON.stringify(names_of(el, '.diet-item-name')));
  await act(async () => { el.querySelectorAll('.diet-item-del')[1].click(); });
  await act(async () => { findButton(el, '확인하고 저장').click(); });
  check('음식 삭제: 삭제한 항목을 뺀 나머지만 저장된다',
    saved.length === 1 && saved[0].items.length === 1 && saved[0].items[0].name === '비빔밥',
    JSON.stringify(saved[0] && saved[0].items));

  // ── 6. 하루 총 kcal 합산 · 저장 합계와 화면 합계 일치 ──────────
  const dayMeals = { meals: {
    '아침': [{ cal: 300, carb: 40, protein: 20, fat: 5 }],
    '점심': [{ cal: 700, carb: 90, protein: 35, fat: 20 }],
    '저녁': [{ cal: 600, carb: 60, protein: 40, fat: 18 }],
    '간식': [{ cal: 220, carb: 30, protein: 5, fat: 8 }],
  } };
  const uiTotal = sumDayMeals(dayMeals);
  const dbTotal = sumMealsForSave(dayMeals.meals);
  check('같은 날 여러 끼(4끼) 합산: 하루 총 1,820kcal', uiTotal.kcal === 1820, JSON.stringify(uiTotal));
  check('화면 합계와 db.js 저장 합계가 완전히 일치한다(집계 기준 이원화 방지)',
    uiTotal.kcal === dbTotal.kcal && uiTotal.protein === dbTotal.protein &&
    uiTotal.carb === dbTotal.carb && uiTotal.fat === dbTotal.fat,
    JSON.stringify({ uiTotal, dbTotal }));
  check('관리자 식단 분석 자동 반영: totalKcal이 없어도 meals 합계가 날짜별 칼로리로 잡힌다',
    getKcalLogs({ dates: { [TODAY]: dayMeals } })[0].kcal === 1820,
    JSON.stringify(getKcalLogs({ dates: { [TODAY]: dayMeals } })));

  // ── 7. 매칭 실패 항목은 칼로리를 지어내지 않는다 ─────────────────
  const rows = estimateFoodLines('알수없는신메뉴 1인분');
  check('매칭 실패: 칼로리를 임의로 만들지 않고 0으로 두어 회원이 직접 입력하게 한다',
    rows.length === 1 && rows[0].matched === false && rows[0].cal === 0 && rows[0].needsCheck === true,
    JSON.stringify(rows));

  const failed = results.filter(([, ok]) => !ok);
  results.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} 회원앱 식단 기록: ${n}`));
  if (failed.length) { console.error(`\n${failed.length} check(s) failed.`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
