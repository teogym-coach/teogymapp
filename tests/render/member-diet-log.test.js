// 회원앱 "식단 기록" 렌더/저장 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-diet-log.test.js)
//
// App.jsx / db.js 원본을 그대로 슬라이스해 실행한다 — 계산 로직을 테스트용으로 복제하지 않는다.
// 확인 범위:
//   1) 기록 없는 회원 / 레거시 총칼로리만 있는 회원 / meals만 있는 과거 기록 / 둘이 섞인 회원
//   2) CTA 하나로 계산 → 확인 → 저장이 강제되는지(계산 안 하고 저장 눌러도 저장되지 않음)
//   3) 이름·양·단위 수정 시 재계산, 칼로리 직접 수정 시 manual override 보존
//   4) 같은 날 여러 끼 / 음식 수정 / 음식 삭제 / 하루 총 kcal 합산
//   5) 필수 음식(거봉·오이무침·현미밥·닭가슴살·계란·옥수수) 매칭과 오탐 방지
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

const out = babel.transformSync(`
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
window.__searchFoodItems = searchFoodItems;
window.__foodSourceKind = foodSourceKind;
window.__FOOD_DB = FOOD_DB;
`, {
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
const foodSourceKind = dom.window.__foodSourceKind;
const FOOD_DB = dom.window.__FOOD_DB;

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 500)); };

// window.confirm은 "칼로리 0 항목 그대로 저장" 확인용 — 기본은 승인으로 둔다.
dom.window.confirm = () => true;
dom.window.alert = () => {};

const reactRoot = ReactDOM.createRoot(document.getElementById('root'));
function valuesOf(container, sel) { return [...container.querySelectorAll(sel)].map(i => i.value); }
async function render(el) {
  await act(async () => { reactRoot.render(el); });
  return document.getElementById('root');
}
function setInput(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
// React 18은 focus/blur를 focusin/focusout으로 위임받는다 — jsdom에서 두 경로를 모두 쏴 준다.
function focusInput(el) {
  el.focus();
  el.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true }));
}
function blurInput(el) {
  el.blur();
  el.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
}
const cta = el => el.querySelector('.diet-cta');
const ctaText = el => (cta(el).textContent || '').trim();

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
let sheetSeq = 0;
async function openSheet(nutrition, saved, mealType = '아침') {
  sheetSeq += 1;
  return render(React.createElement(MemberDietSheet, {
    key: 'sheet' + sheetSeq, p: makeProps(nutrition, saved), date: TODAY, mealType, onClose: () => {},
  }));
}

