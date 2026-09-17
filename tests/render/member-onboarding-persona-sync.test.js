// 회원앱 사전 문진 — 신규 2문항(등록 결정 이유 · PT 시작 계기) 입력·저장 동작 회귀 테스트
// 실행: npm run regression (또는 NODE_ENV=development node tests/render/member-onboarding-persona-sync.test.js)
//
// App.jsx 원본의 MemberOnboarding 컴포넌트를 그대로 슬라이스해 jsdom 위에서 실제로 렌더하고,
// 사람이 하는 것과 똑같이 칩을 클릭한 뒤 "제출하기"까지 눌러 Firestore에 실제로 넘어가는 payload를 확인한다.
// 확인 범위:
//   · 신규 2문항이 단계를 늘리지 않고 기존 단계(상담 결정 / 운동 목표) 안에 들어간다
//   · 등록 결정 이유는 복수 선택이고 상한(3개)을 넘겨 선택되지 않는다
//   · 선택값이 v2.acquisition.joinReasons / v2.goals.ptCause로 저장된다(기존 필드는 그대로)
//   · 저장된 값이 페르소나 초안(buildOnboardingPersonaSeed)으로 정확히 변환된다
//   · 기존 문진 항목(유입 경로·상담 접점·목표)의 저장 형태가 바뀌지 않는다
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');

function slice(start, end) {
  const si = APP.indexOf(start);
  if (si < 0) { console.error('[member-onboarding] slice 시작 마커 없음:', start); process.exit(1); }
  if (APP.indexOf(start, si + 1) !== -1) { console.error('[member-onboarding] 시작 마커가 2회 이상 등장:', start); process.exit(1); }
  const ei = APP.indexOf(end, si);
  if (ei < 0) { console.error('[member-onboarding] slice 끝 마커 없음:', end); process.exit(1); }
  return APP.slice(si, ei);
}

// ── 앱 원본 조각 ─────────────────────────────────────────────
// 문진 화면이 렌더하는 선택지·헬퍼는 전부 원본에서 그대로 가져온다(값을 테스트에 복사하면 실제와 어긋난다).
const src = [
  slice('const JOB_ACTIVITY_OPTIONS=', '// 공지센터 — 자주 묻는 질문(FAQ).'),
  slice('const STEP_RANGE_OPTIONS=', 'function parseWorkoutCount'),
  // App.jsx는 CRLF라 여러 줄을 \n으로 이어 붙인 마커는 절대 매칭되지 않는다 — 마커는 항상 한 줄로 쓴다.
  slice('const ONBOARDING_GOALS=', '// 유입(방문 계기) 데이터 정규화'),
  slice('const OB2_GOAL_TO_LEGACY = {', 'const ONBOARDING_STATUS_LABEL = {'),
  slice('const PERSONA_TRIGGER_OPTIONS = [', '// 홈 "수업일지 미전송" — 예약'),
  slice('function Ob2Chips({options, value, onPick, multi}) {', 'function Choices({vals,cur,onPick,multi})'),
].join('\n');

// ── 하네스 ───────────────────────────────────────────────────
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
let babel, React, ReactDOM, JSDOM;
try {
  babel = require('@babel/core');
  React = require('react');
  ReactDOM = require('react-dom/client');
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('[member-onboarding] 렌더 의존 모듈 로드 실패 — 건너뜁니다:', e.message);
  process.exit(0);
}
const { act } = React;

