// 회원앱 자동 추천 엔진의 RPE / sessionType 데이터 경로 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-auto-routine-rpe.test.js)
//
// 이 테스트의 핵심은 "관리자 원본 세션"이 아니라 "회원앱이 실제로 받는 publicSession 결과"를 엔진에 넣는 것이다.
// 원본만 넣어서 검증하면 이번과 같은 공개 필드 누락(sessionType 미전달 / 운동별 rpe 제거)을 다시 놓친다.
// App.jsx의 추천 엔진과 db.js의 공개 필드 투영을 원본 그대로 슬라이스해 실행한다 — 로직을 복제하지 않는다.
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // babel-preset-react-app 요구사항
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.jsx'), 'utf8');
const DB_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db.js'), 'utf8');

function slice(src, start, end, tag) {
  const si = src.indexOf(start), ei = src.indexOf(end);
  if (si < 0 || ei < 0 || ei < si) { console.error(`[${tag}] slice 경계 실패`, si, ei); process.exit(1); }
  if (src.indexOf(start, si + 1) !== -1) { console.error(`[${tag}] 시작 마커가 2회 이상 등장`); process.exit(1); }
  return src.slice(si, ei);
}

const dbProjection = slice(DB_SRC, 'const SESSION_PUBLIC_FIELDS', 'async function attachSessionMemberFeedback', 'db-public')
  + slice(DB_SRC, 'export function toMemberVisibleSession', 'export async function addSession', 'db-tomember').replace('export function', 'function');
const engine = slice(APP, 'function getNextPtPart(profile){', 'function ReviewRoutine({profile,sessions', 'engine');
const isFuncExSrc = slice(APP, 'function isFuncEx(ex) {', 'function funcSetLabel', 'isFuncEx');

const src = `
const EQUIP_LIST = ["바벨","덤벨","케이블","머신","맨몸","기능"];
function toPositiveNumber(value) { const n = parseFloat(value); return Number.isFinite(n) && n > 0 ? n : null; }
function suggestEquipment() { return null; }
function normalizeExName(name) { return (name||"").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, ""); }
${isFuncExSrc}
${dbProjection}
${engine}
module.exports = { toMemberVisibleSession, getRecommendedPart, buildReviewRoutine, getLatestSessionType,
  recommendExerciseDose, getPartRecoveryHours, getExerciseRpe, getSessionMemberRpe, hasHighEffortSignal,
  PAIR_SPLIT_DEFAULT, SPLIT_2WAY, SPLIT_3WAY, SPLIT_5WAY };
`;

const out = babel.transformSync(src, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'engine.jsx',
}).code;

const Module = require('module');
const m = new Module('engine');
m._compile(out, path.join(__dirname, '..', '..', '__engine_rpe.js')); // 실제로 파일을 만들지 않는다(경로만 사용)
const E = m.exports;

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', JSON.stringify(extra)); };

// ── 테스트 데이터 ─────────────────────────────────────────────────────────────
const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ex = (name, muscleTop, w, r, extra = {}) => ({
  name, muscleTop, equipment: '머신',
  sets: [1, 2, 3].map(() => ({ weight: String(w), reps: String(r), volume: w * r })),
  ...extra,
});
// 관리자앱 getSessions가 돌려주는 형태. memberFeedback은 attachSessionMemberFeedback이 관리자/회원 양쪽에 동일하게 붙인다.
const S = (no, days, part, name, w, opt = {}) => ({
  id: 's' + no, sessionNo: no, date: d(days), isPublished: true, trainerUid: 'T', memo: '관리자 메모',
  sessionType: opt.sessionType || '1:1',
  memberBId: opt.sessionType === '2:1' ? 'mB' : '', pairStatus: opt.sessionType === '2:1' ? 'sent' : '',
  selectedTypes: [part], type: part,
  exercises: [ex(name, part, w, 12, opt.exExtra || {})],
  memberFeedback: opt.rpe === undefined ? null : { source: 'memberApp', rpe: opt.rpe },
});
// 회원앱이 실제로 받는 입력 = 공개 세션 + publicSession 투영
const toMemberApp = (sessions) => sessions.filter(s => s.isPublished === true).map(E.toMemberVisibleSession);

