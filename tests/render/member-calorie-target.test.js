// 회원앱 "하루 권장 칼로리" 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-calorie-target.test.js)
//
// App.jsx 원본을 그대로 슬라이스해 실행한다 — 계산식을 테스트용으로 복제하지 않는다.
// 확인 범위:
//   1) 오늘 먹은 양이 오늘의 하루 권장(분모)을 바꾸지 않는다(순환 참조 재발 방지)
//   2) learned 값이 공식값을 무조건 덮어쓰지 않고 ±15% 안에서만 보정한다
//   3) 감량 보정(-500)은 실제 감량 목표가 있을 때만, 하한선(max(1200, BMR×0.85)) 아래로 내려가지 않는다
//   4) 화면에서 변하는 값은 오늘 섭취·남은 칼로리·진행률뿐이다
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

function slice(start, end, tag) {
  const si = APP.indexOf(start), ei = APP.indexOf(end);
  if (si < 0 || ei < 0 || ei < si) { console.error(`[${tag}] slice 경계 실패`, si, ei); process.exit(1); }
  if (APP.indexOf(start, si + 1) !== -1) { console.error(`[${tag}] 시작 마커가 2회 이상 등장`); process.exit(1); }
  return APP.slice(si, ei);
}

// 칼로리 계산 원본(순수 함수) — jsdom 없이 그대로 실행한다.
const sliceCalorie = [
  slice('const ACTIVITY_MULT = {', 'function calcBMR(', 'ACTIVITY_MULT'),
  slice('const STEP_RANGE_OPTIONS=', 'function KpiTile(', 'estimateMaintenance'),
  slice('function toPositiveNumber(value) {', '// 시작 체중 단일 기준', 'toPositiveNumber'),
  slice('function getKoreaDateString(', 'function getKoreaYesterdayDateString(', 'getKoreaDateString'),
  slice('function getTargetWeight(', 'function parseTargetWeeks(', 'getTargetWeight'),
].join('\n');

const lib = {};
new Function('lib', sliceCalorie + `
lib.estimateMaintenance = estimateMaintenance;
lib.getGoalCalorieRecommendation = getGoalCalorieRecommendation;
lib.initialBmrCalories = initialBmrCalories;
lib.initialMaintenanceCalories = initialMaintenanceCalories;
lib.getTargetWeight = getTargetWeight;
`)(lib);

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 400)); };

const d = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const TODAY = d(0);
const pastDays = (n, kcal) => { const o = {}; for (let i = 1; i <= n; i++) o[d(i)] = { totalKcal: kcal }; return o; };

// 신고된 실제 회원 — 남성 / 만 43세(1983-06) / 184cm / 81kg / 목표 81kg / 운동목표 다이어트
const PROFILE = { gender: '남성', birthYearMonth: '1983-06' };
const onboardingOf = extra => ({ gender: '남성', birthYearMonth: '1983-06', heightCm: 184, currentWeightKg: 81, goal: '다이어트', ...extra });
const FLAT_BODY = { records: [{ date: d(10), weight: 81 }, { date: d(3), weight: 81 }] };
const target = (onboarding, body, nutrition, goal) => {
  const a = lib.estimateMaintenance(PROFILE, onboarding, body, nutrition, [], []);
  return { value: lib.getGoalCalorieRecommendation(a, goal || onboarding.goal).value, a };
};