const out = babel.transformSync(`${src}\nwindow.__MemberOnboarding = MemberOnboarding;`, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'onboarding-harness.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;

// 외부 의존 스텁 — 실제 Firestore·인증 대신 호출 인자를 그대로 받아 적는다.
const saved = { onboarding: [], draft: [], profileSync: [], statusSync: [], bodyCheck: [] };
const env = {
  React,
  useState: React.useState, useEffect: React.useEffect, useRef: React.useRef, useMemo: React.useMemo,
  auth: { currentUser: { uid: 'uid-member-1' } },
  ONBOARDING_VERSION: 3,
  ONBOARDING_SAVE_TIMEOUT_MS: 12000,
  withOnboardingTimeout: (p) => p,
  saveMemberOnboarding: async (id, payload) => { saved.onboarding.push([id, payload]); return payload; },
  saveMemberOnboardingDraft: async (id, d, o) => { saved.draft.push([id, d, o]); },
  syncOnboardingToMemberProfile: async (id, p) => { saved.profileSync.push([id, p]); },
  syncOnboardingStatusToMember: async (id, p) => { saved.statusSync.push([id, p]); },
  saveBodyCheck: async (id, p) => { saved.bodyCheck.push([id, p]); },
  sanitizeDecimalInput: (v) => String(v || '').replace(/[^\d.]/g, ''),
  estimateBirthYearFromAge: () => 1995,
  getLatestBodyWeight: () => null,
  goalDeadlineFromPeriod: () => '2026-12-17',
  addMonthsDateString: () => '2026-12-17',
  scrollMemberAppToTop: () => {},
  LegalDocView: () => null,
  MEMBER_LEGAL_DOCS: {},
  // 스타일 문자열 — 렌더에는 필요하지만 이 테스트의 검증 대상이 아니다(레이아웃이 아닌 입력·저장을 본다).
  CSS: '', MEMBER_CSS: '', OB2_CSS: '',
};
// eslint-disable-next-line no-new-func
new dom.window.Function(...Object.keys(env), out)(...Object.values(env));
const MemberOnboarding = dom.window.__MemberOnboarding;

// buildOnboardingPersonaSeed는 같은 슬라이스 안에 있으므로 한 번 더 꺼내 쓴다(문진 → 페르소나 변환 검증용).
// eslint-disable-next-line no-new-func
const personaLib = new dom.window.Function(
  babel.transformSync(`${slice('const PERSONA_TRIGGER_OPTIONS = [', '// 홈 "수업일지 미전송" — 예약')}\nwindow.__seed = buildOnboardingPersonaSeed;`,
    { presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]], babelrc: false, configFile: false, filename: 'persona-harness.js' }).code
)() || dom.window.__seed;
const buildOnboardingPersonaSeed = dom.window.__seed;

