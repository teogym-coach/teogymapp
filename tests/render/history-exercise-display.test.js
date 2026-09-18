// 관리자앱 히스토리 카드 · 관리자 수업 상세(수업 리포트) 렌더 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/history-exercise-display.test.js)
//
// App.jsx 원본의 헬퍼·컴포넌트를 그대로 슬라이스해 jsdom에서 실제로 렌더한다(값을 옮겨 적지 않음).
// 확인 범위:
//   CASE A  기능운동 category(가동성)·movementPurpose가 있어도 히스토리에는 실제 운동명(name) 표시
//   CASE B  기능 4 + 근력 4 → 8개 실제 운동명 전부 표시, 기능/근력 구분
//   CASE C  운동 12개 → 생략·"외 N개"·"+N" 없이 전부 표시
//   CASE D  name 없는 레거시 기록 → 깨지지 않고 가장 구체적인 fallback 표시(빈 카드는 제외)
//   CASE E  name이 있으면 fallback(목적 문구)보다 항상 name 우선
//   CASE F  중량 미기록 운동 → "0kg"/"최고 0kg" 미표시(관리자 상세)
//   CASE G  정상 중량운동 → 최고 중량·세트·횟수 정상 표시, 어시스트 0kg은 숨기지 않음
//   CASE I  관리자 상세 → 기본 화면이 밝은 톤(다크 배경 미사용), 수업 강도·회원 상태는 더 이상 표시되지 않음
//   CASE J  기능+근력이 하나의 exercises 배열에 저장된 실제 순서 그대로 1~N 순서 번호가 이어져서 표시된다
//   CASE K  "공유 카드"/"공유 이미지 저장" 관련 UI와 캡처 대상(#report-card-capture)이 더 이상 존재하지 않는다(기능 완전 제거 확인)
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
  require, // 슬라이스된 코드가 참조할 수 있는 babel 런타임 헬퍼 등을 위한 실제 require
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

// CASE J — 기능+근력이 하나의 exercises 배열에 저장된 실제 순서 그대로 번호가 이어진다(가나다순·부위별 재정렬 없음)
const splitOrder = L.splitHistoryExercises([...funcEx, ...strengthEx]);
check('CASE J: splitHistoryExercises가 원래 배열 인덱스 그대로 기능=1~4, 근력=5~8 번호를 부여한다',
  splitOrder.func.map(e => e._histOrder).join(',') === '1,2,3,4' && splitOrder.strength.map(e => e._histOrder).join(',') === '5,6,7,8');
check('CASE J: 히스토리 카드에 각 운동명 앞에 실제 수행 순서 번호가 붙어서 표시된다(1전경골근…, 4버드독, 5오버헤드 스쿼트, 8레그 익스텐션)',
  t.includes('1전경골근') && t.includes('4버드독') && t.includes('5오버헤드 스쿼트') && t.includes('8레그 익스텐션'), t);

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

// 관리자 상세 (CASE F/G/I/J) — intensity/condition은 과거 저장값 호환을 위해 필드 자체는 여전히 보존하지만
// (2026-09-18 이후 입력 UI 자체가 없어 항상 기존 기본값인 상태) 화면에는 더 이상 표시하지 않는다.
const session = { id: 's1', date: '2026-09-10', sessionNo: 1, selectedTypes: ['하체'], intensity: '중강도', condition: '상', isPublished: true, status: 'completed',
  exercises: [...funcEx, ...strengthEx], totalVolume: 1220, trainerComment: '총평', nextPlan: '다음엔 박스 스쿼트 65kg' };
t = render(React.createElement(L.SessionAdminDetail, { s: session, member: { name: '홍길동' }, sessions: [session], bodyData: null }));
const detailHtml = rootEl.innerHTML;
check('CASE I: 관리자 상세에 8개 실제 운동명과 기능/근력 구분이 모두 표시된다', eight.every(n => t.includes(n)) && t.includes('기능 · 워밍업') && t.includes('근력운동'), t);
check('CASE I: 관리자 상세는 밝은 톤(흰 카드·#F6F7F9 계열)이며 다크 배경(#0F172A/#111827)을 쓰지 않는다',
  /background:\s*(#FFFFFF|rgb\(255, 255, 255\))/i.test(detailHtml) && !/background:\s*(#0F172A|#111827|rgb\(15, 23, 42\)|rgb\(17, 24, 39\))/i.test(detailHtml));
check('CASE I: 상단 요약에 날짜·회차·부위·체중이 표시된다',
  t.includes('9월') && t.includes('10') && t.includes('회차') && t.includes('하체') && t.includes('72.3kg'), t.slice(0, 300));
check('CASE I: 저장된 데이터에 intensity/condition 값이 있어도 "수업 강도"·"회원 상태" 타일과 값("중강도"/이모지)은 더 이상 표시되지 않는다',
  !t.includes('수업 강도') && !t.includes('회원 상태') && !t.includes('중강도') && !t.includes('😀'), t.slice(0, 400));
check('CASE G: 관리자 상세에 정상 중량운동의 세트별 중량·횟수가 표시된다(박스 스쿼트 60kg × 8회, 최고 60kg)',
  t.includes('60kg') && t.includes('8회') && t.includes('40kg') && t.includes('35kg') && t.includes('15회'));
check('CASE F: 관리자 상세에 "0kg"·"최고 0kg"이 어디에도 표시되지 않는다', !/(^|[^0-9.,])0kg/.test(t), t.match(/.{20}0kg/g));
check('CASE I: 총 볼륨은 유지하되 하단 지표 영역에 표시된다(운동 목록 뒤)', t.includes('총 운동 볼륨') && t.indexOf('총 운동 볼륨') > t.indexOf('레그 익스텐션'));
check('CASE I: 다음 수업 포인트·총평 등 트레이너 기록이 유지된다', t.includes('다음엔 박스 스쿼트 65kg') && t.includes('총평'));
check('CASE J: 관리자 상세에도 운동명 앞에 실제 수행 순서 번호가 이어져서 표시된다(1전경골근…, 8레그 익스텐션)',
  t.includes('1전경골근') && t.includes('8레그 익스텐션'), t);

// 리포트 모달 — 공유 카드/공유 이미지 저장 기능은 완전히 제거됐다(CASE K)
const modal = (props = {}) => React.createElement(L.SessionReportModal, Object.assign({ s: session, member: { name: '홍길동' }, sessions: [session], bodyData: null,
  onClose() {}, onEdit() {}, onPublish() {}, onUnpublish() {}, onSendPair() {} }, props));
t = render(modal());
check('CASE I: 리포트 보기는 관리자 상세(밝은 톤) 하나만 렌더된다(별도 보기 전환 없음)',
  !!rootEl.querySelector('.session-admin-detail'));
const btnByText = (txt) => [...rootEl.querySelectorAll('button')].find(b => b.textContent.includes(txt));
check('CASE K: "공유 카드"/"관리자 보기" 보기 전환 버튼이 더 이상 존재하지 않는다', !btnByText('공유 카드') && !btnByText('관리자 보기'));
check('CASE K: "공유 이미지 저장" 버튼이 더 이상 존재하지 않는다', !btnByText('공유 이미지 저장'));
check('CASE K: 공유 카드 캡처 대상(#report-card-capture)이 DOM에 존재하지 않는다', !document.getElementById('report-card-capture'));
check('CASE K: "공개 취소"(전송 완료 상태)·"수정" 등 실제 운영 버튼은 그대로 유지된다(공개된 세션 기준)', !!btnByText('공개 취소') && !!btnByText('수정'));

let failed = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
console.log(failed ? `\n${failed} 건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
