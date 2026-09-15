// 관리자앱 수업일지 저장·회원 전송 흐름 동작 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/session-save-publish-flow.test.js)
//
// App.jsx 원본의 handleSaveSession / applySingleSessionChange / handlePublishSession 등을 그대로 슬라이스해
// 가짜 Firestore(지연·실패·무응답 주입 가능)와 가짜 React state 위에서 실제로 실행한다.
// 확인 범위:
//   · 저장·전송 성공 뒤 getSessions(전체 + 세션마다 memberFeedback 조회, N+1)를 다시 부르지 않는다
//   · 핵심 write가 끝나면 후속 동기화(lastSession·PT 잔여·체중)를 기다리지 않고 로딩이 풀린다
//   · 모든 실패/무응답 경로에서 loading이 해제되고, 성공을 실패로·실패를 성공으로 표시하지 않는다
//   · 같은 대상 연속 호출은 write를 한 번만 만든다
//   · 1:1 / 2:1 / 기능운동 / RPE / 이중 중량 payload가 가공 없이 그대로 저장된다
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.jsx'), 'utf8');
function slice(start, end) {
  const si = APP.indexOf(start), ei = APP.indexOf(end, si);
  if (si < 0 || ei < 0) { console.error('slice 경계 실패', start, si, ei); process.exit(1); }
  if (APP.indexOf(start, si + 1) !== -1) { console.error('시작 마커가 2회 이상 등장', start); process.exit(1); }
  return APP.slice(si, ei);
}
const src = [
  slice('function withTimeout(promise, ms = 20000', 'const STIM_RATING_OPTIONS'),
  slice('async function handleSaveSession(d) {', 'function resumeDraft2_1('),
  slice('async function refreshSessionsForMember(memberId) {', '// ── PT 잔여 캐시 동기화 (공용)'),
  slice('async function syncPtBalanceAfterSessionChange(memberId, freshSessions) {', 'async function handleUnpublishSession(s) {'),
].join('\n');
// eslint-disable-next-line no-new-func
const factory = new Function('env', `with (env) {\n${src}\nreturn { handleSaveSession, handlePublishSession };\n}`);

const TIME_SCALE = 0.01; // 앱의 20초/15초/10초 상한을 200/150/100ms로 축소해 실행
const RTT = 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const flush = () => sleep(60);

function sortBySessionNo(list) {
  return [...list].sort((a, b) => (a.sessionNo - b.sessionNo) || (a.id < b.id ? -1 : 1));
}
const FB = { s2: { id: 'uid-m1', source: 'memberApp', rpe: 7, sorenessLevel: '약간' } };

