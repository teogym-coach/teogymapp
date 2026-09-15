// 체중 기록(bodyCheck/main.records) 유실 방지 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/body-weight-records-safety.test.js)
//
// 실제 src/db.js(saveBodyCheck·getBodyCheck·회원앱 체중 저장 함수)를 babel로 불러와 가짜 Firestore 위에서 실행하고,
// App.jsx의 수업일지 저장 핸들러 원본도 슬라이스해 같은 가짜 Firestore에 연결한다. 계산식은 복제하지 않는다.
// 가짜 Firestore는 setDoc(교체)/setDoc(merge)/updateDoc/writeBatch/runTransaction(읽은 문서가 커밋 전에 바뀌면 재시도)의
// 의미를 실제 SDK와 같게 구현한다. beforeTxCommit 훅은 "읽은 뒤 쓰기 직전"(트랜잭션 커밋·배치 커밋·bodyCheck 직접 쓰기 중
// 먼저 오는 지점)에 한 번 끼어들어 다른 클라이언트의 쓰기를 흉내 낸다.
// BODY_TEST_ROOT=<다른 체크아웃 경로> 로 실행하면 그 경로의 App.jsx/db.js(예: 수정 전 코드)로 같은 시나리오를 돌린다.
process.env.NODE_ENV = 'test'; // babel-preset-react-app 요구사항(로드 후 production으로 바꿔 dbLog를 끈다)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');

const REPO = path.join(__dirname, '..', '..');
const ROOT = process.env.BODY_TEST_ROOT || REPO;
const req = Module.createRequire(path.join(REPO, 'package.json'));
const babel = req('@babel/core');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');

// ── 가짜 Firestore ───────────────────────────────────────────────
class FakeTimestamp {
  constructor(seconds) { this.seconds = seconds; this.nanoseconds = 0; }
  toMillis() { return this.seconds * 1000; }
  toDate() { return new Date(this.seconds * 1000); }
  isEqual(o) { return o instanceof FakeTimestamp && o.seconds === this.seconds; }
}
class Sentinel { constructor(kind) { this.kind = kind; } isEqual(o) { return o instanceof Sentinel && o.kind === this.kind; } }
const tick = () => new Promise(r => setImmediate(r));
const never = () => new Promise(() => {});

