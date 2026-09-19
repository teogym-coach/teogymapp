// 네이버 후기 정책 분리 회귀 테스트 — 기존 회원(legacy 1·2회) 보호 + 2026-09-19 이후 신규 회원(영상 첨부 1회)
// 실행: npm run regression (또는 NODE_ENV=development node tests/render/review-policy-video.test.js)
//
// App.jsx / db.js 원본을 그대로 슬라이스해 실행한다(값·로직을 테스트에 복사하지 않는다).
//   · db.js addMember/updateMember — 메모리 Firestore 스텁 위에서 reviewPolicyVersion 저장·불변 검증
//   · App.jsx buildRegistrationReviewNotice + ReviewReminderCard — 회원앱 홈 공지 표시/문구
//   · App.jsx HubScreen "⑥ 후기 관리" 블록 — jsdom에 실제 렌더하고 버튼을 눌러 저장 payload 확인
//   · App.jsx buildReviewPendingList — 관리자 홈 "후기 미작성" 판정
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
const DBJS = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');

function sliceOf(text, start, end, label) {
  const si = text.indexOf(start);
  if (si < 0) { console.error(`[review-policy] ${label} slice 시작 마커 없음:`, start); process.exit(1); }
  if (text.indexOf(start, si + 1) !== -1) { console.error(`[review-policy] ${label} 시작 마커가 2회 이상 등장:`, start); process.exit(1); }
  const ei = text.indexOf(end, si);
  if (ei < 0) { console.error(`[review-policy] ${label} slice 끝 마커 없음:`, end); process.exit(1); }
  return text.slice(si, ei);
}
const appSlice = (s, e) => sliceOf(APP, s, e, 'App.jsx');
const dbSlice = (s, e) => sliceOf(DBJS, s, e, 'db.js');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
let babel, React, ReactDOM, JSDOM;
try {
  babel = require('@babel/core');
  React = require('react');
  ReactDOM = require('react-dom/client');
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('[review-policy] 렌더 의존 모듈 로드 실패 — 건너뜁니다:', e.message);
  process.exit(0);
}
const { act } = React;

const POLICY = (DBJS.match(/export const REVIEW_POLICY_VERSION_VIDEO_1 = "([^"]+)";/) || [])[1];
assert.strictEqual(POLICY, '2026-09-19', 'db.js 정책 버전 상수');