function makeWorld({ sessions = [], memberDataLoaded = true, fail = {}, hang = {}, online = true } = {}) {
  let seq = 0;
  const docs = new Map(sessions.map(s => [s.id, { ...s }]));
  const calls = { addSession: 0, updateSession: 0, getSession: 0, getSessions: 0, publishSession: 0, updateMember: 0, saveBodyCheck: 0, syncPtBalanceCache: 0, getSessionsReads: 0 };
  const args = { addSession: [], updateSession: [], updateMember: [], syncPt: [] };
  const done = { updateMember: 0, saveBodyCheck: 0, syncPtBalanceCache: 0 };
  const hook = {}; // 테스트가 특정 호출 도중 끼어들 때 사용
  async function step(name) {
    calls[name] += 1;
    if (hook[name]) hook[name]();
    if (hang[name]) return new Promise(() => {});
    await sleep(RTT);
    if (fail[name]) { const e = new Error(fail[name]); e.code = 'unavailable'; throw e; }
  }
  const withFeedback = (id, d) => ({ ...d, id, memberFeedback: FB[id] || null, memberFeedbackList: FB[id] ? [FB[id]] : [] });
  const db = {
    addSession: async (mid, data) => { await step('addSession'); args.addSession.push([mid, data]); const id = `new${++seq}`; docs.set(id, { ...data, status: data.status || 'draft', isPublished: data.isPublished === true, publishedAt: data.publishedAt || null, createdAt: { server: true } }); return { id, ...data }; },
    updateSession: async (mid, sid, data) => { await step('updateSession'); args.updateSession.push([mid, sid, data]); docs.set(sid, { ...docs.get(sid), ...data }); },
    getSession: async (mid, sid) => { await step('getSession'); const d = docs.get(sid); return d ? { ...d, id: sid } : null; },
    getSessions: async () => { await step('getSessions'); calls.getSessionsReads += 1 + docs.size; return sortBySessionNo([...docs].map(([id, d]) => withFeedback(id, d))); },
    publishSession: async (mid, sid) => { await step('publishSession'); const d = docs.get(sid); docs.set(sid, { ...d, status: 'published', isPublished: true, publishedAt: { server: 'pub' }, completedAt: d.completedAt || { server: 'pub' }, journalSendDeferred: false }); },
    updateMember: async (id, patch) => { await step('updateMember'); args.updateMember.push(patch); done.updateMember += 1; },
    saveBodyCheck: async (id, bd) => { await step('saveBodyCheck'); done.saveBodyCheck += 1; return bd; },
    syncPtBalanceCache: async (id, opts) => { await step('syncPtBalanceCache'); args.syncPt.push(opts.sessions); done.syncPtBalanceCache += 1; return null; },
  };
  const store = {
    loading: false, screen: 'session', editSess: null, bodyData: { goal: {}, records: [], inbody: [] },
    sessions: sortBySessionNo([...docs].map(([id, d]) => withFeedback(id, d))),
    sessionsMap: {}, members: [{ id: 'm1', name: '회원A' }], toasts: [], warns: [], memberDataLoaded,
  };
  const refs = { memberDataReqIdRef: { current: 0 }, sessionSaveInFlightRef: { current: null }, sessionPublishInFlightRef: { current: new Map() } };
  function render() {
    return factory({
      member: { id: 'm1', name: '회원A' },
      editSess: store.editSess, sessions: store.sessions, memberDataLoaded: store.memberDataLoaded, bodyData: store.bodyData, ptRegistrations: [],
      ...refs, ...db,
      setLoading: v => { store.loading = v; },
      showToast: (m, t) => store.toasts.push([t || 'ok', m]),
      setEditSess: v => { store.editSess = v; },
      setScreen: v => { store.screen = v; },
      setSessions: v => { store.sessions = typeof v === 'function' ? v(store.sessions) : v; },
      setSessionsMap: f => { store.sessionsMap = typeof f === 'function' ? f(store.sessionsMap) : f; },
      setMembers: f => { store.members = f(store.members); },
      setMember: () => {},
      setBodyData: v => { store.bodyData = v; },
      setTimeout: (fn, ms) => setTimeout(fn, ms * TIME_SCALE),
      navigator: { onLine: online },
      console: { log() {}, error() {}, warn: (...a) => store.warns.push(a.join(' ')) },
    });
  }
  return { docs, calls, args, done, hook, store, refs, render };
}

const today = new Date().toISOString().split('T')[0];
const baseSessions = () => [
  { id: 's1', sessionNo: 1, date: '2026-09-01', status: 'published', isPublished: true, publishedAt: 't1', completedAt: 't1', exercises: [{ name: '벤치프레스', muscleTop: '가슴', sets: [{ weight: '40', reps: '10' }] }] },
  { id: 's2', sessionNo: 2, date: '2026-09-03', status: 'published', isPublished: true, publishedAt: 't2', completedAt: 't2', exercises: [{ name: '랫풀다운', muscleTop: '등', sets: [{ weight: '30', reps: '12' }] }] },
  { id: 's3', sessionNo: 3, date: '2026-09-05', status: 'draft', isPublished: false, publishedAt: null, exercises: [{ name: '스쿼트', muscleTop: '하체', sets: [{ weight: '60', reps: '8' }] }] },
];
const set = (w, r, extra = {}) => ({ weight: String(w), reps: String(r), durationSec: '', volume: w * r, ...extra });
const richPayload = (over = {}) => ({
  memberName: '회원A', memberId: 'm1', trainerName: '대표', gymName: 'TEO GYM', date: today, sessionNo: 4,
  programType: '일반 PT', status: 'draft', isPublished: false, publishedAt: null,
  type: '가슴 · 기능', selectedTypes: ['가슴', '기능'], intensity: '중', condition: '좋음', sessionType: '1:1', linkedMemberId: null,
  exercises: [
    { name: '벤치프레스', muscleTop: '가슴', muscleSub: '윗가슴', equipment: '바벨', unitType: 'kg', stimRating: 4, sets: [set(40, 10, { rpe: 7 }), set(45, 8, { rpe: 8 }), set(50, 6, { rpe: 9 })] },
    { name: '인클라인 덤벨 프레스', muscleTop: '가슴', equipment: '덤벨', unitType: 'kg', sets: [set(14, 12), set(16, 10), set(16, 10), set(18, 8)] },
    { name: '하프닐링 케이블 로우 DB 프레스', muscleTop: '어깨', equipment: '케이블', unitType: 'kg', sets: [set(10, 12, { dbWeight: '8' }), set(12, 10, { dbWeight: '8' })] },
    { name: '데드버그', muscleTop: '기능', movementPurpose: '코어 안정화', funcCategory: '코어', funcBodyPart: ['복부'], funcTool: '매트', sets: [{ weight: '', reps: '10', durationSec: '30', volume: 0, recordType: 'function' }] },
  ],
  stretchingNotes: '', nextPlan: '', trainerComment: '좋았어요', trainerOnlyNote: '', cardio: null, bodyWeight: '70.5', totalVolume: 1234,
  ...over,
});