function makeFirestore() {
  const docs = new Map(); // path -> { data, version }
  let version = 1000, tsSeq = 0; // 시드 문서(version 1)와 겹치지 않게 1000부터
  const hooks = { failWrite: null, hangWrite: null, failGet: null, beforeTxCommit: null };
  const stats = { txAttempts: 0, txRetries: 0, replaceWrites: 0 };
  const isPlain = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof FakeTimestamp) && !(v instanceof Sentinel);
  const clone = v => Array.isArray(v) ? v.map(clone) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
  const resolve = v => {
    if (v instanceof Sentinel && v.kind === 'serverTimestamp') return new FakeTimestamp(1757900000 + (++tsSeq));
    if (v instanceof Sentinel) throw new Error('deleteField()는 최상위 update/merge 필드에서만 허용');
    if (v === undefined) throw new Error('Function setDoc() called with invalid data. Unsupported field value: undefined');
    if (Array.isArray(v)) return v.map(resolve);
    if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
    return v;
  };
  const mergeInto = (target, patch) => {
    const out = { ...target };
    for (const [k, v] of Object.entries(patch)) {
      if (v instanceof Sentinel && v.kind === 'deleteField') delete out[k];
      else if (isPlain(v) && isPlain(out[k])) out[k] = mergeInto(out[k], v);
      else out[k] = resolve(v);
    }
    return out;
  };
  const pathOf = segs => segs.join('/');
  const snapOf = (p) => { const d = docs.get(p); return { id: p.split('/').pop(), exists: () => !!d, data: () => (d ? clone(d.data) : undefined) }; };
  const runInterleave = async () => { if (hooks.beforeTxCommit) { const h = hooks.beforeTxCommit; hooks.beforeTxCommit = null; await h(); } };
  const guardWrite = async (p) => {
    if (hooks.hangWrite && p.includes(hooks.hangWrite)) return never();
    if (hooks.failWrite && p.includes(hooks.failWrite)) { const e = new Error('unavailable: 쓰기 실패(테스트 주입)'); e.code = 'unavailable'; throw e; }
  };
  const apply = (op) => {
    const cur = docs.get(op.path);
    if (op.type === 'set') docs.set(op.path, { data: op.merge ? mergeInto(cur ? cur.data : {}, op.data) : mergeInto({}, op.data), version: ++version });
    else if (op.type === 'delete') docs.delete(op.path);
    if (op.type === 'set' && !op.merge) stats.replaceWrites += 1;
  };
  // updateDoc은 최상위 필드 값을 통째로 교체한다(맵도 병합하지 않음)
  const replaceTop = (data, patch) => {
    const out = { ...data };
    for (const [k, v] of Object.entries(patch)) {
      if (v instanceof Sentinel && v.kind === 'deleteField') delete out[k];
      else out[k] = resolve(v);
    }
    return out;
  };
  const fsApi = {
    doc: (_db, ...segs) => ({ path: pathOf(segs), id: segs[segs.length - 1] }),
    collection: (_db, ...segs) => ({ path: pathOf(segs) }),
    query: (c) => c, where: () => null, orderBy: () => null, limit: () => null, documentId: () => '__name__',
    serverTimestamp: () => new Sentinel('serverTimestamp'),
    deleteField: () => new Sentinel('deleteField'),
    onSnapshot: () => () => {},
    getDoc: async (ref) => {
      await tick();
      if (hooks.failGet && ref.path.includes(hooks.failGet)) { const e = new Error('unavailable: 읽기 실패(테스트 주입)'); e.code = 'unavailable'; throw e; }
      return snapOf(ref.path);
    },
    getDocs: async (q) => {
      await tick();
      const prefix = q.path + '/';
      const list = [...docs.keys()].filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'));
      return { size: list.length, empty: !list.length, docs: list.map(p => ({ id: p.split('/').pop(), data: () => clone(docs.get(p).data) })) };
    },
    setDoc: async (ref, data, opts) => { await tick(); if (ref.path.includes('bodyCheck')) await runInterleave(); await guardWrite(ref.path); apply({ type: 'set', path: ref.path, data, merge: !!(opts && opts.merge) }); },
    updateDoc: async (ref, data) => { await tick(); if (ref.path.includes('bodyCheck')) await runInterleave(); await guardWrite(ref.path); const cur = docs.get(ref.path); if (!cur) { const e = new Error('No document to update'); e.code = 'not-found'; throw e; } docs.set(ref.path, { data: replaceTop(cur.data, data), version: ++version }); },
    addDoc: async (c, data) => { await tick(); const id = 'auto' + (++version); docs.set(`${c.path}/${id}`, { data: mergeInto({}, data), version: ++version }); return { id }; },
    deleteDoc: async (ref) => { await tick(); docs.delete(ref.path); },
    writeBatch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push({ type: 'set', path: ref.path, data, merge: !!(opts && opts.merge) }),
        update: (ref, data) => ops.push({ type: 'updateTop', path: ref.path, data }),
        delete: (ref) => ops.push({ type: 'delete', path: ref.path }),
        commit: async () => {
          await tick();
          if (ops.some(op => op.path.includes('bodyCheck'))) await runInterleave();
          for (const op of ops) await guardWrite(op.path);
          for (const op of ops) {
            if (op.type === 'updateTop') docs.set(op.path, { data: replaceTop(docs.get(op.path).data, op.data), version: ++version });
            else apply(op);
          }
        },
      };
    },
    runTransaction: async (_db, fn) => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        stats.txAttempts += 1;
        const readVersions = new Map();
        const ops = [];
        const tx = {
          get: async (ref) => {
            await tick();
            if (hooks.failGet && ref.path.includes(hooks.failGet)) { const e = new Error('unavailable: 읽기 실패(테스트 주입)'); e.code = 'unavailable'; throw e; }
            readVersions.set(ref.path, docs.get(ref.path)?.version || 0);
            return snapOf(ref.path);
          },
          set: (ref, data, opts) => { ops.push({ type: 'set', path: ref.path, data, merge: !!(opts && opts.merge) }); return tx; },
          update: (ref, data) => { ops.push({ type: 'updateTop', path: ref.path, data }); return tx; },
          delete: (ref) => { ops.push({ type: 'delete', path: ref.path }); return tx; },
        };
        const result = await fn(tx);
        await runInterleave();
        await tick();
        for (const op of ops) await guardWrite(op.path);
        const conflict = [...readVersions].some(([p, v]) => (docs.get(p)?.version || 0) !== v);
        if (conflict) { stats.txRetries += 1; continue; }
        for (const op of ops) {
          if (op.type === 'updateTop') {
            const cur = docs.get(op.path);
            if (!cur) { const e = new Error('No document to update'); e.code = 'not-found'; throw e; }
            docs.set(op.path, { data: replaceTop(cur.data, op.data), version: ++version });
          } else apply(op);
        }
        return result;
      }
      const e = new Error('Transaction failed all retries'); e.code = 'aborted'; throw e;
    },
  };
  // 이 SDK에 없는 함수를 db.js가 쓰면 바로 드러나도록 Proxy로 감싼다
  const api = new Proxy(fsApi, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? () => { throw new Error(`fake firestore: ${k} 미구현`); } : undefined)) });
  return { api, docs, hooks, stats, raw: (p) => docs.get(p)?.data };
}