// ── 렌더 유틸 ────────────────────────────────────────────────
// root는 한 번만 만든다 — 같은 컨테이너에 createRoot를 반복 호출하면 React가 경고를 내고 상태가 꼬인다.
let root, container;
let renderSeq = 0;
function render(props) {
  container = dom.window.document.getElementById('root');
  if (!root) root = ReactDOM.createRoot(container);
  // key를 바꿔 매 검사마다 컴포넌트를 완전히 새로 마운트한다(이전 검사의 입력이 남지 않도록).
  act(() => { root.render(React.createElement(MemberOnboarding, { key: `r${++renderSeq}`, ...props })); });
}
const buttons = () => [...container.querySelectorAll('button')];
function findButton(text) {
  return buttons().find(b => b.textContent.trim() === text) || null;
}
function click(text) {
  const b = findButton(text);
  assert.ok(b, `버튼을 찾지 못했습니다: "${text}" — 현재 화면: ${buttons().map(x => x.textContent.trim()).join(' | ')}`);
  act(() => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
}
function setInput(placeholder, value) {
  const el = [...container.querySelectorAll('input')].find(i => i.placeholder === placeholder);
  assert.ok(el, `입력칸을 찾지 못했습니다: ${placeholder}`);
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(el, value);
    // React는 controlled input마다 _valueTracker로 "직전 값"을 들고 있다가 같으면 onChange를 건너뛴다.
    // 네이티브 setter로 값을 바꾸면 tracker도 함께 갱신되어 변경이 없던 것으로 취급되므로 직접 되돌린다.
    if (el._valueTracker) el._valueTracker.setValue('');
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
const stepTitle = () => container.querySelector('.ob2-title')?.textContent.trim() || '';
const errorText = () => container.querySelector('.onerror')?.textContent.trim() || '';
// 단계 전진 — 검증에 걸려 제자리에 머물면 화면 문구를 그대로 실패 메시지로 올린다(원인을 추측하지 않는다).
function next(expectTitle) {
  const before = stepTitle();
  click('다음');
  if (expectTitle !== undefined) {
    assert.strictEqual(stepTitle(), expectTitle,
      `"${before}"에서 넘어가지 못했습니다. 화면 오류 문구: "${errorText() || '(없음)'}"`);
  }
}
const selectedChips = () => [...container.querySelectorAll('.ob2-chips button.sel')].map(b => b.textContent.trim());

// 같은 라벨이 여러 문항에 동시에 존재한다("가격"은 상담 결정 접점에도, 등록 결정 이유에도 있다).
// 문항 블록(.ob2-q)을 라벨로 먼저 찾고 그 안에서만 칩을 누른다 — 아니면 엉뚱한 문항의 답이 바뀐다.
function questionBlock(labelPart) {
  const q = [...container.querySelectorAll('.ob2-q')]
    .find(el => (el.querySelector('label')?.textContent || '').includes(labelPart));
  assert.ok(q, `문항을 찾지 못했습니다: "${labelPart}" — 현재 문항: ${[...container.querySelectorAll('.ob2-q label')].map(l => l.textContent.trim()).join(' | ')}`);
  return q;
}
function clickIn(labelPart, text) {
  const q = questionBlock(labelPart);
  const b = [...q.querySelectorAll('button')].find(x => x.textContent.trim() === text);
  assert.ok(b, `"${labelPart}" 문항에서 "${text}" 선택지를 찾지 못했습니다 — 있는 선택지: ${[...q.querySelectorAll('button')].map(x => x.textContent.trim()).join(' | ')}`);
  act(() => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
}
const selectedIn = (labelPart) => [...questionBlock(labelPart).querySelectorAll('button.sel')].map(b => b.textContent.trim());

// ── 검사 ─────────────────────────────────────────────────────
const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); }
  catch (e) { results.push([name, false, e.message]); }
}

const profile = { id: 'm1', memberUid: 'uid-member-1', gender: '', name: '테스트회원' };
// 키·체중은 existing(기존 문진 값)으로 채운다 — 이 테스트가 보려는 건 텍스트 입력이 아니라 신규 칩 문항이다.
const existing = { heightCm: '175', currentWeightKg: '72' };

// 0~2단계를 지나 "상담 결정" 화면까지 이동하는 공통 준비 동작.
function goToConsultStep() {
  render({ profile, body: null, existing, onDone: () => {} });
  clickIn('성별', '남성');
  next('처음 발견');
  clickIn('알게 된 곳', '네이버 검색');
  next('상담 결정');
}