(async () => {
  // ══ A. 화면 표시 — 기록 상태별 ═════════════════════════════════
  let saved = [];
  let el = await render(React.createElement(MemberDietSection, { key: 'a1', p: makeProps({ logs: [], dates: {} }, saved) }));
  let text = el.textContent;
  check('기록 없는 회원: 오늘 섭취 0 / 권장 2,607 kcal을 보여준다',
    text.includes('0') && text.includes('/ 2,607 kcal'), text.slice(0, 300));
  check('기록 없는 회원: 아침·점심·저녁·간식 4개 끼니가 모두 "기록하기"로 나온다',
    ['아침', '점심', '저녁', '간식'].every(m => text.includes(m)) && (text.match(/기록하기/g) || []).length === 4, text.slice(0, 400));

  el = await render(React.createElement(MemberDietSection, { key: 'a2', p: makeProps({ logs: [], dates: { [TODAY]: { totalKcal: 1900, memberInputKcal: 1900 } } }, saved) }));
  check('레거시 총칼로리 기록만 있는 회원: 1,900kcal이 그대로 표시된다', el.textContent.includes('1,900'), el.textContent.slice(0, 300));

  el = await render(React.createElement(MemberDietSection, { key: 'a3', p: makeProps({ logs: [], dates: { [TODAY]: { meals: { '점심': [{ id: 'x', name: '비빔밥', cal: 550 }] } } } }, saved) }));
  check('meals만 있는 과거 기록: totalKcal이 없어도 550kcal로 집계된다', el.textContent.includes('550'), el.textContent.slice(0, 400));

  const mixed = { logs: [], dates: { [TODAY]: { totalKcal: 2000, meals: { '점심': [{ id: 'a', name: '비빔밥', cal: 550, carb: 85, protein: 18, fat: 12 }] } } } };
  el = await render(React.createElement(MemberDietSection, { key: 'a4', p: makeProps(mixed, saved) }));
  check('혼합 회원: 총칼로리(2,000)를 우선 표시하고 식단 합계(550)를 함께 안내한다',
    el.textContent.includes('2,000') && el.textContent.includes('식단 기록 합계는 550kcal'), el.textContent.slice(0, 600));

  // ══ B. 계산하지 않고 저장을 눌렀을 때(이번 개선의 핵심) ═════════
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  check('빈 상태에서는 CTA가 비활성화된다', cta(el).disabled === true, ctaText(el));
  await act(async () => { setInput(el.querySelector('textarea'), '현미밥 200g\n닭가슴살 100g\n계란 2개'); });
  check('음식을 입력하면 CTA가 "칼로리 확인하기"로 바뀐다(저장 문구가 아니다)',
    ctaText(el) === '칼로리 확인하기', ctaText(el));
  await act(async () => { cta(el).click(); });
  check('계산하지 않고 저장을 눌러도 저장되지 않는다 — 대신 자동으로 계산이 실행된다',
    saved.length === 0 && valuesOf(el, '.diet-item-name').join('|') === '현미밥|닭가슴살|계란',
    JSON.stringify({ saved: saved.length, names: valuesOf(el, '.diet-item-name') }));
  check('자동 계산 결과가 화면에 표시된다(481kcal 합계)', el.textContent.includes('481 kcal'), el.textContent.slice(0, 600));
  check('자동 계산 직후 자동 저장하지 않는다 — CTA만 "확인하고 저장"으로 바뀌고 저장은 아직 0건',
    ctaText(el) === '확인하고 저장' && saved.length === 0, ctaText(el) + ' / saved=' + saved.length);
  check('계산 직후 확인 안내 문구를 보여준다', el.textContent.includes('계산했어요'), el.textContent.slice(0, 800));
  await act(async () => { cta(el).click(); });
  check('한 번 더 눌러 최종 확인했을 때 비로소 저장된다',
    saved.length === 1 && saved[0].items.length === 3 && saved[0].mealType === '아침', JSON.stringify(saved));
  check('저장 payload에 화면 전용 필드(pending/stale/manual/candidates)가 없다',
    saved[0].items.every(f => f.pending === undefined && f.stale === undefined && f.manual === undefined && f.candidates === undefined),
    JSON.stringify(saved[0].items[0]));
  check('저장 payload에 출처 구분(sourceKind=local)이 남는다',
    saved[0].items.every(f => f.sourceKind === 'local'), JSON.stringify(saved[0].items.map(f => f.sourceKind)));

  // 입력창에 글을 남긴 채 저장을 눌러도 그 음식이 사라지지 않는다(예전 버그 재발 방지)
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '계란 2개'); });
  await act(async () => { cta(el).click(); });
  await act(async () => { setInput(el.querySelector('textarea'), '현미밥 200g'); });
  check('계산 후 새 음식을 더 적으면 CTA가 다시 "칼로리 확인하기"로 돌아간다', ctaText(el) === '칼로리 확인하기', ctaText(el));
  await act(async () => { cta(el).click(); });
  check('입력창에 남은 음식이 버려지지 않고 항목으로 추가된다',
    valuesOf(el, '.diet-item-name').join('|') === '계란|현미밥' && saved.length === 0,
    JSON.stringify(valuesOf(el, '.diet-item-name')));

  // ══ C. 수정 후 재계산 / manual override ═════════════════════════
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '계란 2개'); });
  await act(async () => { cta(el).click(); });
  check('계란 2개 = 150kcal로 계산된다', valuesOf(el, '.diet-num input')[0] === '150', valuesOf(el, '.diet-num input'));
  await act(async () => { setInput(el.querySelector('.diet-item-amount'), '3'); });
  check('양을 수정하면 재계산 필요 상태가 되고 CTA가 다시 계산으로 바뀐다',
    ctaText(el) === '칼로리 확인하기' && el.textContent.includes('내용을 수정했어요'), ctaText(el));
  await act(async () => { cta(el).click(); });
  check('양 수정 후 재계산: 계란 3개 = 225kcal (낡은 150이 저장되지 않는다)',
    valuesOf(el, '.diet-num input')[0] === '225', valuesOf(el, '.diet-num input'));
  await act(async () => { setInput(el.querySelector('.diet-item-name'), '현미밥'); });
  check('음식명을 수정해도 재계산 필요 상태가 된다', ctaText(el) === '칼로리 확인하기', ctaText(el));
  await act(async () => { cta(el).click(); });
  // 계란(개) → 현미밥(g)으로 이름만 바꾸면 남아 있던 단위 '개'가 현미밥에 맞지 않는다.
  // 이때는 값을 억지로 환산하지 않고 기본 1회 제공량(100g)으로 계산한 뒤 섭취량 확인을 요청해야 한다.
  check('음식명 수정 후 재계산: 단위가 맞지 않으면 기본 제공량(100g)으로 계산하고 확인을 요청한다',
    valuesOf(el, '.diet-item-name')[0] === '현미밥' && valuesOf(el, '.diet-item-amount')[0] === '100' &&
    valuesOf(el, '.diet-item-unit')[0] === 'g' && el.textContent.includes('섭취량을 확인해 주세요'),
    JSON.stringify({ n: valuesOf(el, '.diet-item-name'), a: valuesOf(el, '.diet-item-amount'), u: valuesOf(el, '.diet-item-unit') }));

  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '계란 2개'); });
  await act(async () => { cta(el).click(); });
  await act(async () => { setInput(el.querySelectorAll('.diet-num input')[0], '500'); });
  check('칼로리를 직접 수정하면 출처 배지가 "직접 입력"으로 바뀐다', el.textContent.includes('직접 입력'), el.textContent.slice(0, 700));
  check('직접 수정한 항목은 재계산 대상이 되지 않는다(CTA가 바로 저장)', ctaText(el) === '확인하고 저장', ctaText(el));
  await act(async () => { setInput(el.querySelector('.diet-item-amount'), '5'); });
  check('직접 입력 항목은 양을 바꿔도 재계산 단계 없이 바로 저장 상태를 유지한다',
    ctaText(el) === '확인하고 저장' && valuesOf(el, '.diet-num input')[0] === '500',
    ctaText(el) + ' / ' + valuesOf(el, '.diet-num input'));
  await act(async () => { cta(el).click(); });
  check('직접 입력값은 양을 바꿔도 자동 계산이 덮어쓰지 않는다(500 유지)',
    valuesOf(el, '.diet-num input')[0] === '500', valuesOf(el, '.diet-num input'));
  check('직접 입력 항목은 sourceKind=manual로 저장된다',
    saved.length === 1 && saved[0].items[0].sourceKind === 'manual' && Number(saved[0].items[0].cal) === 500,
    JSON.stringify({ count: saved.length, items: saved[0] && saved[0].items }));

  // ══ D. DB에 없는 음식 / 직접 입력 저장 ══════════════════════════
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '엄마표 닭볶음탕'); });
  await act(async () => { cta(el).click(); });
  check('DB에 없는 음식: 칼로리를 지어내지 않고 0으로 두고 직접 입력을 안내한다',
    valuesOf(el, '.diet-num input')[0] === '0' && el.textContent.includes('등록된 영양정보를 찾지 못했습니다'),
    el.textContent.slice(0, 700));
  await act(async () => { setInput(el.querySelectorAll('.diet-num input')[0], '650'); });
  await act(async () => { cta(el).click(); });
  check('직접 입력한 음식이 manual로 저장된다',
    saved.length === 1 && saved[0].items[0].name === '엄마표 닭볶음탕' &&
    Number(saved[0].items[0].cal) === 650 && saved[0].items[0].sourceKind === 'manual',
    JSON.stringify(saved[0] && saved[0].items));

  // ══ E. 검색 결과가 여러 개일 때 후보 선택 ═══════════════════════
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '계란 2개'); });
  await act(async () => { cta(el).click(); });
  const cands = [...el.querySelectorAll('.diet-cands button')].map(b => b.textContent);
  check('검색 결과가 여러 개면 첫 결과를 확정하지 않고 다른 후보를 함께 보여준다',
    cands.length > 0 && cands.includes('계란흰자'), JSON.stringify(cands));
  const whiteBtn = [...el.querySelectorAll('.diet-cands button')].find(b => b.textContent === '계란흰자');
  await act(async () => { whiteBtn.click(); });
  check('후보를 누르면 그 음식으로 다시 계산된다(계란흰자 2개 = 34kcal)',
    valuesOf(el, '.diet-item-name')[0] === '계란흰자' && valuesOf(el, '.diet-num input')[0] === '34',
    JSON.stringify({ n: valuesOf(el, '.diet-item-name'), v: valuesOf(el, '.diet-num input') }));

  // ══ F. 기존 저장 항목 수정 / 삭제 ═══════════════════════════════
  saved = [];
  el = await openSheet({ logs: [], dates: { [TODAY]: { meals: { '점심': [
    { id: 'x1', name: '비빔밥', cal: 550, carb: 85, protein: 18, fat: 12, source: '음식 DB' },
    { id: 'x2', name: '된장찌개', cal: 150, carb: 10, protein: 12, fat: 5, source: '음식 DB' },
  ] } } } }, saved, '점심');
  check('기존 저장 항목이 그대로 열리고 출처가 TEO GYM DB로 표시된다',
    valuesOf(el, '.diet-item-name').join('|') === '비빔밥|된장찌개' && el.textContent.includes('TEO GYM DB'),
    el.textContent.slice(0, 500));
  await act(async () => { el.querySelectorAll('.diet-item-del')[1].click(); });
  await act(async () => { cta(el).click(); });
  check('음식 삭제: 삭제한 항목을 뺀 나머지만 저장된다',
    saved.length === 1 && saved[0].items.length === 1 && saved[0].items[0].name === '비빔밥',
    JSON.stringify(saved[0] && saved[0].items));

  // ══ G. 집계 · 관리자 분석/그래프 반영 ═══════════════════════════
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
    uiTotal.carb === dbTotal.carb && uiTotal.fat === dbTotal.fat, JSON.stringify({ uiTotal, dbTotal }));
  check('관리자 식단 분석 / 회원앱 칼로리 그래프 반영: totalKcal이 없어도 meals 합계가 날짜별 칼로리로 잡힌다',
    getKcalLogs({ dates: { [TODAY]: dayMeals } })[0].kcal === 1820,
    JSON.stringify(getKcalLogs({ dates: { [TODAY]: dayMeals } })));
  check('레거시 총칼로리 기록의 우선순위는 그대로 유지된다',
    getKcalLogs({ dates: { [TODAY]: { totalKcal: 2000, meals: { '아침': [{ cal: 300 }] } } } })[0].kcal === 2000);

  // ══ H. 출처 구분(레거시 역산 포함) ══════════════════════════════
  check('출처 구분: 과거 기록은 source 문자열에서 sourceKind를 역산한다(레거시 호환)',
    foodSourceKind({ source: '음식 DB' }) === 'local' &&
    foodSourceKind({ source: '직접 입력' }) === 'manual' &&
    foodSourceKind({ sourceKind: 'official' }) === 'official');

  // ══ I. 필수 음식 매칭 / 오탐 방지 ═══════════════════════════════
  const expect = [
    ['거봉 100g', '거봉', '100', 'g', 69],
    ['거봉 150g', '거봉', '150', 'g', 104],
    ['오이무침 100g', '오이무침', '100', 'g', 45],
    ['현미밥 200g', '현미밥', '200', 'g', 222],
    ['닭가슴살 100g', '닭가슴살', '100', 'g', 109],
    ['계란 2개', '계란', '2', '개', 150],
    ['옥수수 0.5개', '옥수수', '0.5', '개', 65],
  ];
  expect.forEach(([q, name, amount, unit, cal]) => {
    const r = estimateFoodLines(q)[0];
    check(`필수 음식 매칭: ${q} → ${name} ${amount}${unit} ${cal}kcal`,
      !!r && r.name === name && r.amount === amount && r.unit === unit && r.cal === cal && r.sourceKind === 'local',
      JSON.stringify(r && { n: r.name, a: r.amount, u: r.unit, c: r.cal }));
  });
  check('오탐 방지: "오이무침"이 "오이"로 조용히 바뀌지 않는다',
    estimateFoodLines('오이무침 100g')[0].name === '오이무침');
  check('오탐 방지: 단위가 힌트일 때만 다른 음식으로 넘어간다("밥 한공기" → 공기밥 300kcal)',
    (() => { const r = estimateFoodLines('밥 한공기')[0]; return r.name === '공기밥' && r.cal === 300; })(),
    JSON.stringify(estimateFoodLines('밥 한공기')[0]));
  check('오탐 방지: 이름이 정확히 일치하면 단위가 달라도 그 음식을 유지한다("계란 100g" → 계란, 섭취량 확인 요청)',
    (() => { const r = estimateFoodLines('계란 100g')[0]; return r.name === '계란' && r.needsCheck === true; })(),
    JSON.stringify(estimateFoodLines('계란 100g')[0]));
  check('음식 DB는 이름이 중복되지 않는다', new Set(FOOD_DB.map(f => f.name)).size === FOOD_DB.length);
  check('음식 DB의 모든 항목이 계산 가능한 기준량(per > 0)을 가진다',
    FOOD_DB.every(f => Number(f.per) > 0 && Number.isFinite(Number(f.cal))));

  // ══ J. 직접 입력 숫자칸 UX — 초기값 0이 안 지워지던 문제 ════════
  // 모바일에서 0인 칸을 터치하면 커서 위치에 따라 "0350" / "3500"이 되던 문제를 막는다.
  const numsOf = c => [...c.querySelectorAll('.diet-num input')];
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '엄마표 닭볶음탕'); });
  await act(async () => { cta(el).click(); });
  check('직접 입력 음식: kcal·탄·단·지 4칸이 모두 0으로 시작한다',
    numsOf(el).length === 4 && numsOf(el).every(i => i.value === '0'), JSON.stringify(numsOf(el).map(i => i.value)));

  // A·B — 4칸 모두 같은 규칙: 터치하면 비워지고, 입력한 숫자만 정확히 남는다.
  const typed = [['kcal', 0, '350', 350], ['탄수화물', 1, '10', 10], ['단백질', 2, '20', 20], ['지방', 3, '15', 15]];
  for (const [label, idx, keys, want] of typed) {
    await act(async () => { focusInput(numsOf(el)[idx]); });
    check(`${label} 칸: 값이 0일 때 터치하면 입력칸이 비워진다(기존 0을 지울 필요가 없다)`,
      numsOf(el)[idx].value === '', JSON.stringify(numsOf(el).map(i => i.value)));
    await act(async () => { setInput(numsOf(el)[idx], keys); });
    check(`${label} 칸: ${keys}을 입력하면 0${keys}/${keys}0이 아니라 정확히 ${keys}만 남는다`,
      numsOf(el)[idx].value === keys, numsOf(el)[idx].value);
    await act(async () => { blurInput(numsOf(el)[idx]); });
    check(`${label} 칸: 포커스가 빠져도 입력한 값(${want})이 그대로 보인다`,
      numsOf(el)[idx].value === String(want), numsOf(el)[idx].value);
  }

  // C — 이미 값이 있는 칸을 다시 터치해도 값이 사라지지 않는다.
  await act(async () => { focusInput(numsOf(el)[0]); });
  check('이미 350이 입력된 kcal 칸을 다시 터치해도 350이 지워지지 않는다',
    numsOf(el)[0].value === '350', numsOf(el)[0].value);
  await act(async () => { blurInput(numsOf(el)[0]); });
  check('다시 터치했다가 아무것도 입력하지 않고 빠져나와도 350이 유지된다',
    numsOf(el)[0].value === '350', numsOf(el)[0].value);
  await act(async () => { cta(el).click(); });
  check('입력한 4개 값이 그대로 저장된다(kcal 350 / 탄 10 / 단 20 / 지 15)',
    saved.length === 1 && Number(saved[0].items[0].cal) === 350 && Number(saved[0].items[0].carb) === 10 &&
    Number(saved[0].items[0].protein) === 20 && Number(saved[0].items[0].fat) === 15,
    JSON.stringify(saved[0] && saved[0].items));

  // D — 숫자 0 자체도 정상 저장된다("입력 안 함"과 구분하려고 0을 막지 않는다).
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '블랙커피'); });
  await act(async () => { cta(el).click(); });
  await act(async () => { focusInput(numsOf(el)[0]); });
  await act(async () => { setInput(numsOf(el)[0], '0'); });
  await act(async () => { blurInput(numsOf(el)[0]); });
  check('회원이 직접 0을 입력하면 화면에 0이 남는다', numsOf(el)[0].value === '0', numsOf(el)[0].value);
  await act(async () => { cta(el).click(); });
  check('0 kcal도 그대로 저장된다(0 입력이 막히지 않는다)',
    saved.length === 1 && saved[0].items[0].name === '블랙커피' && Number(saved[0].items[0].cal) === 0,
    JSON.stringify(saved[0] && saved[0].items));

  // ══ K. 직접 입력 음식명 보존 / 부분 일치 자동 확정 금지 ══════════
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '고구마줄기 무침 100g'); });
  await act(async () => { cta(el).click(); });
  check('"고구마줄기 무침"을 입력하면 음식명이 "고구마"로 바뀌지 않고 그대로 남는다',
    valuesOf(el, '.diet-item-name')[0] === '고구마줄기 무침', JSON.stringify(valuesOf(el, '.diet-item-name')));
  check('"고구마줄기 무침"에 고구마 칼로리(86kcal)가 아니라 자기 DB 항목(100g 60kcal)이 적용된다',
    numsOf(el).slice(0, 4).map(i => i.value).join('|') === '60|8|2|2',
    JSON.stringify(numsOf(el).map(i => i.value)));
  await act(async () => { cta(el).click(); });
  check('입력한 음식명이 저장 데이터에도 "고구마줄기 무침" 그대로 들어간다',
    saved.length === 1 && saved[0].items[0].name === '고구마줄기 무침' &&
    Number(saved[0].items[0].cal) === 60 && saved[0].items[0].sourceKind === 'local',
    JSON.stringify(saved[0] && saved[0].items));

  // 저장 후 재조회 — 원문 이름·중량·영양값이 그대로 복원된다.
  const reopened = { logs: [], dates: { [TODAY]: { meals: { '아침': saved[0].items } } } };
  el = await openSheet(reopened, [], '아침');
  check('저장 후 다시 열어도 "고구마줄기 무침" 이름과 값이 그대로 복원된다',
    valuesOf(el, '.diet-item-name')[0] === '고구마줄기 무침' && valuesOf(el, '.diet-item-amount')[0] === '100' &&
    valuesOf(el, '.diet-item-unit')[0] === 'g' && numsOf(el)[0].value === '60',
    JSON.stringify({ n: valuesOf(el, '.diet-item-name'), a: valuesOf(el, '.diet-item-amount'), v: numsOf(el).map(i => i.value) }));
  el = await render(React.createElement(MemberDietSection, { key: 'k1', p: makeProps(reopened, []) }));
  check('식단 카드 요약에도 "고구마줄기 무침"이 그대로 표시된다',
    el.textContent.includes('고구마줄기 무침') , el.textContent.slice(0, 600));

  // 부분 일치 후보를 회원이 직접 눌렀을 때만 DB 음식으로 바뀐다(요구 5).
  saved = [];
  el = await openSheet({ logs: [], dates: {} }, saved);
  await act(async () => { setInput(el.querySelector('textarea'), '고구 200g'); });
  await act(async () => { cta(el).click(); });
  const sweet = [...el.querySelectorAll('.diet-cands button')].find(b => b.textContent === '고구마');
  check('부분 일치 결과는 "비슷한 음식" 후보 버튼으로만 노출된다("고구" → 고구마)',
    !!sweet && valuesOf(el, '.diet-item-name')[0] === '고구' && el.textContent.includes('비슷한 음식'),
    el.textContent.slice(0, 700));
  // F — 편집 중 draft가 남아 후보 선택 결과를 가리지 않는지(외부 값 변경 반영)
  await act(async () => { focusInput(numsOf(el)[0]); });
  await act(async () => { setInput(numsOf(el)[0], '999'); });
  await act(async () => { sweet.click(); });
  check('후보를 누르면 DB 음식명·영양정보가 정상 적용된다(고구마 200g = 172kcal)',
    valuesOf(el, '.diet-item-name')[0] === '고구마' && numsOf(el)[0].value === '172',
    JSON.stringify({ n: valuesOf(el, '.diet-item-name'), v: numsOf(el).map(i => i.value) }));
  check('편집 중이던 숫자(999)가 후보 선택 후에도 남아 있지 않는다',
    numsOf(el)[0].value !== '999', numsOf(el)[0].value);
  await act(async () => { cta(el).click(); });
  check('회원이 고른 DB 음식은 DB 이름·sourceKind=local로 저장된다',
    saved.length === 1 && saved[0].items[0].name === '고구마' && saved[0].items[0].sourceKind === 'local' &&
    Number(saved[0].items[0].cal) === 172, JSON.stringify(saved[0] && saved[0].items));

  check('오탐 방지: "고구마줄기 무침"은 계산 단계에서도 고구마로 확정되지 않는다',
    (() => { const r = estimateFoodLines('고구마줄기 무침')[0]; return r.name === '고구마줄기 무침' && r.cal === 60; })(),
    JSON.stringify(estimateFoodLines('고구마줄기 무침')[0]));
  // 고구마줄기 무침 — 100g 기준값 하나만 DB에 두고 나머지는 기존 중량 비례 계산으로만 만든다.
  check('음식 DB에 "고구마줄기 무침"이 100g 기준 1건만 등록되어 있다(중량별 중복 항목 없음)',
    FOOD_DB.filter(f => f.name.includes('고구마줄기')).length === 1 &&
    (() => { const f = FOOD_DB.find(x => x.name === '고구마줄기 무침');
      return f && f.unit === 'g' && f.per === 100 && f.cal === 60 && f.carb === 8.0 && f.protein === 2.0 && f.fat === 2.0; })(),
    JSON.stringify(FOOD_DB.filter(f => f.name.includes('고구마줄기'))));
  [[30, 18, 2.4, 0.6, 0.6], [50, 30, 4, 1, 1], [70, 42, 5.6, 1.4, 1.4],
   [100, 60, 8, 2, 2], [150, 90, 12, 3, 3], [200, 120, 16, 4, 4]].forEach(([g, cal, carb, protein, fat]) => {
    const r = estimateFoodLines(`고구마줄기 무침 ${g}g`)[0];
    check(`고구마줄기 무침 중량별 계산: ${g}g → ${cal}kcal / 탄 ${carb} / 단 ${protein} / 지 ${fat}`,
      !!r && r.name === '고구마줄기 무침' && r.amount === String(g) && r.unit === 'g' &&
      r.cal === cal && r.carb === carb && r.protein === protein && r.fat === fat && r.sourceKind === 'local',
      JSON.stringify(r && { n: r.name, a: r.amount, c: r.cal, cb: r.carb, p: r.protein, f: r.fat }));
  });
  check('고구마줄기 무침: 공백 차이("고구마 줄기 무침")도 같은 항목으로 정확 일치한다',
    estimateFoodLines('고구마 줄기 무침 100g')[0].name === '고구마줄기 무침',
    JSON.stringify(estimateFoodLines('고구마 줄기 무침 100g')[0]));
  check('고구마줄기 무침 추가 후에도 "고구마" 검색은 기존 고구마 항목이 1순위다',
    (() => { const r = estimateFoodLines('고구마 100g')[0]; return r.name === '고구마' && r.cal === 86; })(),
    JSON.stringify(estimateFoodLines('고구마 100g')[0]));
  check('오탐 방지: 부분 일치만 있으면 이름을 바꾸지 않는다("닭가 100g" → 닭가슴살 자동 확정 금지)',
    (() => { const r = estimateFoodLines('닭가 100g')[0];
      return r.name === '닭가' && r.cal === 0 && (r.candidates || []).some(c => c.name === '닭가슴살'); })(),
    JSON.stringify(estimateFoodLines('닭가 100g')[0]));
  check('정확 일치는 기존처럼 자동 매칭된다("고구마 200g" → 고구마 172kcal)',
    (() => { const r = estimateFoodLines('고구마 200g')[0];
      return r.name === '고구마' && r.cal === 172 && r.carb === 40 && r.protein === 3.2 && r.fat === 0.2 && r.sourceKind === 'local'; })(),
    JSON.stringify(estimateFoodLines('고구마 200g')[0]));

  // ══ L. 항정살 검색 ═══════════════════════════════════════════════
  check('음식 DB에 "항정살"이 등록되어 있다', FOOD_DB.some(f => f.name === '항정살'));
  check('"항정살" 검색 시 결과가 나온다',
    dom.window.__searchFoodItems('항정살').some(f => f.name === '항정살'),
    JSON.stringify(dom.window.__searchFoodItems('항정살').map(f => f.name)));
  [['항정살 100g', 280, 18, 23], ['항정살 150g', 420, 27, 34.5],
   ['돼지 항정살 100g', 280, 18, 23], ['구운 항정살 200g', 560, 36, 46]].forEach(([q, cal, protein, fat]) => {
    const r = estimateFoodLines(q)[0];
    check(`항정살 검색: ${q} → 항정살 ${cal}kcal (단 ${protein}g / 지 ${fat}g)`,
      !!r && r.name === '항정살' && r.cal === cal && r.protein === protein && r.fat === fat && r.sourceKind === 'local',
      JSON.stringify(r && { n: r.name, c: r.cal, p: r.protein, f: r.fat }));
  });
  check('항정살을 넣어도 검색이 지나치게 넓어지지 않는다(엉뚱한 음식이 항정살로 확정되지 않는다)',
    estimateFoodLines('항정살덮밥')[0].name === '항정살덮밥' && estimateFoodLines('항정살덮밥')[0].cal === 0,
    JSON.stringify(estimateFoodLines('항정살덮밥')[0]));

  const failed = results.filter(([, ok]) => !ok);
  results.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} 회원앱 식단 기록: ${n}`));
  if (failed.length) { console.error(`\n${failed.length} check(s) failed.`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