function loadDb(fake, auth) {
  const file = path.join(ROOT, 'src', 'db.js');
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    presets: [[req.resolve('babel-preset-react-app'), { runtime: 'classic' }]], babelrc: false, configFile: false, filename: file,
  }).code;
  const m = new Module(file, module);
  m.filename = file;
  m.require = id => id === 'firebase/firestore' ? fake.api
    : id === './firebase-config' ? { db: {}, auth, app: {} }
    : id === './app-mode' ? { isMemberMode: () => false, getRuntimeAppMode: () => 'admin' }
    : req(id);
  m._compile(code, file);
  return m.exports;
}

// ── App.jsx 원본 슬라이스 ────────────────────────────────────────
function slice(start, end) {
  const si = APP.indexOf(start), ei = APP.indexOf(end, si);
  if (si < 0 || ei < 0) { console.error('slice 경계 실패', start, si, ei); process.exit(1); }
  if (APP.indexOf(start, si + 1) !== -1) { console.error('시작 마커가 2회 이상 등장', start); process.exit(1); }
  return APP.slice(si, ei);
}
// eslint-disable-next-line no-new-func
const weightLib = new Function(`
${slice('function toPositiveNumber', 'function getBodyWeightRecords')}
${slice('function getBodyWeightRecords', 'function getLatestBodyWeight')}
${slice('function getLatestBodyWeight', 'function getMemberStartWeight')}
${slice('function getWeightProgress', 'function estimateBirthYearFromAge')}
${slice('function upsertBodyRecord', 'function mkSet()')}
${slice('function getAnalysisPersona', 'function average(arr=[])')}
return { getBodyWeightRecords, getLatestBodyWeight, getWeightProgress, upsertBodyRecord, buildGoalWeightState };`)();
const handlerSrc = [
  slice('function withTimeout(promise, ms = 20000', 'const STIM_RATING_OPTIONS'),
  slice('async function handleSaveSession(d) {', 'function resumeDraft2_1('),
  slice('async function refreshSessionsForMember(memberId) {', '// ── PT 잔여 캐시 동기화 (공용)'),
  slice('async function syncPtBalanceAfterSessionChange(memberId, freshSessions) {', 'async function handleUnpublishSession(s) {'),
].join('\n');
// eslint-disable-next-line no-new-func
const handlerFactory = new Function('env', `with (env) {\n${handlerSrc}\nreturn { handleSaveSession };\n}`);

// ── 테스트 월드 ──────────────────────────────────────────────────
const MID = 'm1';
const BODY = `members/${MID}/bodyCheck/main`;
const TIME_SCALE = 0.01;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seedRecords = (dates) => dates.map(([date, weight]) => ({ id: `seed_${date}`, date, weight, bodyFat: null, memo: '' }));
const FIVE = [['2026-09-10', 80.0], ['2026-09-11', 79.8], ['2026-09-12', 79.5], ['2026-09-13', 79.3], ['2026-09-14', 79.1]];

function makeWorld({ records = seedRecords(FIVE), goal = { targetWeight: '72', currentWeight: '80' }, inbody = [], extra = {} } = {}) {
  const fake = makeFirestore();
  const auth = { currentUser: { uid: 'trainer1', email: 't@x' } };
  const d = loadDb(fake, auth);
  process.env.NODE_ENV = 'production';
  fake.docs.set(`members/${MID}`, { data: { name: '회원A', trainerUid: 'trainer1', memberUid: 'memberUid1' }, version: 1 });
  fake.docs.set(BODY, { data: { goal, records, inbody, ...extra }, version: 1 });
  const asMember = async (fn) => { const prev = auth.currentUser; auth.currentUser = { uid: 'memberUid1', email: 'm@x' }; try { return await fn(); } finally { auth.currentUser = prev; } };
  const asTrainer = async (fn) => { const prev = auth.currentUser; auth.currentUser = { uid: 'trainer1', email: 't@x' }; try { return await fn(); } finally { auth.currentUser = prev; } };
  const body = () => fake.raw(BODY) || {};
  const dates = () => (body().records || []).map(r => r.date).sort();
  const weightOn = (date) => (body().records || []).filter(r => r.date === date).map(r => Number(r.weight));
  return { fake, d, auth, asMember, asTrainer, body, dates, weightOn };
}