async function run() {

await check('사전 문진 단계 수가 늘지 않았다(신규 2문항은 기존 단계 안에 들어간다)', () => {
  render({ profile, body: null, existing, onDone: () => {} });
  const titles = [];
  for (let i = 0; i < 30; i++) {
    const t = stepTitle();
    titles.push(t);
    if (t === '최종 확인') break;
    // 각 단계의 필수값만 채우며 전진한다(선택 항목은 건드리지 않는다).
    if (t === '기본 정보') clickIn('성별', '남성');
    else if (t === '처음 발견') clickIn('알게 된 곳', '네이버 검색');
    else if (t === '상담 결정') clickIn('결정한 이유는 무엇인가요', '네이버 플레이스 후기');
    else if (t === '운동 목표') { clickIn('어떤 목표로', '체지방 감량'); clickIn('우선순위가 높은 목표', '체지방 감량'); }
    else if (t === '통증 · 불편 부위') clickIn('통증이나 불편한 부위', '없음');
    next();
  }
  assert.strictEqual(titles.length, 13, '단계 수가 13이 아닙니다: ' + titles.length + ' (' + titles.join(' > ') + ')');
  assert.ok(!titles.some(t => t.includes('등록 이유')), '등록 이유가 별도 단계로 생겼습니다(단계 증가 금지)');
  assert.ok(!titles.some(t => t.includes('PT 계기')), 'PT 계기가 별도 단계로 생겼습니다(단계 증가 금지)');
});

await check('신규 문항이 기존 단계(상담 결정 / 운동 목표) 안에 표시된다', () => {
  goToConsultStep();
  assert.ok(container.textContent.includes('등록하기로 결정한 이유'), '상담 결정 단계에 등록 이유 문항이 없습니다');
  assert.ok(questionBlock('등록하기로 결정한 이유'), '등록 이유 문항 블록이 없습니다');
  clickIn('결정한 이유는 무엇인가요', '네이버 플레이스 후기');
  next('운동 목표');
  assert.ok(container.textContent.includes('PT를 받아보기로 한 계기'), '운동 목표 단계에 PT 계기 문항이 없습니다');
  assert.ok(questionBlock('PT를 받아보기로 한 계기'), 'PT 계기 문항 블록이 없습니다');
});

await check('등록 결정 이유는 복수 선택이고 상한(3개)을 넘겨 선택되지 않는다', () => {
  goToConsultStep();
  const Q = '등록하기로 결정한 이유';
  clickIn(Q, '후기'); clickIn(Q, '대표 직접 수업'); clickIn(Q, '가격');
  assert.deepStrictEqual(selectedIn(Q).sort(), ['가격', '대표 직접 수업', '후기'], '복수 선택이 되지 않았습니다: ' + selectedIn(Q));
  clickIn(Q, '주차'); // 4개째 — 무시되어야 한다
  assert.ok(!selectedIn(Q).includes('주차'), '상한(3개)을 넘겨 선택됐습니다: ' + selectedIn(Q));
  clickIn(Q, '가격'); // 해제
  assert.ok(!selectedIn(Q).includes('가격'), '선택 해제가 되지 않았습니다');
  clickIn(Q, '주차'); // 자리가 났으니 이제 선택 가능
  assert.ok(selectedIn(Q).includes('주차'), '해제 후 다시 선택되지 않았습니다');
});

await check('등록 결정 이유는 상담 신청 접점과 다른 문항이다(같은 라벨을 눌러도 서로 영향을 주지 않는다)', () => {
  goToConsultStep();
  clickIn('결정한 이유는 무엇인가요', '가격');       // 상담 신청 접점 = 가격
  clickIn('등록하기로 결정한 이유', '후기');          // 등록 결정 이유 = 후기
  assert.deepStrictEqual(selectedIn('결정한 이유는 무엇인가요'), ['가격'], '상담 접점 선택이 바뀌었습니다');
  assert.deepStrictEqual(selectedIn('등록하기로 결정한 이유'), ['후기'], '등록 이유 선택이 바뀌었습니다');
});

await check('제출하면 신규 값이 v2.acquisition.joinReasons / v2.goals.ptCause로 저장되고 기존 필드는 그대로다', async () => {
  saved.onboarding.length = 0;
  goToConsultStep();
  clickIn('결정한 이유는 무엇인가요', '네이버 플레이스 후기');
  clickIn('등록하기로 결정한 이유', '후기');
  clickIn('등록하기로 결정한 이유', '대표 직접 수업');
  next('운동 목표');
  clickIn('어떤 목표로', '체지방 감량');
  clickIn('우선순위가 높은 목표', '체지방 감량');
  clickIn('PT를 받아보기로 한 계기', '혼자 운동하다 실패');
  next();
  for (let i = 0; i < 12; i++) {
    if (stepTitle() === '최종 확인') break;
    if (stepTitle() === '통증 · 불편 부위') clickIn('통증이나 불편한 부위', '없음');
    next();
  }
  assert.strictEqual(stepTitle(), '최종 확인', '최종 확인 단계에 도달하지 못했습니다(현재: ' + stepTitle() + ')');

  // 최종 확인 화면 요약에도 신규 항목이 보여야 한다(회원이 제출 전에 검토하는 자리)
  assert.ok(container.textContent.includes('등록 이유'), '최종 확인 요약에 등록 이유가 없습니다');
  assert.ok(container.textContent.includes('PT 계기'), '최종 확인 요약에 PT 계기가 없습니다');

  [...container.querySelectorAll('.agree-row input[type=checkbox]')].forEach(b => act(() => { b.click(); }));
  const submit = findButton('제출하기');
  assert.ok(submit, '제출 버튼을 찾지 못했습니다 — 현재 버튼: ' + buttons().map(b => b.textContent.trim()).join(' | '));
  await act(async () => { submit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });

  assert.strictEqual(saved.onboarding.length, 1, 'saveMemberOnboarding이 정확히 1회 호출되지 않았습니다');
  const payload = saved.onboarding[0][1];
  const v2 = payload.v2;
  assert.deepStrictEqual(v2.acquisition.joinReasons, ['review', 'owner_class'], '등록 이유 저장값이 다릅니다: ' + JSON.stringify(v2.acquisition.joinReasons));
  assert.strictEqual(v2.goals.ptCause, 'solo_fail', 'PT 계기 저장값이 다릅니다: ' + v2.goals.ptCause);
  // 기존 필드 — 이번 변경으로 저장 형태가 달라지면 안 된다
  assert.strictEqual(v2.acquisition.firstTouch, 'naver_search', '유입 경로 저장값이 달라졌습니다');
  assert.strictEqual(v2.acquisition.decisionTouch, 'naver_place_review', '상담 접점 저장값이 달라졌습니다');
  assert.deepStrictEqual(v2.goals.list, ['체지방 감량'], '운동 목표 저장값이 달라졌습니다');
  assert.strictEqual(v2.goals.primary, '체지방 감량');
  assert.strictEqual(payload.completed, true);
  // "기타"를 고르지 않았으므로 자유입력은 빈 값으로 정리돼야 한다(ob2Finalize)
  assert.strictEqual(v2.acquisition.joinReasonOther, '', '기타 입력이 남아 있습니다: ' + v2.acquisition.joinReasonOther);
});

await check('저장된 문진 값이 페르소나 초안으로 정확히 변환된다(문진 → 페르소나 자동 동기화)', () => {
  assert.ok(saved.onboarding[0], '앞 검사에서 저장된 payload가 없습니다');
  const payload = saved.onboarding[0][1];
  const seed = buildOnboardingPersonaSeed({ v2: payload.v2, onboardingUpdatedAt: payload.v2.updatedAt });
  assert.strictEqual(seed.ptTrigger.category, 'solo_fail', 'PT 계기가 주 이유로 들어가지 않았습니다');
  assert.strictEqual(seed.ptTrigger.secondaryCategory, 'weight_gain', '운동 목표가 보조 이유로 변환되지 않았습니다');
  assert.strictEqual(seed.selectionReason.category, 'review');
  assert.strictEqual(seed.selectionReason.secondaryCategory, 'owner_class');
  assert.strictEqual(seed.selectionReason.source, 'onboarding');
});

// ── 결과 출력 ────────────────────────────────────────────────
let failed = 0;
results.forEach(([name, ok, msg]) => {
  if (ok) console.log('PASS ' + name);
  else { failed += 1; console.log('FAIL ' + name + (msg ? ' — ' + msg : '')); }
});
if (failed) { console.error('\n' + failed + ' render check(s) failed.'); process.exit(1); }
console.log('\n' + results.length + ' render check(s) passed.');

}
run().catch(e => { console.error('[member-onboarding] 실행 실패:', e); process.exit(1); });
