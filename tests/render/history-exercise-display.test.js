// 관리자앱 히스토리 카드 · 관리자 수업 상세 · 회원 공유 리포트 카드 렌더 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/history-exercise-display.test.js)
//
// App.jsx 원본의 헬퍼·컴포넌트를 그대로 슬라이스해 jsdom에서 실제로 렌더한다(값을 옮겨 적지 않음).
// 확인 범위:
//   CASE A  기능운동 category(가동성)·movementPurpose가 있어도 히스토리에는 실제 운동명(name) 표시
//   CASE B  기능 4 + 근력 4 → 8개 실제 운동명 전부 표시, 기능/근력 구분
//   CASE C  운동 12개 → 생략·"외 N개"·"+N" 없이 전부 표시
//   CASE D  name 없는 레거시 기록 → 깨지지 않고 가장 구체적인 fallback 표시(빈 카드는 제외)
//   CASE E  name이 있으면 fallback(목적 문구)보다 항상 name 우선
//   CASE F  중량 미기록 운동 → "0kg"/"최고 0kg" 미표시(관리자 상세·공유 카드 모두)
//   CASE G  정상 중량운동 → 최고 중량·세트·횟수 정상 표시, 어시스트 0kg은 숨기지 않음
//   CASE H  회원 공유 카드 → 다크 디자인(#0F172A)·캡처 대상 id 유지, 이미지 저장은 공유 카드를 캡처
//   CASE I  관리자 상세 → 기본 화면이 밝은 톤(다크 배경 미사용)
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.jsx'), 'utf8');
function slice(start, end) {
  const si = APP.indexOf(start), ei = APP.indexOf(end, si);
  if (si < 0 || ei < 0) { console.error('slice 경계 실패', start, si, ei); process.exit(1); }
  if (APP.indexOf(start, si + 1) !== -1) { console.error('시작 마커가 2회 이상 등장', start); process.exit(1); }
  return APP.slice(si, ei);
}
const src = [
  slice('const DUAL_WEIGHT_EXERCISE_NAME', '// ─── 운동 분류 상수 ───'),
  slice('const EQUIP_LIST', 'function mSubs('),
  slice('const IC = {', '// ── 수업 유형 선택 항목'),
  slice('function normalizeTypes(raw) {', 'function calculateKoreanAgeFromBirthYear('),
  slice('const FUNC_CATEGORIES = [', 'const FUNC_BODY_PARTS = ['),
  slice('// 기능 운동을 카테고리별로 그룹핑', '// ── Pointer Event 기반 드래그 정렬 훅'),
  slice('const ASSIST_MACHINE_KEYWORDS', '// ─── CSS ───'),
  slice('const HIST_DARK_TEXT = {', '// 수업일지 "회원 확인" 공통 헬퍼'),
  slice('// 회원 공개 배지 — 히스토리 카드에서 항상 노출', 'function PairSessionListScreen('),
  slice('// 오늘 수업 기준 긍정 변화 감지', 'function SessionReportModal('),
  slice('function SessionReportModal(', 'const CATEGORY_ORDER = {'),
].join('\n');