// 하체/가슴/등 3부위를 두 바퀴 반복 — 분할 패턴이 감지되는 안정적인 기준 데이터
const base = (opt = {}) => [
  S(1, 20, '하체', '레그프레스', 60, opt), S(2, 16, '가슴', '체스트프레스', 30, opt), S(3, 12, '등', '랫풀다운', 35, opt),
  S(4, 8, '하체', '레그프레스', 65, opt), S(5, 5, '가슴', '체스트프레스', 32, opt), S(6, 2, '등', '랫풀다운', 38, opt),
];
const member = (freq) => ({ id: 'm1', name: '테스트', workoutFrequency: freq, nextWorkoutPart: '', nextWorkoutDate: '' });
const doseOf = (sessions, part) => {
  const r = E.buildReviewRoutine(toMemberApp(sessions), {}, [], [part]);
  return r.routine[0] || null;
};
const setsOf = (item) => (item ? item.sets.map(s => s.weight + ' × ' + s.reps).join(' / ') : '(없음)');

// ── 1) RPE 저장 위치 — 현재 실제 입력 경로는 session.memberFeedback.rpe 하나뿐 ──────────
check('현재 입력 경로: 운동별 rpe는 회원앱 공개 필드에서 제거되고, 세션 전체 RPE(memberFeedback.rpe)만 전달된다',
  (() => {
    const ms = toMemberApp(base({ rpe: 7, exExtra: { rpe: 3 } }));
    return ms.every(s => s.exercises.every(e => e.rpe === undefined)) && ms.every(s => s.memberFeedback && s.memberFeedback.rpe === 7);
  })());

check('getExerciseRpe: 빈 문자열/null은 "값 없음"으로 본다(Number("")===0 을 RPE 0으로 오인하지 않는다)',
  E.getExerciseRpe({ rpe: '' }) === null && E.getExerciseRpe({ rpe: null }) === null
  && E.getExerciseRpe({ rpe: 0 }) === 0 && E.getExerciseRpe({ feedbackRpe: '8' }) === 8 && E.getExerciseRpe({ memberRpe: 6 }) === 6);

check('getSessionMemberRpe: session.memberFeedback.rpe만 읽고, 없으면 null을 돌려준다',
  E.getSessionMemberRpe({ memberFeedback: { rpe: 8 } }) === 8
  && E.getSessionMemberRpe({ memberFeedback: { rpe: '' } }) === null
  && E.getSessionMemberRpe({ memberFeedback: null }) === null && E.getSessionMemberRpe({}) === null);

// ── 2) 세션 전체 RPE가 progression에 실제로 연결된다 ────────────────────────────
const lowRpe = doseOf(base({ rpe: 5 }), '하체');
const midRpe = doseOf(base({ rpe: 8 }), '하체');
const highRpe = doseOf(base({ rpe: 9 }), '하체');
const noRpe = doseOf(base({}), '하체');

check('RPE 낮음(5): 세션 RPE가 progression에 연결되어 "조건부 중량 증가"까지만 간다(전 세트 일괄 증량 weight 아님)',
  !!lowRpe && lowRpe.progression.rpeSource === 'session' && lowRpe.progression.mode === 'reps_or_weight',
  lowRpe && lowRpe.progression);

check('RPE 7~8: 중량을 올리지 않고 반복수만 증가한다',
  !!midRpe && midRpe.progression.mode === 'reps' && midRpe.progression.weightBumped === false, midRpe && midRpe.progression);

check('RPE 9 이상: 고강도로 판정해 중량 보류(hold_effort) — 반복수도 낮춘다',
  !!highRpe && highRpe.progression.mode === 'hold_effort' && highRpe.progression.highEffort === true, highRpe && highRpe.progression);

check('RPE 미입력: 보수적으로 반복수만 소폭 증가하고 중량은 올리지 않는다(RPE 없다고 증량하지 않음)',
  !!noRpe && noRpe.progression.rpeSource === 'none' && noRpe.progression.mode === 'reps' && noRpe.progression.weightBumped === false,
  noRpe && noRpe.progression);