let passed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS 후기 정책: ${name}`); passed += 1; }
  catch (e) { console.error(`FAIL 후기 정책: ${name}`); console.error(e && e.stack || e); process.exitCode = 1; }
}

// ── db.js 원본(addMember/updateMember) + 메모리 Firestore ───────
const store = {};
let autoId = 0;
const dbSrc = [
  dbSlice('function normalizeMemberData(data) {', '// ── 디버그 로그'),
  dbSlice('export const REVIEW_POLICY_VERSION_VIDEO_1 =', 'export async function cleanupMemberAppEmailIdentity'),
].join('\n').replace(/export (const|async function|function) /g, '$1 ');
const dbEnv = {
  requireUid: () => 'uid-trainer',
  dbLog: () => {},
  db: {},
  collection: (_db, name) => ({ name }),
  doc: (_db, col, id) => ({ col, id }),
  serverTimestamp: () => '__ts__',
  deleteField: () => '__delete__',
  addDoc: async (_col, payload) => { const id = `m${++autoId}`; store[id] = JSON.parse(JSON.stringify(payload)); return { id }; },
  getDoc: async (ref) => ({ exists: () => !!store[ref.id], data: () => JSON.parse(JSON.stringify(store[ref.id])) }),
  updateDoc: async (ref, patch) => {
    const next = { ...store[ref.id] };
    for (const [k, v] of Object.entries(patch)) { if (v === '__delete__') delete next[k]; else next[k] = JSON.parse(JSON.stringify(v)); }
    store[ref.id] = next;
  },
  saveMemberPrivateFields: async () => {},
};
// eslint-disable-next-line no-new-func
const dbApi = new Function(...Object.keys(dbEnv), `${dbSrc}\nreturn { addMember, updateMember, REVIEW_POLICY_VERSION_VIDEO_1 };`)(...Object.values(dbEnv));

// ── App.jsx 원본 조각 ───────────────────────────────────────
const appSrc = [
  appSlice('const REGISTRATION_NOTICE_POLICY_START_DATE', '// 홈 리디자인 — "이름'),
  appSlice('function buildReviewPendingList(members, liveMembersById) {', '// 홈 "오늘의 AI 코칭"'),
  // HubScreen 후기 관리 블록을 그대로 감싸 독립 컴포넌트로 렌더한다(member/onMemberPatch/updateMember는 원본과 같은 이름).
  'function ReviewCardHarness({ member, onMemberPatch }) {',
  appSlice('  // ⑥ 후기 관리 — 1단계', '  // ⑥-2 등록 관리'),
  '  return secReview;\n}',
].join('\n');
const out = babel.transformSync(`${appSrc}\nwindow.__api = { buildRegistrationReviewNotice, ReviewReminderCard, buildReviewPendingList, ReviewCardHarness, isVideoReviewPolicyMember };`, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'review-policy-harness.jsx',
}).code;

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = '2026-09-19';
const hubWrites = [];
const appEnv = {
  React,
  useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo,
  REVIEW_POLICY_VERSION_VIDEO_1: dbApi.REVIEW_POLICY_VERSION_VIDEO_1,
  getKoreaDateString: () => TODAY,
  dateStrDaysAgo: (n) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); },
  isExcludedAdminMember: () => false,
  updateMember: async (id, patch) => { hubWrites.push([id, patch]); await dbApi.updateMember(id, patch); },
  DB: { mint: '#39C7B8', mintSoft: '#0F9488', mintTintStrong: '#E9FAF7', border: '#ddd', card: '#fff', sub: '#666', faint: '#999', text: '#111', font: 'sans-serif' },
  card: {}, cardTitle: {},
};
// eslint-disable-next-line no-new-func
new Function('window', ...Object.keys(appEnv), out)(dom.window, ...Object.values(appEnv));
const api = dom.window.__api;

function renderNotice(profile) {
  const notice = api.buildRegistrationReviewNotice(profile);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = ReactDOM.createRoot(el);
  act(() => { root.render(React.createElement(api.ReviewReminderCard, { notice })); });
  const text = el.textContent;
  act(() => root.unmount());
  el.remove();
  return { notice, text };
}

// 관리자 후기 관리 카드 — 저장 후 onMemberPatch로 member가 갱신되는 실제 흐름을 재현한다.
async function mountHub(memberId) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = ReactDOM.createRoot(el);
  const state = { member: { id: memberId, ...store[memberId] } };
  const render = () => root.render(React.createElement(api.ReviewCardHarness, {
    member: state.member,
    onMemberPatch: (patch) => { state.member = { ...state.member, ...patch }; render(); },
  }));
  await act(async () => { render(); });
  const buttons = () => [...el.querySelectorAll('button')].map(b => b.textContent);
  const click = async (label) => {
    const b = [...el.querySelectorAll('button')].find(x => x.textContent === label);
    assert.ok(b, `버튼 없음: ${label} (현재: ${buttons().join(', ')})`);
    assert.ok(!b.disabled, `버튼 비활성: ${label}`);
    await act(async () => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await act(async () => {});
  };
  return { el, buttons, click, text: () => el.textContent, unmount: () => { act(() => root.unmount()); el.remove(); } };
}

// 기존(legacy) 회원 — reviewPolicyVersion 필드 없음(배포 전 생성). 07-20 이후 첫 등록 + 후기 목표 설정 상태.
function seedLegacy(id, required, completed) {
  store[id] = {
    name: id, trainerUid: 'uid-trainer', status: 'active',
    registrationType: 'first', firstRegistrationDate: '2026-08-01',
    reviewStatus: { requiredCount: required, completedCount: completed, updatedAt: '2026-08-02T00:00:00.000Z', requiredSetAt: '2026-08-01T00:00:00.000Z' },
  };
}

(async () => {
  // ───── 1~3 · 기존 회원 보호 ─────
  await check('1. 기존 회원(필드 없음) 0회 완료 → 목표 2회 유지(0/2) + 기존 공지 문구', async () => {
    seedLegacy('legacy0', 2, 0);
    const hub = await mountHub('legacy0');
    assert.ok(hub.text().includes('0 / 2회 완료') && hub.text().includes('2회 남음'));
    hub.unmount();
    const { notice, text } = renderNotice(store.legacy0);
    assert.deepStrictEqual(notice, { type: 'required', remaining: 2 });
    assert.ok(text.includes('회원님의 소중한 후기 2회가 기다리고 있어요'));
    assert.ok(!text.includes('네이버 영수증'));
    assert.strictEqual('reviewPolicyVersion' in store.legacy0, false);
  });
  await check('2. 기존 회원 1회 완료 → 1/2 유지 + 기존 1회 남음 문구', async () => {
    seedLegacy('legacy1', 2, 1);
    const hub = await mountHub('legacy1');
    assert.ok(hub.text().includes('1 / 2회 완료') && hub.text().includes('1회 남음'));
    assert.ok(!hub.text().includes('수업 영상 첨부'));
    hub.unmount();
    const { notice, text } = renderNotice(store.legacy1);
    assert.deepStrictEqual(notice, { type: 'required', remaining: 1 });
    assert.ok(text.includes('회원님의 소중한 후기 1회가 기다리고 있어요'));
    assert.ok(text.includes('테오짐에서 느낀 변화와 운동 경험을 편하게 나눠주시면'));
  });
  await check('3. 기존 회원 2회 완료 → 2/2 유지 · 공지 없음', async () => {
    seedLegacy('legacy2', 2, 2);
    const hub = await mountHub('legacy2');
    assert.ok(hub.text().includes('2 / 2회 완료') && hub.text().includes('후기 완료'));
    assert.ok(!hub.buttons().includes('1회 완료 추가'));
    hub.unmount();
    assert.strictEqual(api.buildRegistrationReviewNotice(store.legacy2), null);
  });

  // ───── 4~7 · 신규 정책 회원 ─────
  await check('4. 신규 회원 생성 → reviewPolicyVersion 저장 · 후기 목표는 자동 설정 안 됨 · 공지 없음', async () => {
    const created = await dbApi.addMember({ name: '신규D', status: 'active', registrationType: 'first', firstRegistrationDate: TODAY });
    store.__newId = created.id;
    const doc = store[created.id];
    assert.strictEqual(doc.reviewPolicyVersion, '2026-09-19');
    assert.strictEqual(created.reviewPolicyVersion, '2026-09-19', 'addMember 반환값에도 포함(생성 직후 상세 진입 대비)');
    assert.strictEqual(doc.reviewStatus, undefined, '후기 목표 자동 설정 금지');
    assert.strictEqual(api.buildRegistrationReviewNotice(doc), null, '목표 미설정 → 후기 공지 없음(등록일 5일 안내도 없음)');
  });
  await check('4-1. 신규 정책 회원 후기 설정 → "후기 1회 설정 (영상 첨부)"만 존재, 2회 설정 경로 없음 → 0/1', async () => {
    const id = store.__newId;
    const hub = await mountHub(id);
    assert.deepStrictEqual(hub.buttons(), ['후기 1회 설정 (영상 첨부)']);
    await hub.click('후기 1회 설정 (영상 첨부)');
    assert.deepStrictEqual({ r: store[id].reviewStatus.requiredCount, c: store[id].reviewStatus.completedCount }, { r: 1, c: 0 });
    assert.ok(hub.text().includes('0 / 1회 완료') && hub.text().includes('1회 남음') && hub.text().includes('수업 영상 첨부'));
    await hub.click('다시 시작');
    assert.ok(hub.buttons().includes('1회로 다시 시작') && !hub.buttons().some(b => b.includes('2회')), `다시 시작 버튼: ${hub.buttons()}`);
    await hub.click('취소');
    hub.unmount();
  });
  await check('6. 신규 정책 0/1 → 공지 표시(문구 확인) · 재접속(프로필 재조회)해도 계속 표시 · 등록일 조건 무관', async () => {
    const id = store.__newId;
    const { notice, text } = renderNotice(store[id]);
    assert.deepStrictEqual(notice, { type: 'video' });
    assert.ok(text.includes('후기 작성 안내'));
    assert.ok(text.includes('네이버 영수증 후기 작성 부탁드립니다'));
    assert.ok(text.includes('수업 영상을 함께 첨부해 주시면 됩니다.'));
    // 재접속 = Firestore 문서를 다시 읽어 만든 새 profile 객체
    const reloaded = JSON.parse(JSON.stringify({ id, ...store[id] }));
    assert.deepStrictEqual(api.buildRegistrationReviewNotice(reloaded), { type: 'video' });
    // 등록 구분이 기존 회원이거나 날짜가 없어도, 등록일로부터 오래 지나도 사라지지 않는다(기간 제한 없음)
    for (const variant of [{ registrationType: 'existing' }, { registrationType: undefined, firstRegistrationDate: '' }, { firstRegistrationDate: '2026-01-01' }]) {
      assert.deepStrictEqual(api.buildRegistrationReviewNotice({ ...reloaded, ...variant }), { type: 'video' }, JSON.stringify(variant));
    }
  });
  await check('5. 신규 정책 후기 완료 → 1/1 · 공지 사라짐 · 추가 버튼 없어 1/1 초과 불가', async () => {
    const id = store.__newId;
    const hub = await mountHub(id);
    await hub.click('1회 완료 추가');
    assert.strictEqual(store[id].reviewStatus.completedCount, 1);
    assert.ok(hub.text().includes('1 / 1회 완료') && hub.text().includes('후기 완료'));
    assert.ok(!hub.buttons().includes('1회 완료 추가'), '1/1에서 완료 추가 버튼 없음');
    hub.unmount();
    assert.strictEqual(api.buildRegistrationReviewNotice(store[id]), null);
    // 비정상 데이터(2/1)가 들어와도 공지는 나오지 않고 관리자 화면은 1/1로 클램프된다
    assert.strictEqual(api.buildRegistrationReviewNotice({ ...store[id], reviewStatus: { requiredCount: 1, completedCount: 2 } }), null);
  });
  await check('7. 신규 정책 1/1에서 완료 1회 되돌리기 → 0/1 · 공지 다시 표시', async () => {
    const id = store.__newId;
    const hub = await mountHub(id);
    await hub.click('완료 1회 되돌리기');
    assert.strictEqual(store[id].reviewStatus.completedCount, 0);
    assert.ok(hub.text().includes('0 / 1회 완료'));
    hub.unmount();
    assert.deepStrictEqual(api.buildRegistrationReviewNotice(store[id]), { type: 'video' });
  });
  await check('신규 정책 회원 다시 시작 → 1회로만 재설정(requiredCount 1 유지)', async () => {
    const id = store.__newId;
    const hub = await mountHub(id);
    await hub.click('다시 시작');
    await hub.click('1회로 다시 시작');
    assert.deepStrictEqual({ r: store[id].reviewStatus.requiredCount, c: store[id].reviewStatus.completedCount }, { r: 1, c: 0 });
    hub.unmount();
    assert.strictEqual(store[id].reviewPolicyVersion, '2026-09-19');
  });

  // ───── 8~10 · 기존 회원 동작·정책 불변 ─────
  await check('8. 기존 1/2 회원 1회 추가 → 2/2 정상 완료(목표 2 유지)', async () => {
    const hub = await mountHub('legacy1');
    await hub.click('1회 완료 추가');
    assert.deepStrictEqual({ r: store.legacy1.reviewStatus.requiredCount, c: store.legacy1.reviewStatus.completedCount }, { r: 2, c: 2 });
    assert.ok(hub.text().includes('2 / 2회 완료'));
    hub.unmount();
    assert.strictEqual(api.buildRegistrationReviewNotice(store.legacy1), null);
    assert.strictEqual('reviewPolicyVersion' in store.legacy1, false);
  });
  await check('기존 회원 목표 미설정 → 1회·2회 설정 버튼 그대로 · 다시 시작도 1·2회 모두', async () => {
    store.legacyNone = { name: 'x', trainerUid: 'uid-trainer', status: 'active' };
    const hub = await mountHub('legacyNone');
    assert.deepStrictEqual(hub.buttons(), ['후기 1회 설정', '후기 2회 설정']);
    hub.unmount();
    const hub2 = await mountHub('legacy0');
    await hub2.click('다시 시작');
    assert.ok(hub2.buttons().includes('1회로 다시 시작') && hub2.buttons().includes('2회로 다시 시작'));
    hub2.unmount();
  });
  await check('9. 기존 회원을 09-19 이후 정보 수정(폼 전체 저장) → 정책 필드 생기지 않음, reviewStatus 그대로', async () => {
    const before = JSON.parse(JSON.stringify(store.legacy0));
    await dbApi.updateMember('legacy0', { ...before, name: 'legacy0-수정', memo: '메모' });
    assert.strictEqual('reviewPolicyVersion' in store.legacy0, false);
    assert.deepStrictEqual(store.legacy0.reviewStatus, before.reviewStatus);
    // 수정 payload에 정책 값을 억지로 넣어도 기록되지 않는다(생성 시점에만 확정)
    await dbApi.updateMember('legacy0', { reviewPolicyVersion: '2026-09-19' });
    assert.strictEqual('reviewPolicyVersion' in store.legacy0, false);
    assert.deepStrictEqual(api.buildRegistrationReviewNotice(store.legacy0), { type: 'required', remaining: 2 });
  });
  await check('10. 재등록(등록 구분 재등록 + PT 기준 필드 수정) → 기존 정책 유지 · 신규 회원 정책도 사라지지 않음', async () => {
    await dbApi.updateMember('legacy0', { registrationType: 'renewal', latestRenewalDate: TODAY, firstRegistrationDate: '', registrationNoticeDone: false });
    assert.strictEqual('reviewPolicyVersion' in store.legacy0, false);
    assert.deepStrictEqual({ r: store.legacy0.reviewStatus.requiredCount, c: store.legacy0.reviewStatus.completedCount }, { r: 2, c: 0 });
    const id = store.__newId;
    await dbApi.updateMember(id, { registrationType: 'renewal', latestRenewalDate: TODAY, name: '신규D-수정', reviewPolicyVersion: undefined });
    assert.strictEqual(store[id].reviewPolicyVersion, '2026-09-19', '수정으로 신규 정책이 지워지지 않음');
  });
  await check('11. 후기 조건 없는 일반 신규 회원 → 후기 공지 없음 · 후기 미작성 목록에도 없음', async () => {
    const g = await dbApi.addMember({ name: '일반가', status: 'active', registrationType: 'first', firstRegistrationDate: TODAY });
    assert.strictEqual(api.buildRegistrationReviewNotice(store[g.id]), null);
    assert.ok(!api.buildReviewPendingList([{ id: g.id, ...store[g.id] }], {}).some(r => r.member.id === g.id));
  });
  await check('12. 관리자·회원앱 재접속 → 같은 문서에서 같은 후기 상태', async () => {
    const id = store.__newId;
    const adminView = await mountHub(id);
    const memberProfile = JSON.parse(JSON.stringify({ id, ...store[id] }));
    assert.ok(adminView.text().includes('0 / 1회 완료'));
    assert.deepStrictEqual(api.buildRegistrationReviewNotice(memberProfile), { type: 'video' });
    adminView.unmount();
  });

  // ───── 관리자 홈 후기 미작성 ─────
  await check('관리자 홈 후기 미작성 목록 — 기존 0/2·1/2 포함, 신규 0/1 포함, 신규 1/1·기존 2/2 제외', async () => {
    const mk = (id, r, c, extra = {}) => ({ id, name: id, status: 'active', reviewStatus: { requiredCount: r, completedCount: c }, ...extra });
    const rows = api.buildReviewPendingList([
      mk('L02', 2, 0), mk('L12', 2, 1), mk('L22', 2, 2),
      mk('N01', 1, 0, { reviewPolicyVersion: POLICY }), mk('N11', 1, 1, { reviewPolicyVersion: POLICY }),
    ], {});
    const got = Object.fromEntries(rows.map(r => [r.member.id, `${r.completed}/${r.required}`]));
    assert.deepStrictEqual(got, { L02: '0/2', L12: '1/2', N01: '0/1' });
    // 실시간 오버레이로 신규 회원이 1/1 완료되면 즉시 목록에서 빠진다
    const live = api.buildReviewPendingList([mk('N01', 1, 0, { reviewPolicyVersion: POLICY })], { N01: { reviewStatus: { requiredCount: 1, completedCount: 1 } } });
    assert.strictEqual(live.length, 0);
  });

  // ───── 기존 공지 경로 회귀 ─────
  await check('기존 공지 회귀 — 07-20 이전 등록·등록 구분 없음은 계속 미표시, 목표 없는 첫 등록/재등록 5일 안내 그대로', async () => {
    assert.strictEqual(api.buildRegistrationReviewNotice({ registrationType: 'first', firstRegistrationDate: '2026-07-10', reviewStatus: { requiredCount: 2, completedCount: 0 } }), null);
    assert.strictEqual(api.buildRegistrationReviewNotice({ reviewStatus: { requiredCount: 2, completedCount: 0 } }), null);
    assert.deepStrictEqual(api.buildRegistrationReviewNotice({ registrationType: 'first', firstRegistrationDate: '2026-09-17' }), { type: 'first' });
    assert.deepStrictEqual(api.buildRegistrationReviewNotice({ registrationType: 'renewal', latestRenewalDate: '2026-09-15' }), { type: 'renewal' });
    assert.strictEqual(api.buildRegistrationReviewNotice({ registrationType: 'first', firstRegistrationDate: '2026-09-10' }), null);
    assert.ok(renderNotice({ registrationType: 'first', firstRegistrationDate: '2026-09-17' }).text.includes('첫 운동의 느낌을 편하게 들려주세요'));
    // 다른 정책 문자열(오타·미래 버전)은 신규 정책으로 취급하지 않는다
    assert.strictEqual(api.isVideoReviewPolicyMember({ reviewPolicyVersion: '2026-09-20' }), false);
    assert.strictEqual(api.isVideoReviewPolicyMember({}), false);
  });

  if (process.exitCode) process.exit(1);
  console.log(`PASS 후기 정책: 전체 ${passed}건 통과`);
})().catch(e => { console.error(e); process.exit(1); });