const wrapper = `${src}
window.__lib = { HistExerciseTags, SessionAdminDetail, SessionReportModal, getHistoryExerciseName, isUnweightedRecord, getHistoryExerciseSummary, splitHistoryExercises };
`;
const out = babel.transformSync(wrapper, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'harness.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

const DB = { bg:'#F6F7F9', card:'#FFFFFF', border:'#EDEFF2', text:'#0F172A', sub:'#64748B', faint:'#94A3B8',
  mint:'#39C7B8', mintSoft:'#0F9488', mintTint:'rgba(57,199,184,.10)', shadow:'none', radius:24, radiusSm:18, font:'sans-serif' };
const stubs = {
  React, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef,
  DB,
  Btn: ({ children, onClick }) => React.createElement('button', { onClick }, children),
  Mo: ({ children, style }) => React.createElement('span', { style }, children),
  isOwner: () => false,
  getLatestBodyWeight: () => ({ date: '2026-09-08', weight: 72.3 }),
  formatMonthDayKo: (d) => `${Number(String(d).slice(5, 7))}월 ${Number(String(d).slice(8, 10))}일`,
  formatSorenessBodyParts: () => '-',
  stimRatingLabel: () => '',
  nextPlanLabel: () => '',
  // babel 런타임 헬퍼는 실제 require, html2canvas는 jsdom에서 캔버스를 그릴 수 없으므로 로드 실패로 흉내(handleSaveImage의 catch로 흡수)
  require: (m) => { if (m === 'html2canvas') throw new Error('html2canvas stub'); return require(m); },
};
const names = Object.keys(stubs);
try {
  new dom.window.Function(...names, out)(...names.map(n => stubs[n]));
} catch (e) { console.error('로드 실패:', e.message); process.exit(1); }
const L = dom.window.__lib;

const rootEl = document.getElementById('root');
const root = ReactDOM.createRoot(rootEl);
function render(el) { act(() => { root.render(el); }); return rootEl.textContent; }

const results = [];
const check = (name, ok, extra) => { results.push([name, !!ok]); if (!ok && extra) console.log('   ↳', extra); };
const set = (weight, reps, extra = {}) => ({ weight, reps, volume: 0, recordType: 'weightReps', ...extra });
const fset = (durationSec, reps = '') => ({ weight: '', reps, durationSec, volume: 0, recordType: 'function' });

// ── 예시 수업(운동명은 테스트 데이터일 뿐 — 컴포넌트는 입력 데이터를 그대로 사용) ──
const funcEx = [
  { name: '전경골근·후경골근 근막이완', equipment: '기능', funcCategory: '조직이완', funcBodyPart: ['종아리'], funcTool: '폼롤러', movementPurpose: '종아리 릴리즈', sets: [fset('60')] },
  { name: '장요근 스트레칭', equipment: '기능', funcCategory: '가동성', funcBodyPart: ['장요근'], movementPurpose: '가동성', sets: [fset('30'), fset('30')] },
  { name: '한발 서기', equipment: '기능', funcCategory: '밸런스', movementPurpose: '밸런스', sets: [fset('20')] },
  { name: '버드독', equipment: '기능', funcCategory: '코어', funcBodyPart: ['요추'], movementPurpose: '요추 코어', sets: [fset('', '10')] },
];
const strengthEx = [
  { name: '오버헤드 스쿼트', equipment: '바벨', muscleTop: '하체', muscleSub: '전체', unitType: 'kg', sets: [set('', '10'), set('', '10')] },
  { name: '박스 스쿼트', equipment: '바벨', muscleTop: '하체', muscleSub: '전체', unitType: 'kg', sets: [set('40', '10'), set('60', '8'), set('60', '8')] },
  { name: '아웃싸이 머신', equipment: '머신', muscleTop: '하체', muscleSub: '둔근', unitType: 'kg', sets: [set('35', '15'), set('35', '15')] },
  { name: '레그 익스텐션', equipment: '머신', muscleTop: '하체', muscleSub: '전체', unitType: 'kg', sets: [set('25', '12')] },
];

// CASE A
let t = render(React.createElement(L.HistExerciseTags, { exercises: funcEx.slice(0, 2) }));
check('CASE A: 기능운동 category=가동성·movementPurpose="가동성"이어도 히스토리에는 실제 운동명 "장요근 스트레칭"이 표시된다',
  t.includes('장요근 스트레칭') && t.includes('전경골근·후경골근 근막이완') && !t.includes('종아리 릴리즈'), t);
check('CASE A: 카테고리("가동성")는 실제 운동명을 대체하지 않고 보조 정보로만 붙는다',
  L.getHistoryExerciseName(funcEx[1]).name === '장요근 스트레칭' && t.includes('가동성'), t);

// CASE B
t = render(React.createElement(L.HistExerciseTags, { exercises: [...funcEx, ...strengthEx] }));
const eight = [...funcEx, ...strengthEx].map(e => e.name);
check('CASE B: 기능 4 + 근력 4 → 8개 실제 운동명이 전부 표시된다', eight.every(n => t.includes(n)), t);
check('CASE B: 기능 · 워밍업 / 근력운동 구분 헤더가 표시된다', t.includes('기능 · 워밍업') && t.includes('근력운동'));
check('CASE B: 카테고리 목적 문구("요추 코어")가 운동명 대신 나오지 않는다', !t.includes('요추 코어'), t);

// CASE C
const many = Array.from({ length: 12 }, (_, i) => ({ name: `테스트 운동 ${String(i + 1).padStart(2, '0')}`, equipment: i % 2 ? '덤벨' : '기능', funcCategory: i % 2 ? '' : '가동성', muscleTop: '하체', unitType: 'kg', sets: [set(i % 2 ? '10' : '', '10')] }));
t = render(React.createElement(L.HistExerciseTags, { exercises: many }));
check('CASE C: 운동 12개가 하나도 생략되지 않고 전부 표시된다', many.every(e => t.includes(e.name)), t);
check('CASE C: "외 N개" / "+N" / "더보기" 같은 생략 표기가 없다', !/외 \d+개|\+\d+(?!kg)|더보기|…|\.\.\./.test(t), t);
const html = rootEl.innerHTML;
check('CASE C: 운동명에 말줄임(ellipsis)·nowrap이 걸려 있지 않다', !/text-overflow:\s*ellipsis/.test(html) && !/white-space:\s*nowrap[^"]*"[^>]*>테스트 운동/.test(html));

// CASE D
const legacy = [
  { name: '', equipment: '기능', funcCategory: '가동성', funcBodyPart: ['고관절'], movementPurpose: '', sets: [fset('30')] },
  { name: '', equipment: '덤벨', muscleTop: '가슴', muscleSub: '윗가슴', unitType: 'kg', sets: [set('10', '12')] },
  { name: '', equipment: '바벨', muscleTop: '하체', muscleSub: '전체', sets: [set('', '')] }, // 빈 카드
  { name: '   ', sets: [] }, // 완전 공백
];
let crashed = false;
try { t = render(React.createElement(L.HistExerciseTags, { exercises: legacy })); } catch (e) { crashed = e; }
check('CASE D: 실제 운동명 없는 레거시 기록도 화면이 깨지지 않는다', !crashed, crashed && crashed.message);
check('CASE D: 기능운동 레거시는 목적/카테고리+부위 문구, 일반 운동은 세부부위·기구로 fallback 표시된다',
  t.includes('고관절 가동성 개선') && t.includes('윗가슴 · 덤벨') && t.includes('(운동명 미입력)'), t);
check('CASE D: 이름·세트·분류가 전부 빈 카드는 운동으로 세지 않는다',
  L.splitHistoryExercises(legacy).func.length === 1 && L.splitHistoryExercises(legacy).strength.length === 1);
check('CASE D: exercises 필드가 없거나 null이어도 깨지지 않는다', (() => { try { render(React.createElement(L.HistExerciseTags, { exercises: null })); return true; } catch (e) { return false; } })());

// CASE E
check('CASE E: name이 있으면 movementPurpose·카테고리 fallback보다 항상 name이 우선한다',
  L.getHistoryExerciseName({ name: '오픈북', equipment: '기능', funcCategory: '가동성', funcBodyPart: ['흉추'], movementPurpose: '흉추 가동성 개선' }).name === '오픈북'
  && L.getHistoryExerciseName({ name: ' 버드독 ', funcCategory: '코어', movementPurpose: '요추 코어', equipment: '기능' }).name === '버드독');

// CASE F / G (판정)
check('CASE F: 중량을 한 번도 입력하지 않은 운동(오버헤드 스쿼트)은 중량 미기록으로 판정된다', L.isUnweightedRecord(strengthEx[0]) === true);
check('CASE F: 맨몸 단위(unitType=bodyweight)는 중량 칸이 없는 기록으로 판정된다', L.isUnweightedRecord({ name: '푸쉬업', equipment: '맨몸', unitType: 'bodyweight', sets: [set('', '15')] }) === true);
check('CASE G: 중량이 한 세트라도 기록된 운동은 숨기지 않는다(일부 세트만 0/빈값이어도)', L.isUnweightedRecord({ name: '스쿼트', equipment: '바벨', sets: [set('0', '10'), set('60', '8')] }) === false);
check('CASE G: 어시스트 머신은 보조 중량 0이어도 의미가 있으므로 숨기지 않는다', L.isUnweightedRecord({ name: '어시스트 풀업', equipment: '머신', sets: [set('0', '8')] }) === false);
check('CASE F: 히스토리 요약에서 중량 미기록 운동은 "최고 0kg" 없이 세트·횟수만 표시한다', L.getHistoryExerciseSummary(strengthEx[0]) === '2세트 · 10회', L.getHistoryExerciseSummary(strengthEx[0]));
check('CASE G: 히스토리 요약에서 정상 중량운동은 세트·최고 중량·횟수 범위를 표시한다', L.getHistoryExerciseSummary(strengthEx[1]) === '3세트 · 최고 60kg · 8~10회', L.getHistoryExerciseSummary(strengthEx[1]));

// 관리자 상세 (CASE F/G/I)
const session = { id: 's1', date: '2026-09-10', sessionNo: 1, selectedTypes: ['하체'], intensity: '중강도', condition: '상', isPublished: true, status: 'completed',
  exercises: [...funcEx, ...strengthEx], totalVolume: 1220, trainerComment: '총평', nextPlan: '다음엔 박스 스쿼트 65kg' };
t = render(React.createElement(L.SessionAdminDetail, { s: session, member: { name: '홍길동' }, sessions: [session], bodyData: null }));
const detailHtml = rootEl.innerHTML;
check('CASE I: 관리자 상세에 8개 실제 운동명과 기능/근력 구분이 모두 표시된다', eight.every(n => t.includes(n)) && t.includes('기능 · 워밍업') && t.includes('근력운동'), t);
check('CASE I: 관리자 상세는 밝은 톤(흰 카드·#F6F7F9 계열)이며 다크 배경(#0F172A/#111827)을 쓰지 않는다',
  /background:\s*(#FFFFFF|rgb\(255, 255, 255\))/i.test(detailHtml) && !/background:\s*(#0F172A|#111827|rgb\(15, 23, 42\)|rgb\(17, 24, 39\))/i.test(detailHtml));
check('CASE I: 상단 요약에 날짜·회차·부위·체중·강도·회원 상태가 표시된다',
  t.includes('9월') && t.includes('10') && t.includes('회차') && t.includes('하체') && t.includes('72.3kg') && t.includes('중강도') && t.includes('상'), t.slice(0, 300));
check('CASE G: 관리자 상세에 정상 중량운동의 세트별 중량·횟수가 표시된다(박스 스쿼트 60kg × 8회, 최고 60kg)',
  t.includes('60kg') && t.includes('8회') && t.includes('40kg') && t.includes('35kg') && t.includes('15회'));
check('CASE F: 관리자 상세에 "0kg"·"최고 0kg"이 어디에도 표시되지 않는다', !/(^|[^0-9.,])0kg/.test(t), t.match(/.{20}0kg/g));
check('CASE I: 총 볼륨은 유지하되 하단 지표 영역에 표시된다(운동 목록 뒤)', t.includes('총 운동 볼륨') && t.indexOf('총 운동 볼륨') > t.indexOf('레그 익스텐션'));
check('CASE I: 다음 수업 포인트·총평 등 트레이너 기록이 유지된다', t.includes('다음엔 박스 스쿼트 65kg') && t.includes('총평'));

// 리포트 모달: 기본 관리자 보기 ↔ 공유 카드 (CASE H)
let saveTarget = null;
const origGet = document.getElementById.bind(document);
document.getElementById = (id) => { const el = origGet(id); if (id === 'report-card-capture') saveTarget = el; return el; };
const origErr = console.error; console.error = () => {}; // html2canvas 동적 import는 jsdom에서 실패 → handleSaveImage의 catch로 흡수(캡처 대상 확인이 목적)
const modal = (props = {}) => React.createElement(function Wrap() {
  const [cardMode, setCardMode] = React.useState('simple');
  return React.createElement(L.SessionReportModal, Object.assign({ s: session, member: { name: '홍길동' }, sessions: [session], bodyData: null, cardMode, setCardMode,
    onClose() {}, onEdit() {}, onPublish() {}, onUnpublish() {}, onSendPair() {} }, props));
});
t = render(modal());
check('CASE I: 리포트 보기의 기본 화면은 관리자 상세(밝은 톤)이고 다크 공유 카드는 렌더되지 않는다',
  !!rootEl.querySelector('.session-admin-detail') && !origGet('report-card-capture'));
const btnByText = (txt) => [...rootEl.querySelectorAll('button')].find(b => b.textContent.includes(txt));
act(() => { btnByText('공유 카드').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const cap = origGet('report-card-capture');
check('CASE H: "공유 카드"로 전환하면 기존 다크 리포트 카드(#report-card-capture, #0F172A 배경)가 그대로 렌더된다',
  !!cap && /background:\s*(#0F172A|rgb\(15, 23, 42\))/i.test(cap.innerHTML) && cap.textContent.includes('TEO GYM · PERSONAL TRAINING') && cap.textContent.includes("TODAY'S WORKOUT"));
check('CASE H: 공유 카드의 간단/상세 전환이 유지된다', !!btnByText('간단') && !!btnByText('상세'));
check('CASE H: 공유 카드의 기록 데이터(운동명·세트 중량/횟수·총 볼륨)가 유지된다',
  !!cap && cap.textContent.includes('박스 스쿼트') && cap.textContent.includes('최고 60kg') && cap.textContent.includes('1,220'));
check('CASE F: 공유 카드에서도 중량 미기록 운동(오버헤드 스쿼트)의 "0kg / 최고 0kg"이 사라지고 총 횟수로 표시된다',
  !!cap && !cap.textContent.includes('최고 0kg') && cap.textContent.includes('총 20회'));
// 관리자 보기로 돌아가 저장 버튼 → 공유 카드로 전환 후 그 카드를 캡처
act(() => { btnByText('관리자 보기').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
saveTarget = null;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  // act 안의 상태 변경·effect는 act가 끝날 때 반영되므로, 전환 effect가 건 저장 타이머(60ms)는 act 밖에서 기다린다
  await act(async () => { btnByText('공유 이미지 저장').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await wait(200); });
  check('CASE H: 관리자 보기에서 이미지 저장을 누르면 공유 카드로 전환한 뒤 #report-card-capture(다크 카드)를 캡처 대상으로 사용한다',
    !!saveTarget && saveTarget.id === 'report-card-capture' && !!origGet('report-card-capture'));
  console.error = origErr;

  let failed = 0;
  for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
  console.log(failed ? `\n${failed} 건 실패` : '\n전부 통과');
  process.exit(failed ? 1 : 0);
})();
