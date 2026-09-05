// 관리자앱 "회원앱 자동 추천 미리보기" 결과가 회원앱 자동 추천과 완전히 동일한지 검증하는 회귀 테스트
// 실행: npm run regression (또는 프로젝트 루트에서 node tests/render/member-auto-routine-parity.test.js)
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

// ── 1) db.js: 회원앱에 실제로 내려가는 공개 필드 투영 ─────────────────────────
const dbProjection = slice(DB_SRC, 'const SESSION_PUBLIC_FIELDS', 'async function attachSessionMemberFeedback', 'db-public')
  + slice(DB_SRC, 'export function toMemberVisibleSession', 'export async function addSession', 'db-tomember').replace('export function', 'function');

// ── 2) App.jsx: 회원앱 자동 추천 엔진 전체 ────────────────────────────────────
const engine = slice(APP, 'function getNextPtPart(profile){', 'function ReviewRoutine({profile,sessions', 'engine');
const isFuncExSrc = slice(APP, 'function isFuncEx(ex) {', 'function funcSetLabel', 'isFuncEx');

const src = `
const EQUIP_LIST = ["바벨","덤벨","케이블","머신","맨몸","기능"];
function toPositiveNumber(value) { const n = parseFloat(value); return Number.isFinite(n) && n > 0 ? n : null; }
// 학습된 기구 분류는 이 테스트의 비교 대상이 아니므로 양쪽 입력에 동일하게 "없음"으로 둔다
function suggestEquipment() { return null; }
function normalizeExName(name) { return (name||"").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, ""); }
${isFuncExSrc}
${dbProjection}
${engine}
module.exports = { toMemberVisibleSession, getRecommendedPart, buildReviewRoutine, getLatestSessionType, recommendExerciseDose };
`;

const out = babel.transformSync(src, {
  presets: [[require.resolve('babel-preset-react-app'), { runtime: 'classic' }]],
  babelrc: false, configFile: false, filename: 'engine.jsx',
}).code;

const Module = require('module');
const m = new Module('engine');
m._compile(out, path.join(__dirname, '..', '..', '__engine.js')); // 실제로 파일을 만들지 않는다(경로만 사용)
const E = m.exports;

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); if (!ok && extra !== undefined) console.log('   ↳', JSON.stringify(extra)); };

// ── 테스트 데이터 ─────────────────────────────────────────────────────────────
// 관리자앱 getSessions가 돌려주는 형태(관리자 전용 필드 rpe·sessionType·memo 포함)
const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ex = (name, muscleTop, w, r, extra = {}) => ({
  name, muscleTop, equipment: '머신', rpe: 5, memo: '',
  sets: [{ weight: String(w), reps: String(r), volume: w * r }, { weight: String(w), reps: String(r), volume: w * r },
         { weight: String(w), reps: String(r), volume: w * r }],
  ...extra,
});
const adminSessions = [
  { id: 'a1', sessionNo: 1, date: d(20), isPublished: true, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['하체'], exercises: [ex('레그프레스', '하체', 60, 12)] },
  { id: 'a2', sessionNo: 2, date: d(16), isPublished: true, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['가슴'], exercises: [ex('체스트프레스', '가슴', 30, 12)] },
  { id: 'a3', sessionNo: 3, date: d(12), isPublished: true, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['등'], exercises: [ex('랫풀다운', '등', 35, 12)] },
  { id: 'a4', sessionNo: 4, date: d(8),  isPublished: true, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['하체'], exercises: [ex('레그프레스', '하체', 65, 12)] },
  { id: 'a5', sessionNo: 5, date: d(5),  isPublished: true, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['가슴'], exercises: [ex('체스트프레스', '가슴', 32, 12)] },
  { id: 'a6', sessionNo: 6, date: d(2),  isPublished: true, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['등'], exercises: [ex('랫풀다운', '등', 38, 12)] },
  // 아직 회원앱에 전송하지 않은 초안 — 회원앱은 절대 보지 못한다
  { id: 'a7', sessionNo: 7, date: d(0), isPublished: false, sessionType: '2:1', trainerUid: 'T', selectedTypes: ['어깨'], exercises: [ex('숄더프레스', '어깨', 20, 12)] },
];
const member = { id: 'm1', name: '홍길동', workoutFrequency: '주 3회', nextWorkoutPart: '', nextWorkoutDate: '' };

// 회원앱이 실제로 받는 세션(getPublishedSessions와 동일: 공개만 + publicSession 투영)
const memberAppSessions = adminSessions.filter(s => s.isPublished === true).map(E.toMemberVisibleSession);
// 관리자 미리보기가 만드는 세션(App.jsx MemberAutoRoutinePreviewScreen과 동일한 필터+투영)
const previewSessions = adminSessions
  .filter(s => s.isPublished === true || s.status === 'published')
  .map(E.toMemberVisibleSession)
  .sort((a, b) => ((Number(a.sessionNo) || 0) - (Number(b.sessionNo) || 0)) || String(a.date || '').localeCompare(String(b.date || '')));