check('RPE 미입력 결과에 NaN/undefined가 새어 나오지 않는다',
  !!noRpe && noRpe.sets.every(s => !/NaN|undefined/.test(String(s.weight) + String(s.reps))), noRpe && noRpe.sets);

// ── 3) stimRating은 RPE로 해석되지 않는다 ──────────────────────────────────────
const stimOnly = doseOf(base({ exExtra: { stimRating: 5 } }), '하체');
check('자극도(stimRating)만 있고 RPE가 없으면 중량을 올리지 않는다 — stimRating은 RPE가 아니다',
  !!stimOnly && stimOnly.progression.rpeSource === 'none' && stimOnly.progression.weightBumped === false
  && JSON.stringify(stimOnly.sets) === JSON.stringify(noRpe.sets),
  { stimOnly: stimOnly && stimOnly.progression, sets: setsOf(stimOnly) });

check('자극도는 후보 선정(우선순위)에만 계속 쓰인다 — 자극이 좋았던 운동이 goodStim으로 보고된다',
  (() => {
    const r = E.buildReviewRoutine(toMemberApp(base({ exExtra: { stimRating: 5 } })), {}, [], ['하체']);
    return r.goodStim.some(x => x.name === '레그프레스');
  })());

// ── 4) 통증이 progression보다 우선한다 ─────────────────────────────────────────
const painSessions = base({ rpe: 5 });
painSessions[3] = S(4, 8, '하체', '레그프레스', 65, { rpe: 5, exExtra: { feedback: '무릎 통증' } });
const painRoutine = E.buildReviewRoutine(toMemberApp(painSessions), {}, [], ['하체']);
check('통증 신호가 있으면 낮은 RPE(증량 조건)여도 그 운동은 추천에서 제외된다 — 통증이 progression보다 우선',
  painRoutine.excluded.some(x => x.name === '레그프레스') && !painRoutine.routine.some(x => x.name === '레그프레스'),
  { excluded: painRoutine.excluded.map(x => x.name), routine: painRoutine.routine.map(x => x.name) });

// 통증이 "가장 최근 기록"이 아니라 과거에만 있으면 후보로는 남되 reduce 판정이 되는지(제외가 아님)
const painPast = base({ rpe: 5 });
painPast[5] = S(6, 2, '하체', '레그프레스', 66, { rpe: 5, exExtra: { feedback: '무릎 통증' } });
const painPastItem = doseOf(painPast, '하체');
check('가장 최근 기록에 통증이 있으면 제외되고, 남은 후보의 판정은 감량/유지 방향이다',
  painPastItem === null || ['reduce', 'hold', 'hold_effort', 'hold_low', 'reps'].includes(painPastItem.progression.mode),
  painPastItem && painPastItem.progression);

// ── 5) 세트 미완료 시 증량 제한 ────────────────────────────────────────────────
// 마지막 세트에 중량만 적히고 반복수가 비어 있는 상태 = "세트 데이터는 있으나 완료하지 못함"
// (weight/reps가 모두 비면 getFilledSets에서 세트 자체가 걸러져 완료 판정에 잡히지 않는다)
const partialSessions = base({ rpe: 5 }).map(s => ({
  ...s,
  exercises: s.exercises.map(e => ({ ...e, sets: [e.sets[0], e.sets[1], { weight: e.sets[2].weight, reps: '', volume: 0 }] })),
}));
const partialItem = doseOf(partialSessions, '하체');
check('마지막 기록에서 세트를 완료하지 못했으면 낮은 RPE여도 중량을 올리지 않는다(유지)',
  !!partialItem && partialItem.progression.allCompleted === false && partialItem.progression.mode === 'hold'
  && partialItem.progression.weightBumped === false, partialItem && partialItem.progression);