(async () => {
  // ══ A. 오늘 먹은 양이 하루 권장을 바꾸지 않는다 ═════════════════
  // 신고 당시 재현 조건: 어제까지 3일치 기록 + 오늘 기록. 예전에는 오늘 값이 평균에 섞여
  // 315kcal일 때 권장 1,226 / 1,149kcal일 때 권장 1,435로 하루 중에 분모가 움직였다.
  const nutritionWith = todayKcal => ({ logs: [], dates: {
    [d(9)]: { totalKcal: 2250 }, [d(6)]: { totalKcal: 2180 }, [d(2)]: { totalKcal: 2159 },
    [TODAY]: { meals: { '점심': [{ cal: todayKcal }] } },
  } });
  const ob81 = onboardingOf({ targetWeightKg: 81 });
  const low = target(ob81, FLAT_BODY, nutritionWith(315));
  const high = target(ob81, FLAT_BODY, nutritionWith(1149));
  check('오늘 섭취 315kcal과 1,149kcal의 하루 권장이 동일하다(먹는 양이 목표를 바꾸지 않는다)',
    low.value === high.value, JSON.stringify({ low: low.value, high: high.value }));
  check('신고된 하루 중 변동값(1,226 / 1,435)이 더 이상 나오지 않는다',
    ![1226, 1435].includes(low.value) && ![1226, 1435].includes(high.value),
    JSON.stringify({ low: low.value, high: high.value }));
  check('오늘 기록만 있는 회원도 하루 권장이 공식 기반값으로 고정된다',
    target(ob81, FLAT_BODY, { logs: [], dates: { [TODAY]: { totalKcal: 300 } } }).value ===
    target(ob81, FLAT_BODY, { logs: [], dates: {} }).value);
  // 오늘 식단을 추가/삭제해도 분모는 그대로 — 바뀌는 값은 섭취·남은 칼로리·진행률뿐이다.
  const steps = [0, 315, 700, 1149, 1800].map(k => target(ob81, FLAT_BODY, nutritionWith(k)).value);
  check('오늘 식단을 추가하거나 삭제해도 하루 권장이 계속 같은 값이다',
    new Set(steps).size === 1, JSON.stringify(steps));
  // 평균 섭취량 표시(avg7/avg30)는 오늘을 계속 포함해야 한다 — 목표 산출과 표시는 용도가 다르다.
  check('최근 7일 평균 표시값에는 오늘 기록이 계속 반영된다(표시용 평균은 그대로)',
    low.a.avg7 !== high.a.avg7, JSON.stringify({ low: low.a.avg7, high: high.a.avg7 }));

  // ══ B. 목표 체중 = 현재 체중이면 감량 적자를 만들지 않는다 ══════
  const noneNut = { logs: [], dates: {} };
  const bmr = lib.initialBmrCalories(PROFILE, ob81, FLAT_BODY);
  const formula = lib.initialMaintenanceCalories(PROFILE, ob81, FLAT_BODY, []);
  check('공식 계산: BMR 1,750(Mifflin-St Jeor) / 공식 기반 유지칼로리 2,170',
    bmr === 1750 && formula === 2170, JSON.stringify({ bmr, formula }));
  check('목표 81kg = 현재 81kg이면 운동목표가 "다이어트"여도 -500을 적용하지 않는다',
    target(ob81, FLAT_BODY, noneNut).value === formula,
    JSON.stringify({ v: target(ob81, FLAT_BODY, noneNut).value, formula }));
  check('차이가 0.5kg 미만이면(80.7kg) 감량 목표로 보지 않는다',
    target(onboardingOf({ targetWeightKg: 80.7 }), FLAT_BODY, noneNut).value === formula);
  check('목표 75kg < 현재 81kg이면 기존 감량 보정(-500)이 그대로 적용된다',
    target(onboardingOf({ targetWeightKg: 75 }), FLAT_BODY, noneNut).value === formula - 500,
    JSON.stringify(target(onboardingOf({ targetWeightKg: 75 }), FLAT_BODY, noneNut).value));
  check('차이가 정확히 0.5kg이면(80.5kg) 감량 목표로 본다(경계값)',
    target(onboardingOf({ targetWeightKg: 80.5 }), FLAT_BODY, noneNut).value === formula - 500);
  check('목표 체중 미입력 회원은 기존 동작(-500)을 그대로 유지한다(레거시 호환)',
    target(onboardingOf({}), FLAT_BODY, noneNut).value === formula - 500);

  // ══ C. learned는 공식값을 덮어쓰지 않고 ±15% 안에서만 보정한다 ══
  const ob75 = onboardingOf({ targetWeightKg: 75 });
  const learnedBody = { records: [{ date: d(13), weight: 81 }, { date: d(1), weight: 81 }] };
  check('learned 표본이 부족하면(3일) 공식 계산값을 그대로 쓴다',
    target(ob75, learnedBody, { logs: [], dates: pastDays(3, 1400) }).a.maintenance === formula);
  const lowLearned = target(ob75, learnedBody, { logs: [], dates: pastDays(13, 1400) });
  check('실제 평균이 훨씬 낮아도 유지칼로리가 공식값의 85% 아래로 내려가지 않는다',
    lowLearned.a.maintenance === Math.round(formula * 0.85),
    JSON.stringify({ maintenance: lowLearned.a.maintenance, floor: Math.round(formula * 0.85) }));
  const highLearned = target(ob75, learnedBody, { logs: [], dates: pastDays(13, 3600) });
  check('실제 평균이 훨씬 높아도 유지칼로리가 공식값의 115%를 넘지 않는다',
    highLearned.a.maintenance === Math.round(formula * 1.15),
    JSON.stringify({ maintenance: highLearned.a.maintenance, cap: Math.round(formula * 1.15) }));
  const mildLearned = target(ob75, learnedBody, { logs: [], dates: pastDays(13, 2050) });
  check('공식값과 크게 다르지 않은 실제 평균은 보정값으로 그대로 반영된다(learned 기능 유지)',
    mildLearned.a.learned === true && mildLearned.a.maintenance > formula * 0.85 && mildLearned.a.maintenance < formula,
    JSON.stringify({ learned: mildLearned.a.learned, maintenance: mildLearned.a.maintenance }));

  // ══ D. 하한선 ═══════════════════════════════════════════════════
  check('하한선은 max(1200, BMR×0.85)로 계산된다',
    lowLearned.a.calorieFloor === Math.max(1200, Math.round(bmr * 0.85)),
    JSON.stringify({ floor: lowLearned.a.calorieFloor, bmr }));
  check('감량 회원의 권장이 하한선 아래로 내려가지 않는다',
    lowLearned.value >= lowLearned.a.calorieFloor && lowLearned.value === 1488,
    JSON.stringify({ value: lowLearned.value, floor: lowLearned.a.calorieFloor }));
  // 기존 1200 하한에 걸리던 소체격 회원은 값이 바뀌지 않아야 한다(불필요한 회귀 방지).
  const FEMALE = { gender: '여성', birthYearMonth: '1994-03' };
  const fOb = extra => ({ gender: '여성', birthYearMonth: '1994-03', heightCm: 160, currentWeightKg: 55, goal: '다이어트', ...extra });
  const fBody = { records: [{ date: d(10), weight: 55 }, { date: d(3), weight: 55 }] };
  const fLow = lib.getGoalCalorieRecommendation(
    lib.estimateMaintenance(FEMALE, fOb({ targetWeightKg: 50 }), fBody, { logs: [], dates: pastDays(13, 1000) }, [], []), '다이어트').value;
  check('여성 소체격 감량 회원은 기존 1,200 하한이 그대로 유지된다',
    fLow === 1200, JSON.stringify(fLow));

  // ══ E. 목표 타입별 회귀 ═════════════════════════════════════════
  const legacyOb = onboardingOf({});
  [['다이어트', formula - 500], ['체중 감량', formula - 500], ['근육 증가/벌크', formula + 300],
   ['체형 교정/건강', formula], ['유지어터', formula]].forEach(([goal, want]) => {
    check(`목표 타입 회귀: "${goal}" → ${want}kcal`,
      target(legacyOb, FLAT_BODY, noneNut, goal).value === want,
      JSON.stringify(target(legacyOb, FLAT_BODY, noneNut, goal).value));
  });
  // ══ E-2. 증량 보정도 감량과 같은 원칙(목표=현재면 보정 없음) ═════
  // 감량의 hasDeficitGoal(현재-목표>=0.5)과 부호만 반대인 판단식을 그대로 재사용한다.
  [
    ['현재 81 / 목표 81 / 증량 → +300 미적용', 81, formula],
    ['현재 81 / 목표 81.3 / 증량 → +300 미적용(0.3kg 차이)', 81.3, formula],
    ['현재 81 / 목표 81.49 / 증량 → +300 미적용(0.49kg 차이, 경계 직전)', 81.49, formula],
    ['현재 81 / 목표 81.5 / 증량 → +300 정상 적용(경계값, 감량 기준과 동일하게 >=0.5는 목표 있음으로 처리)', 81.5, formula + 300],
    ['현재 81 / 목표 83 / 증량 → +300 정상 적용(실제 증량 목표)', 83, formula + 300],
  ].forEach(([label, tw, want]) => {
    const v = target(onboardingOf({ targetWeightKg: tw }), FLAT_BODY, noneNut, '근육 증가/벌크').value;
    check(label, v === want, JSON.stringify({ targetWeightKg: tw, value: v, want }));
  });
  check('목표 체중 미입력 증량 회원은 기존 레거시 +300 동작을 유지한다',
    target(onboardingOf({}), FLAT_BODY, noneNut, '근육 증가/벌크').value === formula + 300);
  // "체중 증가" 같은 다른 증량 계열 문구도 같은 목표 판정 로직(analysis.bulk)을 그대로 쓴다.
  check('증량 계열 다른 문구("체중 증가")도 같은 목표=현재 판단이 적용된다',
    target(onboardingOf({ targetWeightKg: 81 }), FLAT_BODY, noneNut, '체중 증가').value === formula);
  // 감량 로직에는 영향이 없어야 한다 — 같은 회원, 감량 목표는 이번 수정 전과 동일하게 동작.
  check('증량 보정 수정이 감량 로직(목표 75, 다이어트)에 영향을 주지 않는다',
    target(onboardingOf({ targetWeightKg: 75 }), FLAT_BODY, noneNut, '다이어트').value === formula - 500);
  check('증량 보정 수정이 감량 로직(목표=현재, 다이어트)에 영향을 주지 않는다',
    target(ob81, FLAT_BODY, noneNut, '다이어트').value === formula);

  // ══ F. 화면(식단 상단) — 변하는 값은 섭취·남은 칼로리·진행률뿐 ══
  const sliceNum = slice('function toPositiveNumber', 'function getBodyWeightRecords', 'ui-num');
  const sliceKcal = slice('function getKcalLogs', 'function getRecentKcalLogsByDays', 'ui-kcal');
  const sliceFood = slice('const FOOD_DB = [', 'function getSupplFeedback', 'ui-food');
  const sliceUi = slice('// 회원앱 식단 기록\n// ═'.replace('\n', '\r\n'), 'function MemberHealth(p){', 'ui-section');
  const out = babel.transformSync(`${sliceNum}\n${sliceKcal}\n${sliceFood}\n${sliceUi}
window.__MemberDietSection = MemberDietSection;`, {
    presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
    babelrc: false, configFile: false, filename: 'calorie.jsx',
  }).code;

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const { act } = React;
  const stubs = {
    React, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
    getKoreaDateString: () => TODAY,
    getKoreaYesterdayDateString: () => d(1),
    // 스텁이 아니라 방금 검증한 원본 계산 함수를 그대로 넣는다.
    estimateMaintenance: lib.estimateMaintenance,
    getGoalCalorieRecommendation: lib.getGoalCalorieRecommendation,
    SjIcon: () => null, HM_PATHS: { clipboard: [] },
    MemberBottomSheet: ({ open, children }) => (open ? React.createElement('div', null, children) : null),
  };
  const names = Object.keys(stubs);
  new dom.window.Function(...names, out)(...names.map(n => stubs[n]));
  const MemberDietSection = dom.window.__MemberDietSection;
  const reactRoot = ReactDOM.createRoot(document.getElementById('root'));
  const renderWith = async todayKcal => {
    const p = {
      profile: { id: 'm1', ...PROFILE }, onboarding: ob81, body: FLAT_BODY,
      nutrition: nutritionWith(todayKcal), checkins: [], sessions: [],
      dietSaving: false, saveDietMeal: async () => {},
    };
    await act(async () => { reactRoot.render(React.createElement(MemberDietSection, { key: 'k' + todayKcal, p })); });
    const el = document.getElementById('root');
    const head = el.querySelector('.diet-total-head');
    return {
      text: head.textContent,
      remain: (el.querySelector('.diet-remain') || {}).textContent || '',
      pct: (el.querySelector('.diet-bar i') || {}).style?.width,
    };
  };
  const v315 = await renderWith(315);
  const v1149 = await renderWith(1149);
  const goal = target(ob81, FLAT_BODY, nutritionWith(315)).value;
  const fmt = n => Math.round(n).toLocaleString();
  check(`식단 상단 분모(하루 권장)가 두 경우 모두 ${fmt(goal)}kcal로 같다`,
    v315.text.includes(`/ ${fmt(goal)} kcal`) && v1149.text.includes(`/ ${fmt(goal)} kcal`),
    JSON.stringify({ a: v315.text, b: v1149.text }));
  check('오늘 섭취값만 바뀐다(315 → 1,149)',
    v315.text.includes('315') && v1149.text.includes(fmt(1149)), JSON.stringify({ a: v315.text, b: v1149.text }));
  check('남은 칼로리 = max(하루 권장 - 오늘 섭취, 0)',
    v315.remain.includes(fmt(goal - 315)) && v1149.remain.includes(fmt(goal - 1149)),
    JSON.stringify({ a: v315.remain, b: v1149.remain }));
  check('식단을 더 담으면 남은 칼로리만 줄어든다',
    goal - 1149 < goal - 315 && v315.remain !== v1149.remain, JSON.stringify({ a: v315.remain, b: v1149.remain }));
  check('진행률 = 오늘 섭취 ÷ 하루 권장 × 100',
    v315.pct === Math.min(100, Math.round(315 / goal * 100)) + '%' &&
    v1149.pct === Math.min(100, Math.round(1149 / goal * 100)) + '%',
    JSON.stringify({ a: v315.pct, b: v1149.pct, goal }));
  check('섭취가 권장을 넘어도 남은 칼로리는 0 아래로 내려가지 않는다',
    (await renderWith(3000)).remain.includes('0 kcal'), JSON.stringify(await renderWith(3000)));

  const failed = results.filter(([, ok]) => !ok);
  results.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} 회원앱 하루 권장 칼로리: ${n}`));
  if (failed.length) { console.error(`\n${failed.length} check(s) failed.`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