// 1) 투영 결과가 회원앱 입력과 완전히 동일
check('관리자 미리보기 입력 = 회원앱이 실제로 받는 세션(공개 필드 투영 결과가 완전히 동일)',
  JSON.stringify(previewSessions) === JSON.stringify(memberAppSessions));

// 2) 관리자 전용 필드는 미리보기 입력에서도 제거된다
check('관리자 전용 필드(sessionType/trainerUid/rpe)는 미리보기 입력에서 제거된다',
  previewSessions.every(s => s.sessionType === undefined && s.trainerUid === undefined)
  && previewSessions.every(s => (s.exercises || []).every(e => e.rpe === undefined)));

// 3) 미전송(초안) 수업은 미리보기에 포함되지 않는다 — 회원앱도 못 보기 때문
check('회원앱에 전송하지 않은 초안 수업은 미리보기 계산에서도 제외된다',
  previewSessions.length === 6 && !previewSessions.some(s => (s.selectedTypes || []).includes('어깨')));

// 4) 추천 부위·근거가 회원앱과 동일
const recPreview = E.getRecommendedPart(member, previewSessions, {});
const recMemberApp = E.getRecommendedPart(member, memberAppSessions, {});
check('자동 추천 부위가 회원앱과 동일', recPreview.part === recMemberApp.part, { preview: recPreview.part, member: recMemberApp.part });
check('추천 근거 문구가 회원앱과 동일', recPreview.reason === recMemberApp.reason);
check('분할 사이클이 회원앱과 동일', JSON.stringify(recPreview.cycle) === JSON.stringify(recMemberApp.cycle));

// 5) 추천 운동/세트/중량/횟수가 회원앱과 동일
const routinePreview = E.buildReviewRoutine(previewSessions, {}, [], recPreview.part.split(' · '));
const routineMember = E.buildReviewRoutine(memberAppSessions, {}, [], recMemberApp.part.split(' · '));
check('추천 운동 목록·순서·세트/중량/횟수가 회원앱과 완전히 동일',
  JSON.stringify(routinePreview.routine) === JSON.stringify(routineMember.routine),
  { preview: routinePreview.routine, member: routineMember.routine });

// 6) 투영을 건너뛰면(관리자 원본 그대로 쓰면) 결과가 달라질 수 있다 — 투영이 반드시 필요한 이유
const rawPublished = adminSessions.filter(s => s.isPublished === true);
check('관리자 원본(투영 없음)은 회원앱과 판정이 달라진다 — 2:1 여부',
  E.getLatestSessionType(rawPublished) === '2:1' && E.getLatestSessionType(memberAppSessions) === '1:1');
const routineRaw = E.buildReviewRoutine(rawPublished, {}, [], ['하체']);
const routineProjected = E.buildReviewRoutine(memberAppSessions, {}, [], ['하체']);
check('관리자 원본(투영 없음)은 rpe가 남아 추천 세트값이 회원앱과 달라진다',
  JSON.stringify(routineRaw.routine) !== JSON.stringify(routineProjected.routine),
  { raw: routineRaw.routine, projected: routineProjected.routine });

// 7) 미리보기가 추가로 노출하는 진단 값이 실제로 채워진다(엔진 결과는 그대로)
check('추천 근거용 추가 반환값(sequence/inferred/cycle)이 제공된다',
  Array.isArray(recPreview.sequence) && 'inferred' in recPreview && Array.isArray(recPreview.cycle));
check('검수용 추가 반환값(ranked/excluded)이 제공된다',
  Array.isArray(routinePreview.ranked) && Array.isArray(routinePreview.excluded));

// 8) 통증 신호가 있는 운동은 후보에서 제외되고 excluded로 보고된다
const painSessions = memberAppSessions.map(s => (s.selectedTypes || []).includes('하체') && s.date === d(8)
  ? { ...s, exercises: s.exercises.map(e => ({ ...e, feedback: '무릎 통증' })) } : s);
const painRoutine = E.buildReviewRoutine(painSessions, {}, [], ['하체']);
check('최근 기록에 통증 신호가 있는 운동은 추천에서 빠지고 제외 목록에 보고된다',
  painRoutine.excluded.some(x => x.name === '레그프레스') && !painRoutine.routine.some(x => x.name === '레그프레스'),
  { excluded: painRoutine.excluded, routine: painRoutine.routine.map(x => x.name) });

// 9) 공개 수업이 하나도 없으면 추천 운동이 만들어지지 않는다(= 회원앱 "기록이 쌓이면" 문구 조건)
const emptyRoutine = E.buildReviewRoutine([], {}, [], ['하체']);
check('공개 수업이 없으면 hasData=false(회원앱 안내 문구 조건과 동일)', emptyRoutine.hasData === false && emptyRoutine.hasClassSessions === false);

let failed = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
console.log(failed ? `\n${failed} 건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