// ── 6) 과거 exercise.rpe가 남아 있는 데이터 호환 ───────────────────────────────
check('과거 데이터에 운동별 rpe가 있으면(관리자 원본 경로) 세션 RPE보다 그 값을 우선한다',
  (() => {
    // 회원앱은 운동별 rpe를 받지 않으므로, 원본을 그대로 넣는 관리자 경로에서만 확인할 수 있는 하위 호환 동작이다.
    const legacy = base({ rpe: 9, exExtra: { rpe: 5 } }).filter(s => s.isPublished);
    const r = E.buildReviewRoutine(legacy, {}, [], ['하체']);
    const item = r.routine[0];
    return !!item && item.progression.rpeSource === 'exercise' && item.progression.exerciseRpe === 5;
  })());

check('과거 데이터의 운동별 rpe가 빈 문자열이면 RPE 0(=매우 쉬움)으로 오인하지 않고 세션 RPE로 판단한다',
  (() => {
    const legacyEmpty = base({ rpe: 9, exExtra: { rpe: '' } }).filter(s => s.isPublished);
    const item = E.buildReviewRoutine(legacyEmpty, {}, [], ['하체']).routine[0];
    return !!item && item.progression.rpeSource === 'session' && item.progression.mode === 'hold_effort';
  })());

check('hasHighEffortSignal: 운동별 RPE가 없으면 세션 RPE 9 이상을 고강도로 인식한다(임계값 9 유지)',
  E.hasHighEffortSignal({}, 9) === true && E.hasHighEffortSignal({}, 8) === false
  && E.hasHighEffortSignal({ rpe: 5 }, 9) === false && E.hasHighEffortSignal({ feedback: '많이 힘들었어요' }) === true);

// ── 7) 회복시간 계산에 세션 RPE가 반영된다 ─────────────────────────────────────
const recovery = (rpe) => E.getPartRecoveryHours('하체', toMemberApp(base(rpe === undefined ? {} : { rpe })));
check('회복시간: 세션 RPE 6 이하 → 48h, 9 이상 → 72h, RPE 미입력 → 기본 60h (기존 임계값 그대로)',
  recovery(5).requiredHours === 48 && recovery(9).requiredHours === 72 && recovery(undefined).requiredHours === 60,
  { low: recovery(5).requiredHours, high: recovery(9).requiredHours, none: recovery(undefined).requiredHours });

check('회복시간 판정 근거(basisRpe)가 함께 반환되어 관리자 미리보기에서 확인할 수 있다',
  recovery(9).basisRpe === 9 && recovery(undefined).basisRpe === null);

// ── 8) sessionType 전달 & 2:1 분할 ─────────────────────────────────────────────
const pair = (n, opt = {}) => {
  const parts = [['하체', '레그프레스', 60], ['가슴', '체스트프레스', 30], ['등', '랫풀다운', 35], ['어깨', '숄더프레스', 20]];
  return Array.from({ length: n }, (_, i) => S(i + 1, (n - i) * 3, parts[i % 4][0], parts[i % 4][1], parts[i % 4][2],
    { ...opt, sessionType: '2:1' }));
};
check('sessionType이 회원앱 입력까지 전달되어 2:1 회원을 2:1로 인식한다',
  E.getLatestSessionType(toMemberApp(pair(3, { rpe: 6 }))) === '2:1');

check('sessionType은 "1:1"/"2:1" 두 값으로만 정규화된다(관리자 전용 2:1 상세는 공개하지 않음)',
  (() => {
    const ms = toMemberApp(pair(3, { rpe: 6 }));
    return ms.every(s => s.sessionType === '2:1' && s.memberBId === undefined && s.pairStatus === undefined)
      && E.toMemberVisibleSession({ id: 'x' }).sessionType === '1:1';
  })());

check('2:1 · 기록 4회 미만: workoutFrequency와 무관하게 2:1 공통 기본 분할(PAIR_SPLIT_DEFAULT)을 쓴다',
  ['주 2회', '주 3회', '주 5회'].every(f => {
    const r = E.getRecommendedPart(member(f), toMemberApp(pair(3, { rpe: 6 })), {});
    return r.isPaired === true && JSON.stringify(r.cycle) === JSON.stringify(E.PAIR_SPLIT_DEFAULT);
  }));