// 관리자 화면들이 onSaveBodyData로 넘기는 payload를 원본과 같은 모양으로 만든다(App.jsx 코드와 동일한 연산).
// 저장 호출은 App 쪽 onSaveBodyData 래퍼와 같게 base(화면에 로드돼 있던 bodyData)를 함께 넘긴다.
const screens = {
  bodyCheckSaveRecord: (bodyData, rec) => ({ ...bodyData, records: weightLib.upsertBodyRecord(bodyData?.records || [], { id: 'r' + Date.now(), ...rec }) }),
  bodyCheckDeleteRecord: (bodyData, id) => ({ ...bodyData, records: (bodyData?.records || []).filter(r => r.id !== id) }),
  bodyCheckSaveGoal: (bodyData, g) => ({ ...bodyData, goal: g }),
  bodyCheckSaveInbody: (bodyData, i) => ({ ...bodyData, records: weightLib.upsertBodyRecord(bodyData?.records || [], { id: 'r' + Date.now(), date: i.date, weight: i.weight }), inbody: [...(bodyData?.inbody || []), { id: 'i' + Date.now(), ...i }] }), // i.id가 있으면 그 id 사용
  healthRecordTab: (bodyData, dt, w) => { const recs = [...(bodyData?.records || []).filter(r => r.date !== dt)]; recs.push({ id: 'w' + Date.now(), date: dt, weight: w, bodyFat: null, muscleMass: null }); return { ...bodyData, records: recs.sort((a, b) => b.date.localeCompare(a.date)) }; },
};
const adminSave = (w, next, base) => w.d.saveBodyCheck(MID, next, { base });

// 수업일지 저장 핸들러를 실제 db.js saveBodyCheck에 연결해 실행
async function runSessionSave(w, { bodyData, bodyWeight = '78.9', date = '2026-09-15', memberDataLoaded = true, onToast } = {}) {
  const store = { loading: false, screen: 'session', sessions: [], sessionsMap: {}, members: [{ id: MID }], editSess: null, bodyData, toasts: [], warns: [] };
  const sessionDocs = new Map();
  let seq = 0;
  const refs = { memberDataReqIdRef: { current: 0 }, sessionSaveInFlightRef: { current: null }, sessionPublishInFlightRef: { current: new Map() } };
  const h = handlerFactory({
    member: { id: MID, name: '회원A' }, editSess: null, sessions: [], memberDataLoaded, bodyData, ptRegistrations: [], ...refs,
    addSession: async (mid, data) => { await tick(); const id = `new${++seq}`; sessionDocs.set(id, { ...data }); return { id, ...data }; },
    updateSession: async () => { throw new Error('unexpected'); },
    getSession: async (mid, sid) => { await tick(); return { id: sid, ...sessionDocs.get(sid) }; },
    getSessions: async () => [...sessionDocs].map(([id, x]) => ({ id, ...x })),
    publishSession: async () => {},
    updateMember: async () => { await tick(); },
    syncPtBalanceCache: async () => null,
    saveBodyCheck: (...a) => w.d.saveBodyCheck(...a),
    setLoading: v => { store.loading = v; }, showToast: (m, t) => { store.toasts.push([t || 'ok', m]); onToast && onToast(m, t); },
    setEditSess: v => { store.editSess = v; }, setScreen: v => { store.screen = v; },
    setSessions: v => { store.sessions = typeof v === 'function' ? v(store.sessions) : v; },
    setSessionsMap: f => { store.sessionsMap = typeof f === 'function' ? f(store.sessionsMap) : f; },
    setMembers: f => { store.members = f(store.members); }, setMember: () => {},
    setBodyData: v => { store.bodyData = v; },
    setTimeout: (fn, ms) => setTimeout(fn, ms * TIME_SCALE), clearTimeout,
    navigator: { onLine: true },
    console: { log() {}, error() {}, warn: (...a) => store.warns.push(a.join(' ')) },
  });
  await h.handleSaveSession({ memberId: MID, memberName: '회원A', date, sessionNo: 6, sessionType: '1:1', exercises: [{ name: '스쿼트', muscleTop: '하체', sets: [{ weight: '60', reps: '8' }] }], bodyWeight, trainerComment: '' });
  return { store, sessionDocs };
}