const results = [];
// 핸들러가 영원히 끝나지 않으면(=무한 로딩) 이벤트 루프가 비어 Node가 조용히 exit 0으로 끝날 수 있으므로
// keepalive 타이머와 테스트별 상한(실제 시간 3초)으로 "끝나지 않음"을 명시적 실패로 만든다.
const keepAlive = setInterval(() => {}, 1000);
async function test(name, fn) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('3초 안에 끝나지 않음(무한 대기)')), 3000); });
  try { await Promise.race([fn(), limit]); results.push([name, true]); }
  catch (e) { results.push([name, false, e]); }
  finally { clearTimeout(timer); }
}
const EXPECTED_TESTS = 19;

(async () => {
  await test('1:1 새 수업일지 저장: addSession 1회 + getSession 1회만, getSessions(N+1) 0회, 곧바로 회원 상세로 이동·로딩 해제', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    const h = w.render();
    await h.handleSaveSession(richPayload());
    assert.strictEqual(w.calls.addSession, 1);
    assert.strictEqual(w.calls.getSessions, 0);
    assert.strictEqual(w.calls.getSession, 1);
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.store.screen, 'hub');
    assert.deepStrictEqual(w.store.toasts, [['ok', '수업 저장 완료 ✓']]);
    assert.deepStrictEqual(w.store.sessions.map(s => s.id), ['s1', 's2', 's3', 'new1']);
    const saved = w.store.sessions[3];
    assert.strictEqual(saved.memberFeedback, null);
    assert.deepStrictEqual(saved.memberFeedbackList, []);
    assert.deepStrictEqual(saved.createdAt, { server: true }); // 서버에서 다시 읽은 값으로 반영
    assert.strictEqual(w.store.sessionsMap.m1, w.store.sessions);
    await flush();
    assert.strictEqual(w.done.updateMember, 1);
    assert.deepStrictEqual(w.args.updateMember[0], { lastSessionDate: today, lastSessionParts: ['가슴', '어깨', '기능'], lastSessionNo: 4 });
    assert.strictEqual(w.done.saveBodyCheck, 1);
    assert.strictEqual(w.done.syncPtBalanceCache, 1);
    assert.strictEqual(w.args.syncPt[0].length, 4);
    const m = w.store.members[0];
    assert.strictEqual(m._todaySession, true);
    assert.strictEqual(w.store.bodyData.records[0].weight, '70.5');
  });

  await test('여러 운동·여러 세트 + 기능운동 + RPE·자극도·이중 중량(dbWeight) payload가 가공 없이 그대로 저장된다', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    const d = richPayload();
    await w.render().handleSaveSession(d);
    const [mid, data] = w.args.addSession[0];
    assert.strictEqual(mid, 'm1');
    const { updatedAt, createdAt, ...rest } = data;
    assert.ok(updatedAt && createdAt && updatedAt === createdAt);
    assert.deepStrictEqual(rest, d);
    assert.deepStrictEqual(w.store.sessions.find(s => s.id === 'new1').exercises, d.exercises);
  });

  await test('기존 수업일지 수정 후 재저장: updateSession(기존 id) 1회, addSession 0회, 회원 피드백(memberFeedback)·목록 순서 유지', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    w.store.editSess = w.store.sessions.find(s => s.id === 's2');
    const d = richPayload({ sessionNo: 2, date: '2026-09-03', status: 'published', isPublished: true, publishedAt: 't2', trainerComment: '수정됨' });
    await w.render().handleSaveSession(d);
    assert.strictEqual(w.calls.addSession, 0);
    assert.strictEqual(w.calls.updateSession, 1);
    assert.strictEqual(w.args.updateSession[0][1], 's2');
    assert.strictEqual(w.calls.getSessions, 0);
    assert.deepStrictEqual(w.store.sessions.map(s => s.id), ['s1', 's2', 's3']);
    const s2 = w.store.sessions[1];
    assert.strictEqual(s2.trainerComment, '수정됨');
    assert.deepStrictEqual(s2.memberFeedback, FB.s2);
    assert.deepStrictEqual(s2.memberFeedbackList, [FB.s2]);
    assert.strictEqual(s2.completedAt, 't2'); // 저장이 건드리지 않은 서버 필드 유지
    assert.strictEqual(w.store.editSess, null);
    assert.deepStrictEqual(w.store.toasts, [['ok', '수업 수정 완료 ✓']]);
  });

  await test('수정 저장으로 회차가 바뀌면 getSessions와 같은 sessionNo 오름차순으로 다시 정렬된다', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    w.store.editSess = w.store.sessions.find(s => s.id === 's1');
    await w.render().handleSaveSession(richPayload({ sessionNo: 9, date: '2026-09-01' }));
    assert.deepStrictEqual(w.store.sessions.map(s => s.id), ['s2', 's3', 's1']);
  });

  await test('이미 저장된 수업일지 전송: publishSession 1회 + getSession 1회, getSessions 0회, 전송 완료 후 로딩 해제·피드백 유지·PT 잔여는 서버 값으로 동기화', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    w.store.screen = 'hub';
    await w.render().handlePublishSession(w.store.sessions[2]);
    assert.strictEqual(w.calls.publishSession, 1);
    assert.strictEqual(w.calls.getSessions, 0);
    assert.strictEqual(w.calls.getSession, 1);
    assert.strictEqual(w.store.loading, false);
    assert.deepStrictEqual(w.store.toasts, [['ok', '회원에게 전송 완료 ✓']]);
    const s3 = w.store.sessions.find(s => s.id === 's3');
    assert.strictEqual(s3.isPublished, true);
    assert.strictEqual(s3.status, 'published');
    assert.deepStrictEqual(s3.completedAt, { server: 'pub' });
    assert.deepStrictEqual(w.store.sessions.find(s => s.id === 's2').memberFeedback, FB.s2);
    await flush();
    assert.strictEqual(w.done.syncPtBalanceCache, 1);
    assert.strictEqual(w.args.syncPt[0].find(s => s.id === 's3').isPublished, true);
  });

  await test('저장 직후 회원에게 전송: 저장 결과 목록 위에서 새 문서가 전송되고 전체 재조회는 한 번도 없다', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    await w.render().handleSaveSession(richPayload());
    const created = w.store.sessions.find(s => s.id === 'new1');
    await w.render().handlePublishSession(created);
    assert.strictEqual(w.calls.getSessions, 0);
    assert.strictEqual(w.store.sessions.find(s => s.id === 'new1').isPublished, true);
    assert.strictEqual(w.store.sessions.length, 4);
    assert.strictEqual(w.store.loading, false);
  });

  await test('후속 동기화(lastSession·체중·PT 잔여)가 응답 없이 멈춰도 저장은 완료 처리되고 로딩이 풀린다', async () => {
    const w = makeWorld({ sessions: baseSessions(), hang: { updateMember: true, saveBodyCheck: true, syncPtBalanceCache: true } });
    await w.render().handleSaveSession(richPayload());
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.store.screen, 'hub');
    assert.deepStrictEqual(w.store.toasts, [['ok', '수업 저장 완료 ✓']]);
    await flush();
    assert.strictEqual(w.calls.updateMember, 1); // 시작은 됐고(병렬), 완료를 기다리지 않았다
    assert.strictEqual(w.calls.saveBodyCheck, 1);
    assert.strictEqual(w.calls.syncPtBalanceCache, 1);
  });

  await test('전송 후 PT 잔여 동기화가 멈춰도 전송 완료 처리·로딩 해제', async () => {
    const w = makeWorld({ sessions: baseSessions(), hang: { syncPtBalanceCache: true } });
    await w.render().handlePublishSession(w.store.sessions[2]);
    assert.strictEqual(w.store.loading, false);
    assert.deepStrictEqual(w.store.toasts, [['ok', '회원에게 전송 완료 ✓']]);
  });

  await test('저장 버튼 빠른 연속 클릭(같은 렌더에서 두 번 호출): 저장 write는 1회만 발생', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    const h = w.render();
    const d = richPayload();
    await Promise.all([h.handleSaveSession(d), h.handleSaveSession(d), h.handleSaveSession(d)]);
    assert.strictEqual(w.calls.addSession, 1);
    assert.strictEqual(w.store.sessions.length, 4);
    assert.strictEqual(w.refs.sessionSaveInFlightRef.current, null);
    // 끝난 뒤에는 다시 저장할 수 있다
    await w.render().handleSaveSession(richPayload({ sessionNo: 5 }));
    assert.strictEqual(w.calls.addSession, 2);
  });

  await test('전송 버튼 빠른 연속 클릭: 같은 수업은 publishSession 1회만, 다른 수업은 각각 전송', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    const h = w.render();
    const s3 = w.store.sessions[2];
    await Promise.all([h.handlePublishSession(s3), h.handlePublishSession(s3)]);
    assert.strictEqual(w.calls.publishSession, 1);
    assert.strictEqual(w.refs.sessionPublishInFlightRef.current.size, 0);
    const w2 = makeWorld({ sessions: baseSessions() });
    const h2 = w2.render();
    await Promise.all([h2.handlePublishSession(w2.store.sessions[1]), h2.handlePublishSession(w2.store.sessions[2])]);
    assert.strictEqual(w2.calls.publishSession, 2);
  });

  await test('Firestore 저장 오류: 실패 토스트, 로딩 해제, 작성 화면 유지(입력 보존), 후속 조회·write 없음', async () => {
    const w = makeWorld({ sessions: baseSessions(), fail: { addSession: 'permission-denied' } });
    await w.render().handleSaveSession(richPayload());
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.store.screen, 'session');
    assert.deepStrictEqual(w.store.toasts, [['err', 'permission-denied']]);
    assert.strictEqual(w.calls.getSession + w.calls.getSessions + w.calls.updateMember, 0);
    assert.strictEqual(w.store.sessions.length, 3);
  });

  await test('Firestore 전송 오류: 호출부 재시도 UI를 위해 throw, 로딩 해제, 목록은 미공개 그대로', async () => {
    const w = makeWorld({ sessions: baseSessions(), fail: { publishSession: 'unavailable' } });
    await assert.rejects(() => w.render().handlePublishSession(w.store.sessions[2]), /unavailable/);
    assert.strictEqual(w.store.loading, false);
    assert.deepStrictEqual(w.store.toasts, [['err', 'unavailable']]);
    assert.strictEqual(w.store.sessions[2].isPublished, false);
    assert.strictEqual(w.refs.sessionPublishInFlightRef.current.size, 0); // 실패 뒤 다시 전송 가능
  });

  await test('네트워크 무응답(핵심 write가 영영 안 끝남): 저장·전송 모두 상한 뒤 실패 안내 + 로딩 해제(무한 로딩 없음)', async () => {
    const w = makeWorld({ sessions: baseSessions(), hang: { addSession: true } });
    await w.render().handleSaveSession(richPayload());
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.store.toasts[0][0], 'err');
    assert.match(w.store.toasts[0][1], /저장이 지연되고 있습니다/);
    const w2 = makeWorld({ sessions: baseSessions(), hang: { publishSession: true } });
    await assert.rejects(() => w2.render().handlePublishSession(w2.store.sessions[2]), /전송이 지연되고 있습니다/);
    assert.strictEqual(w2.store.loading, false);
  });

  await test('저장 성공 뒤 단건 확인 읽기 실패: 실패로 뒤집지 않고(성공 토스트만) 방금 쓴 값으로 목록 반영, 추정 목록으로 PT 잔여 캐시는 쓰지 않음', async () => {
    const w = makeWorld({ sessions: baseSessions(), fail: { getSession: 'unavailable' } });
    await w.render().handleSaveSession(richPayload());
    assert.deepStrictEqual(w.store.toasts, [['ok', '수업 저장 완료 ✓']]);
    assert.strictEqual(w.store.screen, 'hub');
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.store.sessions.find(s => s.id === 'new1').trainerComment, '좋았어요');
    await flush();
    assert.strictEqual(w.calls.syncPtBalanceCache, 0);
    assert.strictEqual(w.calls.updateMember, 1); // 날짜·회차·부위는 방금 쓴 값이라 정확
  });

  await test('단건 확인 읽기가 멈춰도 상한 뒤 방금 쓴 값으로 반영하고 로딩 해제(전송도 동일, 성공 유지)', async () => {
    const w = makeWorld({ sessions: baseSessions(), hang: { getSession: true } });
    await w.render().handleSaveSession(richPayload());
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.store.screen, 'hub');
    const w2 = makeWorld({ sessions: baseSessions(), hang: { getSession: true } });
    await w2.render().handlePublishSession(w2.store.sessions[2]);
    assert.strictEqual(w2.store.loading, false);
    assert.deepStrictEqual(w2.store.toasts, [['ok', '회원에게 전송 완료 ✓']]);
    assert.strictEqual(w2.store.sessions[2].isPublished, true);
    await flush();
    assert.strictEqual(w2.calls.syncPtBalanceCache, 0);
  });

  await test('회원 상세 데이터를 아직 다 못 읽은 상태(memberDataLoaded=false)에서 저장하면 빈 목록에 끼워 넣지 않고 기존처럼 전체 재조회', async () => {
    const w = makeWorld({ sessions: baseSessions(), memberDataLoaded: false });
    w.store.sessions = [];
    await w.render().handleSaveSession(richPayload());
    assert.strictEqual(w.calls.getSessions, 1);
    assert.strictEqual(w.store.sessions.length, 4);
    await flush();
    assert.strictEqual(w.args.syncPt[0].length, 4);
  });

  await test('저장 도중 다른 회원으로 전환(회원 데이터 요청 id 변경)되면 화면 목록(sessions)은 덮어쓰지 않는다', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    w.hook.getSession = () => { w.refs.memberDataReqIdRef.current += 1; w.store.sessions = [{ id: 'other', sessionNo: 1 }]; };
    await w.render().handleSaveSession(richPayload());
    assert.deepStrictEqual(w.store.sessions.map(s => s.id), ['other']);
    assert.strictEqual(w.store.sessionsMap.m1.length, 4); // 회원별 캐시는 해당 회원 키로만 갱신
  });

  await test('2:1 수업(A 저장 payload에 B 데이터 포함)도 1:1과 같은 경로로 가공 없이 저장·전송된다', async () => {
    const w = makeWorld({ sessions: baseSessions() });
    const d = richPayload({ sessionType: '2:1', linkedMemberId: 'm2', memberBId: 'm2', memberBName: '회원B', memberBExercises: [{ name: '스쿼트', sets: [set(40, 10)] }], memberBComment: 'B 코멘트', pairStatus: 'draft', pairSessionId: null, pairRecordedAt: null });
    await w.render().handleSaveSession(d);
    const { updatedAt, createdAt, ...rest } = w.args.addSession[0][1];
    assert.deepStrictEqual(rest, d);
    await w.render().handlePublishSession(w.store.sessions.find(s => s.id === 'new1'));
    const saved = w.store.sessions.find(s => s.id === 'new1');
    assert.strictEqual(saved.sessionType, '2:1');
    assert.strictEqual(saved.memberBId, 'm2');
    assert.strictEqual(saved.isPublished, true);
  });

  await test('오프라인이면 저장·전송 write를 시작하지 않고 즉시 안내(로딩 켜지지 않음)', async () => {
    const w = makeWorld({ sessions: baseSessions(), online: false });
    await assert.rejects(() => w.render().handleSaveSession(richPayload()), /인터넷 연결/);
    await assert.rejects(() => w.render().handlePublishSession(w.store.sessions[2]), /인터넷 연결/);
    assert.strictEqual(w.calls.addSession + w.calls.publishSession, 0);
    assert.strictEqual(w.store.loading, false);
    assert.strictEqual(w.refs.sessionSaveInFlightRef.current, null);
  });

  let bad = 0;
  for (const [name, ok, err] of results) {
    if (ok) console.log(`PASS ${name}`);
    else { bad += 1; console.error(`FAIL ${name}\n  ${err && (err.message || err)}`); }
  }
  if (results.length !== EXPECTED_TESTS) { bad += 1; console.error(`FAIL 실행된 테스트 수 ${results.length} ≠ ${EXPECTED_TESTS}`); }
  clearInterval(keepAlive);
  process.exit(bad ? 1 : 0);
})();