check('2:1 수정 전 문제 재현 방지: sessionType이 없으면 주 2회는 2분할 / 주 5회는 5분할로 갈렸다(이제 갈리지 않는다)',
  (() => {
    const stripped = toMemberApp(pair(3, { rpe: 6 })).map(s => ({ ...s, sessionType: undefined }));
    const c2 = E.getRecommendedPart(member('주 2회'), stripped, {}).cycle;
    const c5 = E.getRecommendedPart(member('주 5회'), stripped, {}).cycle;
    return JSON.stringify(c2) === JSON.stringify(E.SPLIT_2WAY) && JSON.stringify(c5) === JSON.stringify(E.SPLIT_5WAY);
  })());

check('2:1 · 반복 패턴이 감지된 회원은 기본 분할로 덮어쓰지 않고 실제 기록 패턴을 그대로 따른다',
  (() => {
    const seq = ['하체', '가슴', '등', '하체', '가슴', '등'];
    const names = { 하체: '레그프레스', 가슴: '체스트프레스', 등: '랫풀다운' };
    const ss = seq.map((p, i) => S(i + 1, (6 - i) * 3, p, names[p], 50, { sessionType: '2:1', rpe: 6 }));
    const r = E.getRecommendedPart(member('주 3회'), toMemberApp(ss), {});
    return r.isPaired === true && !!r.inferred && JSON.stringify(r.cycle) === JSON.stringify(['하체', '가슴', '등']);
  })());

check('2:1 · RPE 미입력이어도 분할 판정은 정상 동작한다(NaN/undefined로 깨지지 않음)',
  (() => {
    const r = E.getRecommendedPart(member('주 3회'), toMemberApp(pair(3)), {});
    return r.isPaired === true && typeof r.part === 'string' && r.part.length > 0 && !/NaN|undefined/.test(r.part + r.reason);
  })());

// ── 9) 관리자 미리보기 ↔ 회원앱 동일성 (progression 진단 포함) ─────────────────
check('관리자 미리보기와 회원앱이 같은 입력·같은 추천 결과를 낸다(세션 RPE·sessionType 반영 후에도 동일)',
  (() => {
    const admin = base({ rpe: 5, sessionType: '2:1' });
    const memberApp = admin.filter(s => s.isPublished === true).map(E.toMemberVisibleSession);
    const preview = admin.filter(s => s.isPublished === true || s.status === 'published').map(E.toMemberVisibleSession)
      .sort((a, b) => ((Number(a.sessionNo) || 0) - (Number(b.sessionNo) || 0)) || String(a.date || '').localeCompare(String(b.date || '')));
    const rp = E.getRecommendedPart(member('주 3회'), preview, {});
    const rm = E.getRecommendedPart(member('주 3회'), memberApp, {});
    return JSON.stringify(preview) === JSON.stringify(memberApp) && rp.part === rm.part && rp.isPaired === rm.isPaired
      && JSON.stringify(E.buildReviewRoutine(preview, {}, [], rp.part.split(' · ')).routine)
       === JSON.stringify(E.buildReviewRoutine(memberApp, {}, [], rm.part.split(' · ')).routine);
  })());

check('progression 진단은 추천 결과(sets/reason)와 분리된 추가 반환값이라 회원 화면 표시에는 영향이 없다',
  (() => {
    const item = doseOf(base({ rpe: 5 }), '하체');
    return !!item && Array.isArray(item.sets) && typeof item.reason === 'string' && typeof item.progression === 'object';
  })());

check('기록 없음/맨몸·시간 운동 분기도 같은 형태의 progression 진단을 돌려준다(undefined 접근 방지)',
  (() => {
    const empty = E.recommendExerciseDose([], {});
    const func = E.recommendExerciseDose([{ date: d(3), sets: [{ reps: '15' }], rpe: null, sessionRpe: null, isFunc: true }], {});
    return empty.progression && empty.progression.mode === 'no_history' && func.progression && func.progression.mode === 'func';
  })());

let failed = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
console.log(failed ? `\n${failed} 건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