const results = [];
const keepAlive = setInterval(() => {}, 1000);
async function test(name, fn) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('3초 안에 끝나지 않음(무한 대기)')), 3000); });
  try { await Promise.race([fn(), limit]); results.push([name, true]); }
  catch (e) { results.push([name, false, e]); }
  finally { clearTimeout(timer); }
}
const FIVE_DATES = FIVE.map(x => x[0]);
const EXPECTED_TESTS = 26;

(async () => {
  // ── 수업일지 체중 동기화: 화면 bodyData 상태별 ──
  await test('[수업일지] bodyData 정상 로드 상태 + 9/15 체중 → 기존 5건 보존 + 9/15 1건 추가', async () => {
    const w = makeWorld();
    const loaded = await w.d.getBodyCheck(MID);
    const { store } = await runSessionSave(w, { bodyData: loaded });
    await sleep(40);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15']);
    assert.deepStrictEqual(w.weightOn('2026-09-15'), [78.9]);
    assert.strictEqual(store.screen, 'hub');
    assert.strictEqual(store.bodyData.records.length, 6);
  });

  for (const [label, bodyData] of [
    ['null(조회 실패·미로드)', null],
    ['undefined(초기 state)', undefined],
    ['빈 배열 {records:[]}', { goal: {}, records: [], inbody: [] }],
    ['일부만 로드(2건)', { goal: { targetWeight: '72', currentWeight: '80' }, records: seedRecords(FIVE.slice(0, 2)), inbody: [] }],
  ]) {
    await test(`[수업일지] bodyData ${label} 상태에서 9/15 체중 저장 → Firestore 기존 5건·목표(goal)가 사라지지 않는다`, async () => {
      const w = makeWorld();
      await runSessionSave(w, { bodyData });
      await sleep(40);
      assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15']);
      assert.deepStrictEqual(w.body().goal, { targetWeight: '72', currentWeight: '80' });
    });
  }

  await test('[수업일지] 실제 getBodyCheck 조회 실패(null 반환) → 그 상태로 수업일지+체중 저장해도 기존 기록 보존', async () => {
    const w = makeWorld();
    w.fake.hooks.failGet = 'bodyCheck';
    const loaded = await w.d.getBodyCheck(MID); // 실패를 삼키고 null을 돌려준다
    assert.strictEqual(loaded, null);
    w.fake.hooks.failGet = null;
    await runSessionSave(w, { bodyData: loaded });
    await sleep(40);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15']);
  });

  await test('[수업일지] 같은 날짜 다시 입력 → 날짜 기준 upsert(중복 없이 값만 갱신, 기존 필드 유지)', async () => {
    const w = makeWorld({ records: [...seedRecords(FIVE), { id: 'member_2026-09-15', date: '2026-09-15', weight: 79.0, note: '회원앱 직접 입력' }] });
    const loaded = await w.d.getBodyCheck(MID);
    await runSessionSave(w, { bodyData: loaded, bodyWeight: '78.9' });
    await sleep(40);
    assert.deepStrictEqual(w.weightOn('2026-09-15'), [78.9]);
    assert.strictEqual(w.body().records.filter(r => r.date === '2026-09-15')[0].note, '회원앱 직접 입력');
    assert.strictEqual(w.body().records.length, 6);
  });

  // ── 동시성 ──
  await test('[Case A] 관리자 로드 후 회원앱이 9/15 체중 입력 → 관리자가 stale bodyData로 수업일지 9/16 체중 저장 → 회원 기록 보존', async () => {
    const w = makeWorld();
    const adminLoaded = await w.d.getBodyCheck(MID);
    await w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    await runSessionSave(w, { bodyData: adminLoaded, date: '2026-09-16', bodyWeight: '78.8' });
    await sleep(40);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15', '2026-09-16']);
  });

  await test('[Case A-같은날] stale 관리자가 회원이 방금 입력한 같은 날짜(9/15)에 체중 저장 → 1건만 남고(중복 없음) 나중 저장값, 다른 날짜 보존', async () => {
    const w = makeWorld();
    const adminLoaded = await w.d.getBodyCheck(MID);
    await w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    await runSessionSave(w, { bodyData: adminLoaded, date: '2026-09-15', bodyWeight: '78.9' });
    await sleep(40);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15']);
    assert.deepStrictEqual(w.weightOn('2026-09-15'), [78.9]);
  });

  await test('[Case B] 관리자 두 기기: A가 바디체크에 9/15 추가 → 오래된 화면의 B가 9/16 추가 → 둘 다 보존', async () => {
    const w = makeWorld();
    const a = await w.d.getBodyCheck(MID);
    const b = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckSaveRecord(a, { date: '2026-09-15', weight: '79.0' }), a);
    await adminSave(w, screens.bodyCheckSaveRecord(b, { date: '2026-09-16', weight: '78.8' }), b);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15', '2026-09-16']);
  });

  await test('[Case B-삭제] 한쪽이 9/12 삭제 후, 오래된 화면(9/12 포함)이 9/16 추가 → 삭제된 9/12가 되살아나지 않는다', async () => {
    const w = makeWorld();
    const a = await w.d.getBodyCheck(MID);
    const b = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckDeleteRecord(a, 'seed_2026-09-12'), a);
    await adminSave(w, screens.bodyCheckSaveRecord(b, { date: '2026-09-16', weight: '78.8' }), b);
    assert.deepStrictEqual(w.dates(), ['2026-09-10', '2026-09-11', '2026-09-13', '2026-09-14', '2026-09-16']);
  });

  await test('[동시 쓰기] 관리자 저장이 읽은 뒤 커밋 직전에 회원앱이 다른 날짜를 기록 → 재시도로 두 기록 모두 보존', async () => {
    const w = makeWorld();
    const base = await w.d.getBodyCheck(MID);
    w.fake.hooks.beforeTxCommit = () => w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    await adminSave(w, screens.bodyCheckSaveRecord(base, { date: '2026-09-16', weight: '78.8' }), base);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15', '2026-09-16']);
  });

  await test('[동시 쓰기-같은 날짜] 두 곳이 같은 날짜(9/15)를 동시에 다른 값으로 저장 → 9/15는 정확히 1건(나중 커밋 값), 나머지 손상 없음', async () => {
    const w = makeWorld();
    const base = await w.d.getBodyCheck(MID);
    w.fake.hooks.beforeTxCommit = () => w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    await adminSave(w, screens.bodyCheckSaveRecord(base, { date: '2026-09-15', weight: '78.7' }), base);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15']);
    assert.strictEqual(w.weightOn('2026-09-15').length, 1);
    assert.ok([79.0, 78.7].includes(w.weightOn('2026-09-15')[0]));
  });

  await test('[회원앱 동시 쓰기] 회원앱 체중 저장이 읽은 뒤 커밋 직전에 관리자가 다른 날짜를 기록 → 관리자 기록도 보존', async () => {
    const w = makeWorld();
    const base = await w.d.getBodyCheck(MID);
    w.fake.hooks.beforeTxCommit = () => w.asTrainer(() => adminSave(w, screens.bodyCheckSaveRecord(base, { date: '2026-09-16', weight: '78.8' }), base));
    await w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15', '2026-09-16']);
  });

  // ── 관리자 바디체크/건강 기록 화면 기능 유지 ──
  await test('[관리자] 기존 10건 + 오늘 체중 신규 추가(바디체크 기록 저장) → 11건', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, Math.round((81 - i * 0.2) * 10) / 10]);
    const w = makeWorld({ records: seedRecords(ten) });
    const base = await w.d.getBodyCheck(MID);
    const saved = await adminSave(w, screens.bodyCheckSaveRecord(base, { date: '2026-09-15', weight: '78.9' }), base);
    assert.strictEqual(w.body().records.length, 11);
    assert.strictEqual(saved.records.length, 11);
  });

  await test('[관리자] 과거 날짜(9/11) 체중 수정 → 같은 건 값만 바뀌고 건수 동일', async () => {
    const w = makeWorld();
    const base = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckSaveRecord(base, { date: '2026-09-11', weight: '79.6' }), base);
    assert.deepStrictEqual(w.dates(), FIVE_DATES);
    assert.deepStrictEqual(w.weightOn('2026-09-11'), [79.6]);
  });

  await test('[관리자] 기록 삭제 → 해당 건만 삭제, 건강 기록 탭(날짜 교체 방식) 입력도 중복 없이 교체', async () => {
    const w = makeWorld();
    let base = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckDeleteRecord(base, 'seed_2026-09-13'), base);
    assert.deepStrictEqual(w.dates(), ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14']);
    base = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.healthRecordTab(base, '2026-09-14', '78.0'), base);
    assert.deepStrictEqual(w.dates(), ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14']);
    assert.deepStrictEqual(w.weightOn('2026-09-14'), [78]);
  });

  await test('[관리자] 목표 저장·인바디 저장 유지 + 회원앱이 쓴 bodyCheck 최상위 필드(currentWeight·targetWeightKg)를 지우지 않음', async () => {
    const w = makeWorld({ extra: { currentWeight: 79.1, weight: 79.1, targetWeightKg: 72, targetWeight: 72 } });
    let base = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckSaveGoal(base, { currentWeight: '79', targetWeight: '70', targetDate: '2026-12-31', gender: '남성', age: '35', height: '175', activityLevel: '보통' }), base);
    assert.deepStrictEqual(w.body().goal, { currentWeight: '79', targetWeight: '70', targetDate: '2026-12-31', gender: '남성', age: '35', height: '175', activityLevel: '보통' });
    base = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckSaveInbody(base, { date: '2026-09-15', weight: '78.9', bodyFat: '20', muscleMass: '35', memo: '' }), base);
    assert.strictEqual(w.body().inbody.length, 1);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15']);
    assert.strictEqual(w.body().currentWeight, 79.1);
    assert.strictEqual(w.body().targetWeightKg, 72);
  });

  // ── 회원앱 체중 경로 기능 유지 ──
  await test('[회원앱] 건강 탭 체중 입력(같은 날 재입력 upsert)·프로필 현재 체중 수정·날짜 기록 삭제가 기존대로 동작', async () => {
    const w = makeWorld();
    await w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    await w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '78.9' }));
    assert.deepStrictEqual(w.weightOn('2026-09-15'), [78.9]);
    assert.strictEqual(w.body().records.length, 6);
    const today = new Date().toISOString().slice(0, 10);
    await w.asMember(() => w.d.saveMemberProfileFields(MID, { currentWeight: '78.5', targetWeightKg: '72' }, { skipActivity: true }));
    assert.deepStrictEqual(w.weightOn(today), [78.5]);
    assert.strictEqual(w.body().targetWeightKg, 72);
    await w.asMember(() => w.d.deleteMemberHealthRecord(MID, '2026-09-15'));
    assert.ok(!w.dates().includes('2026-09-15'));
    assert.ok(FIVE_DATES.every(dt => w.dates().includes(dt)));
  });

  // ── 실패/지연 UX ──
  await test('[실패] 체중 동기화 write 실패 → 수업일지는 저장 완료 유지, 체중 실패를 별도 안내, 기존 체중 기록 그대로', async () => {
    const w = makeWorld();
    const loaded = await w.d.getBodyCheck(MID);
    w.fake.hooks.failWrite = 'bodyCheck';
    const { store, sessionDocs } = await runSessionSave(w, { bodyData: loaded });
    await sleep(60);
    assert.strictEqual(sessionDocs.size, 1);
    assert.strictEqual([...sessionDocs.values()][0].bodyWeight, '78.9');
    assert.strictEqual(store.screen, 'hub');
    assert.strictEqual(store.loading, false);
    assert.deepStrictEqual(store.toasts[0], ['ok', '수업 저장 완료 ✓']);
    assert.ok(store.toasts.some(([t, m]) => t === 'err' && /체중/.test(m) && /실패/.test(m)), JSON.stringify(store.toasts));
    assert.deepStrictEqual(w.dates(), FIVE_DATES);
    assert.strictEqual(store.bodyData.records.length, 5); // 실패했는데 화면에 반영된 것처럼 보이지 않음
  });

  await test('[지연] 체중 동기화 무응답 → 수업일지 저장·로딩 해제는 즉시, 일정 시간 뒤 "지연" 안내(무한 로딩 없음)', async () => {
    const w = makeWorld();
    const loaded = await w.d.getBodyCheck(MID);
    w.fake.hooks.hangWrite = 'bodyCheck';
    const { store } = await runSessionSave(w, { bodyData: loaded });
    assert.strictEqual(store.loading, false);
    assert.strictEqual(store.screen, 'hub');
    await sleep(400); // 앱 기준 20초 × 0.01
    assert.ok(store.toasts.some(([t, m]) => t === 'err' && /체중/.test(m) && /지연/.test(m)), JSON.stringify(store.toasts));
  });

  // ── 파생 계산 ──
  await test('[계산] 병합 저장 뒤 체중 그래프 입력(getBodyWeightRecords)·최근 체중·변화량·목표 방향 판정이 기대값', async () => {
    const w = makeWorld();
    await runSessionSave(w, { bodyData: null });
    await sleep(40);
    const saved = await w.d.getBodyCheck(MID);
    const rows = weightLib.getBodyWeightRecords(saved);
    assert.deepStrictEqual(rows.map(r => r.date), [...FIVE_DATES, '2026-09-15']);
    assert.strictEqual(weightLib.getLatestBodyWeight(saved).weight, 78.9);
    const prog = weightLib.getWeightProgress(saved);
    assert.strictEqual(prog.firstWeight, 80);
    assert.strictEqual(prog.latestWeight, 78.9);
    assert.strictEqual(prog.change, -1.1);
    assert.strictEqual(prog.recordCount, 6);
    const st = weightLib.buildGoalWeightState('diet', rows);
    assert.strictEqual(st.records, 6);
    assert.strictEqual(st.lastWeight, 78.9);
    assert.strictEqual(saved.goal.targetWeight, '72');
  });

  await test('[저장 결과] saveBodyCheck 반환값은 Firestore 최종 상태와 같다(화면 state를 최신 병합 결과로 교체)', async () => {
    const w = makeWorld();
    const stale = await w.d.getBodyCheck(MID);
    await w.asMember(() => w.d.saveMemberHealthInputs(MID, '2026-09-15', { weight: '79.0' }));
    const saved = await adminSave(w, screens.bodyCheckSaveRecord(stale, { date: '2026-09-16', weight: '78.8' }), stale);
    const fresh = await w.d.getBodyCheck(MID);
    assert.deepStrictEqual(saved.records.map(r => r.date).sort(), fresh.records.map(r => r.date).sort());
    assert.deepStrictEqual(saved.goal, fresh.goal);
  });

  await test('[id 충돌] 다른 기기가 같은 id("r"+같은 밀리초)로 다른 날짜 기록을 먼저 저장 → 이 화면이 모르던 기록은 합치지 않고 둘 다 보존', async () => {
    const w = makeWorld();
    const a = await w.d.getBodyCheck(MID);
    const b = await w.d.getBodyCheck(MID);
    await adminSave(w, { ...a, records: [...a.records, { id: 'r1757900000000', date: '2026-09-15', weight: '79.0' }] }, a);
    await adminSave(w, { ...b, records: [...b.records, { id: 'r1757900000000', date: '2026-09-16', weight: '78.8' }] }, b);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15', '2026-09-16']);
  });

  await test('[인바디] 오래된 화면 두 곳이 각각 인바디를 추가 → 두 인바디와 각 날짜 체중 기록 모두 보존', async () => {
    const w = makeWorld();
    const a = await w.d.getBodyCheck(MID);
    const b = await w.d.getBodyCheck(MID);
    await adminSave(w, screens.bodyCheckSaveInbody(a, { id: 'i_a', date: '2026-09-15', weight: '79.0', bodyFat: '21', muscleMass: '35', memo: '' }), a);
    await adminSave(w, screens.bodyCheckSaveInbody(b, { id: 'i_b', date: '2026-09-16', weight: '78.8', bodyFat: '20.8', muscleMass: '35.1', memo: '' }), b);
    assert.deepStrictEqual(w.body().inbody.map(x => x.date).sort(), ['2026-09-15', '2026-09-16']);
    assert.deepStrictEqual(w.dates(), [...FIVE_DATES, '2026-09-15', '2026-09-16']);
  });

  await test('[회원 등록] 새 회원 초기 체중(base 없음, 문서 없음) 생성은 기존대로 1건', async () => {
    const w = makeWorld();
    w.fake.docs.delete(BODY);
    await w.d.saveBodyCheck(MID, { goal: { targetWeight: '70' }, records: [{ id: 'r_init_m1', date: '2026-09-01', weight: '82', bodyFat: null, muscleMass: null, memo: '등록 시 입력 체중' }] });
    assert.deepStrictEqual(w.dates(), ['2026-09-01']);
    assert.strictEqual(w.body().goal.targetWeight, '70');
    assert.deepStrictEqual(w.body().inbody, []);
  });

  let bad = 0;
  for (const [name, ok, err] of results) {
    if (ok) console.log(`PASS ${name}`);
    else { bad += 1; console.error(`FAIL ${name}\n  ${err && (err.message || err)}`.slice(0, 900)); }
  }
  if (results.length !== EXPECTED_TESTS) { bad += 1; console.error(`FAIL 실행된 테스트 수 ${results.length} ≠ ${EXPECTED_TESTS}`); }
  clearInterval(keepAlive);
  process.exit(bad ? 1 : 0);
})();
