// 관리자 건강관리 허브 "대시보드 / 식단 분석" 렌더 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/health-hub-dashboard.test.js)
//
// App.jsx 원본 컴포넌트를 그대로 렌더한다 — 화면 문구를 테스트용으로 복제하지 않는다.
// 확인 범위:
//   1) 목표일 전 / 목표일 경과+달성 / 목표일 경과+미달성 3가지가 화면에서 실제로 다르게 보이는지
//      (예전엔 목표일이 지나도 "0일 남음"으로만 보였다)
//   2) 권장 섭취 칼로리가 메인, BMR/TDEE가 보조로 배치되는지
//   3) 식단 기록이 없는 회원에게 가짜 그래프/평균 대신 "식단 기록 없음"이 나오는지
//   4) 회원앱 식단 기록(meals)이 관리자 식단 분석에 자동 반영되는지
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

const sliceNum = slice(APP, 'function toPositiveNumber', 'function getBodyWeightRecords', 'toPositiveNumber');
const sliceRec = slice(APP, 'function getBodyWeightRecords', '// 표시용 포맷 — 부동소수점 오차가', 'getBodyWeightRecords');
const sliceGoal = slice(APP, 'function getAnalysisPersona', 'function average(arr=[])', 'goalState');
const sliceKcal = slice(APP, 'function getKcalLogs', 'function estimateMaintenance', 'getKcalLogs');
const sliceUi = slice(APP, '// 건강관리 대시보드 — 수업 전 30초', '// cardioLogs를 prop으로 받으면', 'dashboard');

const out = babel.transformSync(`
${sliceNum}
${sliceRec}
${sliceGoal}
${sliceKcal}
${sliceUi}
window.__Dashboard = HealthDashboardTab;
window.__Diet = AdminDietAnalysisSection;
`, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'hub.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;
const h = React.createElement;

// 목표일 판정은 KST 기준이라 테스트 날짜도 같은 기준으로 만든다.
const kst = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = kst(new Date());
const shift = n => kst(new Date(Date.parse(TODAY + 'T00:00:00Z') + n * 86400000));

// 칼로리 공식(estimateMaintenance)과 차트 라이브러리는 다른 회귀 검사가 담당한다 —
// 여기서는 "화면이 그 값을 어떤 우선순위로 보여주는가"만 본다. 집계(getKcalLogs 계열)는 원본을 그대로 쓴다.
const stubs = {
  React,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
  Card: ({ title, children }) => h('section', null, title ? h('h3', null, title) : null, children),
  Mo: ({ children }) => h('span', null, children),
  Btn: ({ children, onClick }) => h('button', { onClick }, children),
  ResponsiveContainer: ({ children }) => h('div', { className: 'chart' }, children),
  LineChart: ({ children }) => h('div', null, children),
  CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Line: () => null,
  CalorieTrendChart: ({ rows }) => h('div', { className: 'kcal-chart' }, `그래프 ${rows.length}일`),
  NutritionScreen: () => h('div', null, '상세 식단 화면'),
  estimateMaintenance: () => ({ bmr: 1600, maintenance: 2400, diet: 1900, maintain: 2400, bulk: 2700, basis: '공식 기반 초기값', confidence: 55 }),
  getGoalCalorieRecommendation: (a) => ({ label: '감량 권장 칼로리', shortLabel: '감량 목표 기준', value: a.diet }),
  formatKcal: v => (v == null ? '-' : `${Math.round(v).toLocaleString()} kcal`),
  formatSignedKcal: v => (v == null ? '-' : `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()} kcal`),
  summarizeCardioWeek: logs => ({ count: logs.length, totalMinutes: logs.reduce((a, b) => a + (b.durationMinutes || 0), 0), totalCalories: 0, logs }),
  getCardioTypes: r => r.activityTypes || [],
  getPainRecords: cs => cs.filter(c => c.painPart).map(c => ({ date: c.date, part: c.painPart, side: c.painSide, vas: c.painVas, memo: c.painMemo })),
  formatSorenessBodyParts: fb => (fb.sorenessBodyParts || []).join('/'),
  getKoreaDateString: () => TODAY,
  dateStrDaysAgo: n => shift(-n),
};
const names = Object.keys(stubs);
new dom.window.Function(...names, out)(...names.map(n => stubs[n]));

const Dashboard = dom.window.__Dashboard;
const Diet = dom.window.__Diet;

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', String(extra).slice(0, 700)); };

const reactRoot = ReactDOM.createRoot(document.getElementById('root'));
let seq = 0;
async function render(Comp, props) {
  seq += 1;
  await act(async () => { reactRoot.render(h(Comp, Object.assign({ key: 'r' + seq }, props))); });
  return document.getElementById('root').textContent;
}

const member = { id: 'm1', name: '홍길동', goal: '다이어트' };
const baseBody = (targetDate, records) => ({
  goal: { goal: '다이어트', currentWeight: 86.1, targetWeight: 81, targetDate },
  records,
});
const emptyNut = { logs: [], dates: {} };

(async () => {
  // ── 목표일 전 ────────────────────────────────────────────────
  let t = await render(Dashboard, {
    member, sessions: [],
    bodyData: baseBody(shift(22), [{ date: shift(-99), weight: 86.1 }, { date: TODAY, weight: 83 }]),
    nutritionData: emptyNut, memberCheckins: [], cardioLogs: [],
  });
  check('목표일 전: 남은 일수를 표시한다', t.includes('22일 남음') && t.includes('D-22'), t.slice(0, 500));
  check('목표일 전: 첫 측정 대비 변화를 보여준다(시작 대비 아님)', t.includes('첫 측정 대비'), t.slice(0, 500));

  // ── 목표일 경과 + 목표 달성 (대표가 보고한 실제 케이스: 86.1 → 81, 목표 81) ──
  t = await render(Dashboard, {
    member, sessions: [],
    bodyData: baseBody(shift(-48), [{ date: shift(-160), weight: 86.1 }, { date: TODAY, weight: 81 }]),
    nutritionData: emptyNut, memberCheckins: [], cardioLogs: [],
  });
  check('목표일 경과 + 달성: "목표 달성 · 목표 체중 유지 중"으로 표시된다',
    t.includes('목표 달성') && t.includes('목표 체중 유지 중') && t.includes('목표일 48일 경과'), t.slice(0, 700));
  check('목표일 경과 + 달성: "0일 남음"으로 뭉개지지 않는다', !t.includes('일 남음'), t.slice(0, 700));
  check('목표일 경과 + 달성: 새 목표 설정 경고를 띄우지 않는다', !t.includes('새 목표 설정'), t.slice(0, 700));

  // ── 목표일 경과 + 미달성 ─────────────────────────────────────
  t = await render(Dashboard, {
    member, sessions: [],
    bodyData: baseBody(shift(-48), [{ date: shift(-160), weight: 86.1 }, { date: TODAY, weight: 84.5 }]),
    nutritionData: emptyNut, memberCheckins: [], cardioLogs: [],
  });
  check('목표일 경과 + 미달성: "목표 기간 종료 · 새 목표 설정 필요"로 표시된다',
    t.includes('목표 기간 종료') && t.includes('새 목표 설정 필요'), t.slice(0, 700));
  check('목표일 경과 + 미달성: 목표 재설정 안내를 함께 보여준다',
    t.includes('목표 기간이 끝났지만 목표 체중에 도달하지 못했습니다.'), t.slice(0, 900));

  // ── 권장 섭취 메인 / BMR·TDEE 보조 + 최근 유산소·통증·메모 ────
  t = await render(Dashboard, {
    member, sessions: [{ id: 's1', date: shift(-3), memberFeedback: { sorenessLevel: '보통', sorenessBodyParts: ['허벅지 앞'] } }],
    bodyData: baseBody(shift(22), [{ date: shift(-99), weight: 86.1 }, { date: TODAY, weight: 83 }]),
    nutritionData: { logs: [{ date: TODAY, kcal: 2100 }, { date: shift(-1), kcal: 1900 }], dates: {} },
    memberCheckins: [{ date: shift(-2), painPart: '무릎', painSide: '왼쪽', painVas: 4, painMemo: '계단에서 통증' }],
    cardioLogs: [{ date: shift(-2), activityTypes: ['걷기'], durationMinutes: 40 }],
  });
  check('권장 섭취 칼로리가 메인 카드로 표시된다', t.includes('권장 섭취 칼로리 · 감량 목표 기준') && t.includes('1,900 kcal'), t.slice(0, 1400));
  check('BMR/TDEE는 보조 정보로 함께 표시된다', t.includes('기초대사량 BMR') && t.includes('유지 칼로리 TDEE'), t.slice(0, 1400));
  check('최근 7일 실제 평균 섭취와 권장 대비 상태를 함께 보여준다',
    t.includes('최근 7일 평균 섭취') && t.includes('2,000 kcal') && t.includes('권장 대비'), t.slice(0, 1600));
  check('최근 유산소 기록이 표시된다', t.includes('최근 유산소') && t.includes('걷기') && t.includes('40분'), t.slice(0, 1800));
  check('최근 통증·근육통이 함께 표시된다',
    t.includes('무릎') && t.includes('VAS 4') && t.includes('근육통 · 보통 · 허벅지 앞'), t.slice(0, 2000));
  check('회원이 남긴 메모가 표시된다', t.includes('회원이 남긴 메모') && t.includes('계단에서 통증'), t.slice(0, 2200));

  // ── 식단 분석: 기록 없는 회원 ────────────────────────────────
  t = await render(Diet, {
    member, bodyData: baseBody(shift(22), []), nutritionData: emptyNut, sessions: [],
    onSaveNutrition: () => {}, showToast: () => {}, onBack: () => {}, targetCal: 1900,
  });
  check('식단 분석: 기록이 없으면 "식단 기록 없음"만 보여주고 그래프를 만들지 않는다',
    t.includes('식단 기록 없음') && !t.includes('그래프 '), t.slice(0, 800));
  check('식단 분석: 기록이 없어도 권장 섭취 칼로리는 안내한다', t.includes('권장 섭취 칼로리 1,900 kcal'), t.slice(0, 800));

  // ── 식단 분석: 회원앱 식단 기록(meals)이 자동 반영 ───────────
  t = await render(Diet, {
    member, bodyData: baseBody(shift(22), []), sessions: [],
    nutritionData: { logs: [], dates: {
      [TODAY]: { meals: { '아침': [{ cal: 300, protein: 20 }], '점심': [{ cal: 700, protein: 35 }], '저녁': [{ cal: 600, protein: 40 }], '간식': [{ cal: 220, protein: 5 }] } },
      [shift(-1)]: { totalKcal: 1900, dietProtein: 95 },
      [shift(-2)]: { meals: { '점심': [{ cal: 1500, protein: 80 }] } },
    } },
    onSaveNutrition: () => {}, showToast: () => {}, onBack: () => {}, targetCal: 1900,
  });
  check('식단 분석: 회원앱 식단 기록(meals)이 오늘 섭취 kcal로 자동 반영된다', t.includes('1,820 kcal'), t.slice(0, 1000));
  check('식단 분석: 최근 7일·30일 평균과 기록 일수를 함께 보여준다',
    t.includes('최근 7일 평균') && t.includes('최근 30일 평균') && t.includes('총 기록 일수') && t.includes('3일'), t.slice(0, 1600));
  check('식단 분석: 날짜별 칼로리 그래프를 기록 일수만큼 그린다', t.includes('그래프 3일'), t.slice(0, 1600));
  check('식단 분석: 단백질 기록이 충분하면 최근 평균 단백질을 보조 표시한다',
    t.includes('최근 30일 평균 단백질'), t.slice(0, 1800));
  check('식단 분석: 음식·영양제·즐겨찾기 상세 화면 진입점을 유지한다',
    t.includes('상세 식단 기록 (음식 · 영양제 · 즐겨찾기)'), t.slice(0, 1800));

  const failed = results.filter(([, ok]) => !ok);
  results.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} 건강관리 허브: ${n}`));
  if (failed.length) { console.error(`\n${failed.length} check(s) failed.`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
