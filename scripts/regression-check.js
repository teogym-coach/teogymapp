const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const db = fs.readFileSync(path.join(root, 'src', 'db.js'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const functionsIndex = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');

const memberProfileFn = db.slice(db.indexOf('export async function getMemberAppProfile'), db.indexOf('export async function saveMemberCheckin'));
const memberUpdateFn = firestoreRules.slice(
  firestoreRules.indexOf('function memberProfileUpdateKeysAllowed()'),
  firestoreRules.indexOf('function memberOnboardingProfileKeysAllowed()')
);
const membersBlock = firestoreRules.slice(
  firestoreRules.indexOf('match /members/{memberId}'),
  firestoreRules.indexOf('match /dailyConditioning/')
);
const membersBlockFlat = membersBlock.replace(/\s+/g, ' ');

// ── 2:1 종료(teamStatus)와 개인 회원 상태(status) 분리 검증용 슬라이스 ──
const updatePairSessionStatusFn = db.slice(db.indexOf('export async function updatePairSessionStatus'), db.indexOf('export async function splitPairSession'));
const handlePairStatusChangeFn = app.slice(app.indexOf('async function handlePairStatusChange'), app.indexOf('async function handleSplitPairSession'));
const applyMemberStatusChangeFn = app.slice(app.indexOf('async function applyMemberStatusChange'), app.indexOf('async function handleStatusChange'));
const isMemberStatusActiveFn = firestoreRules.slice(firestoreRules.indexOf('function isMemberStatusActive'), firestoreRules.indexOf('function canReadMemberData'));

// ── 오늘의 운동 가이드: 실제 실행 시나리오 검증 ──
// App.jsx는 JSX/Firebase 등을 포함해 그대로 require할 수 없으므로, 분할 추천에 필요한 "JSX 없는 순수 함수"만
// 원본 소스에서 그대로 슬라이스해 new Function으로 실행한다 — 로직을 다시 옮겨 적지 않고 원본 코드 자체를 검증한다.
let workoutGuideLib = null;
try {
  const sliceNum = app.slice(app.indexOf('function toPositiveNumber'), app.indexOf('function getBodyWeightRecords'));
  const sliceFunc = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  const sliceA = app.slice(app.indexOf('function getNextPtPart'), app.indexOf('function formatWeightValue'));
  const sliceB = app.slice(app.indexOf('function normalizeWorkoutPart'), app.indexOf('function formatRoutineSet'));
  const sliceC = app.slice(app.indexOf('function hasRoutineCautionText'), app.indexOf('function ReviewRoutine'));
  const sliceEquip = app.slice(app.indexOf('const EQUIP_LIST'), app.indexOf('const EQUIP_COLOR'));
  const sliceLib = app.slice(app.indexOf('const EXERCISE_LIBRARY'), app.indexOf('function suggestMuscle'));
  const factory = new Function(`${sliceNum}\n${sliceFunc}\n${sliceEquip}\n${sliceLib}\n${sliceA}\n${sliceB}\n${sliceC}\nreturn { getRecommendedPart, getLatestSessionType, getRecentPartSequence, partComboLabel, SPLIT_5WAY, SPLIT_2WAY, SPLIT_3WAY, SPLIT_COMBO_2WAY, PAIR_SPLIT_DEFAULT, normalizeExerciseName, recommendExerciseDose, buildReviewRoutine, getPartRecoveryHours, DOSE_REP_SCHEME, BARBELL_PLATE_WEIGHTS, BARBELL_WEIGHT_STEP, DEFAULT_BARBELL_BASE_WEIGHT, DUMBBELL_WEIGHTS, DUMBBELL_JUMP_PCT_THRESHOLD, nextWorkingWeight, nextDumbbellWeight, resolveEquipmentKind, estimateWeightIncrement, isBarbellWeightPlausible, hasStableRecentPerformance, resolveBarbellKind, detectBarbellKindFromText, BARBELL_BASE_WEIGHT_BY_KIND };`);
  workoutGuideLib = factory();
} catch (e) {
  console.error('[regression] 오늘의 운동 가이드 로직 추출 실패:', e.message);
}
// ── 체중 변화 단일 기준: 실제 실행 시나리오 검증 ──
// 회원목록·회원 상세·분석 화면이 모두 같은 수치를 보여야 하므로, 공용 헬퍼 원본 코드를 그대로 슬라이스해 실행한다.
let weightProgressLib = null;
try {
  const sliceNum = app.slice(app.indexOf('function toPositiveNumber'), app.indexOf('function getBodyWeightRecords'));
  const sliceRec = app.slice(app.indexOf('function getBodyWeightRecords'), app.indexOf('function getLatestBodyWeight'));
  const sliceProg = app.slice(app.indexOf('function getWeightProgress'), app.indexOf('function estimateBirthYearFromAge'));
  weightProgressLib = new Function(`${sliceNum}\n${sliceRec}\n${sliceProg}\nreturn { getWeightProgress, formatWeightChange, getBodyWeightRecords };`)();
} catch (e) {
  console.error('[regression] 체중 변화 헬퍼 추출 실패:', e.message);
}
function wpScenario(name, fn) {
  if (!weightProgressLib) return [name, false];
  try { return [name, !!fn(weightProgressLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}
// ── 회원앱 홈 "30일 체중 변화" 카드: 실제 실행 시나리오 검증 ──
// 정확히 29일 전 기록이 없어도(최근 30일 범위 안 가장 오래된 기록 기준) 변화가 반영되어야 하고,
// 최근 30일 안에 기록이 전혀 없으면 오래된 기록 하나를 자기 자신과 비교해 "0kg"을 만들어내면 안 된다.
let weightCardLib = null;
try {
  const sliceNum = app.slice(app.indexOf('function toPositiveNumber'), app.indexOf('function getBodyWeightRecords'));
  const sliceRec = app.slice(app.indexOf('function getBodyWeightRecords'), app.indexOf('function getLatestBodyWeight'));
  const sliceKst = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function getKoreaYesterdayDateString'));
  const sliceDaysAgo = app.slice(app.indexOf('function dateStrDaysAgo'), app.indexOf('function summarizeCardioWindow'));
  const sliceCard = app.slice(app.indexOf('function computeWeightCard'), app.indexOf('function computeWeeklyWorkoutCard'));
  weightCardLib = new Function(`${sliceNum}\n${sliceRec}\n${sliceKst}\n${sliceDaysAgo}\n${sliceCard}\nreturn { computeWeightCard, getBodyWeightRecords, dateStrDaysAgo };`)();
} catch (e) {
  console.error('[regression] 30일 체중 변화 카드 헬퍼 추출 실패:', e.message);
}
function wcScenario(name, fn) {
  if (!weightCardLib) return [name, false];
  try { return [name, !!fn(weightCardLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 회원앱 분석 탭 "체중 추이" 그래프 집계(2026-08-18): 실제 실행 시나리오 검증 ──
// 원본 배열을 mutate하지 않는지, 기록 없는 날짜를 0으로 채우지 않는지, 전체 기간에서
// 포인트가 과도하게 생성되지 않는지를 원본 헬퍼 코드를 그대로 슬라이스해 실행 결과로 확인한다.
let weightTrendLib = null;
try {
  const sliceAvg = app.slice(app.indexOf('function average(arr=[])'), app.indexOf('function epochDay'));
  const sliceTrend = app.slice(app.indexOf('function epochDay'), app.indexOf('function buildTopExercisesByFrequency'));
  const sliceKst = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function getKoreaYesterdayDateString'));
  const sliceDaysAgo = app.slice(app.indexOf('function dateStrDaysAgo'), app.indexOf('function summarizeCardioWindow'));
  weightTrendLib = new Function(`${sliceKst}\n${sliceDaysAgo}\n${sliceAvg}\n${sliceTrend}\nreturn { epochDay, round1, weightMovingAverage7, pickWeightTrendGranularity, weightTrendBucketKey, weightTrendBucketLabel, buildWeightTrendBuckets, buildWeightRecentSummary, average, dateStrDaysAgo };`)();
} catch (e) {
  console.error('[regression] 체중 추이 그래프 집계 헬퍼 추출 실패:', e.message);
}
function wtScenario(name, fn) {
  if (!weightTrendLib) return [name, false];
  try { return [name, !!fn(weightTrendLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 회원앱 건강 탭 "어제 기록/오늘 상태" 날짜 규칙: 실제 실행 시나리오 검증 ──
// 월/연도 경계에서도 KST 달력일 기준으로 정확한 어제 날짜를 계산해야 한다(24시간을 단순히 빼는 방식의 오류 방지).
let healthDateLib = null;
try {
  const sliceKst = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function isPublishedData'));
  healthDateLib = new Function(`${sliceKst}\nreturn { getKoreaDateString, getKoreaYesterdayDateString };`)();
} catch (e) {
  console.error('[regression] 건강 탭 날짜 헬퍼 추출 실패:', e.message);
}
function healthDateScenario(name, fn) {
  if (!healthDateLib) return [name, false];
  try { return [name, !!fn(healthDateLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 회원앱 분석 탭 "전날 생활 → 당일 체중" D-1 매칭: 실제 실행 시나리오 검증 ──
// 원본 체중/칼로리/걸음수/유산소 기록의 날짜는 그대로 두고, 조회 시점에만 전날 값을 당일 체중에 연결해야 한다.
let prevDayLib = null;
try {
  const sliceTypes = app.slice(app.indexOf('function normalizeTypes'), app.indexOf('function formatTypes'));
  const sliceCardioTypes = app.slice(app.indexOf('function getCardioTypes'), app.indexOf('function calcCardioCalories'));
  const slicePrevDay = app.slice(app.indexOf('function prevCalendarDate'), app.indexOf('function weightMovingAverage7'));
  prevDayLib = new Function(`${sliceTypes}\n${sliceCardioTypes}\n${slicePrevDay}\nreturn { prevCalendarDate, buildPrevDayLifestyleRows };`)();
} catch (e) {
  console.error('[regression] 전날 생활 매칭 헬퍼 추출 실패:', e.message);
}
function prevDayScenario(name, fn) {
  if (!prevDayLib) return [name, false];
  try { return [name, !!fn(prevDayLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 공통 판단 로직(목표 방향 × 최근 체중 변화 방향 × 데이터 충분성): 실제 실행 시나리오 검증 ──
// 기간 리포트·목표 전략·건강 탭 기록 분석·건강 전문 분석이 전부 이 결과를 재사용하므로,
// 여기서 판정이 틀리면 네 화면이 동시에 틀린다. 원본 함수를 그대로 슬라이스해 실행 결과로 검증한다.
let goalStateLib = null;
try {
  const sliceGoal = app.slice(app.indexOf('function getAnalysisPersona'), app.indexOf('function average(arr=[])'));
  goalStateLib = new Function(`${sliceGoal}\nreturn { getAnalysisPersona, getGoalWeightDirection, buildGoalWeightState, goalDeltaTone, goalToneColor, goalWeightHeadline };`)();
} catch (e) {
  console.error('[regression] 공통 판단 로직 추출 실패:', e.message);
}
function goalStateScenario(name, fn) {
  if (!goalStateLib) return [name, false];
  try { return [name, !!fn(goalStateLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 시작 체중 단일 기준(getMemberStartWeight) + 목표 유형별 페이스(getGoalPace): 실제 실행 시나리오 검증 ──
// 시작 체중이 화면마다 다르면 Before→After·목표까지·예상 기간이 서로 다른 값을 보여주게 되므로 원본 함수로 직접 확인한다.
let startWeightLib = null;
try {
  const sliceNum = app.slice(app.indexOf('function toPositiveNumber'), app.indexOf('function getBodyWeightRecords'));
  const sliceRec = app.slice(app.indexOf('function getBodyWeightRecords'), app.indexOf('// ── 체중 변화 단일 기준'));
  const sliceWeeks = app.slice(app.indexOf('function weeksUntilDate'), app.indexOf('function getGoalPace'));
  const slicePace = app.slice(app.indexOf('function getGoalPace'), app.indexOf('const STEP_RANGE_OPTIONS'));
  const sliceGoal2 = app.slice(app.indexOf('function getAnalysisPersona'), app.indexOf('function average(arr=[])'));
  startWeightLib = new Function(`${sliceNum}\n${sliceRec}\n${sliceWeeks}\n${slicePace}\n${sliceGoal2}\nreturn { getMemberStartWeight, getGoalPace, getWeightRemaining, getGoalWeightDirection, getAnalysisPersona, GOAL_PACE_LABELS, getWeightGoalProgress, goalToneColor };`)();
} catch (e) {
  console.error('[regression] 시작 체중/목표 페이스 헬퍼 추출 실패:', e.message);
}
function startWeightScenario(name, fn) {
  if (!startWeightLib) return [name, false];
  try { return [name, !!fn(startWeightLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── "목표 대비 섭취"(구 목표 달성률): 실제 실행 시나리오 검증 ──
// 3,000 / 2,125 = 141%는 "목표를 141% 달성"이 아니라 "목표보다 41% 많이 먹었다"는 뜻이므로,
// 라벨·색·설명이 그 의미와 회원 목표 방향에 맞는지 원본 함수로 확인한다.
let calorieIntakeLib = null;
try {
  const sliceNum2 = app.slice(app.indexOf('function toPositiveNumber'), app.indexOf('function getBodyWeightRecords'));
  const sliceGoal3 = app.slice(app.indexOf('function getAnalysisPersona'), app.indexOf('function average(arr=[])'));
  calorieIntakeLib = new Function(`${sliceNum2}\n${sliceGoal3}\nreturn { buildCalorieIntakeSummary, getGoalWeightDirection, getAnalysisPersona, goalToneColor };`)();
} catch (e) {
  console.error('[regression] 목표 대비 섭취 헬퍼 추출 실패:', e.message);
}
function calorieIntakeScenario(name, fn) {
  if (!calorieIntakeLib) return [name, false];
  try { return [name, !!fn(calorieIntakeLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── "이번 기간 리포트" 인트로 문구: 실제 실행 시나리오 검증 ──
let periodReportLib = null;
try {
  const sliceReport = app.slice(app.indexOf('function buildPeriodReport'), app.indexOf('function PeriodReportCard'));
  periodReportLib = new Function(`${sliceReport}\nreturn { buildPeriodReport };`)();
} catch (e) {
  console.error('[regression] 기간 리포트 로직 추출 실패:', e.message);
}
function periodReportScenario(name, fn) {
  if (!periodReportLib) return [name, false];
  try { return [name, !!fn(periodReportLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 섭취 칼로리 "날짜당 총섭취량" 정규화: 실제 실행 시나리오 검증 ──
// 전날 생활 매칭(D-1)을 도입해도 칼로리 원본 집계 의미(날짜당 1건 = 그날의 총섭취량)는 그대로여야 한다.
let kcalLogsLib = null;
try {
  const sliceNum = app.slice(app.indexOf('function toPositiveNumber'), app.indexOf('function getBodyWeightRecords'));
  const sliceKcal = app.slice(app.indexOf('function getKcalLogs'), app.indexOf('function getRecentKcalLogsByDays'));
  kcalLogsLib = new Function(`${sliceNum}
${sliceKcal}
return { getKcalLogs };`)();
} catch (e) {
  console.error('[regression] 섭취 칼로리 집계 헬퍼 추출 실패:', e.message);
}
function kcalLogsScenario(name, fn) {
  if (!kcalLogsLib) return [name, false];
  try { return [name, !!fn(kcalLogsLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 2:1 회원별 개인화(종목 대상 only · 회원별 운동 부위 · 회원 한 명분 기록 변환): 실제 실행 시나리오 검증 ──
// "나눠서 기록"이 실제로 쓰는 원본 함수를 그대로 슬라이스해 실행한다 — A 전용 종목이 B 기록/분석에 섞이는
// 사고를 문자열 검사가 아니라 실행 결과로 막는다.
let pairPersonalLib = null;
try {
  // 다음 수업 부위 자동 반영에 필요한 getTodayMuscleTop/SESSION_BODY_PART_OPTIONS/SESSION_PART_TO_MUSCLE_TOP도
  // 1:1과 같은 원본 정의를 그대로 슬라이스한다(2:1 전용 해석 규칙을 새로 만들지 않는다).
  const sliceBodyPart = app.slice(app.indexOf('const SESSION_BODY_PART_OPTIONS'), app.indexOf('function normalizeTypes'));
  const sliceTypes = app.slice(app.indexOf('function normalizeTypes'), app.indexOf('function formatTypes'));
  const slicePair  = app.slice(app.indexOf('function pairExerciseTarget'), app.indexOf('function formatParts'));
  pairPersonalLib = new Function(`${sliceBodyPart}\n${sliceTypes}\n${slicePair}\nreturn { pairExerciseTarget, pairExerciseIncludes, getPairMemberTypes, mergePairTypes, buildPairSplitExercises, summarizePastPairSets, sameBodyParts, derivePairCardMuscleTop, getTodayMuscleTop, SESSION_BODY_PART_OPTIONS };`)();
} catch (e) {
  console.error('[regression] 2:1 개인화 헬퍼 추출 실패:', e.message);
}
function pairScenario(name, fn) {
  if (!pairPersonalLib) return [name, false];
  try { return [name, !!fn(pairPersonalLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 운동 기록 단위(kg/단/맨몸): 실제 실행 시나리오 검증 ──
// 스미스머신 푸쉬업처럼 숫자가 중량(kg)이 아니라 "단"(바 높이)이거나 "맨몸"(중량 없음)인 기록은
// calcVol/exVol이 반환하는 볼륨에서 반드시 제외돼야 하고, 단위 필드가 없는 기존 기록은 계속 kg로 해석돼야 한다.
// isFuncEx~exVol 구간을 원본 그대로 슬라이스해 실행한다(값을 다시 옮겨 적지 않고 실제 로직을 검증).
let unitVolLib = null;
try {
  const sliceUnitVol = app.slice(app.indexOf('function isFuncEx'), app.indexOf('// ─── CSS ───'));
  unitVolLib = new Function(`${sliceUnitVol}\nreturn { calcVol, exVol, getExerciseType, isFuncEx, getRecordUnit, formatRecordValue, getWeightColumnLabel };`)();
} catch (e) {
  console.error('[regression] 기록 단위(kg/단/맨몸) 헬퍼 추출 실패:', e.message);
}
function unitScenario(name, fn) {
  if (!unitVolLib) return [name, false];
  try { return [name, !!fn(unitVolLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// 시나리오 공용 픽스처 — 랫풀다운(공통) + 벤치프레스(A만) + 레그프레스(B만)
const pairFixtureExercises = () => ([
  { name:'랫풀다운', only:'', muscleTop:'등', equipment:'머신',
    setsA:[{weight:'30',reps:'12'},{weight:'30',reps:'12'},{weight:'30',reps:'12'}],
    setsB:[{weight:'20',reps:'15'},{weight:'20',reps:'15'},{weight:'20',reps:'15'}],
    feedbackA:{note:'광배 자극 좋음'}, feedbackB:{note:'가동범위 주의'} },
  { name:'벤치프레스', only:'A', muscleTop:'가슴', equipment:'바벨',
    setsA:[{weight:'50',reps:'10'}], setsB:[], feedbackA:{note:''}, feedbackB:{note:''} },
  { name:'레그프레스', only:'B', muscleTop:'하체', equipment:'머신',
    setsA:[], setsB:[{weight:'80',reps:'12'}], feedbackA:{note:''}, feedbackB:{note:''} },
]);

// ── 홈 "수업일지 미전송"/"수업일지 미확인": 0회차 제외·회원 확인 판정 실제 실행 시나리오 검증 ──
// 0회차(숫자 0·문자열 "0"·"0회차")는 미전송 목록에서 제외되고, 1회차 이상과 회차 정보 없는 기록은 기존 기준 그대로 판정돼야 한다.
// getSessionReadStatus/summarizeSessionReadStatus/buildUnreadSessionMembers(수업일지 "회원 확인")도 같은 스코프에서 함께 검증한다.
let unsentSessionLib = null;
try {
  const sliceKoreaDate = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function getKoreaYesterdayDateString'));
  const sliceDaysAgo = app.slice(app.indexOf('function dateStrDaysAgo'), app.indexOf('function summarizeCardioWindow'));
  const sliceMonthDayKo = app.slice(app.indexOf('function formatMonthDayKo'), app.indexOf('function formatWhenLabel'));
  const sliceFuncEx = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  const sliceOwner = app.slice(app.indexOf('const isOwner = (m)'), app.indexOf('function isExcludedAdminMember'));
  const sliceExcluded = app.slice(app.indexOf('function isExcludedAdminMember'), app.indexOf('const isRegularAdminMember'));
  const sliceUnsent = app.slice(app.indexOf('const UNSENT_SESSION_START_DATE'), app.indexOf('function buildReviewPendingList'));
  const sliceSessionRead = app.slice(app.indexOf('function getSessionReadStatus'), app.indexOf('function SessionReadBadge'));
  const sliceOnboardingStatus = app.slice(app.indexOf('const ONBOARDING_STATUS_LABEL'), app.indexOf('const DEFAULT_ADMIN_EMAIL'));
  unsentSessionLib = new Function(`${sliceKoreaDate}\n${sliceDaysAgo}\n${sliceMonthDayKo}\n${sliceFuncEx}\n${sliceOwner}\n${sliceExcluded}\n${sliceOnboardingStatus}\n${sliceSessionRead}\n${sliceUnsent}\nreturn { isTrialSessionNo, buildUnsentSessionMembers, UNSENT_SESSION_START_DATE, getSessionReadStatus, formatSessionReadTime, summarizeSessionReadStatus, buildUnreadSessionMembers, UNREAD_SESSION_WINDOW_DAYS, hasRealFeedbackInput, getRecentFeedbackInputStats, formatRelativeActiveTime, getMemberLastActiveStatus, getInactiveAppMembers, getNoFeedbackActivityMembers, APP_USAGE_INACTIVE_GRACE_DAYS, getOnboardingStatusFromMember, toMillisSafe, isAtOrAfterHomeTaskCutoff, HOME_TASK_CUTOFF_AT };`)();
} catch (e) {
  console.error('[regression] 수업일지 미전송 헬퍼 추출 실패:', e.message);
}
function usScenario(name, fn) {
  if (!unsentSessionLib) return [name, false];
  try { return [name, !!fn(unsentSessionLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 홈 "다음 예약이 필요한 회원": 관리자 "일정 미정" 보류 예외 필터 실제 실행 시나리오 검증 ──
// scheduleFollowupStatus==="pending"인 회원은 기존 자동 판정(다음 예약 없음)을 만족해도 목록에서 제외되고,
// 해제(빈 문자열)하면 그 시점에도 실제 다음 예약이 없는 한 다시 표시돼야 한다. 자동 판정 조건 자체는 건드리지 않는다.
let nextBookingLib = null;
try {
  const sliceOwner = app.slice(app.indexOf('const isOwner = (m)'), app.indexOf('function isExcludedAdminMember'));
  const sliceExcluded = app.slice(app.indexOf('function isExcludedAdminMember'), app.indexOf('const isRegularAdminMember'));
  const sliceFuncEx = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  const sliceCore = app.slice(app.indexOf('function normalizeSessionDateKey'), app.indexOf('const TODAY_STATUS_STYLE'));
  const sliceNextInfo = app.slice(app.indexOf('function getMemberNextSessionInfo'), app.indexOf('function getNextWorkoutSummary'));
  const sliceNextBooking = app.slice(app.indexOf('function buildNextBookingList'), app.indexOf('const UNSENT_SESSION_START_DATE'));
  nextBookingLib = new Function(`${sliceOwner}\n${sliceExcluded}\n${sliceFuncEx}\n${sliceCore}\n${sliceNextInfo}\n${sliceNextBooking}\nreturn { buildNextBookingList };`)();
} catch (e) {
  console.error('[regression] 다음 예약 필요 헬퍼 추출 실패:', e.message);
}
function nbScenario(name, fn) {
  if (!nextBookingLib) return [name, false];
  try { return [name, !!fn(nextBookingLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── PT 잔여 횟수·재등록 관리: 실제 실행 시나리오 검증 ──
// 잔여 계산은 회원 상세 카드·상단 요약이 모두 getPtBalance() 하나만 쓰므로, 원본 소스를 그대로 슬라이스해 실행한다.
// 핵심 불변식: ① 기준(baseline) 이전 수업은 절대 차감되지 않는다 ② 같은 수업은 몇 번을 다시 저장·공개해도 1회만 차감된다.
let ptBalanceLib = null;
try {
  const sliceFuncEx = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  const sliceMillis = app.slice(app.indexOf('function toMillisSafe'), app.indexOf('function isAtOrAfterHomeTaskCutoff'));
  const slicePt = app.slice(app.indexOf('function isTrialSessionNo'), app.indexOf('function buildUnsentSessionMembers'));
  ptBalanceLib = new Function(`${sliceFuncEx}\n${sliceMillis}\n${slicePt}\nreturn { getPtBalance, getPtBalanceBaseline, isPtDebitableSession, countPtDebitedSessions, getPtSessionCompletedAtMs, summarizePtRegistrations, getPtBalanceStatus, needsPtRenewalNotice, getPtBalanceSummary, buildPtBalanceCachePatch, isPtRenewalNoticeHandled, buildPtRenewalNoticeList, isTrialSessionNo, sessionNoToNumber, PT_BALANCE_LOW_THRESHOLD, PT_BALANCE_URGENT_THRESHOLD };`)();
} catch (e) {
  console.error('[regression] PT 잔여 횟수 헬퍼 추출 실패:', e.message);
}
function ptScenario(name, fn) {
  if (!ptBalanceLib) return [name, false];
  try { return [name, !!fn(ptBalanceLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}
// 회원앱 비노출 검사용 — "실제로 렌더링되는 코드"만 남긴다.
// 블록 주석(JSX의 {/* ... */} 포함)과 한 줄 전체가 주석인 줄을 제거한다.
// 줄 중간의 //는 문자열 안 URL(https://...)일 수 있어 건드리지 않는다(과다 제거로 검사가 헐거워지는 것 방지).
function stripCommentsForRenderCheck(src) {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
}
const memberAppRenderRegion = () => stripCommentsForRenderCheck(
  app.slice(app.indexOf('function MemberApp({ onLogout })'), app.indexOf('function AdminMemberAppInviteButton'))
);

// 공통 픽스처 — 기준일 2026-08-07(잔여 8회 · 재등록 2회), 오늘은 2026-08-31로 고정
const PT_BASELINE_AT = '2026-08-07T00:00:00.000Z';
const PT_TODAY = '2026-08-31';
const ptMember = (over = {}) => ({
  id: 'mA', ptBalanceInitialized: true, ptBalanceBaselineAt: PT_BASELINE_AT,
  ptBalanceBaselineDate: '2026-08-07', ptBalanceBaselineRemaining: 8, ptBalanceBaselineRenewalCount: 2, ...over,
});
// 기본값 = 기준 이후 새로 기록되고 실제로 완료(회원 공개)된 정상 PT 수업(차감 대상)
// completedAt = publishSession()이 최초 공개 때 1회만 기록하는 완료 확정 시각(차감 판정의 유일한 기준)
const ptSession = (over = {}) => ({
  id: 's1', date: '2026-08-10', sessionNo: 1, isPublished: true, status: 'published',
  createdAt: '2026-08-10T01:00:00.000Z', publishedAt: '2026-08-10T02:00:00.000Z', completedAt: '2026-08-10T02:00:00.000Z',
  exercises: [{ name: '벤치프레스', sets: [{ weight: 40, reps: 10 }] }], ...over,
});

// ── 유입 분석(방문계기 정규화·기간 비교·중복 집계 방지): 실제 실행 시나리오 검증 ──
// 회원 프로필(survey.visit*) · 상담 문서(평탄 visit*) · 온보딩 v2(v2.acquisition) 세 구조를 하나로 읽는
// 공용 selector 원본 코드를 그대로 슬라이스해 실행한다(로직을 옮겨 적지 않고 원본 자체를 검증).
let acquisitionLib = null;
try {
  const sliceAcq = app.slice(app.indexOf('const ACQUISITION_FIRST_TOUCH_OPTIONS'), app.indexOf('// 온보딩 v2의 세부 목표(12종)'));
  acquisitionLib = new Function(`${sliceAcq}\nreturn { normalizeMemberAcquisitionData, normalizeAcquisitionChannel, normalizeAiSourceList, buildAcquisitionRows, summarizeAcquisitionRows, acqDelta, buildAcquisitionPeriod, inAcqRange, getAcquisitionDate, buildAcquisitionBuckets, buildAcquisitionInsights, buildAcquisitionActions, maskAcquisitionName, ACQ_UNKNOWN, ACQ_AI_CHANNEL, ACQ_AI_UNSPECIFIED, ACQ_AI_OTHER, ACQ_CANONICAL_CHANNELS, ACQUISITION_CHANNEL_OPTIONS, acqSourceTimestampMs, acqPickNewerCandidate, acqSourceOriginLabel };`)();
} catch (e) {
  console.error('[regression] 유입 분석 정규화 로직 추출 실패:', e.message);
}
function acqScenario(name, fn) {
  if (!acquisitionLib) return [name, false];
  try { return [name, !!fn(acquisitionLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 방문계기 수정 timestamp(survey.visitUpdatedAt) 계산 로직: 실제 실행 시나리오 검증 ──
// db.js는 Firestore SDK(serverTimestamp 등)를 import하므로 그대로 실행할 수 없어, serverTimestamp만
// 스텁으로 주입하고 원본 헬퍼 코드 자체를 슬라이스해 실행한다.
let visitUpdatedAtLib = null;
try {
  const sliceVisit = db.slice(db.indexOf('const SURVEY_VISIT_FIELDS'), db.indexOf('export async function addMember'));
  visitUpdatedAtLib = new Function('serverTimestamp', `${sliceVisit}\nreturn { computeVisitUpdatedAt, surveyVisitFieldsEqual, surveyHasAnyVisitData };`)(() => '__SERVER_TS__');
} catch (e) {
  console.error('[regression] 방문계기 timestamp 로직 추출 실패:', e.message);
}
function visitAtScenario(name, fn) {
  if (!visitUpdatedAtLib) return [name, false];
  try { return [name, !!fn(visitUpdatedAtLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 회원 상세 "오늘 수업" 카드 부위별 근육통·통증 "최근 상태" 참고 표시: 실제 실행 시나리오 검증 ──
// getHubBodyPartAwareness는 선택을 막지 않고(HubScreen의 partChip onClick은 항상 동작), 참고 경고 판정에만 쓰인다.
let hubAwarenessLib = null;
try {
  const sliceKoreaDate = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function getKoreaYesterdayDateString'));
  const sliceDaysDiff = app.slice(app.indexOf('function koreaDateDaysDiff(fromDateStr,toDateStr){'), app.indexOf('function getPersonalWorkoutCompletionDateKey'));
  const sliceNormalize = app.slice(app.indexOf('function normalizePersonalWorkoutSoreness'), app.indexOf('function sorenessTimingLabel'));
  const sliceLevelDesc = app.slice(app.indexOf('function sorenessTimingLabel'), app.indexOf('function getPersonalWorkoutAttentionReasons'));
  const sliceFeedbackParts = app.slice(app.indexOf('function memberFeedbackParts(existing={})'), app.indexOf('function formatSorenessBodyParts'));
  const sliceAwareness = app.slice(app.indexOf('const HUB_SORENESS_RECENCY_DAYS'), app.indexOf('function HubScreen('));
  hubAwarenessLib = new Function(`${sliceKoreaDate}\n${sliceDaysDiff}\n${sliceNormalize}\n${sliceLevelDesc}\n${sliceFeedbackParts}\n${sliceAwareness}\nreturn { getHubBodyPartAwareness, HUB_SORENESS_RECENCY_DAYS, HUB_PAIN_RECENCY_DAYS };`)();
} catch (e) {
  console.error('[regression] 오늘 수업 카드 부위 경고 로직 추출 실패:', e.message);
}
function hbaScenario(name, fn) {
  if (!hubAwarenessLib) return [name, false];
  try { return [name, !!fn(hubAwarenessLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 개인운동 공통 계산 헬퍼: 실제 실행 시나리오 검증 ──
// 회원앱 기록 화면·목록·상세와 관리자 "최근 개인운동" 카드가 모두 같은 함수를 쓰므로, 원본 소스를 그대로
// 슬라이스해 실행한다(로직을 여기에 다시 옮겨 적지 않는다). 볼륨은 기존 exVol을, 식별자는 기존
// canonicalExerciseKey를 재사용하므로 그 원본 구간까지 함께 잘라 같은 스코프에서 실행한다.
let personalWorkoutLib = null;
try {
  const sliceLimits = db.slice(db.indexOf('export const PERSONAL_WORKOUT_LIMITS'), db.indexOf('export async function getPersonalWorkouts')).replace('export const', 'const');
  const sliceMuscleConst = app.slice(app.indexOf('const EQUIP_LIST'), app.indexOf('const AI_GOAL_OPTIONS'));
  // 가져오기(개인운동 2차 3단계)는 "오늘의 운동 부위 → muscleTop" 매핑과 신규 운동/세트 기본값 생성기를 재사용하므로
  // 그 원본 구간도 같은 스코프에 넣는다(값을 여기에 다시 적지 않는다).
  const sliceSessionParts = app.slice(app.indexOf('const SESSION_BODY_PART_OPTIONS'), app.indexOf('// type(string) → selectedTypes(array) 호환 변환'));
  const sliceMkEx = app.slice(app.indexOf('function mkSet()'), app.indexOf('// 네트워크 지연/오프라인 큐잉'));
  const sliceFuncEx = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  const sliceFuncVol = app.slice(app.indexOf('function funcExVol'), app.indexOf('function funcExStats'));
  const sliceExVol = app.slice(app.indexOf('const ASSIST_MACHINE_KEYWORDS'), app.indexOf('const CSS = `'));
  const sliceBadge = app.slice(app.indexOf('const MUSCLE_TOP_BADGE_LABEL'), app.indexOf('const GROWTH_METRIC_DEFS'));
  const sliceDateLabel = app.slice(app.indexOf('const KOREAN_DAY_NAMES'), app.indexOf('function rpeDescription'));
  const sliceWeightFmt = app.slice(app.indexOf('function formatWeightValue'), app.indexOf('function ChangeReportMetric'));
  const sliceSuggestConst = app.slice(app.indexOf('const EX_MUSCLE_SUGGEST'), app.indexOf('const EXERCISE_LIBRARY'));
  const sliceLib = app.slice(app.indexOf('const EXERCISE_LIBRARY'), app.indexOf('function normalizeToKoreaDateKey'));
  // 비교 헬퍼(개인운동 2차 1단계)는 방향 라벨에 formatMonthDayKo를 쓰므로 그 원본 구간도 같은 스코프에 함께 넣는다.
  const sliceMonthDayKo = app.slice(app.indexOf('function formatMonthDayKo'), app.indexOf('function formatWhenLabel'));
  // 슬라이스 끝 경계는 첫 JSX 컴포넌트 직전(MemberExerciseComparison)까지다 — JSX가 섞이면 new Function 파싱이 깨진다.
  const slicePersonal = app.slice(app.indexOf('const PERSONAL_WORKOUT_PART_OPTIONS'), app.indexOf('function MemberExerciseComparison'));
  personalWorkoutLib = new Function(
    `${sliceLimits}\n${sliceMuscleConst}\n${sliceSessionParts}\n${sliceMkEx}\n${sliceFuncEx}\n${sliceFuncVol}\n${sliceExVol}\n${sliceBadge}\n${sliceDateLabel}\n${sliceWeightFmt}\n${sliceMonthDayKo}\n${sliceSuggestConst}\n${sliceLib}\n${slicePersonal}\n` +
    'return { PERSONAL_WORKOUT_LIMITS, PERSONAL_WORKOUT_PART_OPTIONS, getPersonalWorkoutPartChipOptions, canonicalExerciseKey, normalizePersonalWorkout, normalizePersonalWorkoutSet, normalizePersonalWorkoutExercise, calculatePersonalExerciseVolume, calculatePersonalWorkoutTotals, collectPersonalWorkoutExerciseKeys, summarizePersonalWorkoutExercise, formatPersonalWorkoutPartsLabel, buildPersonalWorkoutCardSummary, getPersonalWorkoutDurationMinutes, formatPersonalWorkoutDuration, getPersonalWorkoutValidSets, getLastCompletedPersonalExerciseRecord, buildPersonalExerciseCandidates, validatePersonalWorkoutForComplete, ' +
    'normalizeComparableExercise, buildExercisePerformanceSnapshot, compareExercisePerformance, formatExerciseComparisonSummary, buildMemberExerciseComparisonIndex, formatExerciseSnapshotLine, getExerciseRecordDateKey, ' +
    'buildSessionPrepSummary, buildNextStartWeightRecommendation, getDayDiffFromDateKeys, formatElapsedDayLabel, getExerciseRecordOrder, getExerciseRecordTimeMs, ' +
    'mkEx, mkSet, getCompletedPersonalWorkoutsLatestFirst, PERSONAL_WORKOUT_IMPORT_LIST_LIMIT, buildPersonalWorkoutImportCandidates, buildPersonalWorkoutImportOptions, resolveImportedMuscleTop, ' +
    'buildImportedSessionSet, buildSessionExerciseDraftFromPersonalExercise, isBlankSessionExerciseCard, isSessionExerciseListEssentiallyEmpty, ' +
    'getSessionExerciseCanonicalKey, analyzePersonalWorkoutImportMerge, applyPersonalWorkoutImport };'
  )();
} catch (e) {
  console.error('[regression] 개인운동 헬퍼 추출 실패:', e.message);
}
function pwScenario(name, fn) {
  if (!personalWorkoutLib) return [name, false];
  try { return [name, !!fn(personalWorkoutLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 개인운동 종목 검색 시트 iOS 키보드 대응: 순수 함수 실제 실행 시나리오 검증 ──
// visualViewport 스냅샷 → (키보드에 가려진 높이, 시트 가용 높이) 계산은 JSX/훅과 분리된 순수 함수(computeKeyboardSheetLayout)라
// 원본 소스를 그대로 슬라이스해 실행한다.
let keyboardSheetLib = null;
try {
  // 이 슬라이스에는 computeKeyboardSheetLayout뿐 아니라 변화 임계값 판정 함수(keyboardSheetLayoutChanged)도
  // 함께 들어 있다 — 검색 결과 개수 변화로 인한 미세한 값 흔들림이 리렌더로 이어지지 않는지 그대로 검증한다.
  const sliceCompute = app.slice(app.indexOf('function computeKeyboardSheetLayout'), app.indexOf('function useKeyboardAwareViewport'));
  keyboardSheetLib = new Function(`${sliceCompute}\nreturn { computeKeyboardSheetLayout, keyboardSheetLayoutChanged, KEYBOARD_SHEET_CHANGE_THRESHOLD };`)();
} catch (e) {
  console.error('[regression] 키보드 시트 레이아웃 헬퍼 추출 실패:', e.message);
}
function ksScenario(name, fn) {
  if (!keyboardSheetLib) return [name, false];
  try { return [name, !!fn(keyboardSheetLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 신규 수업 기록 초기값(날짜·오늘의 운동 부위): 실제 실행 시나리오 검증 ──
// 회원 상세 "다음 수업 준비"(nextWorkoutDate/nextWorkoutPart)가 신규 수업일지 초기값으로 그대로 연결되는지,
// 기존 기록 수정은 절대 덮이지 않는지를 원본 소스 그대로 슬라이스해 실행한다.
let sessionInitLib = null;
try {
  const sliceKoreaDate = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function getKoreaYesterdayDateString'));
  const sliceTypes = app.slice(app.indexOf('const SESSION_TYPE_OPTIONS'), app.indexOf('function calculateKoreanAgeFromBirthYear'));
  const sliceNextParts = app.slice(app.indexOf('const NEXT_PT_PART_OPTIONS'), app.indexOf('function normalizeEmail'));
  const sliceInit = app.slice(app.indexOf('function normalizeToKoreaDateKey'), app.indexOf('function PersonalWorkoutRecordPickerSheet'));
  sessionInitLib = new Function(`${sliceKoreaDate}\n${sliceTypes}\n${sliceNextParts}\n${sliceInit}\nreturn { getInitialNewSessionValues, normalizeToKoreaDateKey, parseNextParts, SESSION_BODY_PART_OPTIONS, normalizeTypes, getKoreaDateString };`)();
} catch (e) {
  console.error('[regression] 신규 수업 초기값 헬퍼 추출 실패:', e.message);
}
function siScenario(name, fn) {
  if (!sessionInitLib) return [name, false];
  try { return [name, !!fn(sessionInitLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

// ── 회원 목록 "오늘 수업"/"미기록" 분류(2026-08-05): 실제 실행 시나리오 검증 ──
// 수업 날짜는 createdAt/updatedAt 등 기록 시각이 아니라 세션 date·다음 수업 준비 날짜만으로 판정돼야 하며,
// 과거 예정인데 미기록인 건은 "미기록"으로, 과거인데 이미 저장/완료된 건은 어디에도 노출되지 않아야 한다.
let todaySessionLib = null;
try {
  const sliceKoreaDate = app.slice(app.indexOf('function getKoreaDateString'), app.indexOf('function getKoreaYesterdayDateString'));
  const sliceFuncEx = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  // TODAY_STATUS_STYLE/PAST_UNRECORDED_STYLE(색상 상수, DB 참조)은 판정 로직에 필요 없어 슬라이스에서 제외한다.
  const sliceCore = app.slice(app.indexOf('function normalizeSessionDateKey'), app.indexOf('const TODAY_STATUS_STYLE'));
  const sliceSort = app.slice(app.indexOf('function getTodaySortTimeKey'), app.indexOf('function nextSessionInfoLabel'));
  const sliceNextInfo = app.slice(app.indexOf('function getMemberNextSessionInfo'), app.indexOf('function getNextWorkoutSummary'));
  todaySessionLib = new Function(`${sliceKoreaDate}\n${sliceFuncEx}\n${sliceCore}\n${sliceSort}\n${sliceNextInfo}\nreturn { getKoreaDateString, normalizeSessionDateKey, getMemberNextSessionInfo, getTodaySessionStatus, getPastUnrecordedInfo, isTodaySessionMember, getTodaySortTimeKey };`)();
} catch (e) {
  console.error('[regression] 오늘 수업 분류 헬퍼 추출 실패:', e.message);
}
function tsScenario(name, fn) {
  if (!todaySessionLib) return [name, false];
  try { return [name, !!fn(todaySessionLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}

const daysAgoStr = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysFromNowStr = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
function wgScenario(name, fn) {
  if (!workoutGuideLib) return [name, false];
  try { return [name, !!fn(workoutGuideLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}
const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

const unsentMockMember = (id, over = {}) => ({ id, name: id, status: 'active', ...over });
const unsentMockDate = daysAgoStr(1);
const unsentToday = daysAgoStr(0);
// 홈 "수업일지 미확인" cutoff 테스트용 — 회귀 스크립트는 항상 배포(cutoff) 이후에 실행되므로 "지금"은 항상 cutoff 이후,
// "1년 전"은 항상 cutoff 이전으로 취급해도 안전하다.
const unsentPublishedAfterCutoff = new Date().toISOString();
const unsentPublishedBeforeCutoff = new Date(Date.now() - 365 * 86400000).toISOString();
const checks = [
  ['수업일지 저장', app.includes('async function handleSaveSession') && app.includes('addSession(member.id, { ...payload, createdAt: now })') && app.includes('updateSession(member.id, editSess.id, payload)') && app.includes('await withTimeout(writePromise')],
  ['수업일지 저장: 좁은 화면 무한 로딩 원인(SessionScreen 저장 버튼에 중복 클릭 가드·저장 중 표시가 전혀 없던 문제) 수정', (() => {
    const i = app.indexOf('function SessionScreen(');
    const j = app.indexOf('function CardSaveView');
    const slice = app.slice(i, j);
    return slice.includes('const savingRef = useRef(false);') &&
      slice.includes('const [saving, setSaving] = useState(false);') &&
      slice.includes('async function handleSave()') &&
      slice.includes('if (savingRef.current) return;') &&
      slice.includes('await onSave(payload);') &&
      slice.includes('savingRef.current = false;') &&
      slice.includes('setSaving(false);');
  })()],
  ['수업일지 저장: 상단·하단 저장 버튼 모두 저장 중에는 disabled + "저장 중..." 표시(중복 저장 방지)', (() => {
    const i = app.indexOf('function SessionScreen(');
    const j = app.indexOf('function CardSaveView');
    const slice = app.slice(i, j);
    return slice.includes('<button onClick={handleSaveTop} disabled={saving}') &&
      slice.includes('{saving ? "저장 중..." : `💾 ${isOwner(member) ? "운동 저장" : "저장"}`}') &&
      slice.includes('<Btn full onClick={handleSave} disabled={saving}');
  })()],
  ...[
    ['수업일지 미전송: 0회차(숫자) + 미전송 → 목록에서 제외', lib => {
      const members = [unsentMockMember('trial_num')];
      const sessionsMap = { trial_num: [{ sessionNo: 0, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['수업일지 미전송: 0회차(문자열 "0"/"0회차") + 미전송 → 목록에서 제외', lib => {
      const members = [unsentMockMember('trial_str1'), unsentMockMember('trial_str2')];
      const sessionsMap = {
        trial_str1: [{ sessionNo: '0', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }],
        trial_str2: [{ sessionNo: '0회차', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }],
      };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['수업일지 미전송: 1회차 이상 + 미전송 → 기존처럼 목록에 표시', lib => {
      const members = [unsentMockMember('real1')];
      const sessionsMap = { real1: [{ sessionNo: 1, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['수업일지 미전송: 1회차 이상 + 전송 완료 → 목록에서 제외', lib => {
      const members = [unsentMockMember('sent1')];
      const sessionsMap = { sent1: [{ sessionNo: 2, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: true }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['수업일지 미전송: 회차 정보 없음/파싱 불가 + 미전송 → 0회차로 간주하지 않고 기존처럼 표시', lib => {
      const members = [unsentMockMember('nono1'), unsentMockMember('nono2')];
      const sessionsMap = {
        nono1: [{ date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }],
        nono2: [{ sessionNo: '', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }],
      };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 2;
    }],
    ['수업일지 미전송: 관리자가 이 기록만 보류(journalSendDeferred=true)하면 목록에서 제외', lib => {
      const members = [unsentMockMember('def1')];
      const sessionsMap = { def1: [{ id: 'sA', sessionNo: 1, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false, journalSendDeferred: true }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['수업일지 미전송: 보류 해제(journalSendDeferred=false) + 여전히 미전송 → 다시 목록에 표시', lib => {
      const members = [unsentMockMember('def2')];
      const sessionsMap = { def2: [{ id: 'sA', sessionNo: 1, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false, journalSendDeferred: false }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['수업일지 미전송: 같은 회원의 A수업만 보류해도 B수업(미전송)은 정상 표시 — 회원 단위가 아닌 세션 문서 단위 필터', lib => {
      const members = [unsentMockMember('def3')];
      const sessionsMap = { def3: [
        { id: 'sA', sessionNo: 1, date: daysAgoStr(2), exercises: [{ name: '스쿼트' }], isPublished: false, journalSendDeferred: true },
        { id: 'sB', sessionNo: 2, date: unsentMockDate, exercises: [{ name: '벤치프레스' }], isPublished: false, journalSendDeferred: false },
      ] };
      const rows = lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday);
      return rows.length === 1 && rows[0].count === 1 && rows[0].sessionId === 'sB';
    }],
    ['수업일지 미전송: 실제 전송 완료(isPublished=true)면 보류 여부와 무관하게 목록에 안 나타남(전송이 최우선 상태)', lib => {
      const members = [unsentMockMember('def4')];
      const sessionsMap = { def4: [{ id: 'sA', sessionNo: 1, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: true, journalSendDeferred: true }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['수업일지 미전송(홈): teo(대표) 개인 기록은 조건을 만족해도 제외(isExcludedAdminMember)', lib => {
      const members = [{ id: 'teo_unsent', name: 'teo_unsent', status: 'active', isOwner: true }];
      const sessionsMap = { teo_unsent: [{ sessionNo: 1, date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: false }] };
      return lib.buildUnsentSessionMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['수업일지 회원 확인: 읽음 기록이 없으면 getSessionReadStatus가 isRead:false를 반환', lib => {
      return lib.getSessionReadStatus('s1', {}).isRead === false;
    }],
    ['수업일지 회원 확인: firstReadAt이 있는 readMap 항목은 isRead:true + readCount 유지', lib => {
      const status = lib.getSessionReadStatus('s1', { s1: { firstReadAt: '2026-07-30', lastReadAt: '2026-07-31', readCount: 3 } });
      return status.isRead === true && status.readCount === 3 && status.firstReadAt === '2026-07-30';
    }],
    ['수업일지 회원 확인: formatSessionReadTime이 같은 해는 "M월 D일 HH:mm"으로 표시', lib => {
      const sameYear = new Date(new Date().getFullYear(), 6, 30, 13, 12);
      return /^7월 30일 13:12$/.test(lib.formatSessionReadTime(sameYear));
    }],
    ['수업일지 회원 확인: formatSessionReadTime이 다른 해는 "YYYY.MM.DD HH:mm"으로 표시', lib => {
      return /^\d{4}\.07\.30 13:12$/.test(lib.formatSessionReadTime(new Date(2020, 6, 30, 13, 12))) && !lib.formatSessionReadTime(new Date(2020, 6, 30, 13, 12)).startsWith(String(new Date().getFullYear()));
    }],
    ['수업일지 회원 확인: summarizeSessionReadStatus가 공개 세션만·최근 n건만 집계(비공개 제외)', lib => {
      const sessions = [
        { id: 'a', date: '2026-07-01', isPublished: true }, { id: 'b', date: '2026-07-02', isPublished: true },
        { id: 'c', date: '2026-07-03', isPublished: true }, { id: 'd', date: '2026-07-04', isPublished: false },
        { id: 'e', date: '2026-07-05', isPublished: true },
      ];
      const readMap = { a: { firstReadAt: '2026-07-01' }, c: { firstReadAt: '2026-07-03' } };
      const summary = lib.summarizeSessionReadStatus(sessions, readMap, 5);
      return summary.total === 4 && summary.readCount === 2 && summary.unreadCount === 2;
    }],
    ['수업일지 미확인(홈): 공개+최근 14일 이내+미확인+cutoff 이후 발행 → 목록에 포함', lib => {
      const members = [unsentMockMember('unread1')];
      const sessionsMap = { unread1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: unsentPublishedAfterCutoff }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 1;
    }],
    ['수업일지 미확인(홈): 이미 확인한 기록은 목록에서 제외', lib => {
      const members = [unsentMockMember('read1')];
      const sessionsMap = { read1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: unsentPublishedAfterCutoff }] };
      const readsByMember = { read1: { s1: { firstReadAt: unsentMockDate } } };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, readsByMember, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈): 비공개 기록은 미확인 통계 대상이 아님(미전송 영역)', lib => {
      const members = [unsentMockMember('unpub1')];
      const sessionsMap = { unpub1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: false, publishedAt: unsentPublishedAfterCutoff }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈): 14일보다 오래된 공개·미확인 기록은 홈 알림 대상에서 제외', lib => {
      const members = [unsentMockMember('old1')];
      const sessionsMap = { old1: [{ id: 's1', sessionNo: 3, date: daysAgoStr(20), isPublished: true, publishedAt: unsentPublishedAfterCutoff }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈): 테스트 회원/대표(TEO) 개인 기록은 제외', lib => {
      const members = [
        { id: 'test1', name: 'test1', status: 'active', isTestMember: true },
        { id: 'teo_unread', name: 'teo_unread', status: 'active', isOwner: true },
      ];
      const sessionsMap = {
        test1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: unsentPublishedAfterCutoff }],
        teo_unread: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: unsentPublishedAfterCutoff }],
      };
      // teo(isOwner)도 회원전용앱에서 실제로 운동일지를 확인할 수 있게 됐지만(canUseMemberLinkedFeatures),
      // 홈 "수업일지 미확인" 운영 집계에서는 isExcludedAdminMember로 계속 제외되어야 한다.
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    // ── 홈 cutoff: 배포 기준 시각 이전 발행분은 제외, 이후 발행분만 포함(레거시·경계값 포함) ──
    ['수업일지 미확인(홈) cutoff: 기준 시각 이전에 발행되고 미확인 → 제외', lib => {
      const members = [unsentMockMember('beforecutoff1')];
      const sessionsMap = { beforecutoff1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: unsentPublishedBeforeCutoff }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈) cutoff: 기준 시각 이후에 발행되고 미확인 → 포함', lib => {
      const members = [unsentMockMember('aftercutoff1')];
      const sessionsMap = { aftercutoff1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: unsentPublishedAfterCutoff }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 1;
    }],
    ['수업일지 미확인(홈) cutoff: 발행 시각(publishedAt)이 없는 레거시 기록 → 제외', lib => {
      const members = [unsentMockMember('legacy1')];
      const sessionsMap = { legacy1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈) cutoff: 기준 시각과 정확히 같은 시각에 발행되고 미확인 → 포함(경계값 포함)', lib => {
      const members = [unsentMockMember('exactcutoff1')];
      const sessionsMap = { exactcutoff1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true, publishedAt: lib.HOME_TASK_CUTOFF_AT }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 1;
    }],
    ['홈 cutoff 헬퍼: toMillisSafe/isAtOrAfterHomeTaskCutoff가 값 없음/파싱 불가를 null(=제외)로 처리', lib => {
      return lib.toMillisSafe(null) === null && lib.toMillisSafe(undefined) === null && lib.toMillisSafe('not-a-date') === null &&
        lib.isAtOrAfterHomeTaskCutoff(null) === false && lib.isAtOrAfterHomeTaskCutoff(undefined) === false;
    }],
    // ── 회원 앱 이용 현황: hasRealFeedbackInput/getRecentFeedbackInputStats ──
    ['앱 이용 현황: 몸 상태 미저장(undefined) → 입력 완료 아님', lib => lib.hasRealFeedbackInput(undefined) === false],
    ['앱 이용 현황: sorenessLevel "없음"만 저장(rpe/메모 없음) → 기본값만 저장된 것으로 보고 입력 완료 아님', lib => lib.hasRealFeedbackInput({ sorenessLevel: '없음' }) === false],
    ['앱 이용 현황: RPE만 저장돼도 입력 완료로 인정', lib => lib.hasRealFeedbackInput({ rpe: 6 }) === true],
    ['앱 이용 현황: 메모만 저장돼도 입력 완료로 인정(공백만은 제외)', lib => lib.hasRealFeedbackInput({ memo: '괜찮았어요' }) === true && lib.hasRealFeedbackInput({ memo: '   ' }) === false],
    ['앱 이용 현황: 실제 근육통(없음 아님)이 저장되면 입력 완료로 인정', lib => lib.hasRealFeedbackInput({ sorenessLevel: '보통', sorenessBodyParts: ['하체'] }) === true],
    ['앱 이용 현황: getRecentFeedbackInputStats가 공개 세션 최근 n건만 집계하고 펼치기만 한 세션은 입력으로 세지 않음', lib => {
      const sessions = [
        { id: 'a', date: '2026-07-01', isPublished: true, memberFeedback: { rpe: 7, updatedAt: '2026-07-01T10:00:00Z' } },
        { id: 'b', date: '2026-07-02', isPublished: true, memberFeedback: { sorenessLevel: '없음' } },
        { id: 'c', date: '2026-07-03', isPublished: true },
        { id: 'd', date: '2026-07-04', isPublished: false, memberFeedback: { rpe: 9 } },
        { id: 'e', date: '2026-07-05', isPublished: true, memberFeedback: { memo: '허리가 뻐근했어요', updatedAt: '2026-07-05T10:00:00Z' } },
      ];
      const stats = lib.getRecentFeedbackInputStats(sessions, 4);
      return stats.total === 4 && stats.inputCount === 2 && stats.lastInputAt === '2026-07-05T10:00:00Z';
    }],
    // ── 회원 앱 이용 현황: formatRelativeActiveTime/getMemberLastActiveStatus ──
    ['앱 이용 현황: 이용 기록이 없으면 "이용 기록 없음"', lib => lib.formatRelativeActiveTime(null) === '이용 기록 없음'],
    // T03:00:00Z(=KST 정오, 자정 경계와 무관하게 안전)로 명시적 UTC 시각을 고정해 테스트 실행 서버의 로컬 타임존과 무관하게 KST 날짜가 정확히 일치하게 한다.
    ['앱 이용 현황: 어제 이용은 "어제"로 표시', lib => lib.formatRelativeActiveTime(new Date(`${daysAgoStr(1)}T03:00:00Z`)) === '어제'],
    ['앱 이용 현황: 30일 넘게 지난 이용은 "N일 전 · M월 D일" 형태로 날짜 병기', lib => /^\d+일 전 · \d+월 \d+일$/.test(lib.formatRelativeActiveTime(new Date(`${daysAgoStr(40)}T03:00:00Z`)))],
    ['앱 이용 현황: getMemberLastActiveStatus가 요약 없으면 hasUsage:false + activeDays30:0', lib => {
      const status = lib.getMemberLastActiveStatus({ summary: null, activeDays30: 0 });
      return status.hasUsage === false && status.activeDays30 === 0;
    }],
    // ── 회원 앱 이용 현황: getInactiveAppMembers(홈 "최근 이용 없음") ──
    ['앱 이용 현황(홈): 앱 초대 전 회원은 미사용 경고 대상에서 제외', lib => {
      const members = [{ id: 'notinvited1', name: 'a', status: 'active' }];
      return lib.getInactiveAppMembers(members, {}, {}, unsentToday).length === 0;
    }],
    ['앱 이용 현황(홈): 초대 후 7일 이내(그레이스 기간)는 이용 기록이 없어도 제외', lib => {
      const members = [{ id: 'invited1', name: 'a', status: 'active', memberAppInviteSentAt: daysAgoStr(3) }];
      return lib.getInactiveAppMembers(members, {}, {}, unsentToday).length === 0;
    }],
    ['앱 이용 현황(홈): 초대 후 7일 이상 지났는데 이용 기록이 전혀 없으면 대상에 포함', lib => {
      const members = [{ id: 'invited2', name: 'a', status: 'active', memberAppInviteSentAt: daysAgoStr(10) }];
      return lib.getInactiveAppMembers(members, {}, {}, unsentToday).length === 1;
    }],
    ['앱 이용 현황(홈): 최근 7일 이내 이용 기록이 있으면 제외', lib => {
      const members = [{ id: 'active1', name: 'a', status: 'active', memberAppInviteSentAt: daysAgoStr(30) }];
      const summaryMap = { active1: { lastActiveAt: daysAgoStr(2) } };
      return lib.getInactiveAppMembers(members, {}, summaryMap, unsentToday).length === 0;
    }],
    ['앱 이용 현황(홈): 마지막 이용이 7일 이상 지났으면 대상에 포함 + daysSinceActive 정확히 계산', lib => {
      const members = [{ id: 'old1', name: 'a', status: 'active', memberAppInviteSentAt: daysAgoStr(30) }];
      const summaryMap = { old1: { lastActiveAt: daysAgoStr(10) } };
      const rows = lib.getInactiveAppMembers(members, {}, summaryMap, unsentToday);
      return rows.length === 1 && rows[0].daysSinceActive === 10;
    }],
    ['앱 이용 현황(홈): TEO 대표·테스트 회원은 제외', lib => {
      const members = [
        { id: 'teo1', name: 'teo1', status: 'active', isOwner: true, memberAppInviteSentAt: daysAgoStr(30) },
        { id: 'test2', name: 'test2', status: 'active', isTestMember: true, memberAppInviteSentAt: daysAgoStr(30) },
      ];
      return lib.getInactiveAppMembers(members, {}, {}, unsentToday).length === 0;
    }],
    ['앱 이용 현황(홈): 종료·휴회 등 비활성 회원은 제외', lib => {
      const members = [{ id: 'ended1', name: 'a', status: 'ended', memberAppInviteSentAt: daysAgoStr(30) }];
      return lib.getInactiveAppMembers(members, {}, {}, unsentToday).length === 0;
    }],
    // ── 회원 앱 이용 현황: getNoFeedbackActivityMembers(홈 "최근 몸 상태 입력 없음") ──
    ['앱 이용 현황(홈): 최근 공개 수업 자체가 없으면 몸 상태 미입력 대상이 아님', lib => {
      const members = [{ id: 'nopub1', name: 'a', status: 'active' }];
      const sessionsMap = { nopub1: [{ id: 's1', isPublished: false }] };
      return lib.getNoFeedbackActivityMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['앱 이용 현황(홈): 공개 수업은 있지만 최근 14일 내 근육통/RPE/메모 활동이 전혀 없으면 대상에 포함', lib => {
      const members = [{ id: 'nofb1', name: 'a', status: 'active' }];
      const sessionsMap = { nofb1: [{ id: 's1', isPublished: true }] };
      return lib.getNoFeedbackActivityMembers(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['앱 이용 현황(홈): 최근 14일 내 RPE 활동 기록이 있으면 제외', lib => {
      const members = [{ id: 'fb1', name: 'a', status: 'active', recentActivityLog: [{ type: 'rpe', at: Date.now() - 2 * 86400000 }] }];
      const sessionsMap = { fb1: [{ id: 's1', isPublished: true }] };
      return lib.getNoFeedbackActivityMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['앱 이용 현황(홈): 14일보다 오래된 활동 기록은 인정하지 않고 대상에 포함', lib => {
      const members = [{ id: 'oldfb1', name: 'a', status: 'active', recentActivityLog: [{ type: 'memo', at: Date.now() - 20 * 86400000 }] }];
      const sessionsMap = { oldfb1: [{ id: 's1', isPublished: true }] };
      return lib.getNoFeedbackActivityMembers(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['앱 이용 현황(홈): soreness/rpe/memo 이외 타입(예: weight) 활동은 몸 상태 입력으로 인정하지 않음', lib => {
      const members = [{ id: 'wfb1', name: 'a', status: 'active', recentActivityLog: [{ type: 'weight', at: Date.now() - 1 * 86400000 }] }];
      const sessionsMap = { wfb1: [{ id: 's1', isPublished: true }] };
      return lib.getNoFeedbackActivityMembers(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['앱 이용 현황(홈): teo(대표) 개인 기록은 몸 상태 미입력 조건을 만족해도 제외', lib => {
      const members = [{ id: 'teo_nofb', name: 'teo_nofb', status: 'active', isOwner: true }];
      const sessionsMap = { teo_nofb: [{ id: 's1', isPublished: true }] };
      return lib.getNoFeedbackActivityMembers(members, {}, sessionsMap, unsentToday).length === 0;
    }],
  ].map(([name, fn]) => usScenario(name, fn)),
  ...[
    ['다음 예약 필요: 마지막 수업 후 다음 일정이 없으면 목록에 표시', lib => {
      const members = [unsentMockMember('nb_a')];
      const sessionsMap = { nb_a: [{ id: 's1', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: true }] };
      return lib.buildNextBookingList(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['다음 예약 필요: 관리자가 "일정 미정"(scheduleFollowupStatus="pending")으로 보류하면 목록에서 제외', lib => {
      const members = [unsentMockMember('nb_b', { scheduleFollowupStatus: 'pending' })];
      const sessionsMap = { nb_b: [{ id: 's1', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: true }] };
      return lib.buildNextBookingList(members, {}, sessionsMap, unsentToday).length === 0;
    }],
    ['다음 예약 필요: 일정 미정 해제(빈 문자열) + 여전히 다음 일정 없으면 다시 목록에 표시', lib => {
      const members = [unsentMockMember('nb_c', { scheduleFollowupStatus: '' })];
      const sessionsMap = { nb_c: [{ id: 's1', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: true }] };
      return lib.buildNextBookingList(members, {}, sessionsMap, unsentToday).length === 1;
    }],
    ['다음 예약 필요: pending 상태여도 실제 다음 일정이 등록돼 있으면(자동 조건 자체 해당없음) 목록에 안 나타남', lib => {
      const members = [unsentMockMember('nb_d', { scheduleFollowupStatus: 'pending', nextWorkoutDate: daysFromNowStr(3) })];
      const sessionsMap = { nb_d: [{ id: 's1', date: unsentMockDate, exercises: [{ name: '스쿼트' }], isPublished: true }] };
      return lib.buildNextBookingList(members, {}, sessionsMap, unsentToday).length === 0;
    }],
  ].map(([name, fn]) => nbScenario(name, fn)),
  // ── 다음 예약 필요: "일정 미정 해제" 접근 경로 — 홈에서 "일정 미정"을 지정하면 members 실시간 구독에만 반영되고,
  // HubScreen의 member prop은 goHub 호출 당시 넘겨받은 객체를 그대로 쓸 뿐 회원 문서를 다시 읽지 않아 stale할 수 있다.
  // liveMembersById를 우선 사용하는 보정값(scheduleFollowupPending)이 없으면 해제 버튼 자체가 렌더링되지 않아
  // "설정은 되는데 해제할 방법이 없는" 상태에 빠진다 — 이 4개 체크가 그 회귀를 잡는다.
  ['일정 미정 해제 접근성: HubScreen이 liveMembersById를 전달받아 stale한 member prop 대신 실시간 값으로 일정 미정 상태를 판별한다', app.includes('const scheduleFollowupPending = (liveMembersById[member.id]?.scheduleFollowupStatus ?? member.scheduleFollowupStatus) === "pending";') && app.includes('liveMembersById={liveMembersById} />}')],
  ['회원 상세 "다음 수업 준비" 카드: 일정 미정 상태일 때만 안내 블록 + 해제 버튼이 노출된다(다른 회원에게는 안 보임)', app.includes('{scheduleFollowupPending && (') && app.includes('다음 일정 · 일정 미정 상태') && app.includes('onClick={handleReleaseFollowupPending}')],
  ['일정 미정 해제 버튼: Firestore scheduleFollowupStatus를 지워 홈 목록 자동 판정이 다시 그대로 작동하게 한다', app.includes('const handleReleaseFollowupPending = async()') && app.includes('scheduleFollowupStatus: "", scheduleFollowupUpdatedAt: new Date().toISOString()')],
  ['실제 다음 일정 등록 시 일정 미정 자동 해제: stale한 member prop이 아니라 liveMembersById 보정값(scheduleFollowupPending)을 기준으로 판단한다', app.includes('if (value && scheduleFollowupPending) {') && app.includes('patch.scheduleFollowupStatus = "";')],
  ['운동기록 저장', app.includes('exercises') && app.includes('sets') && app.includes('calcVol')],
  ['대표 운동기록 저장', app.includes('isOwner') && app.includes('OWNER_LEGACY_NAME') && app.includes('대표님')],
  ['체형평가 저장', db.includes('export async function saveAssessment') && db.includes('members", memberId, "assessments"')],
  ['건강관리 허브 저장', db.includes('export async function saveBodyCheck') && db.includes('export async function saveNutrition')],
  ['체중 그래프 표시', app.includes('getBodyWeightRecords') && app.includes('<LineChart') && app.includes('dataKey="weight"')],
  ['회원 대시보드 표시', app.includes('function MemberHome') && app.includes('변화 리포트') && app.includes('현재 목표') && app.includes('오늘의 운동 가이드')],
  ['최근 수정 정렬', app.includes('sortMode') && app.includes('updatedAt')],
  ['2:1 수업 저장', app.includes('handleSendPairSession') && app.includes('sendPairSession') && app.includes('member2')],
  ['Firebase 저장 구조', db.includes('collection(db, "members", memberId, "sessions")') && db.includes('doc(db, "members", memberId, "bodyCheck", "main")') && db.includes('doc(db, "members", memberId, "memberOnboarding", "main")')],
  ['회원앱 체중 저장 bodyCheck upsert', db.includes('export async function saveMemberHealthInputs') && db.includes('doc(db, "members", memberId, "bodyCheck", "main")') && db.includes('upsertRecordByDate(current.records || []') && db.includes('{ merge: true }')],
  ['Firestore Rules bodyCheck 회원 create/update/read 허용', firestoreRules.includes('match /bodyCheck/{docId}') && firestoreRules.includes('bodyCheckProfileCreateKeysAllowed') && firestoreRules.includes('bodyCheckProfileUpdateKeysAllowed') && firestoreRules.includes('docId == "main"')],
  ['회원앱 members.memberUid 쿼리 조회', memberProfileFn.includes('collection(db, "members")') && memberProfileFn.includes('where("memberUid", "==", uid)') && memberProfileFn.includes('limit(1)')],
  ['회원앱 memberAppIndex 미사용', !memberProfileFn.includes('memberAppIndex') && !app.includes('memberAppIndex')],
  ['Firestore Rules members 본인 list 허용', firestoreRules.includes('allow get, list: if canReadMemberData(resource.data)') && firestoreRules.includes('isMemberStatusActive(data)')],
  ['createMemberAppIndexForMember Cloud Function 제거', !functionsIndex.includes('exports.createMemberAppIndexForMember') && !functionsIndex.includes('memberAppIndex/{')],
  ['공지 대상 회원 엄격 필터 제거', app.includes('function isNoticeEligibleMember(m)') && !app.includes('m.remainingSessions==null') && !app.includes('status!=="active"') && app.includes('["deleted","archived","inactive"].includes(noticeMemberStatus(m))')],
  ['개별 공지 저장/회원앱 조회', db.includes('targetType=data.targetType==="member"?"member":"all"') && db.includes('targetMemberId=targetType==="member"') && db.includes('targetMemberName=targetType==="member"') && db.includes('where("targetType","==","member"),where("targetMemberId","==",memberId)')],

  // ── 수업일지 "회원 확인"(상세 열람) ──
  // 목록 노출만으로 마킹되는 기존 readSessions(배지 전용)와 별개로 members/{id}/sessionReads/{sessionId}에 firstReadAt/lastReadAt/readCount를 기록한다.
  ['수업일지 회원 확인: markSessionDetailRead가 firstReadAt은 최초 1회만, 이후엔 lastReadAt/readCount만 갱신',
    db.includes('export async function markSessionDetailRead(memberId, sessionId, source)') &&
    db.includes('"members", memberId, "sessionReads", sessionId') &&
    db.includes('firstReadAt: now, lastReadAt: now,') &&
    db.includes('readCount: prevCount + 1,')
  ],
  ['수업일지 회원 확인: getSessionReadMap이 관리자앱 표시용으로 회원별 확인 상태를 일괄 조회', db.includes('export async function getSessionReadMap(memberId)') && db.includes('collection(db, "members", memberId, "sessionReads")')],
  ['수업일지 회원 확인: 회원앱 수업 탭 "목록 노출"만으로는 호출되지 않고, 실제 펼침 시점(자동펼침/카드펼침/몸상태펼침)에서만 호출',
    app.includes('markSessionDetailRead(latestId,"auto_expanded_recent_session")') &&
    app.includes('if(s.id&&!wasOpen&&markSessionDetailRead)markSessionDetailRead(s.id,"session_content_open")') &&
    app.includes('if(next&&!expandedFeedbackIds.has(s.id)&&markSessionDetailRead)markSessionDetailRead(s.id,"body_status_open")')
  ],
  ['수업일지 회원 확인: 관리자앱 "회원앱 미리보기" 모달은 MemberJournal/MemberFeedbackForm을 재사용하지 않는 별도 컴포넌트라 확인 처리를 호출하지 않음',
    (() => {
      const start = app.indexOf('회원앱 미리보기 모달');
      const end = app.indexOf('function ', start);
      const modalBody = start !== -1 && end !== -1 ? app.slice(start, end) : '';
      return !!modalBody && !modalBody.includes('markSessionDetailRead');
    })()
  ],
  ['Firestore Rules sessionReads: 회원 본인만 공개(isPublished) 세션에 한해 기록 + firstReadAt/firstReadSource 이후 변경 불가',
    firestoreRules.includes('match /sessionReads/{sessionId}') &&
    firestoreRules.includes('get(/databases/$(database)/documents/members/$(memberId)/sessions/$(sessionId)).data.isPublished == true') &&
    firestoreRules.includes('request.resource.data.diff(resource.data).affectedKeys().hasOnly(["lastReadAt", "lastReadSource", "readCount"])')
  ],
  ['관리자앱: 히스토리 카드 회원 확인 배지 + 회원 상세 요약 + 홈 "수업일지 미확인"이 모두 공통 헬퍼(getSessionReadStatus 등) 재사용, 각자 재구현하지 않음',
    app.includes('function SessionReadBadge({ session, readMap, compact=false, ownerLabel=false })') &&
    app.includes('<SessionReadBadge session={s} readMap={sessionReadsMap} compact={isMobile} ownerLabel={isOwner(member)} />') &&
    app.includes('const readSummary = summarizeSessionReadStatus(sessions, sessionReadsMap, 5);') &&
    app.includes('function buildUnreadSessionMembers(members, liveMembersById, sessionsMap, sessionReadsMapByMember, todayKST)')
  ],
  ['관리자앱: teo(대표)도 회원 연동 기능(확인 배지 등)을 canUseMemberLinkedFeatures로 항상 사용 가능 — isOwner로 통째로 숨기지 않음',
    app.includes('function canUseMemberLinkedFeatures(member) {') &&
    app.includes('{canUseMemberLinkedFeatures(member) && <SessionReadBadge session={s} readMap={sessionReadsMap} compact={isMobile} ownerLabel={isOwner(member)} />}') &&
    !app.includes('{!isOwner(member) && <SessionReadBadge')
  ],

  // ── 회원 앱 이용 현황(관리자 전용 참고 지표) ──
  ['회원 앱 이용 현황: recordMemberAppUsage가 firstUsedAt/firstActiveAt은 최초 1회만 기록(summary+appUsageDays 배치 저장)',
    db.includes('export async function recordMemberAppUsage(memberId, tab)') &&
    db.includes('"members", memberId, "appUsage", "summary"') &&
    db.includes('"members", memberId, "appUsageDays", dateKey') &&
    db.includes('...(summarySnap.exists() ? {} : { firstUsedAt: now }),') &&
    db.includes('...(daySnap.exists() ? {} : { firstActiveAt: now }),')
  ],
  ['회원 앱 이용 현황: getMemberAppUsage(상세)가 최근 30일 이용일 수를 date>=cutoff 단일 where로 계산(복합 인덱스 불필요) + getMemberAppUsageSummary(홈 집계용 경량 조회)가 별도로 존재',
    db.includes('export async function getMemberAppUsage(memberId)') &&
    db.includes('query(collection(db, "members", memberId, "appUsageDays"), where("date", ">=", cutoffKey))') &&
    db.includes('export async function getMemberAppUsageSummary(memberId)')
  ],
  ['회원 앱 이용 현황: 회원앱은 home/workout/health/analysis/profile 탭 진입 시에만 기록하고 세션당 최소 10분 간격(sessionStorage)으로 스로틀 — 온보딩 중·테스트 회원은 제외(TEO 대표는 실사용 검증을 위해 더 이상 제외하지 않음)',
    app.includes('const APP_USAGE_MIN_INTERVAL_MS=10*60*1000;') &&
    app.includes('if(!profile?.id||profile.memberUid!==auth.currentUser?.uid||!onboardingDone||profile.isTestMember===true)return;') &&
    app.includes('recordMemberAppUsage(profile.id,tab).catch(()=>{});') &&
    !app.includes('isExcludedAdminMember(profile))return;')
  ],
  ['회원 앱 이용 현황: 관리자앱 회원 상세 카드가 최근 이용/최근 30일 이용/수업일지 확인/몸 상태 입력을 모두 기존 계산 함수 재사용으로 표시(회원앱에는 노출 안 함) — teo(대표)도 canUseMemberLinkedFeatures로 동일하게 표시',
    app.includes('const secAppUsage = canUseMemberLinkedFeatures(member) ? (() => {') &&
    app.includes('const lastActive = getMemberLastActiveStatus(memberAppUsage);') &&
    app.includes('const feedbackStats = getRecentFeedbackInputStats(sessions, 4);') &&
    !app.includes('const secAppUsage = isOwner(member) ? null')
  ],
  ['Firestore Rules appUsage/appUsageDays: 회원 본인만 자기 데이터 생성·갱신 가능, 읽기는 트레이너 전용(회원앱에 노출하지 않는 정책과 일치) + firstUsedAt/date 불변',
    firestoreRules.includes('match /appUsage/{docId}') &&
    firestoreRules.includes('allow read: if isTrainerOfMember(memberId);') &&
    firestoreRules.includes('match /appUsageDays/{dateId}') &&
    firestoreRules.includes('request.resource.data.diff(resource.data).affectedKeys().hasOnly(["lastActiveAt", "tabs"])')
  ],

  // ── 보안 체크 ──
  ['회원 자기수정 금지 필드(isOwner·role·memberUid·trainerUid)',
    !memberUpdateFn.includes('"isOwner"') &&
    !memberUpdateFn.includes('"role"') &&
    !memberUpdateFn.includes('"memberUid"') &&
    !memberUpdateFn.includes('"trainerUid"') &&
    !memberUpdateFn.includes('"name"')
  ],
  ['회원 수정 가능 생년월일 필드 포함(birthYear·birthMonth·birthDay)',
    memberUpdateFn.includes('"birthYear"') &&
    memberUpdateFn.includes('"birthMonth"') &&
    memberUpdateFn.includes('"birthDay"')
  ],
  ['세션 생성·삭제 관리자 전용',
    firestoreRules.includes('allow create, delete: if isTrainerOfMember(memberId)')
  ],
  ['회원 세션 수정 sorenessReport만 허용',
    firestoreRules.includes('affectedKeys().hasOnly(["sorenessReport", "sorenessUpdatedAt"])')
  ],
  ['members 생성 시 trainerUid 본인 설정 필수',
    membersBlockFlat.includes('allow create: if isSignedIn() && request.resource.data.trainerUid == uid()')
  ],
  ['2:1 pairSessions 컬렉션 기반 독립 수업 관리',
    app.includes('pairSessions') &&
    app.includes('getPairSessions') &&
    app.includes('splitPairSession')
  ],
  ['관리자 URL 회원 자동 리디렉션 (/member)',
    app.includes('getMemberAppProfile().then(profile') &&
    app.includes("window.location.replace(\"/member\")") &&
    app.includes('isOwner !== true')
  ],
  ['?app=member 쿼리 접속 시 /member로 주소 정리',
    app.includes('params.get("app") === "member" && !path.startsWith("/member")') &&
    app.includes('window.location.replace("/member"')
  ],

  // ── private 서브컬렉션 보안 분리 체크 ──
  ['memo·ticketInfo private 서브컬렉션 저장 (주문서 제외)',
    db.includes('members", memberId, "private", "admin"') &&
    db.includes('export async function getMemberPrivate') &&
    db.includes('saveMemberPrivateFields')
  ],
  ['addMember: memo·ticketInfo 주문서 미포함',
    (() => {
      const fn = db.slice(db.indexOf('export async function addMember'), db.indexOf('export async function updateMember'));
      return fn.includes('const { memo, ticketInfo, ...publicData } = data') &&
             fn.includes('saveMemberPrivateFields') &&
             !fn.includes('"memo"') && !fn.includes("memo,\n");
    })()
  ],
  ['updateMember: memo·ticketInfo 주문서에서 제거 (deleteField)',
    (() => {
      const fn = db.slice(db.indexOf('export async function updateMember'), db.indexOf('export async function cleanupMemberAppEmailIdentity'));
      return fn.includes("'memo' in before") &&
             fn.includes('deleteField()') &&
             fn.includes('saveMemberPrivateFields');
    })()
  ],
  ['관리자앱 private 데이터 로드 (loadMemberData)',
    app.includes('getMemberPrivate(memberId)') &&
    app.includes('setMemberPrivateData(priv)') &&
    app.includes('setMemberPrivateData(null)')
  ],
  ['HubScreen·MemberForm private 데이터 merge 전달',
    app.includes('...member, ...(memberPrivateData || {})') &&
    app.includes('MemberForm initial={{...member')
  ],
  ['Firestore catch-all private 접근 차단 (isTrainerOfMember)',
    firestoreRules.includes('match /{subCollection}/{docId}') &&
    firestoreRules.includes('allow read, write: if isTrainerOfMember(memberId)')
  ],
  ['MemberApp 컴포넌트 내 getMemberPrivate 미사용',
    (() => {
      const memberAppSection = app.slice(
        app.indexOf('function MemberApp('),
        app.indexOf('export default function App()')
      );
      return !memberAppSection.includes('getMemberPrivate');
    })()
  ],
  ['published=false 세션 회원앱 미노출',
    firestoreRules.includes('canReadSession(memberId, resource.data)') &&
    firestoreRules.includes("isMemberSelfActive(memberId) && sessionData.get('isPublished', false) == true") &&
    db.includes('getPublishedSessions') &&
    db.includes('where("isPublished", "==", true)')
  ],
  ['회원 URL memberId 조작 불가 (memberUid 쿼리 고정)',
    memberProfileFn.includes('where("memberUid", "==", uid)') &&
    !app.includes('memberId = params.get("memberId")') &&
    !app.includes('memberId = searchParams.get')
  ],
  ['deleteMember: private 서브컬렉션 삭제 포함',
    (() => {
      const delFn = db.slice(
        db.indexOf('export async function deleteMember'),
        db.indexOf('export async function verifyMemberOwnership')
      );
      return delFn.includes('"private"') && delFn.includes('privSnap.docs.map(d => deleteDoc(d.ref))');
    })()
  ],
  ['getSessions: limit(500) 안전 상한선 적용',
    (() => {
      const fn = db.slice(
        db.indexOf('export async function getSessions'),
        db.indexOf('export async function getPublishedSessions')
      );
      return fn.includes('limit(500)');
    })()
  ],

  // ── 회원 앱 플로우 체크 ──
  ['회원앱 로그인 후 getMemberAppProfile로 프로필 조회',
    db.includes('export async function getMemberAppProfile') &&
    app.includes('getMemberAppProfile()')
  ],
  ['회원앱 수업일지 isPublished 필터 적용',
    db.includes('export async function getPublishedSessions') &&
    db.includes('where("isPublished", "==", true)')
  ],
  ['회원앱 온보딩/프로필 저장 함수 존재',
    db.includes('export async function saveMemberOnboarding') &&
    db.includes('export async function saveMemberProfileFields')
  ],
  ['회원앱 건강 기록 저장 함수 존재',
    db.includes('export async function saveMemberHealthInputs')
  ],
  ['회원앱 체크인 저장 함수 존재',
    db.includes('export async function saveMemberCheckin')
  ],
  ['회원앱 루틴 추천 조회 함수 존재',
    db.includes('export async function getRoutineRecommendations')
  ],
  ['회원앱 공지사항 조회 함수 존재 (getMemberNotices)',
    db.includes('export async function getMemberNotices')
  ],
  ['관리자앱 로그아웃 (signOut) 구현',
    app.includes('signOut(auth)') || app.includes('signOut(')
  ],

  // ── 운영 안정화 체크 ──
  ['private 마이그레이션 점검 함수 존재 (checkPrivateMigrationStatus)',
    db.includes('export async function checkPrivateMigrationStatus') &&
    db.includes('STALE_FIELDS')
  ],
  ['관리자 로그인 시 private 마이그레이션 점검 호출',
    app.includes('checkPrivateMigrationStatus') &&
    app.includes('checkPrivateMigrationStatus().catch')
  ],
  ['Sentry DSN 없을 때 안전 fallback (조건부 초기화)',
    (() => {
      try {
        const idx = require('fs').readFileSync(require('path').join(require('path').resolve(__dirname,'..'), 'src', 'index.js'), 'utf8');
        return idx.includes('REACT_APP_SENTRY_DSN') && idx.includes('if (dsn)');
      } catch { return false; }
    })()
  ],

  // ── ErrorBoundary 체크 ──
  ['ErrorBoundary 파일 존재 및 componentDidCatch 구현',
    (() => {
      try {
        const eb = require('fs').readFileSync(require('path').join(require('path').resolve(__dirname,'..'), 'src', 'ErrorBoundary.jsx'), 'utf8');
        return eb.includes('componentDidCatch') && eb.includes('getDerivedStateFromError') && eb.includes('handleReload');
      } catch { return false; }
    })()
  ],
  ['index.js에서 ErrorBoundary로 App 감싸기',
    (() => {
      try {
        const idx = require('fs').readFileSync(require('path').join(require('path').resolve(__dirname,'..'), 'src', 'index.js'), 'utf8');
        return idx.includes('<ErrorBoundary>') && idx.includes('import ErrorBoundary');
      } catch { return false; }
    })()
  ],
  ['manifest.json start_url/scope 경로 정확성 (/member)',
    (() => {
      try {
        const m = require('fs').readFileSync(require('path').join(require('path').resolve(__dirname,'..'), 'public', 'manifest.json'), 'utf8');
        return m.includes('"start_url": "/member"') && m.includes('"scope": "/member"');
      } catch { return false; }
    })()
  ],

  // ── 성능 최적화 체크 ──
  ['회원 목록 세션 요약 getRecentSessions(5) 사용 (전량 로드 방지)',
    app.includes('getRecentSessions(m.id, 5)') &&
    db.includes('export async function getRecentSessions')
  ],
  ['getRecentSessions: limit(5) + orderBy(sessionNo desc) 적용',
    (() => {
      const fn = db.slice(
        db.indexOf('export async function getRecentSessions'),
        db.indexOf('// ════════════════════════════════════════════════════\n// private 마이그레이션')
      );
      return fn.includes('orderBy("sessionNo", "desc")') && fn.includes('limit(n)');
    })()
  ],
  ['MemberApp 초기 읽기 병렬화 (Promise.all)',
    (() => {
      const memberAppStart = app.indexOf('function MemberApp(');
      const memberAppEnd = app.indexOf('export default function App()');
      const memberApp = app.slice(memberAppStart, memberAppEnd);
      return memberApp.includes('Promise.all([readStep("2"') ||
             memberApp.includes('await Promise.all([readStep');
    })()
  ],

  // ── 2:1 회원별 개인화 (세미프라이빗 코칭: 같이 운동하되 기록·관리는 각자) ──
  pairScenario('2:1 시나리오A: 같은 종목을 둘 다 해도 회원별 중량/횟수/세트가 각자 기록으로 분리된다', L => {
    const a = L.buildPairSplitExercises(pairFixtureExercises(), 'A');
    const b = L.buildPairSplitExercises(pairFixtureExercises(), 'B');
    const latA = a.find(e => e.name === '랫풀다운');
    const latB = b.find(e => e.name === '랫풀다운');
    return latA.sets.length === 3 && latA.sets[0].weight === '30' && latA.sets[0].reps === '12'
        && latB.sets.length === 3 && latB.sets[0].weight === '20' && latB.sets[0].reps === '15'
        && latA.feedback === '광배 자극 좋음' && latB.feedback === '가동범위 주의';
  }),
  pairScenario('2:1 시나리오B: A 전용 종목(벤치프레스)은 B의 개인 기록에 절대 포함되지 않는다', L => {
    const a = L.buildPairSplitExercises(pairFixtureExercises(), 'A');
    const b = L.buildPairSplitExercises(pairFixtureExercises(), 'B');
    return a.some(e => e.name === '벤치프레스') && !b.some(e => e.name === '벤치프레스');
  }),
  pairScenario('2:1 시나리오C: B 전용 종목(레그프레스)은 A의 개인 기록에 절대 포함되지 않는다', L => {
    const a = L.buildPairSplitExercises(pairFixtureExercises(), 'A');
    const b = L.buildPairSplitExercises(pairFixtureExercises(), 'B');
    return b.some(e => e.name === '레그프레스') && !a.some(e => e.name === '레그프레스');
  }),
  pairScenario('2:1 시나리오D: 오늘 운동 부위를 A=상체 / B=하체로 서로 다르게 저장·조회할 수 있다', L => {
    const ps = { selectedTypesA:['상체'], selectedTypesB:['하체'], selectedTypes:['상체','하체'] };
    const ta = L.getPairMemberTypes(ps, 'A');
    const tb = L.getPairMemberTypes(ps, 'B');
    const merged = L.mergePairTypes(ta, tb);
    return ta.length === 1 && ta[0] === '상체'
        && tb.length === 1 && tb[0] === '하체'
        && merged.length === 2 && merged.includes('상체') && merged.includes('하체');
  }),
  pairScenario('2:1 시나리오F: only가 없는 기존 pairSessions 문서는 모두 두 회원 공통 운동으로 해석된다', L => {
    const legacy = [
      { name:'스쿼트', setsA:[{weight:'40',reps:'10'}], setsB:[{weight:'20',reps:'10'}], feedbackA:{}, feedbackB:{} },
      { name:'데드리프트', only:'', setsA:[{weight:'60',reps:'8'}], setsB:[{weight:'30',reps:'8'}], feedbackA:{}, feedbackB:{} },
    ];
    const a = L.buildPairSplitExercises(legacy, 'A');
    const b = L.buildPairSplitExercises(legacy, 'B');
    return a.length === 2 && b.length === 2
        && L.pairExerciseTarget(legacy[0]) === '' && L.pairExerciseIncludes(legacy[0], 'A') && L.pairExerciseIncludes(legacy[0], 'B');
  }),
  pairScenario('2:1 시나리오F-2: selectedTypesA/B가 없는 기존 문서는 팀 공통 selectedTypes/type으로 폴백된다', L => {
    const legacyArr = { selectedTypes:['가슴','삼두'] };
    const legacyStr = { type:'하체' };
    const a = L.getPairMemberTypes(legacyArr, 'A');
    const b = L.getPairMemberTypes(legacyArr, 'B');
    const s = L.getPairMemberTypes(legacyStr, 'B');
    return a.join('·') === '가슴·삼두' && b.join('·') === '가슴·삼두' && s.join('·') === '하체';
  }),
  pairScenario('2:1 시나리오G: 회원별 총 볼륨·종목 수가 자기 운동만으로 계산돼 분석에 상대 회원 운동이 섞이지 않는다', L => {
    const calcVol = (exList) => exList.reduce((s,e)=> s + (e.sets||[]).reduce((ss,r)=>{
      const w=parseFloat(r.weight)||0, reps=parseInt(r.reps)||0;
      return ss + (w>0 && reps>0 ? Math.round(w*reps*10)/10 : 0);
    },0), 0);
    const a = L.buildPairSplitExercises(pairFixtureExercises(), 'A');
    const b = L.buildPairSplitExercises(pairFixtureExercises(), 'B');
    // A: 랫풀다운 30×12×3(1080) + 벤치프레스 50×10(500) = 1580 / B: 랫풀다운 20×15×3(900) + 레그프레스 80×12(960) = 1860
    return a.length === 2 && b.length === 2 && calcVol(a) === 1580 && calcVol(b) === 1860;
  }),
  pairScenario('2:1 지난 기록 요약: 가장 무거운 유효 세트를 대표로 보여 주고, 값이 없으면 빈 문자열을 돌려준다', L => {
    const s = L.summarizePastPairSets([{weight:'25',reps:'12'},{weight:'27.5',reps:'12'},{weight:'27.5',reps:'10'}]);
    const empty = L.summarizePastPairSets([{weight:'',reps:''},{}]);
    const timeOnly = L.summarizePastPairSets([{durationSec:'40'}]);
    return s === '27.5kg × 12회 · 3세트' && empty === '' && timeOnly === '40초 · 1세트';
  }),

  // ── 2:1 다음 수업 부위 자동 반영 — 회원별 selectedTypesA/B와 기본 운동 1의 muscleTop을
  //    각 회원의 "다음 수업 준비"(nextWorkoutPart/nextPtPart)로 자동 초기화한다 ──
  pairScenario('2:1 자동초기값 시나리오A: A/B 다음 부위가 같으면(하체=하체) 공통 운동의 muscleTop도 그 부위로 자동 반영된다', L => {
    const typesA = ['하체'], typesB = ['하체'];
    return L.sameBodyParts(typesA, typesB) === true
        && L.derivePairCardMuscleTop('', typesA, typesB) === '하체'
        && L.getTodayMuscleTop(typesA) === '하체';
  }),
  pairScenario('2:1 자동초기값 시나리오B: A/B 다음 부위가 다르면(상체/하체) 각자 자동 선택되되 공통 운동엔 어느 쪽도 임의로 들어가지 않는다', L => {
    const typesA = ['상체'], typesB = ['하체'];
    return L.derivePairCardMuscleTop('A', typesA, typesB) === '' // "상체"는 SESSION_PART_TO_MUSCLE_TOP에 없어 매핑 없음(1:1과 동일 정책)
        && L.derivePairCardMuscleTop('B', typesA, typesB) === '하체'
        && L.derivePairCardMuscleTop('', typesA, typesB) === ''; // 공통 카드엔 임의로 반영하지 않음
  }),
  pairScenario('2:1 자동초기값: "팔"도 SESSION_BODY_PART_OPTIONS에 포함되어 다음 수업 준비 값이 그대로 회원별 selectedTypes로 채택되지만(선택 목록 자동 반영), muscleTop 자동 매핑은 "상체"와 동일하게 없음', L => {
    const typesA = ['팔'], typesB = ['하체'];
    return L.SESSION_BODY_PART_OPTIONS.includes('팔')
        && L.derivePairCardMuscleTop('A', typesA, typesB) === ''
        && L.derivePairCardMuscleTop('B', typesA, typesB) === '하체'
        && L.getTodayMuscleTop(['팔']) === '';
  }),
  pairScenario('2:1 자동초기값 시나리오B-2: 매핑 가능한 부위(가슴/하체)로 A/B가 다르면 각자 정확히 자기 부위만 반영된다', L => {
    const typesA = ['가슴'], typesB = ['하체'];
    return L.derivePairCardMuscleTop('A', typesA, typesB) === '가슴'
        && L.derivePairCardMuscleTop('B', typesA, typesB) === '하체'
        && L.derivePairCardMuscleTop('', typesA, typesB) === '';
  }),
  pairScenario('2:1 자동초기값 시나리오C: A/B 모두 다음 부위 정보가 없으면 빈 값으로 시작한다(임의 기본 부위 선택 없음)', L => {
    return L.sameBodyParts([], []) === true && L.derivePairCardMuscleTop('', [], []) === '';
  }),
  pairScenario('2:1 자동초기값 시나리오D: 한 명만 다음 부위가 있으면(A=하체, B=없음) A만 자동 반영되고 공통 운동엔 들어가지 않는다', L => {
    const typesA = ['하체'], typesB = [];
    return L.derivePairCardMuscleTop('A', typesA, typesB) === '하체'
        && L.derivePairCardMuscleTop('B', typesA, typesB) === ''
        && L.derivePairCardMuscleTop('', typesA, typesB) === ''; // A만 있고 B는 없어 "같음"이 아니므로 공통엔 미반영
  }),
  pairScenario('2:1 자동초기값 시나리오G: 새 운동 추가 시 대상(둘 다/A만/B만)에 따라 다른 초기값이 유도된다', L => {
    const typesA = ['가슴'], typesB = ['하체'];
    const both = L.derivePairCardMuscleTop('', typesA, typesB);   // 둘 다 + 다른 부위 → 빈 값
    const onlyA = L.derivePairCardMuscleTop('A', typesA, typesB); // A만 → A의 부위
    const onlyB = L.derivePairCardMuscleTop('B', typesA, typesB); // B만 → B의 부위
    const sameBoth = L.derivePairCardMuscleTop('', ['등'], ['등']); // 둘 다 + 같은 부위 → 그 부위
    return both === '' && onlyA === '가슴' && onlyB === '하체' && sameBoth === '등';
  }),
  ['2:1 자동초기값: 기본 운동 1의 muscleTop이 derivePairCardMuscleTop("", selectedTypesA, selectedTypesB)로 초기화된다',
    app.includes('return [mkPairEx(derivePairCardMuscleTop("", selectedTypesA, selectedTypesB))];')
  ],
  ['2:1 자동초기값: "운동 추가"도 같은 유도 함수로 초기화되고, 대상(only) 변경 시 아직 직접 수정 안 한 카드만 즉시 갱신된다',
    app.includes('const addEx = () => setExercises(prev=>[...prev, mkPairEx(derivePairCardMuscleTop("", selectedTypesA, selectedTypesB))]);') &&
    app.includes('const top = derivePairCardMuscleTop(val, selectedTypesA, selectedTypesB);') &&
    app.includes('if (top) { u.muscleTop = top; u.muscleSub = mSubs(top)[0] || u.muscleSub; }')
  ],
  ['2:1 자동초기값 시나리오F: 다음 수업 부위가 바뀌어도 이미 직접 muscleTop을 고른 카드(_muscleManual)는 절대 덮어쓰지 않는다',
    app.includes('if (e._muscleManual) return e;') &&
    app.includes('const top = derivePairCardMuscleTop(pairExerciseTarget(e), selectedTypesA, selectedTypesB);') &&
    app.includes('u._muscleManual = true;') // muscleTop 직접 변경 시(field==="muscleTop") 세워지는 기존 가드를 그대로 재사용
  ],
  ['2:1 자동초기값 시나리오E/6: 기존 저장·draft 복원된 운동은 방어적으로 _muscleManual=true 처리되어 자동 반영 대상에서 제외된다',
    app.includes('return editData.exercises.map(e => ({...e, _muscleManual: e._muscleManual !== undefined ? e._muscleManual : true}));')
  ],
  ['2:1 개인화: 종목 대상(only)은 화면에 "둘 다 / 회원 이름만"으로만 노출되고 개발용 값(only)을 그대로 보여 주지 않는다',
    app.includes('const PAIR_ONLY_OPTIONS = [{ value:"", label:"둘 다" }, { value:"A" }, { value:"B" }];') &&
    app.includes('const label = opt.label || `${(opt.value==="A"?memberA?.name:memberB?.name) || `${opt.value} 회원`}만`;') &&
    app.includes('updateEx(ei,"only",opt.value)')
  ],
  ['2:1 개인화: 나눠서 기록이 회원별 종목 필터(buildPairSplitExercises)와 회원별 부위(getPairMemberTypes)를 사용',
    app.includes('const exToA = buildPairSplitExercises(pairSession.exercises, "A");') &&
    app.includes('const exToB = buildPairSplitExercises(pairSession.exercises, "B");') &&
    app.includes('const typesA = getPairMemberTypes(pairSession, "A");') &&
    app.includes('const typesB = getPairMemberTypes(pairSession, "B");')
  ],
  ['2:1 개인화: selectedTypesA/B를 pairSessions에 저장하고, 나눠서 기록 후 다음 회차용으로 함께 초기화',
    db.includes('selectedTypesA: data.selectedTypesA || [],') &&
    db.includes('selectedTypesB: data.selectedTypesB || [],') &&
    db.includes('selectedTypesA: [],') &&
    db.includes('selectedTypesB: [],')
  ],
  ['2:1 개인화: 팀 공통 type/selectedTypes는 A/B 합집합으로 계속 저장(홈 "오늘 수업" 그룹 카드 표시 유지)',
    app.includes('const mergedTypes = mergePairTypes(selectedTypesA, selectedTypesB);') &&
    app.includes('selectedTypes: mergedTypes.length ? mergedTypes : ["기타"],')
  ],
  ['2:1 시나리오E: 다음 수업 준비가 회원별로 각각 저장된다(부위는 항상 개별, 날짜·시간은 공통 입력 + 개별 전환 가능)',
    app.includes('const [nextSameSchedule, setNextSameSchedule] = useState(true);') &&
    app.includes('date: nextSameSchedule ? nextDateA : nextDateB,') &&
    app.includes('parts: nextPartsB,') &&
    app.includes('const part = t.parts.length ? t.parts.join(" · ") : "미정";')
  ],
  ['2:1 시나리오E-2: 다음 수업 저장은 1:1과 같은 회원 문서 필드를 그대로 재사용(새 컬렉션·새 필드 없음)',
    app.includes('nextWorkoutDate: t.date || "",') &&
    app.includes('nextWorkoutPart: part, nextPtPart: part,') &&
    app.includes('nextWorkoutDateUpdatedAt: new Date().toISOString(),')
  ],
  ['2:1 이전 기록: 1:1과 같은 findPastExRecords를 재사용하고 회원별로 따로 조회(별도 기록 시스템 신설 없음)',
    app.includes('findPastExRecords(pastSessions[who], ex.name, 1)') &&
    app.includes('getSessions(memberAId).catch(() => []),') &&
    app.includes('getSessions(memberBId).catch(() => []),')
  ],
  ['2:1 이전 기록 불러오기: 해당 회원 세트만 교체하고 상대 회원 세트는 건드리지 않는다',
    app.includes('const loadPastSets = (ei, who, rec, name) => {') &&
    app.includes('const key = who==="A"?"setsA":"setsB";') &&
    app.includes('i===ei ? {...e, [key]: next.length ? next : [mkPairSet()]} : e')
  ],
  ['2:1 반응형: 태블릿·PC(≥768)는 두 회원 나란히, 좁은 화면은 회원 탭 전환(기존 breakpoint 재사용)',
    app.includes('const isWide = winW >= 768;') &&
    app.includes('const [activeWho, setActiveWho] = useState("A");') &&
    app.includes('const visibleSides = isWide ? PAIR_SIDES : PAIR_SIDES.filter(s => s.who === activeWho);')
  ],

  // ── 2:1 페어 세션 체크 ──
  ['2:1 pairStatus draft 저장 (신규/수정 시 초안 유지)',
    app.includes('["recorded","sent"].includes(editData?.pairStatus)') &&
    app.includes('"draft"')
  ],
  ['나눠서 기록 후 B세션 isPublished=false',
    db.includes('export async function sendPairSession') &&
    db.includes('isPublished: false') &&
    db.includes('status: "draft"')
  ],
  ['나눠서 기록 후 A pairStatus=recorded (공개 아님)',
    db.includes('pairStatus: "recorded"') &&
    db.includes('pairRecordedAt: serverTimestamp()')
  ],
  ['나눠서 기록 후 B isPublished=false (bSessionData)',
    app.includes('isPublished: false') &&
    app.includes('status: "draft"') &&
    app.includes('bSessionData')
  ],
  ['2:1 A/B 독립 세트 구조 (setsA/setsB)',
    app.includes('setsA') &&
    app.includes('setsB') &&
    app.includes('feedbackA') &&
    app.includes('feedbackB')
  ],
  ['2:1 나눠서 기록 - 개인 세션 분리 생성',
    app.includes('handleSplitPairSession') &&
    app.includes('splitDone') &&
    app.includes('pairSourceId')
  ],
  ['2:1 나눠서 기록: ID→이름 폴백 (memberAId 누락 대응)',
    app.includes('const findMember = (id, name) =>') &&
    app.includes('const mA = findMember(pairSession.memberAId, pairSession.memberAName)') &&
    app.includes('const mB = findMember(pairSession.memberBId, pairSession.memberBName)')
  ],
  ['2:1 나눠서 기록: 구체적 에러 메시지 (회원별)',
    app.includes('pairSession.memberAName || "A회원"') &&
    app.includes('pairSession.memberBName || "B회원"')
  ],
  ['2:1 폼: memberAId 이름 자동 복원 (resolveIdByName)',
    app.includes('const resolveIdByName = (id, name) =>') &&
    app.includes('useState(() => resolveIdByName(editData?.memberAId, editData?.memberAName)')
  ],
  ['2:1 teamStatus: 업데이트 시 Firestore 기존값 보존',
    db.includes('teamStatus: data.teamStatus || undefined') &&
    db.includes('teamStatus: data.teamStatus || "active"')
  ],
  ['A/B 기록 혼용 방지 (memberBId 구분 저장)',
    app.includes('payload.memberBId = member2.id') &&
    app.includes('payload.memberBExercises = exM2')
  ],
  ['1:1 기록 영향 없음 (2:1 조건부 처리)',
    app.includes("sessionType === \"2:1\" && member2") &&
    !app.includes('onSave2(payload2)')
  ],
  ['나눠서 기록 버튼 UI (확인 모달 + HistoryScreen + SessionReportModal)',
    app.includes('나눠서 기록') &&
    app.includes('onSendPair') &&
    app.includes('confirmPair') &&
    app.includes('splitting')
  ],
  ['2:1 수업 목록 및 상태별 버튼 문구 (PairSessionListScreen)',
    app.includes('PairSessionListScreen') &&
    app.includes('onPair21') &&
    app.includes('pairSessionHasContent') &&
    app.includes('수업 기록하기') &&
    app.includes('기록 계속하기') &&
    app.includes('기록 보기')
  ],
  ['회원 카드 2:1 작성중 배지',
    app.includes('2:1 작성중') &&
    app.includes('onResumeDraft2_1')
  ],
  ['나눠서 기록 후 기록 완료 배지',
    app.includes('기록 완료') &&
    app.includes('pairRecordedAt')
  ],
  ['B회원 세트 추가 버튼 (m2 블록)',
    app.includes('addM2Set') &&
    app.includes('세트 추가')
  ],
  ['pairRecordedAt 저장 (db.js)',
    db.includes('pairRecordedAt: serverTimestamp()')
  ],
  // ── 읽지 않은 수업일지 배지 ──
  ['unread 배지: published + unread 세션 있으면 배지 표시 (nav-badge)',
    app.includes('nav-badge') &&
    app.includes('unreadCount') &&
    app.includes('k==="workout"&&unreadCount>0')
  ],
  ['unread 배지: unreadCount 3개 계산 (SESSION_UNREAD_CUTOFF 기준)',
    app.includes('SESSION_UNREAD_CUTOFF') &&
    app.includes('readSessionIds.has(s.id)') &&
    db.includes('SESSION_UNREAD_CUTOFF = "2026-06-30"')
  ],
  ['unread 배지: 수업일지 탭 진입 시 읽음 처리 (useEffect + markedRef)',
    app.includes('markedRef=useRef(false)') &&
    app.includes('markedRef.current=true') &&
    app.includes('markSessionsAsRead(ids)')
  ],
  ['unread 배지: 카드 펼칠 때 개별 읽음 처리 (toggleSess)',
    app.includes('markSessionsAsRead([s.id])')
  ],
  ['unread 배지: 읽음 처리 후 상태 업데이트 (setReadSessionIds)',
    app.includes('setReadSessionIds') &&
    app.includes('markSessionsRead(profile.id,newIds)')
  ],
  ['unread 배지: 다른 회원 수업일지 포함 안 됨 (getPublishedSessions memberId 격리)',
    db.includes('collection(db, "members", memberId, "sessions")') &&
    db.includes('where("isPublished", "==", true)')
  ],
  ['unread 배지: unpublished 세션 제외 (isPublished 조건)',
    app.includes('s.isPublished&&!readSessionIds.has(s.id)')
  ],
  ['unread 배지: Firestore Rules readSessions 본인만 write 가능',
    firestoreRules.includes('match /readSessions/{sessionId}') &&
    firestoreRules.includes('isMemberSelf(memberId)') &&
    firestoreRules.includes('keys().hasOnly(["readAt"])')
  ],
  ['unread 배지: 관리자앱 publishSession 로직 영향 없음',
    db.includes('export async function publishSession') &&
    db.includes('export async function getReadSessionIds') &&
    db.includes('export async function markSessionsRead')
  ],
  // ── 관리자앱 UX 개선 (2026-06) ──
  ['레이아웃: 대표님 운동기록이 2:1 수업보다 앞에 위치',
    (() => {
      const ownerIdx = app.indexOf('대표님 전용 운동 기록 버튼');
      const pairIdx  = app.indexOf('2:1 진입 카드');
      return ownerIdx > 0 && pairIdx > 0 && ownerIdx < pairIdx;
    })()
  ],
  ['필터: 상담 필터 존재',
    app.includes('"consult"') && app.includes('label:"상담"') && app.includes('color:"#a78bfa"')
  ],
  ['공지: owner(TEO/대표님) 검색 가능',
    app.includes('isOwner === true || m.role === "owner"') &&
    app.includes('teo 대표님 owner') &&
    app.includes('ownerAlias')
  ],
  ['운동 자동 분류: 덤벨 벤치프레스 → 가슴/가운데가슴 (공백 있는 "가운데 가슴" 값은 MUSCLE_MAP 옵션과 안 맞아 제거)',
    app.includes('"덤벨 벤치프레스"') && app.includes('sub:"가운데가슴"') && !app.includes('sub:"가운데 가슴"')
  ],
  ['운동 자동 분류: 업라이트 로우 → 어깨/전면·측면',
    app.includes('"업라이트 로우"') && (app.includes('sub:"전면·측면"') || app.includes("sub:'전면·측면'"))
  ],
  ['운동 자동 분류: 사이드 래터럴 레이즈 추가',
    app.includes('"사이드 래터럴 레이즈"')
  ],
  ['운동 자동 분류: 요청 종목(스모 데드리프트/푸쉬업/벤치프레스/덤벨 플라이/케이블 프레스다운(로프)/케이블 플라이/라잉 트라이셉스 익스텐션) 정확 매칭 라이브러리 등록',
    app.includes('const EXERCISE_LIBRARY = [') &&
    ["스모데드리프트","푸쉬업","벤치프레스","덤벨플라이","케이블프레스다운로프","케이블플라이","라잉트라이셉스익스텐션","케이블프레스다운"].every(k => app.includes(`"${k}"`))
  ],
  ['운동 자동 분류: EXERCISE_LIBRARY는 normalizeExName으로 정규화된 이름을 정확 일치(Map)로 조회 — 키워드 부분매칭과 충돌하지 않음',
    app.includes('const EXERCISE_LIBRARY_BY_NAME = new Map();') &&
    app.includes('function getLibraryClassification(name)')
  ],
  ['운동 자동 분류: 킥백의 muscleTop 오타("삼두") 수정 — MUSCLE_MAP에 없는 값이라 드롭다운이 깨지는 문제 방지',
    app.includes('top:"팔-삼두근", sub:"외측두"') && !app.includes('top:"삼두"')
  ],
  ['운동 종목 전체 회원 공통 학습: exerciseClassifications/{trainerUid}를 실시간 구독해 회원과 무관하게 전체 적용',
    app.includes('subscribeToExerciseClassifications(user.uid, setExerciseClassifications)') &&
    db.includes('export function subscribeToExerciseClassifications(trainerUid, onChange)')
  ],
  ['운동 종목 전체 회원 공통 학습: 트레이너가 직접 수정하면 saveExerciseClassification으로 즉시 저장(localStorage 아님)',
    app.includes('function recordExerciseClassification(name, patch)') &&
    db.includes('export async function saveExerciseClassification(trainerUid, exerciseKey, patch, displayName)')
  ],
  ['운동 종목 자동 분류 우선순위: 1) Firestore 학습 데이터 2) EXERCISE_LIBRARY 정확 매칭 3) 기존 키워드 추론(EX_MUSCLE_SUGGEST/getAutoEquipmentByName)',
    app.includes('function suggestEquipment(name, classifications)') &&
    app.includes('function suggestMuscle(name, classifications)') &&
    app.includes('return learned || getLibraryClassification(name)?.equipment || getAutoEquipmentByName(name);')
  ],
  ['운동명 정규화: 한글/영문/숫자가 아닌 모든 문자를 제거(유니코드 인식)해 공백·대소문자·특수문자 표기 차이를 통일',
    app.includes('function normalizeExName(name) {') &&
    app.includes('replace(/[^\\p{L}\\p{N}]/gu, "")')
  ],
  ['운동명 정규화: canonicalExerciseKey가 EXERCISE_LIBRARY 별칭(예: 벤치프레스/Bench Press)을 대표 이름 하나로 통일해 저장/조회 키가 갈리지 않게 함',
    app.includes('function canonicalExerciseKey(name)') &&
    app.includes('"벤치프레스","benchpress","bench press"') &&
    app.includes('const key = canonicalExerciseKey(name);')
  ],
  ['운동 종목 전체 회원 공통 학습: 같은 운동명 재저장 시 새 항목 대신 items[key]가 merge되어 equipment/muscleTop/muscleSub/displayName/updatedAt만 갱신(Firestore setDoc merge:true)',
    db.includes('items: { [exerciseKey]: { ...clean(patch), displayName, updatedAt: serverTimestamp() } },') &&
    db.includes('}, { merge: true });')
  ],
  ['생일 배지: isTodayBirthday 함수 존재',
    app.includes('function isTodayBirthday(m)') &&
    app.includes('now.getMonth() + 1 === bm && now.getDate() === bd')
  ],
  ['생일 배지: 회원 카드에 🎂 생일 배지 표시',
    app.includes('isBirthday = isTodayBirthday(m)') &&
    app.includes('🎂 생일')
  ],
  ['생일 배지: 오늘 생일 요약 섹션 존재',
    app.includes('오늘 생일') &&
    app.includes('filtered.filter(m => isTodayBirthday(m))')
  ],
  // ── NEW 배지 (회원 입력 알림) ──
  ['NEW 배지: memberLastInputAt Firestore Rules 허용',
    firestoreRules.includes('"memberLastInputAt"')
  ],
  ['NEW 배지: saveMemberCheckin이 memberLastInputAt 갱신',
    db.includes('memberLastInputAt: serverTimestamp()')
  ],
  // ── 최근 활동 요약 (todayInputTypes/recentActivityLog) ──
  ['최근 활동: Firestore Rules가 회원 본인 쓰기 허용 (todayInputTypes/recentActivityLog)',
    firestoreRules.includes('"todayInputTypes"') &&
    firestoreRules.includes('"recentActivityLog"')
  ],
  ['최근 활동: touchMemberActivities가 체중·칼로리·걸음수/수업피드백(근육통·RPE·메모)/유산소 저장 시 호출됨',
    db.includes('export async function touchMemberActivities(memberId, activities = [])') &&
    (db.match(/await touchMemberActivities\(/g) || []).length >= 3
  ],
  ['최근 활동: dateKey 미전달 시 한국시간 기준으로 폴백 (UTC 기준이면 KST 00~09시에 하루 밀림)',
    db.includes('function koreaDateKey(date = new Date())') &&
    db.includes("const todayKey = activities[0].dateKey || koreaDateKey();")
  ],
  // ── 회원 목록 "오늘 회원 입력 피드" (항목별 "오늘 활동" 필터를 대체) ──
  ['오늘 회원 입력 피드: 메모/통증/근육통/RPE/컨디션/체중/유산소/칼로리 8종 타입 정의',
    app.includes('const TODAY_FEED_TYPES = [') &&
    ["memo","pain","soreness","rpe","condition","weight","cardio","kcal"].every(k => app.includes(`"${k}"`))
  ],
  ['오늘 회원 입력 피드: 한국시간(getKoreaDateString) 기준으로 오늘 판정',
    app.includes('const todayKST = getKoreaDateString();') &&
    app.includes('liveMember.todayInputTypes?.date === todayKST')
  ],
  ['오늘 회원 입력 피드: 트레이너별 읽음 상태(trainerNotificationReads)를 Firestore에서 실시간 구독',
    app.includes('subscribeToTrainerNotificationReads(user.uid, setNotificationReads)') &&
    db.includes('export function subscribeToTrainerNotificationReads(trainerUid, onChange)')
  ],
  ['오늘 회원 입력 피드: 이벤트 id(feedEventId)로 이미 읽은 알림을 걸러내 "읽지 않은 알림"만 표시',
    db.includes('export function feedEventId(memberId, at, type)') &&
    app.includes('const id = feedEventId(m.id, a.at, a.type);') &&
    app.includes('if (readEventIds.has(id)) return;')
  ],
  ['오늘 회원 입력 피드: getTodayFeedItems가 전체 회원 recentActivityLog를 병합해 최신 입력순 정렬',
    app.includes('function getTodayFeedItems()') &&
    app.includes('if (a.dateKey !== todayKST || !TODAY_FEED_TYPES.includes(a.type)) return;') &&
    app.includes('items.sort((a,b) => (b.at||0) - (a.at||0))')
  ],
  ['오늘 회원 입력 피드: 요약 카드가 "읽지 않은 알림 N건" 표시, 모두 확인하면 안내 문구로 전환',
    app.includes('읽지 않은 알림 ${todayFeedItems.length}건') &&
    app.includes('오늘 새로운 회원 입력이 없습니다.')
  ],
  ['오늘 회원 입력 피드: 알림 클릭 시 해당 알림 1건만 읽음 처리 + type별 목적 화면(healthhub/soreness)으로 이동',
    app.includes('onMarkEventsRead?.([item.id]);') &&
    app.includes('onSelect(target, feedItemTarget(item.type));') &&
    app.includes('const FEED_TARGET_BY_TYPE = {')
  ],
  ['오늘 회원 입력 피드: 읽음 상태는 Firestore(trainerNotificationReads)에 영구 저장되어 새로고침/재로그인에도 유지, 회원 원본 데이터는 변경하지 않음',
    db.includes('export async function markNotificationEventsRead(trainerUid, todayKey, eventIds = [])') &&
    firestoreRules.includes('match /trainerNotificationReads/{uid}')
  ],
  ['오늘 회원 입력 피드 이동: goHub가 targetScreen/healthHubTab 옵션을 받아 healthhub/soreness로 직접 이동',
    app.includes('function goHub(m, opts={})') &&
    app.includes('setScreen(opts.targetScreen || "hub")') &&
    app.includes('setHealthHubInitialTab(opts.healthHubTab || "대시보드")')
  ],
  ['오늘 회원 입력 피드 이동: HealthHubScreen이 initialTab prop으로 시작 탭을 받음',
    app.includes('function HealthHubScreen({ member, sessions=[], bodyData, nutritionData, onSaveBodyData, onSaveNutrition, showToast, onBack, targetCal, initialTab })') &&
    app.includes('useState(initialTab || "대시보드")')
  ],
  ['NEW 표시 통일: 회원 카드 왼쪽 아이콘의 큰 NEW 배지 하나만 사용 (이름 옆 작은 "NEW 입력" 배지는 폐지)',
    app.includes('function hasTodayFeedInput(m)') &&
    app.includes('hasTodayFeedInput(m) && (') &&
    !app.includes('🔴 NEW 입력')
  ],
  ['NEW 표시: 회원 카드 클릭 시 그 회원의 오늘 미확인 알림을 모두 읽음 처리',
    app.includes('function markMemberFeedRead(m)') &&
    app.includes('markMemberFeedRead(m);onSelect(m);')
  ],
  // ── 출석 기능 ──
  ['출석 기능: saveAttendance 함수 존재 (db.js)',
    db.includes('export async function saveAttendance(memberId, dateKey)') &&
    db.includes('duplicate: true') &&
    db.includes('source: "memberApp"')
  ],
  ['출석 기능: getAttendanceRecent 함수 존재 (db.js)',
    db.includes('export async function getAttendanceRecent(memberId')
  ],
  ['출석 기능: Firestore Rules attendance 본인만 write',
    firestoreRules.includes('match /attendance/{dateId}') &&
    firestoreRules.includes('allow create: if isMemberSelfActive(memberId)') &&
    firestoreRules.includes('allow update: if false')
  ],
  ['운동 체크: AttendanceCard 컴포넌트 — 운동 체크 문구',
    app.includes('function AttendanceCard({attendance') &&
    app.includes('오늘 운동 체크') &&
    app.includes('오늘 운동 완료') &&
    app.includes('이번 달 운동')
  ],
  ['운동 체크: 캘린더 미표시 (건강관리 탭에서 제거)',
    !app.includes('function AttendanceCalendar(') &&
    !app.includes('AttendanceCalendar attendance=')
  ],
  ['운동 체크: 중복 방지 문구',
    app.includes('이미 운동 체크가 완료되었습니다')
  ],
  ['운동 체크: 출석 게임화 문구 미포함',
    !app.includes('연속 출석') &&
    !app.includes('출석 목표') &&
    !app.includes('출석 달성률') &&
    !app.includes('출석 랭킹')
  ],
  ['운동 체크: 이번 달 실제 운동 횟수(monthCount) 기반 피드백 문구 — 임의 순환이 아니라 실제 기록을 반영',
    app.includes('monthCount>=15?"정말 꾸준히 운동하고 계세요!') &&
    app.includes('꾸준히 기록이 쌓이고 있어요')
  ],
  ['출석 기능: saveAttendance 함수 존재 (db.js)',
    db.includes('export async function saveAttendance(memberId, dateKey)') &&
    db.includes('duplicate: true') &&
    db.includes('source: "memberApp"')
  ],
  ['출석 기능: getAttendanceRecent 함수 존재 (db.js)',
    db.includes('export async function getAttendanceRecent(memberId')
  ],
  ['출석 기능: Firestore Rules attendance 본인만 write',
    firestoreRules.includes('match /attendance/{dateId}') &&
    firestoreRules.includes('allow create: if isMemberSelfActive(memberId)') &&
    firestoreRules.includes('allow update: if false')
  ],
  ['출석 기능: 중복 출석 방지 (duplicate check)',
    db.includes('if (snap.exists()) return { duplicate: true }')
  ],
  ['출석 기능: attendance import (App.jsx)',
    app.includes('saveAttendance, getAttendanceRecent')
  ],
  ['섭취칼로리: getKcalLogs 사용 (dates+logs 통합)',
    app.includes('const kcalLogs=getKcalLogs(effectiveNutrition)') &&
    app.includes('const recentKcal=kcalLogs.find(l=>l.date===today)')
  ],
  ['홈 공지사항: NoticeCard 홈에 포함',
    app.includes('NoticeCard notices={p.notices}') &&
    app.includes('function NoticeCard({notices=[]')
  ],
  ['관리자 운동 빈도: HubScreen 이번달/7일/30일 표시',
    app.includes('hubAttendance') &&
    app.includes('운동 빈도') &&
    app.includes('최근 7일') &&
    app.includes('최근 30일') &&
    app.includes('대사 추정·식단 분석 참고용')
  ],
  // ── 2:1 수업 상태 관리 ──
  ['2:1 메인 카드: active/all 필터에서만 표시 조건',
    app.includes('filter==="active"||filter==="all"') &&
    app.includes('pairSessions.some(ps=>!ps.teamStatus||ps.teamStatus==="active")')
  ],
  ['2:1 메인 카드: MembersScreen이 pairSessions prop 수신',
    app.includes('function MembersScreen(') &&
    app.includes('pairSessions=[]')
  ],
  ['2:1 관리 화면: 진행중/휴식중/종료 상태 필터 탭',
    app.includes('statusFilter') &&
    app.includes('STATUS_TABS') &&
    app.includes('"active"') &&
    app.includes('"paused"') &&
    app.includes('"ended"')
  ],
  ['2:1 관리 화면: 기본 필터 진행중(active)',
    app.includes('useState("active")')
  ],
  ['2:1 상태 변경: updatePairSessionStatus db.js 함수',
    db.includes('export async function updatePairSessionStatus(id, teamStatus)')
  ],
  ['2:1 상태 변경: handlePairStatusChange App.jsx 핸들러',
    app.includes('async function handlePairStatusChange(id, teamStatus)')
  ],
  ['2:1 상태 변경: teamStatus 필드 savePairSession에 포함',
    db.includes('teamStatus: data.teamStatus || "active"')
  ],
  ['2:1 상태 배지: PsCard에 TEAM_STATUS_LABELS 표시',
    app.includes('TEAM_STATUS_LABELS') &&
    app.includes('TEAM_STATUS_COLORS') &&
    app.includes('getTeamStatus(ps)')
  ],
  ['2:1 종료(teamStatus) 변경 시 members 문서 미접촉',
    !updatePairSessionStatusFn.includes('"members"') &&
    !updatePairSessionStatusFn.includes('updateMember')
  ],
  ['2:1 종료(teamStatus) 변경은 pairSessions 문서 필드만 update',
    updatePairSessionStatusFn.includes('doc(db, "pairSessions", id)') &&
    updatePairSessionStatusFn.includes('updateDoc(ref, { teamStatus, updatedAt: serverTimestamp() })')
  ],
  ['handlePairStatusChange가 개인 회원 status 변경 함수를 호출하지 않음',
    !handlePairStatusChangeFn.includes('applyMemberStatusChange') &&
    !handlePairStatusChangeFn.includes('updateMember')
  ],
  ['개인 회원 상태 변경(applyMemberStatusChange)은 pairSessions/teamStatus와 무관하게 members 문서만 수정',
    applyMemberStatusChangeFn.includes('updateMember(id, patch)') &&
    !applyMemberStatusChangeFn.includes('pairSessions') &&
    !applyMemberStatusChangeFn.includes('teamStatus')
  ],
  ['회원앱 접근 판정(getMemberAppProfile)이 2:1 teamStatus/pairStatus를 참조하지 않음',
    !memberProfileFn.includes('teamStatus') &&
    !memberProfileFn.includes('pairStatus') &&
    !memberProfileFn.includes('pairSessions')
  ],
  ['Firestore Rules 회원 접근 판정(isMemberStatusActive)이 2:1 teamStatus/pairStatus를 참조하지 않음',
    !isMemberStatusActiveFn.includes('teamStatus') &&
    !isMemberStatusActiveFn.includes('pairStatus') &&
    !isMemberStatusActiveFn.includes('pairSessions')
  ],

  // ── 유산소 기록 기능 ──
  ['유산소 기록: Firestore 저장 구조 members/{id}/cardioLogs',
    db.includes('export async function getCardioLogs(memberId') &&
    db.includes('export async function saveCardioLog(memberId') &&
    db.includes('export async function deleteCardioLog(memberId') &&
    db.includes('collection(db, "members", memberId, "cardioLogs")')
  ],
  ['유산소 기록: Firestore Rules cardioLogs 회원 본인 read/write 허용',
    firestoreRules.includes('match /cardioLogs/{logId}') &&
    firestoreRules.includes('allow read, create, update: if canAccessMember(memberId);\n        allow delete: if canAccessMember(memberId);')
  ],
  ['유산소 기록: MET 기반 칼로리 계산(공식 재사용)',
    app.includes('function getCardioMet(activityType, intensity)') &&
    app.includes('function calcCardioCalories(met, weightKg, minutes)') &&
    app.includes('met * 3.5 * w * m / 200')
  ],
  ['Zone2 심박수: 기본 방식(220-나이) + 개인화 방식(HRR) 둘 다 구현',
    app.includes('function getZone2Range(age, restingHeartRate)') &&
    app.includes('220 - safeAge') &&
    app.includes('maxHR - rhr') &&
    app.includes('"personalized"') &&
    app.includes('"basic"')
  ],
  ['Zone2 달성 여부: 평균 심박수 없으면 unknown 처리',
    app.includes('function classifyZone2(averageHeartRate, zone2)') &&
    app.includes('return "unknown"')
  ],
  ['안정시 심박수: memberOnboarding 필드 화이트리스트에 포함(Rules + db.js)',
    firestoreRules.includes('"agreedTermsAt", "agreedPrivacyAt", "restingHeartRate"') &&
    db.includes('"agreedTermsAt", "agreedPrivacyAt", "restingHeartRate"')
  ],
  ['회원앱 건강 탭: 하단 유산소 섹션(유산소 기록/유산소 분석 탭) 제거 — 상단 "오늘 유산소" 카드 하나가 입력/수정을 전담(기존 기록을 불러와 덮어씀)',
    !app.includes('function CardioSection(') &&
    !app.includes('["record","유산소 기록"]') &&
    !app.includes('["analysis","유산소 분석"]') &&
    app.includes('function MemberHealth(p)') &&
    app.includes('{key:"cardio",label:"유산소"') &&
    app.includes('<CardioEntryForm key={yesterdayCardio?.id||"new"} p={p} initialDate={yesterday} initialLog={yesterdayCardio} onSaved={()=>setSheet(null)}/>')
  ],
  ['관리자앱 건강관리 허브: 유산소 탭 연동(최근 기록/주간 요약/Zone2/체중 비교)',
    app.includes('function AdminCardioSection(') &&
    app.includes('{key:"유산소",   role:"cardio"') &&
    app.includes('cur.role==="cardio" && <AdminCardioSection')
  ],

  // ── 회원앱 PC 크롬 스크롤 고정 버그 재발 방지 ──
  // 원인: 공용 admin CSS의 body{overscroll-behavior:none}이 .member-shell을
  // 스크롤 컨테이너로 만드는 grid+overflow-x:hidden 조합과 겹치며 wheel 스크롤 체이닝을 완전히 막았다.
  // 회원앱에서만 overscroll-behavior:auto로 되돌리고, .member-shell 자체의 overflow-x:hidden은 제거해
  // 불필요한 내부 스크롤 컨테이너가 생기지 않게 한다. body/html 예외 처리는 :has()로 회원앱 DOM에만 스코프.
  ['회원앱 스크롤 고정 버그 수정: body:has(.member-shell)/.member-login에서 overscroll-behavior 예외 처리',
    app.includes('body:has(.member-shell),body:has(.member-login){background:#F6F7F9;color:#20242A;overflow-y:auto!important;overscroll-behavior:auto!important;height:auto!important}') &&
    app.includes('html:has(.member-shell),html:has(.member-login){height:auto!important;overflow-y:auto!important}')
  ],
  ['회원앱 스크롤 고정 버그 수정: .member-shell에 불필요한 overflow-x:hidden 제거(내부 스크롤 컨테이너화 방지)',
    !app.includes('.member-shell{min-height:100vh;min-height:100dvh;height:auto;background:#F6F7F9;color:#20242A;display:grid;place-items:start center;overflow-x:hidden}') &&
    app.includes('.member-shell{min-height:100vh;min-height:100dvh;height:auto;background:#F6F7F9;color:#20242A;display:grid;place-items:start center}')
  ],
  ['관리자앱 body overscroll-behavior:none은 그대로 유지(회원앱 예외처리가 admin에 새지 않음)',
    app.includes('overscroll-behavior:none;overflow-x:hidden;width:100%;max-width:100vw;')
  ],

  // ── 2:1 수업 기록 화면 수정 ──
  ['2:1 수업 기본 세트 3세트로 변경',
    app.includes('setsA: [mkPairSet(),mkPairSet(),mkPairSet()],') &&
    app.includes('setsB: [mkPairSet(),mkPairSet(),mkPairSet()],') &&
    !app.includes('setsA: [mkPairSet(),mkPairSet(),mkPairSet(),mkPairSet(),mkPairSet()],')
  ],
  ['2:1 수업 세트 추가/삭제: 최소 1세트 유지, 회원(A/B)별 독립 처리',
    app.includes('if(sets.length<=1){showToast("최소 1세트 유지");return e;}') &&
    app.includes('const key = who==="A"?"setsA":"setsB";')
  ],
  ['2:1 운동 종목 자동 매칭: 1:1과 동일한 매핑 함수(suggestMuscle/suggestEquipment, classifications 포함)를 공용 스코프로 재사용',
    app.includes('function suggestMuscle(name, classifications) {') &&
    app.includes('function suggestEquipment(name, classifications) {') &&
    (app.match(/function suggestMuscle\(name, classifications\) \{/g) || []).length === 1 &&
    (app.match(/function suggestEquipment\(name, classifications\) \{/g) || []).length === 1
  ],
  ['2:1 자동 매칭: 이름 입력 시 부위/기구 자동 채움(muscleSub 포함) + 수동 수정값은 이후 덮어쓰지 않음(_muscleManual/_equipManual) + 수정 시 전체 공통 학습 데이터에 기록',
    app.includes('if (!e._muscleManual) {') &&
    app.includes('const sug = suggestMuscle(val, classifications);') &&
    app.includes('if (sug?.top) { u.muscleTop = sug.top; u.muscleSub =') &&
    app.includes('if (!e._equipManual) {') &&
    app.includes('const sugEq = suggestEquipment(val, classifications);') &&
    app.includes('} else if (field==="muscleTop") {') &&
    app.includes('} else if (field==="equipment") {') &&
    app.includes('onLearnExercise?.(e.name, { muscleTop: val, muscleSub: mSubs(val)[0] || "" });') &&
    app.includes('onLearnExercise?.(e.name, { equipment: val });')
  ],
  ['2:1 하단 버튼: 목록으로 가기 + 저장 + 나눠서 기록(나눠서 기록이 가장 넓은 영역)',
    app.includes('목록으로 가기') &&
    app.includes('onClick={onBack} disabled={saving||splitting}') &&
    app.includes('flex:"2 1 0",minWidth:0,padding:"13px 8px",borderRadius:9,border:"none"')
  ],
  ['2:1 나눠서 기록: 처리 중 중복 클릭 방지(splitting 상태로 버튼 비활성화)',
    app.includes('const [splitting, setSplitting] = useState(false);') &&
    (app.match(/const \[splitting, setSplitting\] = useState\(false\);/g) || []).length >= 2
  ],

  // ── 2:1 나눠서 기록 후 상태 초기화 (그룹 관계 유지 + 이번 회차 기록만 리셋) ──
  ['2:1 나눠서 기록 후: pairSessions 문서의 이번 회차 필드(운동종목/코멘트/강도/타입)만 초기화',
    db.includes('exercises: [],') &&
    db.includes('trainerCommentA: "",') &&
    db.includes('trainerCommentB: "",') &&
    db.includes('splitDone: false,') &&
    db.includes('status: "draft",') &&
    db.includes('lastSplitAt: serverTimestamp(),')
  ],
  ['2:1 나눠서 기록 후: 회원 개인 세션 생성 로직은 그대로 유지(개인 히스토리 영향 없음)',
    db.includes('const aRef = await addDoc(') &&
    db.includes('const bRef = await addDoc(') &&
    db.includes('return { aSessionId: aRef.id, bSessionId: bRef.id };')
  ],
  ['2:1 나눠서 기록 후: 폼 화면이 목록으로 돌아가 로컬 state(운동종목/세트/중량)가 리셋된 문서와 어긋나지 않게 처리',
    // 회원별 개인화(selectedTypesA/B) 추가로 호출부가 여러 줄로 나뉘었다 — CRLF 때문에 여러 줄을 한 번에
    // 매칭하면 항상 실패하므로 한 줄 단위로 확인한다(검사 의도는 동일: editData 기반 split + 목록 복귀).
    app.includes('await onSplit(editData ? {...editData,') &&
    app.includes('exercises, trainerCommentA, trainerCommentB,') &&
    app.includes('onBack?.();')
  ],

  // ── 회원앱 홈 "오늘 운동 완료" 버튼 리디자인 ──
  ['홈 오늘 운동 완료 버튼: nowrap + 아이콘 정렬 + 44~48px 높이의 pill 버튼(.attendance-check-btn)',
    app.includes('className="attendance-check-btn"') &&
    app.includes('className="attendance-check-icon"') &&
    app.includes('.attendance-check-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;flex-shrink:0;white-space:nowrap;height:46px;padding:0 20px;border-radius:999px;') &&
    app.includes('.attendance-check-btn:active{transform:scale(.95)')
  ],

  // ── 수업 탭 리디자인(sj-*) — 통합 피드백 카드 "오늘 수업은 어땠나요?" ──
  ['수업 후 상태 메모: 요청 placeholder(좋았던 점/아쉬웠던 점) 적용',
    app.includes('placeholder="오늘 운동 중 좋았던 점이나 아쉬웠던 점을 남겨주세요."')
  ],
  ['수업 후 상태: RPE 1~10 숫자 버튼+쉬운 설명 힌트, 근육통 정도/부위, 메모가 하나의 피드백 카드로 통합 ("어떤 느낌인가요?" 선택 UI는 회원 요청으로 제거됨, sorenessNature 필드·저장 로직은 과거 기록 호환용으로 유지)',
    app.includes('<b>수업 후 몸 상태</b>') &&
    app.includes('className="sj-rpe-grid"') &&
    app.includes('function rpeDescription(') &&
    app.includes('const SORENESS_RISK_NATURES=') &&
    !app.includes('어떤 느낌인가요?')
  ],
  ['수업 후 상태: RPE·근육통·메모가 각각 독립된 저장 버튼을 가지며 한 항목 저장이 다른 항목을 건드리지 않음(공통 "기록 저장" 버튼 제거)',
    app.includes('const saveRpe=()=>saveSection("rpe",{rpe:Number(rpe)});') &&
    app.includes('saveSection("soreness",{sorenessLevel:level,sorenessBodyParts:parts,sorenessNature:nature});') &&
    app.includes('const saveMemo=()=>saveSection("memo",{memo:memo.trim()});') &&
    app.includes('"RPE 저장"') && app.includes('"근육통 저장"') && app.includes('"메모 저장"') &&
    !app.includes('"기록 저장"')
  ],
  ['수업 후 상태: 근육통 안내 문구("수업 후 2일 안에 가장 심했던 정도를 선택해주세요.")가 제목과 선택 버튼 사이에 표시',
    app.includes('<span className="sj-fb-instruction">수업 후 2일 안에 가장 심했던 정도를 선택해주세요.</span>') &&
    app.includes('.sj-fb-instruction{')
  ],
  ['수업 후 상태: 저장 중 중복 클릭 방지 (savingSection)',
    app.includes('if(savingSection)return;') &&
    app.includes('setSavingSection(key)')
  ],
  ['수업 후 상태: RPE·근육통·메모 저장 시 저장 직전 스크롤 위치를 기록 후 behavior:"auto"로 복원(smooth 사용 금지), alert()는 더 이상 호출하지 않고 비차단 토스트(sj-fb-saved-toast)로 대체',
    app.includes('const scrollY=window.scrollY;') &&
    app.includes('restoreScroll(scrollY)') &&
    app.includes('window.scrollTo({top:y,behavior:"auto"})') &&
    app.includes('sj-fb-saved-toast') &&
    !app.includes('alert("수업 후 상태가 저장되었습니다.")')
  ],
  ['수업 후 상태: "수업 후 몸 상태" 카드는 기본 접힘(헤더 한 줄만) + 펼치기/접기 토글로 언제든 입력·수정 가능, 접힘 상태 미리보기(sj-fb-quick) 없음',
    app.includes('function MemberFeedbackForm({s,onSave,open,onToggle}){') &&
    app.includes('펼치기 <SjIcon paths={SJ_PATHS.chevronDown}') &&
    app.includes('접기 <SjIcon paths={SJ_PATHS.chevronUp}') &&
    !app.includes('sj-fb-quick')
  ],
  ['수업 후 상태: 피드백 카드 펼침 상태(expandedFeedbackIds)는 MemberJournal이 아니라 MemberApp이 세션 id별 Set으로 관리(최초값 항상 빈 new Set()=전체 접힘) — MemberFeedbackForm/MemberJournal 내부 로컬 state가 아니므로 저장→load()로 하위 트리가 통째로 재마운트돼도 펼침 상태가 초기화되지 않음',
    app.includes('const [expandedFeedbackIds,setExpandedFeedbackIds]=useState(()=>new Set());') &&
    app.includes('const setFeedbackOpen=useCallback((id,nextOpen)=>{') &&
    app.includes('function MemberFeedbackForm({s,onSave,open,onToggle}){') &&
    (() => {
      const start = app.indexOf('function MemberFeedbackForm({s,onSave,open,onToggle}){');
      const end = app.indexOf('\nconst ANALYSIS_PERIODS=');
      const body = start !== -1 && end !== -1 ? app.slice(start, end) : '';
      return !!body && !body.includes('const [open,');
    })() &&
    (() => {
      const start = app.indexOf('function MemberJournal({');
      const end = app.indexOf('function MemberJournal({') !== -1 ? app.indexOf('\nfunction ', app.indexOf('function MemberJournal({')+1) : -1;
      const body = start !== -1 && end !== -1 ? app.slice(start, end) : '';
      // MemberJournal 자체에는 expandedFeedbackIds/setFeedbackOpen을 선언(useState/useCallback)하지 않고 props로만 받아써야 함
      return !!body && body.includes('expandedFeedbackIds,setFeedbackOpen') &&
        !body.includes('const [expandedFeedbackIds,setExpandedFeedbackIds]') &&
        !body.includes('const setFeedbackOpen=useCallback');
    })()
  ],
  ['수업 후 상태: expandedFeedbackIds는 sessionStorage로 이전 방문 값을 복원하지 않음(기본은 항상 접힘) — JOURNAL_EXPANDED_FEEDBACK_KEY 같은 sessionStorage 키 자체가 코드에 존재하지 않아야 함',
    !app.includes('JOURNAL_EXPANDED_FEEDBACK_KEY') &&
    !app.includes('teogym_journal_expandedFeedbackIds')
  ],
  ['수업 후 상태: MemberFeedbackForm의 open prop이 "최신 수업이라서/openId가 null이라서/피드백 미입력이라서" 등 자동 펼침 조건 없이 오직 expandedFeedbackIds(사용자가 직접 연 id 집합) 포함 여부로만 결정됨',
    app.includes('<MemberFeedbackForm s={s} onSave={saveFeedback} open={expandedFeedbackIds.has(s.id)} onToggle={next=>{')
  ],
  ['수업일지: 상위 "수업 카드"(MemberJournal) 펼침 판정(isExp)이 배열 인덱스가 아니라 실제 session.id(latestId) 비교로만 이루어짐 — 저장 후 재조회로 목록이 다시 그려져 인덱스가 흔들려도 펼침 카드가 바뀌지 않음',
    app.includes('const isExp=(s)=>!!lq||(openId==null&&s.id===latestId)||openId===s.id;')
  ],
  ['수업일지: 사용자가 "접기"를 눌렀을 때만 openId가 "__none__"(자동 재펼침 금지)으로 바뀌고, saveFeedback/load() 흐름에는 setOpenId/setExpandedFeedbackIds/setFeedbackOpen 호출이 전혀 없어 저장으로 인한 재조회가 두 펼침 상태 모두 건드리지 않음',
    app.includes('const toggleSess=(s)=>{ const wasOpen=isExp(s); setOpenId(prev=>(wasOpen&&!lq)?"__none__":s.id);') &&
    (() => {
      const start = app.indexOf('const saveFeedback=async(sessionId,feedback)=>{');
      const end = app.indexOf('const saveProfileInfo=async(data)=>{', start);
      const body = start !== -1 && end !== -1 ? app.slice(start, end) : '';
      return !!body && !body.includes('setOpenId') && !body.includes('setExpandedFeedbackIds') && !body.includes('setFeedbackOpen');
    })() &&
    (() => {
      const start = app.indexOf('const load=useCallback(async(opts={})=>{');
      const end = app.indexOf('if(loading) return', start);
      const body = start !== -1 && end !== -1 ? app.slice(start, end) : '';
      return !!body && !body.includes('setExpandedFeedbackIds') && !body.includes('setFeedbackOpen');
    })()
  ],
  ['수업일지: 사용자가 펼쳤던 session.id가 재조회 후 실제로 더 이상 존재하지 않을 때만 openId를 초기화(null) — sessions가 아직 빈 배열(로딩 전)일 때는 오탐으로 초기화하지 않도록 가드',
    app.includes('if(openId==null||openId==="__none__"||!sessions.length)return;') &&
    app.includes('if(!sessions.some(s=>s.id===openId))setOpenId(null);')
  ],
  ['수업일지: openId(상위 수업 카드 펼침, "수업 후 몸 상태"와는 별개)는 여전히 sessionStorage에도 저장되어 모바일 브라우저가 탭을 백그라운드에서 재로드(메모리 절약)해도 펼침 상태가 복원됨 — try/catch로 감싸 프라이빗 브라우징 등에서도 앱이 깨지지 않음',
    app.includes('const JOURNAL_OPEN_ID_KEY="teogym_journal_openId";') &&
    app.includes('try{return sessionStorage.getItem(JOURNAL_OPEN_ID_KEY);}catch{return null;}') &&
    app.includes('sessionStorage.setItem(JOURNAL_OPEN_ID_KEY,next)')
  ],
  ['수업 후 상태: RPE·근육통·메모 저장(saveSection)은 펼침 상태를 건드리지 않고(onToggle 미호출) 저장 완료 처리만 수행 — 사용자가 접기 버튼(cancel)을 누르거나 펼치기 버튼(openWithScroll)을 누를 때만 onToggle 호출',
    (() => {
      const start = app.indexOf('const saveSection=async(key,payload)=>{');
      const end = app.indexOf('const saveRpe=');
      const body = start!==-1 && end!==-1 ? app.slice(start,end) : '';
      return body && !body.includes('onToggle') &&
        app.includes('onToggle(false);') && // cancel()
        app.includes('onToggle(true); };'); // openWithScroll()
    })()
  ],
  ['수업 후 상태: 위험 신호(움직일 때 불편함/날카로운 통증) 선택 시 대표에게 알리라는 안내 표시',
    app.includes('const SORENESS_RISK_NATURES=') &&
    app.includes('다음 수업 전 대표님께 꼭 알려주세요.')
  ],
  ['수업일지 카드 순서: 운동종목(SessionMini)이 피드백 카드(MemberFeedbackForm)보다 먼저 표시',
    (() => {
      const i = app.indexOf('<SessionMini s={s} exFilter={lq||null} openKeys={openKeys} toggleOpen={toggleOpen} comparisonIndex={comparisonIndex}/>');
      const j = app.indexOf('<MemberFeedbackForm s={s} onSave={saveFeedback} open={expandedFeedbackIds.has(s.id)} onToggle={next=>{');
      return i !== -1 && j !== -1 && i < j;
    })()
  ],
  ['수업일지: 최근 수업 대표 카드(카드 밖 별도 라벨 없이 카드 내부 최상단 통합 메타 "최근 수업 · 부위 · PR" 한 줄로 표시) + 이전 수업 프리뷰 카드(날짜·부위·대표 운동·RPE 여부) + 전체 수업 기록 보기',
    !app.includes('className="sj-hero-label"') &&
    app.includes('className="sj-card-meta"') &&
    app.includes('<span className="sj-card-meta-label">최근 수업</span>') &&
    app.includes('function formatKoreanDateLabel(') &&
    app.includes('이전 수업') &&
    app.includes('전체 수업 기록 보기')
  ],
  ['수업일지: 최신 수업 카드 통합 메타(sj-card-meta)의 부위는 formatTypes(s.selectedTypes||s.type) 실제 데이터를 사용하고, PR은 prInfo.prSessionIds(실제 PR 여부)로 판단해 PR이 없으면 표시하지 않음(자리 비우지 않음) — 카드 밖·카드 안에 부위/PR이 이중 표시되지 않도록 최신 카드는 날짜 아래 <p>{typeName}</p>를 생략',
    (() => {
      const start = app.indexOf('const renderExpanded=(s)=>{');
      const end = app.indexOf('const renderCollapsed=(s)=>{');
      const body = start !== -1 && end !== -1 ? app.slice(start, end) : '';
      return !!body &&
        body.includes('isLatest?') &&
        body.includes('<span className="sj-card-meta-part">{typeName}</span>') &&
        body.includes('{isPr&&<><span className="sj-card-meta-dot">·</span><em className="sj-card-meta-pr">PR</em></>}') &&
        body.includes(':isPr&&<span className="sj-badges"><em className="sj-badge pr">★ PR</em></span>}') &&
        body.includes('{!isLatest&&<p>{typeName}</p>}');
    })()
  ],
  ['수업일지: 세트 표가 운동 유형별 열 자동 구성(중량/반복/시간, 값 있는 열만 표시) — 중량 열은 기록 단위(kg/단)에 따라 라벨·표기가 바뀐다',
    app.includes('recordUnit!=="bodyweight" && sets.some(x=>toPositiveNumber(x.weight))&&{key:"weight",label:getWeightColumnLabel(recordUnit)') &&
    app.includes('sets.some(x=>toPositiveNumber(x.reps))&&{key:"reps",label:"반복"') &&
    app.includes('sets.some(getSetDurationValue)&&{key:"dur",label:"시간"')
  ],
  ['Firestore 저장: saveSessionMemberFeedback이 건드린 필드만 setDoc(merge:true)로 반영, 나머지는 기존값 유지 (+sorenessNature)',
    db.includes('if (feedback.sorenessLevel !== undefined || feedback.sorenessBodyParts !== undefined || feedback.sorenessBodyPart !== undefined) {') &&
    db.includes('if (feedback.rpe !== undefined) payload.rpe = Number(feedback.rpe);') &&
    db.includes('if (feedback.sorenessNature !== undefined) payload.sorenessNature = feedback.sorenessNature || "";') &&
    db.includes('if (feedback.memo !== undefined) payload.memo = feedback.memo || "";') &&
    db.includes('await setDoc(ref, clean(payload), { merge: true });')
  ],
  ['Firestore Rules: memberFeedback 필드 화이트리스트에 sorenessNature 포함',
    firestoreRules.includes('"sorenessBodyParts", "sorenessNature", "rpe"')
  ],

  // ── 관리자앱 PC 로그인 화면 대비 개선 ──
  ['관리자 로그인 버튼: 입력 전 약한 블루 틴트, 입력 완료 시 선명한 블루(#2F73F6)로 전환(Btn 공용 컴포넌트는 변경하지 않고 LoginScreen 인스턴스에만 style prop으로 override)',
    app.includes('background:"rgba(47,115,246,.14)",color:"rgba(255,255,255,.5)",opacity:1,boxShadow:"none"') &&
    app.includes('background:"#2F73F6",color:"#fff",opacity:1,boxShadow:"0 8px 20px rgba(47,115,246,.35)"') &&
    app.includes('function Btn({ children, onClick, sm, full, disabled, ghost, style }) {') // 공용 Btn 컴포넌트 시그니처 불변 확인
  ],
  ['관리자앱 입력창/라벨/placeholder 대비 개선 — 회원앱(.member-shell/.member-login) DOM에는 :not(:has())로 매칭되지 않음',
    app.includes('body:not(:has(.member-shell)):not(:has(.member-login)) label{color:#9ca8bb;}') &&
    app.includes('background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;') &&
    app.includes('body:not(:has(.member-shell)):not(:has(.member-login)) input::placeholder,')
  ],
  ['회원앱 회귀 방지: .form-line/.login-form 등 회원 전용 input/label 스코프 규칙은 그대로 유지(관리자 대비 개선이 회원앱에 새지 않음)',
    app.includes('.form-line label{font-weight:900;color:#66717C}') &&
    app.includes('.login-form input:not([type="checkbox"]){width:100%;background:#fff;color:#20242A;')
  ],

  // ── 회원앱 건강 탭: 카드 하나 = 입력 항목 하나 재설계 ──
  // ── 회원앱 건강 탭: 전날 생활(그룹A)/오늘 상태(그룹B) 2그룹 재설계 ──
  ['건강 탭 카드 순서: 어제 기록 그룹(칼로리·걸음수·유산소)·오늘 상태 그룹(체중·컨디션·통증) 순서로 각각 배치',
    (() => {
      const iY = app.indexOf('function buildYesterdayHealthTiles(p,yesterday,open){');
      const blockY = app.slice(iY, iY + 900);
      const orderY = ['key:"kcal"', 'key:"steps"', 'key:"cardio"'];
      let posY = -1;
      const okY = iY !== -1 && orderY.every(tok => { const idx = blockY.indexOf(tok); if (idx === -1 || idx <= posY) return false; posY = idx; return true; });
      const iT = app.indexOf('function buildTodayStatusTiles(p,today,open){');
      const blockT = app.slice(iT, iT + 900);
      const orderT = ['key:"weight"', 'key:"condition"', 'key:"pain"'];
      let posT = -1;
      const okT = iT !== -1 && orderT.every(tok => { const idx = blockT.indexOf(tok); if (idx === -1 || idx <= posT) return false; posT = idx; return true; });
      return okY && okT;
    })()
  ],
  ['건강 탭 기본 날짜: 칼로리·걸음수·유산소 카드는 어제 날짜를 기본값으로 열고, 체중·컨디션·통증 카드는 오늘 날짜를 기본값으로 연다',
    (() => {
      const i = app.indexOf('function MemberHealth(p){');
      const block = app.slice(i, app.indexOf('function CardioEntryForm', i));
      return block.includes('weight:()=>{ p.setForm(f=>({...f,date:today,') &&
        block.includes('kcal:()=>{ p.setForm(f=>({...f,date:yesterday,') &&
        block.includes('steps:()=>{ p.setForm(f=>({...f,date:yesterday,') &&
        block.includes('condition:()=>{ p.setForm(f=>({...f,date:today,') &&
        block.includes('pain:()=>{ p.setForm(f=>({...f,date:today,') &&
        block.includes('initialDate={yesterday} initialLog={yesterdayCardio}');
    })()
  ],
  ['건강 탭: 과거 기록 수정(캘린더에서 특정 날짜 선택)은 여전히 그 날짜(selected)를 그대로 쓰고 오늘/어제로 강제되지 않는다',
    app.includes('const openMeasure=()=>{ p.setForm(f=>({...f,date:selected})); setSheet("measure"); };') &&
    app.includes('const openCondition=()=>{ p.setForm(f=>({...f,date:selected})); setSheet("condition"); };') &&
    app.includes('<CardioEntryForm key={selected} p={p} initialDate={selected} onSaved={()=>setSheet(null)}/>')
  ],
  ['최근 건강 기록 카드 제거: 건강 탭 입력 카드 영역에는 조회 전용 최근 기록 카드가 없음(RecentHealthRecords/buildRecentHealthRecords 삭제)',
    !app.includes('function RecentHealthRecords(') &&
    !app.includes('<RecentHealthRecords') &&
    !app.includes('function buildRecentHealthRecords(')
  ],

  // ── 건강 탭 프리미엄 리디자인(동기부여 대시보드) ──
  ['건강 탭: 건강 기록 카드 6종이 하나의 health-hub 카드 안에서 어제 기록/오늘 상태 두 그룹으로 표시(하위 유산소 탭/최근 기록 등 별도 섹션 없이 개별 시트로 대체)',
    (() => {
      const iHub = app.indexOf('<div className="health-hub">');
      const iGroups = app.indexOf('className="health-daygroups"');
      const iGrid = app.indexOf('className="health-daygroup-grid"');
      return iHub !== -1 && iGroups !== -1 && iGrid !== -1 && iHub < iGroups && iGroups < iGrid && !app.includes('<div className="health-hub-divider"/>');
    })()
  ],
  ['건강 탭: 상단 요약이 체중/이번주 운동/유산소/동적 하이라이트 4종으로 개편, 목표 카드 제거',
    app.includes('function computeWeightCard(body)') &&
    app.includes('function computeWeeklyWorkoutCard(attendance=[],onboarding={})') &&
    app.includes('function pickHighlightStat(p)') &&
    !app.includes('<Metric t="목표" v={p.onboarding.goal}/>')
  ],
  ['건강 탭: 동기부여 배너(buildHealthMotivation)가 기존 데이터만으로 계산됨(신규 저장 없음)',
    app.includes('function buildHealthMotivation(p)') &&
    app.includes('목표까지 ${remain}회 남았으니 다음 수업 전까지 채워보세요') &&
    app.includes('function computeEngagementStreak(checkins=[],attendance=[],cardioLogs=[])')
  ],
  ['건강 탭: 유산소 섹션 내부가 MCard 대신 통일된 health-subcard 디자인 사용(1:1/관리자 MCard는 그대로 유지)',
    !/CardioRecordTab[\s\S]{0,400}<MCard/.test(app) &&
    app.includes('className="health-subcard"') &&
    app.includes('function MCard({title,children}){return <section className="mcard">')
  ],
  ['건강 탭: 펼치기/접기·탭 전환에 150~250ms 트랜지션 애니메이션 적용',
    app.includes('.health-collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s ease}') &&
    app.includes('.cardio-tab-fade{animation:healthFadeIn .2s ease}') &&
    app.includes('@keyframes healthFadeIn')
  ],
  ['건강 탭: 저장 완료 시 성공 플래시 애니메이션(.save-success), 기존 저장 함수(saveCheck/saveCardioEntry) 로직은 변경 없음',
    app.includes('.primary.save-success,.ghost.save-success{background:#16C784') &&
    app.includes('await p.saveCheck(); setJustSaved(true);') &&
    app.includes('await p.saveCardioEntry({...d,id:initialLog?.id});')
  ],

  // ── 변화분석 탭: 2026-07 리디자인(목표별 Hero + 이번 기간 리포트) ──
  ['변화분석: 목표 5종 페르소나 판별 함수 존재(다이어트/벌크업/체형교정/체력향상/건강관리), 배열 목표는 첫 유효값 사용',
    app.includes('function getAnalysisPersona(goal=""){') &&
    app.includes('const first=Array.isArray(goal)?(goal.find(v=>String(v||"").trim())||""):goal;') &&
    app.includes('if(g.includes("체형교정")||g.includes("교정")) return "correction";') &&
    app.includes('if(g.includes("벌크업")||g.includes("증량")||g.includes("근육 키우기")) return "bulk";') &&
    app.includes('if(g.includes("다이어트")||g.includes("감량")) return "diet";') &&
    app.includes('if(g.includes("체력")) return "fitness";') &&
    app.includes('return "general";')
  ],
  ['변화분석: 목표별 Hero — 밝은 카드, 핵심 수치 1개+지표 3개, 데이터 부족 시 빈 상태 안내(억지 수치 없음)',
    app.includes('function buildGoalHero(persona, ctx) {') &&
    app.includes('function GoalHeroCard({ hero }) {') &&
    app.includes('<GoalHeroCard hero={hero} />') &&
    app.includes('아직 변화 기록이 충분하지 않아요.') &&
    app.includes('변화 흐름을 확인할 수 있어요.')
  ],
  ['변화분석: 이번 기간 리포트 — 잘한 점 최대 2개+다음 목표 1개, 내용 없으면 카드 숨김, 별점·등급·예상 달성률 제거',
    app.includes('function buildPeriodReport(persona, ctx) {') &&
    app.includes('const trimmed = goods.slice(0, 2);') &&
    app.includes('<PeriodReportCard report={periodReport} />') &&
    app.includes('<MCard title="이번 기간 리포트">') &&
    !app.includes('function GrowthReportCard') &&
    !app.includes('title="이번 달 성장 리포트"') &&
    !app.includes('예상 달성률 <b>')
  ],
  ['변화분석: 대표 코멘트·다음 변화 예상·이번 달 BEST 카드는 렌더링 제거(회원 분석 탭)',
    !app.includes('<MCard title="대표 코멘트">') &&
    !app.includes('function FuturePredictionCard') &&
    !app.includes('function MonthlyBestCard') &&
    !app.includes('<MCard title="다음 변화 예상">')
  ],
  ['변화분석: 부위별 운동 볼륨 카드 - 부위 선택 없이 5개 부위(등/가슴/하체/어깨/팔)를 동시에 비교, 카드 자체의 기간 버튼(최근/1개월/3개월/6개월/1년)으로 대표 3개 시점을 선택, 데이터 부족 시 "기록 부족" 안내',
    app.includes('function buildPartVolumeHistory(sessions=[]){') &&
    app.includes('const VOLUME_CARD_PERIODS=[{key:"recent",label:"최근"},{key:"1m",label:"1개월",days:30},{key:"3m",label:"3개월",days:90},{key:"6m",label:"6개월",days:180},{key:"1y",label:"1년",days:365}];') &&
    app.includes('function pickVolumeBars(records=[],periodKey){') &&
    app.includes('function PartVolumeMultiCard({sessions=[]}){') &&
    !app.includes('<div className="part-volume-tabs">') &&
    app.includes('기록 부족')
  ],
  ['변화분석: 목표별 주요 그래프 분기 — 다이어트=체중, 벌크업=볼륨·수행능력, 체형교정=통증, 체력향상=운동지속, 건강관리=체중+활동',
    app.includes('{persona === "diet" && weightChart}') &&
    app.includes('{persona === "correction" && painVasCard}') &&
    app.includes('{persona === "fitness" && cardioActivityCard}') &&
    (() => {
      const i = app.indexOf('{persona === "bulk" && (');
      if (i === -1) return false;
      return app.slice(i, i + 300).includes('<PartVolumeMultiCard sessions={p.sessions} />') &&
        app.slice(i, i + 300).includes('<StrengthChangeCard');
    })()
  ],
  ['변화분석: 체형교정 교정 결과는 correctionSummaries 실데이터로 표시(없으면 정직한 안내), 추가 데이터(접힘)에서 확인',
    app.includes('const correctionResultCard = (') &&
    app.includes('아직 등록된 교정 평가 결과가 없습니다. 다음 방문 시 대표님께 평가를 요청해보세요.') &&
    app.includes('{persona === "correction" && correctionResultCard}')
  ],
  ['변화분석: 체성분 변화 추이(compositionChart)는 건강 전문 분석에서 페르소나 구분 없이 항상 표시',
    (() => {
      const i = app.indexOf('<CollapsibleSection label="건강 전문 분석"');
      return app.slice(i, i + 2500).includes('{compositionChart}') &&
        !app.slice(i, i + 2500).includes('persona !== "general" && compositionChart');
    })()
  ],
  ['변화분석: 회원 분석 화면 어디에도 "AI" 문자열이 없음(Hero/리포트/전략 영역)',
    (() => {
      const start = app.indexOf('function buildGoalHero');
      const end = app.indexOf('function ProfileHeroCard');
      return start !== -1 && end !== -1 && !app.slice(start, end).includes('AI');
    })()
  ],
  ['변화분석: 건강 전문 분석에 BMI/BMR/인바디 히스토리만 추가(내장지방·체수분·부위별 근육량은 언급하지 않음 — 미입력 항목 노출 금지)',
    app.includes('title="BMI"') &&
    app.includes('title="BMR(기초대사량)"') &&
    app.includes('인바디 히스토리') &&
    !app.includes('내장지방') && !app.includes('체수분') && !app.includes('부위별 근육량')
  ],
  ['변화분석: BMI는 체중+키로 계산(신규 입력 없이 재사용), BMR은 estimateMaintenance 결과 재사용',
    app.includes('const bmiOf = r => {') &&
    app.includes('calorieAnalysis.bmr ? `${Math.round(calorieAnalysis.bmr)}kcal`')
  ],
  ['변화분석: "다음 수업 전까지" 체크리스트는 회원 화면에서 렌더링하지 않음(계산 로직은 관리자앱 사용 대비 유지)',
    app.includes('function buildNextClassChecklist({ recentKcalCount, recentCardioCount })') &&
    app.includes('function NextClassChecklistCard({ items = [], closing })') &&
    !app.includes('<NextClassChecklistCard items={nextClassChecklist.items} closing={nextClassChecklist.closing} />')
  ],
  ['변화분석: 위상각/신체나이 등 전문 데이터는 "건강 전문 분석"로 통합, 기본 접힘',
    app.includes('<CollapsibleSection label="건강 전문 분석" defaultOpen={false}>') &&
    !app.includes('<CollapsibleSection label="신체나이 변화" defaultOpen={false}>')
  ],
  ['변화분석: Before → After — 시작/현재 텍스트·숫자 비교(다이어트/건강유지=체중, 벌크업=골격근량 우선·없으면 대표 중량, 체형교정=통증), 값 없으면 카드 숨김',
    app.includes('function BeforeAfterCard({ metricLabel, before, after, unit = "", periodText, goodDirection = "down" })') &&
    app.includes('if (before == null || after == null || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after))) return null;') &&
    app.includes('const beforeAfter = (() => {') &&
    app.includes('<BeforeAfterCard {...beforeAfter} periodText={periodText} />')
  ],
  ['변화분석: 카드 순서 — Hero → 그래프 → Before→After → 이번 기간 리포트 → 목표 전략 → 추가 데이터(접힘) → 건강 전문 분석(접힘)',
    (() => {
      const iHero = app.indexOf('<GoalHeroCard hero={hero} />');
      const iBA = app.indexOf('<BeforeAfterCard {...beforeAfter} periodText={periodText} />');
      const iReport = app.indexOf('<PeriodReportCard report={periodReport} />');
      const iStrategy = app.indexOf('<WeightGoalStrategyCard {...p}');
      const iExtra = app.indexOf('<CollapsibleSection label="추가 데이터" defaultOpen={false}>');
      const iPro = app.indexOf('<CollapsibleSection label="건강 전문 분석" defaultOpen={false}>');
      return [iHero, iBA, iReport, iStrategy, iExtra, iPro].every(i => i !== -1) &&
        iHero < iBA && iBA < iReport && iReport < iStrategy && iStrategy < iExtra && iExtra < iPro;
    })()
  ],
  ['변화분석: 목표 전략 — 핵심 수치 2개+한 줄 방향, "주당 0.xxkg"·달성 확률 미노출, 데이터 부족 시 안내 문구',
    app.includes('function WeightGoalStrategyCard({persona="diet",painLast=null,periodCardioMinutes=0,periodWorkoutCount=0,weightState=null,...p}){') &&
    app.includes('기록이 조금 더 쌓이면 목표 흐름을 확인할 수 있어요.') &&
    !app.includes('주당 {f.recommended.toFixed(2)}kg') &&
    !app.includes('목표 달성 가능성 {f.possibility}')
  ],

  // ── 체형평가 리뉴얼 Phase 1: 빠른 평가 / 유형별 평가 / 교차 평가 ──
  ['체형평가: 빠른 평가 체크리스트 8개 항목 정의(통증/가동범위 제한/근력 저하/자세 문제/보행 문제/저림/운동 시 통증/일상생활 통증)',
    app.includes('const QUICK_CHECK_ITEMS = [') &&
    ['pain','romLimit','weakness','posture','gait','tingling','painDuringExercise','painDailyLife'].every(k=>app.includes(`key:"${k}"`))
  ],
  ['체형평가: 유형별 평가 카테고리 10개(기존 9개 + 보행), 기존 9개는 필수 테스트 5개 이상 유지(축소 없음)',
    app.includes('const ASSESS_CATEGORIES = ["목","어깨","팔꿈치","손목","허리","골반","무릎","발목","발바닥","보행"];') &&
    (() => {
      const start = app.indexOf('const CATEGORY_TESTS = {');
      const end = app.indexOf('const TEST_RESULT_OPTS');
      const block = app.slice(start, end);
      const cats = ["목","어깨","팔꿈치","손목","허리","골반","무릎","발목","발바닥","보행"];
      return cats.every((cat,i) => {
        const catIdx = block.indexOf(`"${cat}": [`);
        if (catIdx === -1) return false;
        const nextCat = cats[i+1];
        const nextCatIdx = nextCat ? block.indexOf(`"${nextCat}": [`, catIdx) : -1;
        const section = block.slice(catIdx, nextCatIdx === -1 ? undefined : nextCatIdx);
        return (section.match(/key:/g)||[]).length >= 5;
      });
    })()
  ],
  ['체형평가: 보행 카테고리는 측면/후면 12항목 + "이상 패턴" 라벨, 나머지 카테고리는 기존처럼 정상/제한/통증 버튼 + 통증 시 좌우 VAS 입력',
    app.includes('const TEST_RESULT_OPTS = ["정상","제한","통증"];') &&
    app.includes('const CATEGORY_RESULT_OPTS = { "보행": ["정상","이상 패턴","통증"] };') &&
    app.includes('group:"측면"') && app.includes('group:"후면"') &&
    app.includes('row.result==="통증" && (') &&
    app.includes('{["좌","우"].map(side=>(')
  ],
  ['체형평가: 모든 테스트 항목에 평가방법(method)/정상기준(normal)/제한의심(limited)/통증체크(painCriteria) 필드 + "기준 보기" 접이식 UI',
    app.includes('const [openCriteria, setOpenCriteria] = useState(') &&
    app.includes('{criteriaOpen?"기준 접기 ▲":"기준 보기 ▼"}') &&
    (() => {
      const start = app.indexOf('const CATEGORY_TESTS = {');
      const end = app.indexOf('const TEST_RESULT_OPTS');
      const block = app.slice(start, end);
      return (block.match(/method:/g)||[]).length >= 60 && (block.match(/normal:/g)||[]).length >= 60;
    })()
  ],
  ['체형평가: 가동범위(ROM) 입력 — TEST_ROM_CONFIG/REACH_LEVELS 존재, 각도/거리/도달위치/시간 + 좌우 기록 지원',
    app.includes('const REACH_LEVELS = ["도달 안 됨","엉덩이","천골","요추","흉요추 경계","견갑골 하각","견갑골 중앙","견갑골 상각 이상"];') &&
    app.includes('const TEST_ROM_CONFIG = {') &&
    app.includes('sh_flex:        {type:"angle"') &&
    app.includes('apley:          {type:"reachLevel"') &&
    app.includes('leftValue') && app.includes('rightValue')
  ],
  ['체형평가: 교차 평가 정적 매핑(어깨→흉추/견갑/반대쪽 골반/고관절, 허리→고관절/발목/햄스트링, 무릎→고관절/발목) + 일괄 체크',
    app.includes('"어깨":   [{label:"흉추",       categoryKey:null},   {label:"견갑",   categoryKey:null}, {label:"반대쪽 골반", categoryKey:"골반"}, {label:"고관절", categoryKey:"골반"}],') &&
    app.includes('"허리":   [{label:"고관절",     categoryKey:"골반"}, {label:"발목",   categoryKey:"발목"}, {label:"햄스트링", categoryKey:null}],') &&
    app.includes('"무릎":   [{label:"고관절",     categoryKey:"골반"}, {label:"발목",   categoryKey:"발목"}],') &&
    app.includes('const bulkCheckCrossReferrals = (cat) => {')
  ],
  ['체형평가: 빠른 평가 체크 시 회원의 과거 평가 이력(빈도) 기반으로 추천 카테고리 계산, 이력 없으면 전체 노출',
    app.includes('function getRecommendedCategories(records=[], limit=5)') &&
    app.includes('return sorted.length ? sorted.slice(0,limit) : ASSESS_CATEGORIES.slice(0,limit);')
  ],
  ['체형평가: 새 quickCheck/categoryResults는 실제 입력된 경우에만 저장(레거시 전용 저장 시 새 필드로 오염되지 않음)',
    app.includes('const hasQuickCheck = Object.values(quickCheck).some(Boolean);') &&
    app.includes('quickCheck: hasQuickCheck ? {...quickCheck} : undefined,') &&
    app.includes('categoryResults: hasCategoryResults ? {...categoryResults} : undefined,')
  ],
  ['체형평가: 기존 자유입력(painList/muscleItems/mobility/gait/postureList) 탭과 기록 조회는 그대로 유지(레거시 데이터 손실 없음)',
    app.includes('{key:"입력",      label:"상세 입력"},') &&
    app.includes('{viewRec.categoryResults && Object.keys(viewRec.categoryResults).length>0 && (')
  ],

  // ── 체형평가 리뉴얼 Phase 2: 교정 루틴 생성기 + 재평가 ──
  ['체형평가: 교정 루틴 6단계(도수→호흡→가동성→활성화→패턴→근력) 템플릿, 유형별 평가에서 제한/통증 확인된 카테고리만 자동 시드',
    app.includes('const ROUTINE_PHASES = ["도수","호흡","가동성","활성화","패턴","근력"];') &&
    app.includes('function buildRoutineSeed(categoryResults={}) {') &&
    app.includes('.filter(([,cr]) => (cr.tests||[]).some(t => t.result && t.result!=="정상"))')
  ],
  ['체형평가: 교정 루틴 운동은 자유 텍스트 입력(이름/세트/횟수/메모), 트레이너가 추가·삭제·수정 가능',
    app.includes('function emptyCorrectiveExercise() { return { name:"", sets:"", reps:"", duration:"", memo:"" }; }') &&
    app.includes('const updateRoutineExercise = (phaseIdx, exIdx, patch) => {') &&
    app.includes('const addRoutineExercise = (phaseIdx) => {') &&
    app.includes('const removeRoutineExercise = (phaseIdx, exIdx) => {')
  ],
  ['체형평가: 재평가는 유형별 평가에서 제한/통증이었던 테스트(+가동범위 수치가 있는 테스트)를 대상으로 하고, before/after를 좋아짐/유지/악화로 자동 비교',
    app.includes('function buildRetestTargets(categoryResults={}) {') &&
    app.includes('if ((t.result && t.result!=="정상") || beforeMeasure) {') &&
    app.includes('function compareRetest(retestTargets=[], retestResults={}) {') &&
    app.includes('const changeLabel = afterRank<beforeRank ? "좋아짐" : afterRank>beforeRank ? "악화" : "유지";')
  ],
  ['체형평가: 재평가는 VAS(통증) 비교도 별도로 산출(painCompare)',
    app.includes('const painChange = afterVas<beforeVas ? "좋아짐" : afterVas>beforeVas ? "악화" : "유지";') &&
    app.includes('painCompare.push({ category:target.category, testKey:target.testKey, label:target.label, side, before:beforeVas, after:afterVas, changeLabel:painChange });')
  ],
  ['체형평가: 교정 루틴/재평가는 생성·입력한 경우에만 저장, 기록 상세 뷰에서도 확인 가능',
    app.includes('correctiveRoutine: routinePhases ? { phases: routinePhases } : undefined,') &&
    app.includes('retest: Object.keys(retestResults).length>0 ? {') &&
    app.includes('{viewRec.correctiveRoutine?.phases?.length>0 && (') &&
    app.includes('{viewRec.retest?.done && (')
  ],

  // ── 체형평가 리뉴얼 Phase 3: 변화 분석 강화 ──
  ['변화 분석: ROM 증가 TOP5(재평가 좋아짐 빈도) + 통증 감소 TOP5(재평가 VAS 감소폭 합산)',
    app.includes('records.forEach(r => (r.retest?.compare||[]).forEach(c => {') &&
    app.includes('if (c.changeLabel==="좋아짐") { const k=c.category+" "+c.label; romImproveFreq[k]=(romImproveFreq[k]||0)+1; }') &&
    app.includes('painDecreaseSum[k]=(painDecreaseSum[k]||0)+(c.before-c.after); }')
  ],
  ['변화 분석: 반복되는 제한(같은 테스트가 2회 이상 제한/통증) 집계는 유형별 평가 타임라인 기반',
    app.includes('const catTimeline = {};') &&
    app.includes('.filter(x => x.badCount>=2)')
  ],
  ['변화 분석: 교정 완료(최초 제한/통증→최근 정상) / 재발(정상 이후 다시 제한/통증) 항목을 시간 순으로 자동 판별',
    app.includes('timeline.length>=2 && timeline[0].result!=="정상" && timeline[timeline.length-1].result==="정상"') &&
    app.includes('const firstNormalIdx = timeline.findIndex(t=>t.result==="정상");') &&
    app.includes('return firstNormalIdx!==-1 && timeline.slice(firstNormalIdx+1).some(t=>t.result!=="정상");')
  ],
  ['변화 분석: 좌우 차이는 가장 최근 평가의 통증 VAS 좌/우 기록에서 계산(레거시 기록도 그대로 집계에 포함)',
    app.includes('Object.entries(latest.categoryResults||{}).forEach(([cat,cr]) => {') &&
    app.includes('const diff = Math.abs((t.vas.좌||0)-(t.vas.우||0));')
  ],

  // ── 체형평가 리뉴얼 Phase 4: Firestore correctionSummaries + 회원앱 연동 ──
  ['Firestore 규칙: assessments(전문 임상 데이터)는 트레이너 전용 그대로 유지, correctionSummaries만 신규 추가(회원은 읽기만 가능)',
    firestoreRules.includes('match /assessments/{assessmentId} {\n        allow read, write: if isTrainerOfMember(memberId);\n      }') &&
    firestoreRules.includes('match /correctionSummaries/{summaryId} {') &&
    firestoreRules.includes('allow read: if isTrainerOfMember(memberId) || isMemberSelfActive(memberId);') &&
    (() => {
      const i = firestoreRules.indexOf('match /correctionSummaries/{summaryId} {');
      const block = firestoreRules.slice(i, firestoreRules.indexOf('}', firestoreRules.indexOf('}', i) + 1));
      return block.includes('allow write: if isTrainerOfMember(memberId);') && !block.includes('canAccessMember');
    })()
  ],
  ['db.js: getCorrectionSummaries/saveCorrectionSummary가 members/{id}/correctionSummaries 경로를 사용, saveAssessment와 동일한 clean()/merge 패턴 재사용',
    db.includes('export async function getCorrectionSummaries(memberId) {') &&
    db.includes('collection(db, "members", memberId, "correctionSummaries")') &&
    db.includes('export async function saveCorrectionSummary(memberId, data) {') &&
    db.includes('doc(db, "members", memberId, "correctionSummaries", summaryId)')
  ],
  ['체형평가 저장: 유형별 평가/재평가 데이터가 있을 때만 회원용 교정 결과 요약(+가동범위 변화 romChanges)을 별도 컬렉션에 추가 저장(전문용어 없는 문장만)',
    app.includes('function buildMemberCorrectionFeedback(rec){') &&
    app.includes('if (hasCategoryResults || rec.retest) {') &&
    app.includes('const romChanges = buildMemberRomSentences(buildRomChangeCards(buildCatTimeline(next)));') &&
    app.includes('await saveCorrectionSummary(member.id, { id: savedRec.id, date: assDate, ...feedback, romChanges, visibleToMember: true });')
  ],
  ['체형평가: 가동범위 변화(buildRomChangeCards/buildMemberRomSentences)는 통증 변화 분석과 별개 — 의료 표현("진단/질환/병변/치료") 없이 "가동범위/움직임 변화"로만 표현, "AI" 단어 없음, 데이터 없으면 자연스러운 안내',
    (() => {
      const i = app.indexOf('function buildRomChangeCards');
      const j = app.indexOf('function RomChangeCard');
      const block = app.slice(i, j+1200);
      return i!==-1 && j!==-1 && !block.includes('AI') &&
        !/진단|질환|병변|손상 확정/.test(block) &&
        app.includes('가동범위 변화 기록이 쌓이면 여기에서 확인할 수 있어요.');
    })()
  ],
  ['회원앱: correctionSummaries를 다른 컬렉션과 동일한 readStep 패턴으로 로딩하고 common prop으로 전달, 실패해도 다른 데이터 로딩을 막지 않음',
    app.includes('readStep("13","correctionSummaries",`members/${p.id}/correctionSummaries`,()=>getCorrectionSummaries(p.id),[])') &&
    app.includes('setCorrectionSummaries((csm||[]).filter(x=>x.visibleToMember!==false));') &&
    // common prop 목록의 마지막 항목이 아니어도 통과해야 한다(개인운동 prop 추가 이후) — 전달 여부만 확인한다
    (app.includes('cardioSaving,correctionSummaries};') || app.includes('cardioSaving,correctionSummaries,'))
  ],
  ['Firestore 규칙 테스트: correctionSummaries에 회원 read 허용/write 차단/타회원 차단/휴식중 회원 차단 케이스 존재',
    (() => {
      const testSrc = fs.readFileSync(path.join(root, 'tests', 'rules', 'firestore.rules.test.mjs'), 'utf8');
      return testSrc.includes('describe("6-2. correctionSummaries') &&
        testSrc.includes('[진행중 회원] 본인 correctionSummaries write 차단(트레이너만 쓰기 가능)') &&
        testSrc.includes('[회원 A] 회원 B correctionSummaries read 차단') &&
        testSrc.includes('[휴식중 회원] correctionSummaries read 차단');
    })()
  ],

  // ── 오늘의 운동 가이드 추천 로직 개편 ──
  ['오늘의 운동 가이드: 부위 pill이 팔로 통합되고 코어가 단독 추천 후보에서 제거됨',
    app.includes('["가슴","등","하체","어깨","팔"].map(x=>') &&
    !/const parts=\["가슴","등","하체","어깨","코어"\]/.test(app)
  ],
  ['오늘의 운동 가이드: 성별 분기 없이 주당 운동 빈도 기반 기본 분할 상수 + 2:1 공통 기본값 정의',
    app.includes('const SPLIT_5WAY       = ["하체","어깨","등","가슴","팔"];') &&
    app.includes('const SPLIT_2WAY       = ["하체","가슴 · 등 · 어깨 · 팔"];') &&
    app.includes('const SPLIT_3WAY       = ["하체","가슴 · 어깨 · 삼두","등 · 이두"];') &&
    app.includes('const SPLIT_COMBO_2WAY = ["하체 · 가슴 · 삼두","등 · 어깨 · 이두"];') &&
    app.includes('const PAIR_SPLIT_DEFAULT = SPLIT_3WAY;')
  ],
  ['오늘의 운동 가이드: SPLIT_5WAY 순환 순서 자체가 상극 조합(하체↔등, 가슴↔어깨)을 순환 인접 위치에 배치하지 않음(가슴→팔→하체→어깨→등→(순환)가슴 — 5개 인접쌍 어디에도 금지 조합 없음)',
    (() => {
      const CONFLICT = { "하체":"등", "등":"하체", "가슴":"어깨", "어깨":"가슴" };
      const order = ["하체","어깨","등","가슴","팔"];
      return order.every((p, i) => CONFLICT[p] !== order[(i + 1) % order.length]);
    })()
  ],
  ['오늘의 운동 가이드: 기본 분할 선택(pickBaseCycle)이 실제 기록에서 조합형(SPLIT_COMBO_2WAY) 사용 흔적을 최우선 확인하고, 없으면 주당 운동 빈도로 분할 길이를 가름 — 성별 참조 없음',
    app.includes('function pickBaseCycle(sequence,freq){') &&
    app.includes('if(sequence.some(s=>SPLIT_COMBO_2WAY.includes(s)))return SPLIT_COMBO_2WAY;') &&
    app.includes('if(freq>=4)return SPLIT_5WAY;') &&
    app.includes('return freq===3?SPLIT_3WAY:SPLIT_2WAY;') &&
    !/gender/.test(app.slice(app.indexOf('function getRecommendedPart('), app.indexOf('function formatRoutineSet')))
  ],
  ['오늘의 운동 가이드: 원본 selectedTypes 기반 콤보 라벨(partComboLabel)로 이두/삼두를 뭉개지 않고 미는/당기는 조합을 그대로 인식',
    app.includes('const PART_COMBO_ORDER = ["하체","가슴","등","어깨","이두","삼두","팔"];') &&
    app.includes('function partComboLabel(rawTypes){')
  ],
  ['오늘의 운동 가이드: 2:1 여부 판별(getLatestSessionType)이 회원 본인 sessions의 최근 sessionType만으로 이뤄짐(별도 조회 없음) — 최근 수업이 1:1로 바뀌면 자동 복귀',
    app.includes('function getLatestSessionType(sessions=[]){') &&
    app.includes('return sorted[0]?.sessionType==="2:1" ? "2:1" : "1:1";')
  ],
  ['오늘의 운동 가이드: getRecommendedPart 1순위가 2:1 여부(isPaired)로 기본 사이클을 선택하고, 그 외에는 성별이 아니라 실제 기록/빈도(pickBaseCycle)만으로 결정',
    app.includes('const isPaired=getLatestSessionType(sessions)==="2:1";') &&
    app.includes('const baseCycle=isPaired?PAIR_SPLIT_DEFAULT:pickBaseCycle(patternSequence,freq);')
  ],
  ['오늘의 운동 가이드: 분할 패턴 추론이 최근 창(28일)만으로 부족하면 전체 수업 기록으로 확장해 재시도하되, 직전 수업(lastPart) 회피 로직은 최근 창만 사용해 오래된 기록을 직전 수업으로 오인하지 않음',
    app.includes('const patternSequence=sequence.length<4?getRecentPartSequence(sessions,40,3650):sequence;') &&
    app.includes('const baseCycle=isPaired?PAIR_SPLIT_DEFAULT:pickBaseCycle(patternSequence,freq);') &&
    app.includes('const inferred=inferActualSplit(patternSequence);') &&
    app.includes('const lastPart=sequence[0];')
  ],
  ['오늘의 운동 가이드: 다음 수업 날짜 역산(2·3순위) 결과가 실제 최근 수업과 상극이면 채택하지 않고 다음 단계(패턴 이어가기/회복 회피)로 넘김 — 사이클 위치 계산만으로 상극 조합을 추천하지 않도록 보장',
    app.includes('const conflictsWithLast=lastAtoms.some(a=>candidate.split(" · ").includes(a)||candidate.split(" · ").includes(CONFLICT[a]));') &&
    app.includes('if(!conflictsWithLast){')
  ],
  ['오늘의 운동 가이드: 최종 폴백(4·5순위)이 다음 수업이 오늘·내일처럼 임박하면 그 예정 부위와 상극인 조합도 함께 회피(다음 수업 부위와 겹치는 추천 방지)',
    app.includes('if(info.daysUntil!=null && info.daysUntil>=0 && info.daysUntil<=1 && info.part){') &&
    app.includes('info.part.split(" · ").forEach(a=>{avoid.add(a); const c=CONFLICT[a]; if(c)avoid.add(c);});')
  ],
  ['오늘의 운동 가이드: 실제 수업일지 반복 패턴 추정(1순위)이 최근 2~4주(windowDays) 안에서, 실제 "반복" 여부를 검증(단순 나열 아님)',
    app.includes('function getRecentPartSequence(sessions=[], n=14, windowDays=28)') &&
    app.includes('function isPeriodic(chrono,L){') &&
    app.includes('function detectRepeatingCycle(chrono=[])') &&
    app.includes('if(sequence.length<4)return null;') &&
    app.includes('return detectRepeatingCycle([...sequence].reverse());')
  ],
  ['오늘의 운동 가이드: 패턴이 확인되면 마지막 수업 다음 순서로 이어가기(회복 회피 규칙보다 우선 — 가슴→어깨처럼 실제 반복된 흐름은 그대로 따름)',
    app.includes('part=cycle[(idxLast+1)%cycle.length];')
  ],
  ['오늘의 운동 가이드: 다음 수업 날짜 역산 공식이 사이클 길이 이내 + 주당 빈도가 사이클 길이에 못 미치지 않을 때만 적용(3순위 게이트로 "주 2회에게 5회처럼" 추천 방지)',
    app.includes('const freq=getWorkoutFrequencyNumber(profile);') &&
    app.includes('if(info.daysUntil!=null && info.daysUntil>=1 && info.daysUntil<=cycle.length && freq>=cycle.length-1){') &&
    app.includes('const idxToday=((idxNext-info.daysUntil)%cycle.length+cycle.length)%cycle.length;')
  ],
  ['오늘의 운동 가이드: getNextWorkoutInfo/normalizeWorkoutPart/getRecentPartCounts/getWorkoutFrequencyNumber 등 관리자앱 공유 함수는 본체 변경 없음',
    app.includes('function getNextWorkoutInfo(profile){const part=getNextPtPart(profile);') &&
    app.includes('function getRecentPartCounts(sessions=[]){const cutoff=new Date(Date.now()-21*86400000).toISOString().slice(0,10);')
  ],
  ['오늘의 운동 가이드: exerciseMatchesPart가 배열(콤보 부위)도 하위호환으로 지원 + 원본 값(이두/삼두)도 함께 비교',
    app.includes('const rawVals=[memberTop,e.type]; const parts=Array.isArray(part)?part:[part]; return vals.some(v=>parts.includes(v))||rawVals.some(v=>parts.includes(v))||parts.some(p=>String(e.name||"").includes(p));')
  ],
  wgScenario('오늘의 운동 가이드 시나리오1: 주 5회 회원의 5분할 폴백에서 가슴 다음 어깨가 추천되지 않음', lib => {
    const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 5회' }, [{ date: daysAgoStr(1), selectedTypes: ['가슴'], exercises: [] }], {});
    return r.part !== '어깨';
  }),
  wgScenario('오늘의 운동 가이드 시나리오2: 주 5회 회원의 5분할 폴백에서 하체 다음 등이 추천되지 않음', lib => {
    const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 5회' }, [{ date: daysAgoStr(1), selectedTypes: ['하체'], exercises: [] }], {});
    return r.part !== '등';
  }),
  wgScenario('오늘의 운동 가이드 시나리오3: 기록 부족 + 주 2회 회원에게 상체·하체 2분할이 적용될 수 있음(성별 무관)', lib => {
    const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 2회' }, [], {});
    return arrEq(r.cycle, lib.SPLIT_2WAY);
  }),
  wgScenario('오늘의 운동 가이드 시나리오4: 하체·가슴·삼두 / 등·어깨·이두 패턴이 반복되면 해당 2분할을 유지(성별 무관)',
    lib => {
      const sessions = [
        { date: daysAgoStr(8), selectedTypes: ['하체', '가슴', '삼두'], exercises: [] },
        { date: daysAgoStr(6), selectedTypes: ['등', '어깨', '이두'], exercises: [] },
        { date: daysAgoStr(4), selectedTypes: ['하체', '가슴', '삼두'], exercises: [] },
        { date: daysAgoStr(2), selectedTypes: ['등', '어깨', '이두'], exercises: [] },
      ];
      const r = lib.getRecommendedPart({}, sessions, {});
      return arrEq(r.cycle, lib.SPLIT_COMBO_2WAY) && r.part === '하체 · 가슴 · 삼두';
    }
  ),
  wgScenario('오늘의 운동 가이드 시나리오5: 주 3회·기록 부족 회원에게 하체·미는 운동·당기는 운동이 순환(당기는 다음 미는 추천, 하체·반복 회피, 성별 무관)',
    lib => {
      const sessions = [
        { date: daysAgoStr(6), selectedTypes: ['하체'], exercises: [] },
        { date: daysAgoStr(4), selectedTypes: ['가슴', '어깨', '삼두'], exercises: [] },
        { date: daysAgoStr(2), selectedTypes: ['등', '이두'], exercises: [] },
      ];
      const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 3회' }, sessions, {});
      return arrEq(r.cycle, lib.SPLIT_3WAY) && r.part === '가슴 · 어깨 · 삼두';
    }
  ),
  wgScenario('오늘의 운동 가이드 시나리오6: 2:1 진행 중이면 성별과 무관하게 공통 기본값을 쓰고, 다음 수업 부위(하체)와 겹치면 순서를 조정',
    lib => {
      const profile = { weeklyWorkoutCount: '주 1회', nextWorkoutPart: '하체', nextWorkoutDate: daysFromNowStr(1) };
      const sessions = [{ date: daysAgoStr(40), sessionType: '2:1', selectedTypes: ['삼두'], exercises: [] }];
      const r = lib.getRecommendedPart(profile, sessions, {});
      return r.isPaired === true && arrEq(r.cycle, lib.PAIR_SPLIT_DEFAULT) && r.part === '가슴 · 어깨 · 삼두';
    }
  ),
  wgScenario('오늘의 운동 가이드 시나리오7: 주 4회 이상이고 기록이 뒷받침되지 않아도(짧은 기록) 5분할 폴백이 적용될 수 있음(성별 무관)', lib => {
    const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 4회' }, [], {});
    return arrEq(r.cycle, lib.SPLIT_5WAY);
  }),

  // ── 운동명 정규화 + 세트·중량·볼륨·RPE 추천 — 실제 buildReviewRoutine/recommendExerciseDose 실행 검증 ──
  wgScenario('운동명 정규화 시나리오1: "시티드 케이블로우"와 "시티드 케이블 로우"가 동일 운동으로 집계됨', lib => {
    const mkSet = (w, r) => ({ weight: w, reps: r, volume: w * r });
    const sessions = [
      { date: daysAgoStr(10), isPublished: true, exercises: [{ name: '시티드 케이블로우', muscleTop: '등', sets: [mkSet(40, 12), mkSet(40, 12), mkSet(40, 12)] }] },
      { date: daysAgoStr(5), isPublished: true, exercises: [{ name: '시티드 케이블 로우', muscleTop: '등', sets: [mkSet(42.5, 12), mkSet(42.5, 12), mkSet(42.5, 12)] }] },
    ];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '등');
    const matched = rec.routine.filter(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('시티드 케이블로우'));
    return matched.length === 1 && matched[0].analyzedCount === 2;
  }),
  wgScenario('운동명 정규화 시나리오2: "랫풀다운"과 "랫 풀 다운"의 최근 기록이 하나로 합쳐짐', lib => {
    const mkSet = (w, r) => ({ weight: w, reps: r, volume: w * r });
    const sessions = [
      { date: daysAgoStr(9), isPublished: true, exercises: [{ name: '랫풀다운', muscleTop: '등', sets: [mkSet(35, 12), mkSet(35, 12), mkSet(35, 12)] }] },
      { date: daysAgoStr(4), isPublished: true, exercises: [{ name: '랫 풀 다운', muscleTop: '등', sets: [mkSet(37.5, 12), mkSet(37.5, 12), mkSet(37.5, 12)] }] },
    ];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '등');
    const matched = rec.routine.filter(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('랫풀다운'));
    return matched.length === 1 && matched[0].analyzedCount === 2;
  }),
  wgScenario('운동명 정규화 시나리오3: 기록이 없는 운동은 기본 4세트와 20·15·12·10회가 추천됨', lib => {
    const r = lib.recommendExerciseDose([], {});
    const reps = r.sets.map(s => Number(String(s.reps).replace('회', '')));
    return r.sets.length === 4 && JSON.stringify(reps) === JSON.stringify(lib.DOSE_REP_SCHEME);
  }),
  wgScenario('운동명 정규화 시나리오4: 최근 RPE 6이고 모든 세트를 완료한 운동은 볼륨이 소폭 증가함', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 20, reps: 12, volume: 240 }, { weight: 20, reps: 12, volume: 240 }, { weight: 20, reps: 12, volume: 240 }], rpe: 6, isNegative: false, isFunc: false }];
    const r = lib.recommendExerciseDose(history, {});
    const lastVol = 3 * 240;
    const newVol = r.sets.reduce((s, x) => s + (Number(String(x.weight).replace('kg', '')) || 0) * (Number(String(x.reps).replace('회', '')) || 0), 0);
    return newVol > lastVol;
  }),
  wgScenario('운동명 정규화 시나리오5: 최근 RPE 9~10인 운동은 무조건 중량을 올리지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 20, reps: 12, volume: 240 }, { weight: 20, reps: 12, volume: 240 }, { weight: 20, reps: 12, volume: 240 }], rpe: 9, isNegative: false, isFunc: false }];
    const r = lib.recommendExerciseDose(history, {});
    return r.sets.every(s => { const w = Number(String(s.weight).replace('kg', '')); return !Number.isFinite(w) || w <= 20; });
  }),
  wgScenario('운동명 정규화 시나리오6: 최근 실패(불편감) 기록이 있으면 중량 또는 반복수가 보수적으로 조정됨', lib => {
    const history = [{ date: daysAgoStr(2), sets: [{ weight: 20, reps: 12, volume: 240 }], rpe: 8, isPainRisk: true, isFunc: false }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w <= 20 && reps < 12;
  }),
  wgScenario('운동명 정규화 시나리오7: 동일 운동 최근 최대 8회만 사용하되 최신 기록에 더 높은 가중치를 줌', lib => {
    const mkSet = w => ({ weight: w, reps: 10, volume: w * 10 });
    const sessions = [];
    for (let i = 0; i < 10; i++) {
      sessions.push({ date: daysAgoStr(20 - i), isPublished: true, exercises: [{ name: '벤치프레스', muscleTop: '가슴', sets: [mkSet(20 + i), mkSet(20 + i), mkSet(20 + i)], rpe: 6 }] });
    }
    const rec = lib.buildReviewRoutine(sessions, {}, [], '가슴');
    const matched = rec.routine.find(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('벤치프레스'));
    return !!matched && matched.analyzedCount === 8;
  }),
  wgScenario('운동명 정규화 시나리오8: 권장 총볼륨 증가가 일반적으로 최근 기록 대비 3~8% 범위에 들어감', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 20, reps: 12, volume: 240 }, { weight: 20, reps: 12, volume: 240 }, { weight: 20, reps: 12, volume: 240 }], rpe: 6, isNegative: false, isFunc: false }];
    const r = lib.recommendExerciseDose(history, {});
    const lastVol = 3 * 240;
    const newVol = r.sets.reduce((s, x) => s + (Number(String(x.weight).replace('kg', '')) || 0) * (Number(String(x.reps).replace('회', '')) || 0), 0);
    const pct = ((newVol - lastVol) / lastVol) * 100;
    return pct >= 0 && pct <= 8.5;
  }),
  wgScenario('운동명 정규화 시나리오9: 맨몸·시간 기반 운동에 중량 볼륨 공식을 잘못 적용하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ reps: 15, durationSec: 30 }], rpe: 6, isNegative: false, isFunc: true }];
    const r = lib.recommendExerciseDose(history, {});
    return r.sets.every(s => !/kg/.test(String(s.weight)));
  }),

  // ── 테오짐 실제 장비 중량(바벨 5kg 그리드/덤벨 구비 목록/머신·케이블 실측 간격) 반영 — 실제 실행 검증 ──
  wgScenario('바벨 시나리오1: 20kg 바벨 운동 다음 추천으로 22.5kg을 생성하지 않음', lib => {
    const mk = () => ({ weight: 20, reps: 12, volume: 240 });
    const history = [{ date: daysAgoStr(3), sets: [mk(), mk(), mk()], rpe: 6, isFunc: false, equipment: '바벨' }];
    const r = lib.recommendExerciseDose(history, {});
    return r.sets.every(s => { const w = Number(String(s.weight).replace('kg', '')); return !Number.isFinite(w) || w !== 22.5; });
  }),
  wgScenario('바벨 시나리오2: 기본 바벨 20kg과 2.5kg 원판을 사용하면 다음 구성 가능한 총중량을 25kg으로 판단', lib => {
    return lib.nextWorkingWeight(20, '바벨', []).weight === 25;
  }),
  wgScenario('바벨 시나리오3: 바벨 운동에서 총중량이 일반적으로 5kg 단위로 증가함', lib => {
    const { weight } = lib.nextWorkingWeight(30, '바벨', []);
    return weight - 30 === 5;
  }),
  wgScenario('바벨 시나리오4: 30kg 다음 추천으로 32.5kg을 생성하지 않고 35kg 또는 반복수 증가를 선택', lib => {
    const mk = () => ({ weight: 30, reps: 12, volume: 360 });
    const history = [{ date: daysAgoStr(3), sets: [mk(), mk(), mk()], rpe: 6, isFunc: false, equipment: '바벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w !== 32.5 && (w === 35 || (w === 30 && reps > 12));
  }),
  wgScenario('바벨 시나리오5: 목표 반복수를 아직 못 채운 세트는 큰 중량 점프 대신 현재 중량에서 반복수 증가를 우선', lib => {
    const history = [
      { date: daysAgoStr(2), sets: [{ weight: 20, reps: 10, volume: 200 }], rpe: 7, isFunc: false, equipment: '바벨' },
      { date: daysAgoStr(5), sets: [{ weight: 20, reps: 12, volume: 240 }], rpe: 7, isFunc: false, equipment: '바벨' },
      { date: daysAgoStr(9), sets: [{ weight: 20, reps: 12, volume: 240 }], rpe: 7, isFunc: false, equipment: '바벨' },
    ];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w === 20 && reps > 10;
  }),
  wgScenario('덤벨 시나리오6: 덤벨 추천값이 반드시 구비 목록 중 하나임', lib => {
    return [1, 3, 5, 7, 8, 10, 12, 14, 20, 24, 30, 34].every(cw => {
      const history = [{ date: daysAgoStr(3), sets: [{ weight: cw, reps: 12, volume: cw * 12 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
      const r = lib.recommendExerciseDose(history, {});
      const w = Number(String(r.sets[0].weight).replace('kg', ''));
      return !Number.isFinite(w) || lib.DUMBBELL_WEIGHTS.includes(w);
    });
  }),
  wgScenario('덤벨 시나리오7: 5kg 다음에 존재하지 않는 6kg을 추천하지 않고 7kg 또는 5kg 반복수 증가를 선택', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 5, reps: 12, volume: 60 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w !== 6 && (w === 7 || (w === 5 && reps > 12));
  }),
  wgScenario('덤벨 시나리오8: 14kg에서 20kg으로 바로 증가하지 않고 14kg에서 반복수 증가를 우선', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 14, reps: 12, volume: 168 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w === 14 && reps > 12;
  }),
  wgScenario('덤벨 시나리오9: 24kg 다음에 존재하지 않는 26·28kg을 생성하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 24, reps: 12, volume: 288 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w !== 26 && w !== 28 && (!Number.isFinite(w) || lib.DUMBBELL_WEIGHTS.includes(w));
  }),
  wgScenario('덤벨 시나리오10: 한 손 기준 덤벨 기록을 양손 합산 중량으로 잘못 추천하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 14, reps: 12, volume: 168 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    return r.sets.every(s => { const w = Number(String(s.weight).replace('kg', '')); return !Number.isFinite(w) || w < 28; });
  }),
  wgScenario('머신·케이블 시나리오11: 실제 기록이 20·25kg이면 증량 간격을 5kg으로 판단', lib => {
    const history = [
      { date: daysAgoStr(10), sets: [{ weight: 20, reps: 12, volume: 240 }], rpe: 6, isFunc: false, equipment: '머신' },
      { date: daysAgoStr(3), sets: [{ weight: 25, reps: 12, volume: 300 }], rpe: 6, isFunc: false, equipment: '머신' },
    ];
    return lib.estimateWeightIncrement(history) === 5;
  }),
  wgScenario('머신·케이블 시나리오12: 동일 운동에서 한 가지 중량만 존재하면 임의 증량 단위를 생성하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 20, reps: 12, volume: 240 }], rpe: 6, isFunc: false, equipment: '머신' }];
    if (lib.estimateWeightIncrement(history) !== null) return false;
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w === 20 && reps > 12;
  }),
  wgScenario('RPE·통증 시나리오13: 최근 RPE 9이지만 통증이 없으면 후보에서 사라지지 않고 중량 유지/반복 감소', lib => {
    const sessions = [{ date: daysAgoStr(3), isPublished: true, exercises: [{ name: '레그프레스', muscleTop: '하체', equipment: '머신', rpe: 9, feedback: '힘들었지만 잘 마쳤어요', sets: [{ weight: 100, reps: 10, volume: 1000 }, { weight: 100, reps: 10, volume: 1000 }, { weight: 100, reps: 10, volume: 1000 }] }] }];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '하체');
    const matched = rec.routine.find(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('레그프레스'));
    if (!matched) return false;
    const w = Number(String(matched.sets[0].weight).replace('kg', ''));
    return w <= 100;
  }),
  wgScenario('RPE·통증 시나리오14: 최근 RPE 10이지만 명확한 통증이 없으면 무조건 운동을 제외하지 않음', lib => {
    const sessions = [{ date: daysAgoStr(3), isPublished: true, exercises: [{ name: '스쿼트', muscleTop: '하체', equipment: '바벨', rpe: 10, feedback: '많이 힘들었어요', sets: [{ weight: 60, reps: 8, volume: 480 }, { weight: 60, reps: 8, volume: 480 }, { weight: 60, reps: 8, volume: 480 }] }] }];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '하체');
    return !!rec.routine.find(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('스쿼트'));
  }),
  wgScenario('RPE·통증 시나리오15: "무릎 통증"처럼 명확한 통증 기록이 있으면 해당 운동을 후보에서 제외함', lib => {
    const sessions = [{ date: daysAgoStr(3), isPublished: true, exercises: [{ name: '레그익스텐션', muscleTop: '하체', equipment: '머신', feedback: '무릎 통증이 있었어요', sets: [{ weight: 40, reps: 10, volume: 400 }, { weight: 40, reps: 10, volume: 400 }, { weight: 40, reps: 10, volume: 400 }] }] }];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '하체');
    return !rec.routine.find(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('레그익스텐션'));
  }),
  wgScenario('공통 시나리오16: 기록이 있어도 장비 종류를 알 수 없으면 구체적 중량을 임의 생성하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 33, reps: 12, volume: 396 }], rpe: 6, isFunc: false, equipment: null }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 33;
  }),

  // ── 안전 보완: 기록 없는 바벨 20kg 자동추천 제거 + 그리드 검증 + 덤벨 증가율 기반 판단 — 실제 실행 검증 ──
  wgScenario('바벨 안전1: 바벨 운동 기록이 전혀 없을 때 20kg을 자동 추천하지 않음', lib => {
    const r = lib.recommendExerciseDose([], {});
    return r.sets.every(s => !/kg/.test(String(s.weight)));
  }),
  wgScenario('바벨 안전2: 기록 없는 바벨 운동에 "가벼운 중량부터 시작 후 RPE에 맞춰 조정" 안내가 표시됨', lib => {
    const r = lib.recommendExerciseDose([], {});
    return /가벼운/.test(r.reason) && /RPE/.test(r.reason);
  }),
  wgScenario('바벨 안전3: 과거 바벨 기록이 22.5kg일 때 무조건 27.5kg을 생성하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 22.5, reps: 12, volume: 270 }], rpe: 6, isFunc: false, equipment: '바벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w !== 27.5;
  }),
  wgScenario('바벨 안전4: 바벨 종류와 기본 바 무게를 알 수 없으면 새로운 총중량을 임의 생성하지 않음', lib => {
    const mk = () => ({ weight: 33, reps: 10, volume: 330 });
    const sessions = [{ date: daysAgoStr(3), isPublished: true, exercises: [{ name: '이상한운동123', muscleTop: '가슴', sets: [mk(), mk(), mk()], rpe: 6 }] }];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '가슴');
    const matched = rec.routine.find(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('이상한운동123'));
    if (!matched) return false;
    const w = Number(String(matched.sets[0].weight).replace('kg', ''));
    return w === 33;
  }),
  wgScenario('덤벨 안전5: 3kg에서 4kg으로 상승률이 높으면 반복수 증가를 우선', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 3, reps: 12, volume: 36 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    const reps = Number(String(r.sets[0].reps).replace('회', ''));
    return w === 3 && reps > 12;
  }),
  wgScenario('덤벨 안전6: 5kg에서 7kg으로 바로 증량하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 5, reps: 12, volume: 60 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 5;
  }),
  wgScenario('덤벨 안전7: 8kg에서 10kg으로 바로 증량하지 않음', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 8, reps: 12, volume: 96 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 8;
  }),
  wgScenario('덤벨 안전8: 20kg에서 24kg 증량은 최근 수행과 RPE가 충분히 안정적인 경우에만 허용', lib => {
    const mk = () => ({ weight: 20, reps: 12, volume: 240 });
    const history = [
      { date: daysAgoStr(2), sets: [mk(), mk(), mk()], rpe: 6, isFunc: false, equipment: '덤벨' },
      { date: daysAgoStr(5), sets: [mk(), mk(), mk()], rpe: 6, isFunc: false, equipment: '덤벨' },
      { date: daysAgoStr(9), sets: [mk(), mk(), mk()], rpe: 6, isFunc: false, equipment: '덤벨' },
    ];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 24;
  }),
  wgScenario('덤벨 안전9: 30kg에서 34kg 증량은 최근 RPE가 높으면 허용하지 않음', lib => {
    const history = [{ date: daysAgoStr(2), sets: [{ weight: 30, reps: 10, volume: 300 }], rpe: 9, isFunc: false, equipment: '덤벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w <= 30;
  }),
  wgScenario('덤벨 안전10: 덤벨 추천값은 여전히 테오짐 구비 목록 외의 값을 생성하지 않음', lib => {
    return [1, 2, 3, 4, 5, 7, 8, 10, 12, 14, 20, 24, 30, 34].every(cw => {
      const history = [{ date: daysAgoStr(3), sets: [{ weight: cw, reps: 12, volume: cw * 12 }], rpe: 6, isFunc: false, equipment: '덤벨' }];
      const r = lib.recommendExerciseDose(history, {});
      const w = Number(String(r.sets[0].weight).replace('kg', ''));
      return !Number.isFinite(w) || lib.DUMBBELL_WEIGHTS.includes(w);
    });
  }),

  // ── 바벨 세부 종류(일반 20kg / 라이트 10kg / EZ Bar 10kg) — 실제 실행 검증 ──
  wgScenario('바 종류1: 20kg 일반 바벨 운동은 20kg 기준(일반 올림픽 바)으로 계산', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 20, reps: 12, volume: 240 }], rpe: 6, isFunc: false, equipment: '바벨', barbellKind: '일반바벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 25;
  }),
  wgScenario('바 종류2: 10kg 일반 바벨(라이트 바벨) 운동은 10kg 기준으로 계산', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 15, reps: 12, volume: 180 }], rpe: 6, isFunc: false, equipment: '바벨', barbellKind: '라이트바벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 20;
  }),
  wgScenario('바 종류3: EZ Bar 운동(운동명 키워드로 판별)은 10kg 기준으로 계산', lib => {
    const mk = w => ({ weight: w, reps: 10, volume: w * 10 });
    const sessions = [{ date: daysAgoStr(3), isPublished: true, exercises: [{ name: '이지바 컬', muscleTop: '팔-이두근', sets: [mk(15), mk(15), mk(15)], rpe: 6 }] }];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '팔');
    const matched = rec.routine.find(x => lib.normalizeExerciseName(x.name) === lib.normalizeExerciseName('이지바 컬'));
    if (!matched) return false;
    const w = Number(String(matched.sets[0].weight).replace('kg', ''));
    return w === 20;
  }),
  wgScenario('바 종류4: 바 종류를 잘못 인식하지 않음(덤벨을 바벨로, 일반 바벨을 EZ Bar로 오인하지 않음)', lib => {
    const dumbbellKind = lib.resolveBarbellKind({ name: '덤벨컬', equipment: '덤벨' });
    const plainBarbellKind = lib.resolveBarbellKind({ name: '바벨 스쿼트', equipment: '바벨' });
    return dumbbellKind === null && plainBarbellKind === '일반바벨';
  }),
  wgScenario('바 종류5: 실제 기록이 있으면 기본 바 무게보다 기록값을 우선 사용', lib => {
    const history = [{ date: daysAgoStr(3), sets: [{ weight: 40, reps: 10, volume: 400 }], rpe: 6, isFunc: false, equipment: '바벨', barbellKind: '일반바벨' }];
    const r = lib.recommendExerciseDose(history, {});
    const w = Number(String(r.sets[0].weight).replace('kg', ''));
    return w === 45; // 기본값(20)+5가 아니라 실제 기록 40kg+5
  }),

  ['오늘의 운동 가이드: 보조 운동 섹션 제거(메인 추천 3~4종목에만 집중, 코어 별도 추천 없음)',
    !app.includes('🧩 보조 운동') &&
    !app.includes('const coreRec=buildReviewRoutine(sessions,onboarding,checkins,"코어");') &&
    !app.includes('coreAccessory')
  ],
  ['오늘의 운동 가이드: 팔 추천 시 전체 상위 4개가 아니라 이두 2개 + 삼두 2개로 균형있게 구성',
    app.includes('const armBalanced=wantsArm?[...sorted.filter(isBicep).slice(0,2),...sorted.filter(isTricep).slice(0,2)]:[];') &&
    app.includes('const routineList=armBalanced.length?armBalanced:sorted.slice(0,4);') &&
    app.includes('routineList.sort(bySequence);')
  ],
  ['오늘의 운동 가이드: buildReviewRoutine 후보 자격이 세트 3개 이상 요구가 아니라 트레이너 표시 또는 최소 1세트 실제 기록만 요구 — 세트가 적게 기록되는 운동도 후보에서 조기 배제되지 않음(팔 1종목만 추천되던 버그 수정)',
    app.includes('if(!isTrainerMarkedExercise(e)&&filled.length<1)return;') &&
    !app.includes('(!isTrainerMarkedExercise(e)&&filled.length<3)')
  ],
  ['오늘의 운동 가이드: buildReviewRoutine이 세션 내 등장 순서(orderIdx)를 최근 가중 평균으로 계산해 최종 추천 순서를 실제 수업 순서에 맞게 재배치',
    app.includes('orderIdx') &&
    app.includes('const orderRankOf=rec=>{') &&
    app.includes('const bySequence=(a,b)=>orderRankOf(a)-orderRankOf(b);')
  ],
  ['오늘의 운동 가이드 UI: 추천 이유 블록이 기존 rec-group 스타일(여백 있는 구분선)을 재사용해 카드와 분리되고, 개인 운동 빈도(전체 횟수만, 부위별 아님)를 보조 문구로 반영',
    app.includes('const weekly=computeWeeklyWorkoutCard(attendance,onboarding);') &&
    !app.includes('className="rec-reasons"') &&
    /\.rec-group\{border-top:1px solid #EEF1F4;padding-top:16px;margin-top:16px\}/.test(app)
  ],
  ['오늘의 운동 가이드: 맨몸·시간 기반 운동의 중량 배지 문구가 한 줄로 짧게 표시됨("동작 위주(중량 없음)" → "맨몸 동작")',
    app.includes('"맨몸 동작"') && !app.includes('동작 위주(중량 없음)')
  ],
  wgScenario('팔 추천 버그 수정: 세트가 2개만 기록된 팔 운동도 후보에서 배제되지 않고 이두 2 + 삼두 2, 총 4종목이 추천됨', lib => {
    const mk = w => ({ weight: w, reps: 10, volume: w * 10 });
    const sessions = [{ date: daysAgoStr(3), isPublished: true, exercises: [
      { name: '바벨컬', muscleTop: '이두', sets: [mk(20), mk(20)] },
      { name: '해머컬', muscleTop: '이두', sets: [mk(14), mk(14)] },
      { name: '케이블 푸시다운', muscleTop: '삼두', sets: [mk(15), mk(15)] },
      { name: '오버헤드 익스텐션', muscleTop: '삼두', sets: [mk(10), mk(10)] },
    ] }];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '팔');
    return rec.routine.length === 4;
  }),
  wgScenario('실제 순서 재현: 최근 동일 부위 수업에서 반복된 등장 순서대로 추천 루틴이 정렬됨', lib => {
    const mk = w => ({ weight: w, reps: 10, volume: w * 10 });
    const sessions = [
      { date: daysAgoStr(2), isPublished: true, exercises: [
        { name: '벤치프레스', muscleTop: '가슴', sets: [mk(40), mk(40), mk(40)], rpe: 6 },
        { name: '인클라인 벤치프레스', muscleTop: '가슴', sets: [mk(30), mk(30), mk(30)], rpe: 6 },
      ] },
      { date: daysAgoStr(9), isPublished: true, exercises: [
        { name: '벤치프레스', muscleTop: '가슴', sets: [mk(37.5), mk(37.5), mk(37.5)], rpe: 6 },
        { name: '인클라인 벤치프레스', muscleTop: '가슴', sets: [mk(27.5), mk(27.5), mk(27.5)], rpe: 6 },
      ] },
    ];
    const rec = lib.buildReviewRoutine(sessions, {}, [], '가슴');
    const names = rec.routine.map(x => lib.normalizeExerciseName(x.name));
    const bi = names.indexOf(lib.normalizeExerciseName('벤치프레스'));
    const ii = names.indexOf(lib.normalizeExerciseName('인클라인 벤치프레스'));
    return bi !== -1 && ii !== -1 && bi < ii;
  }),

  // ── 건강 탭: 컨디션/통증 독립 저장 ──
  ['건강 탭: 컨디션/통증이 체중·칼로리·걸음수와 분리된 독립 저장 함수(saveCondition/savePain)로 존재',
    app.includes('const saveCondition=async()=>{') &&
    app.includes('const savePain=async()=>{') &&
    !app.includes('if(form.condition)checkinPatch.condition=form.condition;')
  ],
  ['건강 탭: saveCheck(체중·칼로리·걸음수)는 컨디션/통증을 더 이상 건드리지 않음',
    app.includes('await saveMemberHealthInputs(profile.id,dateKey,{weight:weightValue,kcal:kcalValue,steps:stepsValue});') &&
    !app.includes('await saveMemberCheckin(profile.id,dateKey,checkinPatch); await saveMemberHealthInputs')
  ],
  ['건강 탭: 컨디션/통증 저장 버튼이 각각 저장 중 상태로 중복 클릭 방지 + 저장 완료 표시',
    app.includes('if(conditionSaving)return;') &&
    app.includes('if(painSaving)return;') &&
    app.includes('justSavedCondition?"컨디션 저장 완료 ✓"') &&
    app.includes('justSavedPain?"통증 저장 완료 ✓"')
  ],
  ['건강 탭: 컨디션/통증 저장이 관리자앱 최근 활동에 반영되도록 touchMemberActivities 호출 + 활동 타입 등록',
    db.includes("if (data.condition) {") &&
    db.includes('activities.push({ type: "condition", label: "컨디션", value: data.condition, dateKey });') &&
    db.includes('activities.push({ type: "pain", label: "통증", value, dateKey });') &&
    app.includes('"memo","pain","soreness","rpe","personalWorkoutSoreness","personalWorkoutRpe","condition","personalWorkout","weight","cardio","kcal","steps"')
  ],
  ['개인운동 활동 타입: personalWorkout/personalWorkoutRpe/personalWorkoutSoreness가 PT용 rpe/soreness와 분리된 아이콘·라벨을 갖는다',
    app.includes('personalWorkout:"🏋️", personalWorkoutRpe:"🏋️", personalWorkoutSoreness:"🦵"') &&
    app.includes('personalWorkout:"개인운동", personalWorkoutRpe:"개인운동 RPE", personalWorkoutSoreness:"개인운동 근육통"')
  ],

  // ── 기존 코멘트 개인화 (홈/건강 탭, 수업 탭은 제외) ──
  ['개인화: 홈 탭 "건강 요약" 배너(buildHealthMotivation)가 통증/컨디션/체중/식단/유산소 순으로 "비교 → 이유 → 다음 행동 제안"까지 이어지는 문장(질책 표현 없이)',
    (() => {
      const i = app.indexOf('function buildHealthMotivation(p){');
      const block = i !== -1 ? app.slice(i, i + 4200) : '';
      return block.includes('오늘은 강도를 살짝 낮추고 진행하는 것이 회복에 도움이 됩니다') &&
        block.includes('오늘 충분히 쉬어야 다음 수업에서 컨디션을 온전히 끌어올릴 수 있으니') &&
        block.includes('지금처럼 기록을 이어가면 다음 상담에서 변화가 더욱 뚜렷하게 나타날 가능성이 높습니다') &&
        block.includes('오늘 한 끼만 남겨보세요') &&
        block.includes('최근 체중 변화는 좋지만 유산소 기록이 줄어들고 있어요') &&
        !block.includes('부족합니다') && !block.includes('AI');
    })()
  ],
  ['개인화: 홈 탭 "오늘의 운동 가이드" 추천 이유가 항상 같은 고정 문구("최근 자극이 좋았던 운동입니다"/"통증 기록과...") 대신 실제 기록(goodStim/practice) 기반으로 표시',
    !app.includes('<span>최근 자극이 좋았던 운동입니다.</span><span>통증 기록과 다음 PT 전 회복을 함께 고려했습니다.</span>') &&
    app.includes('rec.goodStim.length?`최근 ${rec.goodStim.map(e=>e.name).slice(0,2).join(", ")} 기록에서 자극이 좋았던 점을 반영했어요.`')
  ],
  ['개인화: 홈 탭 "오늘 운동 체크" 피드백이 실제 이번 달 운동 횟수 구간(monthCount)에 따라 달라지고, 다음 행동 제안까지 이어짐(임의 순환 아님)',
    app.includes('monthCount>=15?"정말 꾸준히 운동하고 계세요! 이 페이스라면 다음 달 변화도 기대할 수 있어요."') &&
    app.includes('이번 주도 이 페이스를 유지해보세요.')
  ],
  ['개인화: 수업 탭(SessionMini/MemberFeedbackForm)에는 개인화 코멘트·추천·코칭 문구를 추가하지 않음 — 수업일지 확인/근육통·RPE·메모 입력/지난 기록 확인만 유지',
    !app.includes('function buildSessionTabComment') &&
    !app.includes('function SessionCoachComment')
  ],

  // ── PT 코치형 3단계 코멘트(현재 상태 → 잘하고 있는 점 → 다음 행동 제안) ──
  ['PT코치형: 홈 탭 "오늘의 운동 가이드"가 상태(다음 수업/남은 기간) 뒤에 이전 기록 대비 중량 향상(비교) 또는 실제 기록 기반 칭찬을 넣고, 그 다음 추천 부위(다음 행동)로 마무리',
    app.includes('const recentBiggestGain=[...recentTopEx].filter(r=>r.delta>0).sort((a,b)=>b.delta-a.delta)[0]; const praiseLine=recentBiggestGain?`이전 기록보다') &&
    app.includes('{praiseLine&&<>{praiseLine}<br/></>}{recommended.reason}<br/>오늘은')
  ],
  ['PT코치형: 구 "이번 달 변화"/대표 코멘트 문장은 2026-07 리디자인에서 "이번 기간 리포트"로 통합(중복 문장 제거), 리포트는 기록값 기반 잘한 점+다음 목표로 마무리',
    !app.includes('function buildDietGrowthLines') &&
    !app.includes('function buildCorrectionGrowthLines') &&
    app.includes('goods.push({ title: "체중 감소", text: `체중이 ${Math.abs(wDiff)}kg 감소했어요.` });') &&
    app.includes('next = pain?.first != null && pain?.last != null && pain.last > pain.first')
  ],

  // ── 변화를 기억하는 PT 코치형(이전 기록 대비 비교 → 잘하고 있는 점 → 다음 행동) ──
  ['비교형: 건강 요약 배너가 통증/컨디션/체중/식단/유산소 각각 이전 기록(이전 체크인·지난주)과 비교한 문구를 포함(비교 불가 시 조용히 생략, 억지 비교 없음)',
    app.includes('const prevPainCheck=checkinList.slice(1).find(c=>c.painPart&&c.painPart!=="없음");') &&
    app.includes('이전 기록보다 통증이 줄었어요. ') &&
    app.includes('지난 기록보다 컨디션이 다소 떨어졌어요. ') &&
    app.includes('지난주보다 체중 기록이 더 꾸준해졌어요. ') &&
    app.includes('지난주보다 식단 기록이 더 늘었어요. ') &&
    app.includes('지난주보다 유산소 기록이 더 좋아졌어요. ')
  ],
  ['비교형: 홈 탭 "오늘 운동 체크"가 지난달 같은 기간 대비 운동 횟수 비교 문구를 포함(비교 데이터 없으면 생략)',
    app.includes('const lastMonthSameDayCount=attendance.filter(a=>{const d=String(a.date||""); return d.startsWith(prevYm)&&Number(d.slice(8,10))<=dayOfMonth;}).length;') &&
    app.includes('지난달 같은 기간보다 운동 횟수가 늘었어요. ')
  ],
  ['비교형: 분석 탭 대표 코멘트 계산(coachComment)은 2026-07 리디자인에서 제거, 비교 문장은 홈 탭(HomeCoachCommentCard=실제 trainerComment)과 이번 기간 리포트가 대신함',
    !app.includes('const coachComment = (() => {') &&
    app.includes('function HomeCoachCommentCard({sessions=[],onMore}){')
  ],

  // ── 원인과 추천 이유까지 설명하는 PT 코치형(비교 → 변화 이유 → 잘하는 점 → 다음 행동 → 추천 이유) ──
  ['원인설명형: 홈 탭 "오늘의 운동 가이드" 추천 이유(getRecommendedPart)가 모두 완결된 문장으로 "왜 이 부위/순서를 추천하는지"를 설명(문장이 <br/>에서 끊기지 않음), 2:1 진행 중이면 그 사실도 문장에 반영',
    app.includes(':`다음 수업이 ${info.part} 운동으로 예정되어 있어, 그 전까지 일정을 고려한 추천입니다.`;') &&
    app.includes('reason=`최근 4주 ${pairNote}기록상 ${cycleLabel} 패턴으로 운동하고 있습니다. 지난 운동이 ${lastPart}이었기 때문에 이어지는 순서를 추천합니다.`;') &&
    app.includes('reason=(avoidedConflict && candidates.length<cycle.length)') &&
    app.includes('if(!reason)reason=inferred?`최근 4주 ${pairNote}기록상 ${cycleLabel} 패턴으로 운동하고 있습니다.`:isPaired?"2:1 수업 기록이 아직 충분하지 않아 기본 3분할을 적용했습니다.":"기본 분할 기준을 따른 추천입니다.";')
  ],
  ['원인설명형: 건강 요약 배너가 체중 변화 이유(식단·유산소 신호를 교차 참조)와, 유산소 부족 시 "체중 변화는 좋지만 유산소가 줄어서" 같은 교차 원인 기반 추천 이유를 포함',
    app.includes('const reason=recentKcalCount>=5&&zoneWeek.inZone>0?"최근 식단과 유산소 기록이 함께 이어진 것이 이런 변화로 연결되고 있어요.":') &&
    app.includes('최근 체중 변화는 좋지만 유산소 기록이 줄어들고 있어요. 감량 흐름을 안정적으로 유지할 수 있도록 오늘 20~30분 가볍게 유산소를 추가해보세요.')
  ],
  ['원인설명형: 다이어트 "다음 수업 전까지" 체크리스트 안내문이 왜 이 항목을 추천하는지(식단 기록 부족/유산소 기록 감소) 이유를 포함',
    app.includes('최근 식단 기록이 뜸해 체중 변화의 원인을 정확히 짚기 어려웠어요.') &&
    app.includes('최근 체중 변화는 좋지만 유산소 기록이 줄어들고 있어, 감량 흐름을 안정적으로 유지하기 위해 추천드려요.')
  ],
  ['원인설명형: 분석 탭 긴 원인 설명 문장은 리디자인에서 제거, 이번 기간 리포트가 기록값 기반 짧은 문장(잘한 점/다음 목표)으로 대체',
    !app.includes('최근 식단 기록과 유산소 운동을 꾸준히 이어온 것이 좋은 흐름으로 연결되고 있습니다.') &&
    app.includes('function PeriodReportCard({ report }) {')
  ],
  // ── 회원앱 "목표 관리" (온보딩 부분 수정 + 변경 이력 + 관리자 피드 연동) ──
  ['목표 관리: 프로필 화면에 "목표 관리" 메뉴 추가',
    app.includes('목표 관리 열기') &&
    app.includes('setShowGoalManage(true)')
  ],
  ['목표 관리: MemberGoalManageScreen이 운동목적/집중관리부위/운동빈도/운동가능시간/목표체중/목표기간 6개 항목을 다룸',
    app.includes('function MemberGoalManageScreen({onboarding,profile,onSave,onBack})') &&
    ["goal","focusAreas","weeklyWorkoutCount","averageWorkoutTime","targetWeightKg","targetPeriod"].every(k => app.includes(`key:"${k}"`))
  ],
  ['목표 관리: 저장은 기존 saveProfileInfo/saveMemberOnboarding을 재사용(중복 저장 로직 없음)',
    app.includes('const saveGoalUpdate=async(changes)=>{') &&
    app.includes('if(Object.keys(profileFields).length) await saveProfileInfo(profileFields);') &&
    app.includes('if(Object.keys(onboardingOnlyFields).length) await saveMemberOnboarding(profile.id,onboardingOnlyFields);')
  ],
  ['목표 관리: 변경 이력은 recordGoalChange가 memberOnboarding/main.goalHistory(최근 30건)에 저장',
    db.includes('export async function recordGoalChange(memberId, changes = [])') &&
    db.includes('.slice(0, 30)') &&
    db.includes("source: \"member_goal_update\"")
  ],
  ['목표 관리: goalHistory가 Firestore Rules 화이트리스트(memberOnboardingProfileKeysAllowed)에 포함됨',
    firestoreRules.includes('"restingHeartRate", "goalHistory"')
  ],
  ['목표 관리: recordGoalChange가 touchMemberActivities로 goal_update 알림을 오늘 회원 입력 피드에 연동',
    db.includes('type: "goal_update", label: c.fieldLabel, value: `${c.oldDisplay} → ${c.newDisplay}`') &&
    app.includes('"goal_update"') && app.includes('TODAY_FEED_TYPES')
  ],
  ['목표 관리: 같은 배치에서 같은 type의 활동이 겹쳐도 feedEventId가 충돌하지 않도록 at을 1ms씩 offset',
    db.includes('const newEntries = activities.map((a, i) => ({') &&
    db.includes('dateKey: a.dateKey || todayKey, at: now + i,')
  ],
  ['목표 관리 피드: goal_update는 항목별 문장(예: "운동 목적을 변경했습니다")을 위해 item.label/조사를 동적으로 계산',
    app.includes('const DYNAMIC_LABEL_TYPES = new Set(["goal_update"]);') &&
    app.includes('function koreanParticleEulReul(word)') &&
    app.includes('ACTIVITY_VERB[item.type]||"입력했습니다"')
  ],
  ['목표 관리 피드 이동: goal_update 클릭 시 회원 상세(hub)로 이동 — 전용 관리자 화면이 없어 최소 기준(상세 이동) 충족',
    app.includes('goal_update: { targetScreen: "hub" }')
  ],

  // ── 관리자앱 회원 상세 "회원 변화" — 목표별 핵심 변화 요약 카드 ──
  ['회원 변화: 목표 분류·계산·카드 함수가 모두 존재',
    app.includes('function getMemberChangeGoalType(goalRaw)') &&
    app.includes('function buildMemberChangeSummary(rawGoal, sessions, bodyData, ci)') &&
    app.includes('function buildMemberChangeMetrics(goalType, ctx)') &&
    app.includes('function MemberChangeCard(') &&
    app.includes('function MemberChangeMetricTile(')
  ],
  ['회원 변화: HubScreen 상단(topChrome)에 카드가 연결되고 목표 필드는 ob?.goal||member.goal을 그대로 사용',
    app.includes('{!loading && <MemberChangeCard goal={ob?.goal || member.goal} sessions={sessions} bodyData={bodyData} checkins={ci} />}')
  ],
  ['회원 변화: 기존 계산 함수 재사용(getBodyWeightRecords·exVol·buildStrengthData·calcEpley1RM·getPainSummary·findPastExRecords·memberFeedbackParts·normalizeExerciseName·isSkipForStrength) — 중복 재구현 없음',
    app.includes('function buildMemberChangeWeightInfo(bodyData) {') && app.includes('getBodyWeightRecords(bodyData)') &&
    app.includes('sum + (exVol(e) || 0)') &&
    app.includes('function buildMemberChangeStrength(sessions) {') && app.includes('buildStrengthData(sessions || [])') &&
    app.includes('function buildMemberChangeExercisePerformance(sessions) {') && app.includes('findPastExRecords(sessions, cand.name, 30)') &&
    app.includes('isSkipForStrength(e)') && app.includes('memberFeedbackParts(s.memberFeedback)') && app.includes('normalizeExerciseName(e.name)') &&
    app.includes('getPainSummary(ci)')
  ],
  ['회원 변화: 목표별 3대 핵심 지표 문구가 모두 존재(다이어트/벌크업/체형교정/체중유지/건강관리)',
    ['"첫 측정 대비 체중 변화"', '"최근 30일 변화"', '"목표까지 남은 체중"'].every(s => app.includes(s)) &&
    ['"근력 변화"', '"총 운동 볼륨 변화"'].every(s => app.includes(s)) &&
    ['"통증 변화"', '"불편 부위 변화"', '"운동 수행 변화"'].every(s => app.includes(s)) &&
    ['"최근 체중 변동 폭"', '"평균 체중"'].every(s => app.includes(s)) &&
    ['"최근 참여 빈도"', '"RPE 변화"'].every(s => app.includes(s))
  ],
  ['회원 변화 체형교정: 근거 없는 움직임/좌우 균형/동작 완성도 점수를 자동 생성하지 않음',
    !app.includes('움직임 점수') && !app.includes('좌우 균형 점수') && !app.includes('동작 완성도 점수')
  ],
  ['회원 변화: 데이터 부족 시 0%·임의값 대신 명시적 안내 문구 사용(emptyMetric)',
    app.includes('const emptyMetric = (key, label, emptyText, compareText) => ({ key, label, empty: true, emptyText, compareText, detailRows: [] });') &&
    ['"체중 기록 부족"', '"목표 체중 미등록"', '"비교 가능한 수업 기록 부족"', '"비교할 동일 운동 기록 부족"', '"통증 점수 미등록"', '"최근 불편 부위 기록 없음"'].every(s => app.includes(s))
  ],
  ['회원 변화: 퍼센트 계산이 이전 값 0/비정상일 때 NaN·Infinity 대신 null 반환(memberChangePct)',
    app.includes('function memberChangePct(recent, prev) {') &&
    app.includes('if (!Number.isFinite(r) || !Number.isFinite(p) || p === 0) return null;')
  ],
  ['회원 변화: 다이어트 목표의 기존 체중 그래프(HubWeightTrendSection·기간 선택)를 삭제·축소하지 않고 카드 아래에 그대로 유지',
    app.includes('function HubWeightTrendSection({ records, chartHeight = 150 }) {') &&
    app.includes('shouldShowWeightTrend(ob?.goal || member.goal)') &&
    app.includes('<HubWeightTrendSection key={member.id} records={wEntries} chartHeight={isWide ? 156 : 148} />')
  ],

  // ── 체중 변화 기준 통일(회원목록 ↔ 회원 상세 ↔ 분석 도구) ──────────────────────────
  ['체중 변화: 공용 헬퍼 getWeightProgress/formatWeightChange 존재 + 등록 체중(startWeight)을 기준으로 쓰지 않음',
    app.includes('function getWeightProgress(bodyData, liveEntry = null) {') &&
    app.includes('function formatWeightChange(change) {') &&
    app.includes('function weightChangeText(progress){') &&
    !app.includes('weightChangeText(statusValues.find(f=>f.key==="weight")?.value, m.startWeight)')
  ],
  ['체중 변화: 회원목록 카드가 회원 상세와 같은 원본(bodyCheck.records)으로 현재 체중·변화를 계산',
    app.includes('const [weightBodyById, setWeightBodyById] = useState({});') &&
    app.includes('return [m.id, await getBodyCheck(m.id)];') &&
    app.includes('weightBodyById={weightBodyById}') &&
    app.includes('const weightProgress = getWeightProgress(weightBodyById[m.id], liveWeightAct ? {') &&
    app.includes('const weightChange = weightChangeText(weightProgress);')
  ],
  ['체중 변화: 회원 변화 카드·바디체크 대시보드·목표 예상이 모두 첫 측정 기록 기준을 사용',
    app.includes('const progress = getWeightProgress(bodyData);   // 첫 측정 ↔ 최근 측정 단일 기준(회원목록 카드와 동일)') &&
    app.includes('startDiff: progress.change,') &&
    app.includes('const lostSoFar    = weightProgress.hasEnoughData ? -weightProgress.change : 0;') &&
    app.includes('const start=getMemberStartWeight({records:weights,profile:p.profile||{},onboarding:p.onboarding||{}})||toPositiveNumber(p.startW)||cur;')
  ],
  ['체중 변화: 회원앱 분석 탭도 기간 내 실제 측정 기록 2회 이상일 때만 변화 계산(등록 체중과 혼용 없음)',
    app.includes('const wDiff = weights.length >= 2 ? +(weights.at(-1).weight - weights[0].weight).toFixed(1) : null;') &&
    app.includes('if (weights.length < 2) return { metricLabel: null, before: null, after: null };')
  ],
  ['체중 변화: 화면 문구가 "첫 측정 대비"로 통일(체중 변화 표시에 "시작 대비" 잔존 없음)',
    app.includes('diffChip("첫 측정 대비", totalDiff)') &&
    app.includes('kg 첫 측정 대비') &&
    app.includes('{wBadge(wDiff,"첫 측정")}') &&
    !app.includes('시작 대비')
  ],
  wpScenario('체중 변화 시나리오: 강미주 케이스(55.7 → 53) = -2.7kg, 회원목록·회원 상세 동일', lib => {
    const body = { records: [
      { date: '2026-06-02', weight: 55.7 }, { date: '2026-06-20', weight: 54.4 }, { date: '2026-07-29', weight: 53 },
    ] };
    const p = lib.getWeightProgress(body);
    return p.firstWeight === 55.7 && p.latestWeight === 53 && p.change === -2.7 && p.recordCount === 3 &&
      p.firstDate === '2026-06-02' && p.latestDate === '2026-07-29' && lib.formatWeightChange(p.change) === '-2.7kg';
  }),
  wpScenario('체중 변화 시나리오: 증가한 회원(60 → 61.5) = +1.5kg', lib => {
    const p = lib.getWeightProgress({ records: [{ date: '2026-05-01', weight: 60 }, { date: '2026-07-01', weight: 61.5 }] });
    return p.change === 1.5 && lib.formatWeightChange(p.change) === '+1.5kg';
  }),
  wpScenario('체중 변화 시나리오: 기록 1개면 변화를 만들지 않음(0kg 문구 없음)', lib => {
    const p = lib.getWeightProgress({ records: [{ date: '2026-07-01', weight: 58 }] });
    return p.recordCount === 1 && p.hasEnoughData === false && p.change === null && p.latestWeight === 58;
  }),
  wpScenario('체중 변화 시나리오: 기록이 없으면 NaN 없이 null 반환', lib => {
    const a = lib.getWeightProgress(null), b = lib.getWeightProgress({ records: [] });
    return [a, b].every(p => p.recordCount === 0 && p.change === null && p.latestWeight === null && p.firstWeight === null) &&
      lib.formatWeightChange(null) === null;
  }),
  wpScenario('체중 변화 시나리오: 문자열·null·0·빈값 레거시 기록도 정상 처리', lib => {
    const p = lib.getWeightProgress({ records: [
      { date: '2026-06-02', weight: '55.7' }, { date: '2026-06-10', weight: 0 }, { date: '2026-06-15', weight: '' },
      { date: '2026-06-20', weight: null }, { date: '', weight: 54 }, { date: '2026-07-29', weight: '53' },
    ] });
    return p.firstWeight === 55.7 && p.latestWeight === 53 && p.change === -2.7 && p.recordCount === 2;
  }),
  wpScenario('체중 변화 시나리오: 배열이 날짜순이 아니어도 실제 날짜 기준 최초·최근 선택', lib => {
    const p = lib.getWeightProgress({ records: [
      { date: '2026-07-29', weight: 53 }, { date: '2026-06-02', weight: 55.7 }, { date: '2026-07-01', weight: 54 },
    ] });
    return p.firstWeight === 55.7 && p.latestWeight === 53 && p.change === -2.7;
  }),
  wpScenario('체중 변화 시나리오: 회원앱 실시간 입력(liveEntry)은 현재 체중만 갱신하고 기준은 첫 측정 유지', lib => {
    const body = { records: [{ date: '2026-06-02', weight: 55.7 }, { date: '2026-07-29', weight: 53 }] };
    const sameDay = lib.getWeightProgress(body, { weight: 52.5, date: '2026-07-29' }); // 같은 날짜는 최신 입력 우선
    const newDay = lib.getWeightProgress(body, { weight: 52, date: '2026-07-30' });
    return sameDay.recordCount === 2 && sameDay.latestWeight === 52.5 && sameDay.firstWeight === 55.7 && sameDay.change === -3.2 &&
      newDay.recordCount === 3 && newDay.latestWeight === 52 && newDay.change === -3.7;
  }),
  wpScenario('체중 변화 시나리오: 부동소수점 오차가 표시에 남지 않음(-2.7kg / 0kg / +1.2kg)', lib => {
    const p = lib.getWeightProgress({ records: [{ date: '2026-06-02', weight: 55.7 }, { date: '2026-07-29', weight: 53 }] });
    return String(p.change) === '-2.7' &&
      lib.formatWeightChange(0) === '0kg' && lib.formatWeightChange(1.2000000001) === '+1.2kg' &&
      lib.formatWeightChange(-2.7000000001) === '-2.7kg';
  }),

  // ── 회원앱 홈 "30일 체중 변화" 카드 버그 수정 (2026-08-18) ──────────────────────
  wcScenario('30일 체중 변화 ①: 최근 30일 안에 기록이 여러 개면 첫 기록↔최근 기록 차이를 반영(-2.0kg)', lib => {
    const body = { records: [
      { date: daysAgoStr(28), weight: 83.0 }, { date: daysAgoStr(20), weight: 82.4 },
      { date: daysAgoStr(13), weight: 81.8 }, { date: daysAgoStr(6), weight: 81.3 },
      { date: daysAgoStr(0), weight: 81.0 },
    ] };
    const c = lib.computeWeightCard(body);
    return c.delta === -2 && c.value === '81kg';
  }),
  wcScenario('30일 체중 변화 ②: 정확히 30일 전 기록은 없지만 최근 30일 안에 여러 기록이 있으면 그 범위 안 최고령 기록을 기준으로 계산(회귀 확인 — 예전엔 delta=null로 빠졌음)', lib => {
    const body = { records: [{ date: daysAgoStr(20), weight: 80 }, { date: daysAgoStr(10), weight: 79 }, { date: daysAgoStr(0), weight: 78 }] };
    const c = lib.computeWeightCard(body);
    return c.delta === -2;
  }),
  wcScenario('30일 체중 변화 ③: 오늘 새로 기록하면 최신 기록으로 즉시 반영', lib => {
    const c = lib.computeWeightCard({ records: [{ date: daysAgoStr(25), weight: 70 }, { date: daysAgoStr(0), weight: 69 }] });
    return c.value === '69kg' && c.delta === -1;
  }),
  wcScenario('30일 체중 변화 ④: 최근 30일 기록이 1개뿐이면 delta=null(0kg으로 단정하지 않고 현재 체중만 표시)', lib => {
    const body = { records: [{ date: daysAgoStr(60), weight: 90 }, { date: daysAgoStr(5), weight: 75 }] };
    const c = lib.computeWeightCard(body);
    return c.delta === null && c.value === '75kg';
  }),
  wcScenario('30일 체중 변화 ⑤: 최근 30일 기록이 아예 없으면 오래된 기록 하나를 자기 자신과 비교해 "0kg"을 만들지 않고 delta=null(수정 전 버그 재현 방지)', lib => {
    const c = lib.computeWeightCard({ records: [{ date: daysAgoStr(60), weight: 80 }] });
    return c.delta === null && c.value === '80kg';
  }),
  wcScenario('30일 체중 변화 ⑥: 체중 증가도 동일하게 반영(+2kg)', lib => {
    const c = lib.computeWeightCard({ records: [{ date: daysAgoStr(20), weight: 70 }, { date: daysAgoStr(0), weight: 72 }] });
    return c.delta === 2;
  }),
  wcScenario('30일 체중 변화 ⑦: 기록이 전혀 없으면 "기록 필요"', lib => {
    const a = lib.computeWeightCard(null), b = lib.computeWeightCard({ records: [] });
    return a.value === '기록 필요' && a.delta === null && b.value === '기록 필요' && b.delta === null;
  }),
  wcScenario('30일 체중 변화 ⑧: 같은 날짜 중복 기록이 섞여 있어도 예외 없이 계산됨(정상 저장 경로는 upsertBodyRecord/upsertRecordByDate로 날짜당 1건만 유지)', lib => {
    const body = { records: [{ date: daysAgoStr(20), weight: 70 }, { date: daysAgoStr(20), weight: 71 }, { date: daysAgoStr(0), weight: 69 }] };
    const c = lib.computeWeightCard(body);
    return Number.isFinite(c.delta) && c.value === '69kg';
  }),
  ['30일 체중 변화 ⑨: HomeWeightSpark 그래프와 동일한 dateStrDaysAgo(29) 기준을 공유(카드 수치와 그래프 범위 불일치 없음)',
    app.includes("const pts=getBodyWeightRecords(body).filter(r=>r.date>=dateStrDaysAgo(29)&&Number.isFinite(Number(r.weight)));") &&
    app.includes('const since=dateStrDaysAgo(29);') && app.includes('const windowRecords=weights.filter(w=>w.date>=since);')
  ],

  // ── 상담 고객 분리 · 회원앱 사전 문진(온보딩 v2) 개편 ──────────────────────────
  ['상담 분리: 신규 상담은 members가 아니라 consultations 문서만 생성',
    db.includes('export async function addConsultation') &&
    db.includes('addDoc(collection(db, "consultations")') &&
    app.includes('screen==="consultationForm"') &&
    app.includes('<ConsultationFormScreen')
  ],
  ['상담 분리: 상담 상태 6종(예정/완료/고민중/추후연락/등록확정/미등록)을 모두 지원',
    ['consultation_scheduled', 'consultation_completed', 'considering', 'follow_up', 'registered', 'not_registered']
      .every(k => db.includes(`key: "${k}"`))
  ],
  ['상담 분리: 미등록 상담 고객은 삭제 대상이 아니며 전환 완료건은 삭제 자체가 차단됨',
    db.includes('if (data.convertedMemberId) throw new Error("이미 정식 회원으로 전환된 상담은 삭제할 수 없습니다.");') &&
    app.includes('상담만 받고 등록하지 않은 분도')
  ],
  ['상담 → 회원 전환: 중복 전환 방지 + memberId/consultationId 상호 연결',
    db.includes('export async function convertConsultationToMember') &&
    db.includes('if (consult.convertedMemberId) throw new Error("이미 정식 회원으로 전환된 상담 고객입니다.");') &&
    db.includes('await addMember({ ...memberData, consultationId });') &&
    db.includes('convertedMemberId: created.id,') &&
    app.includes('? await convertConsultationToMember(d.consultationId, d)')
  ],
  ['상담 → 회원 전환: 이름·연락처·방문 경로·상담 메모·희망 시간이 자동으로 채워짐',
    app.includes('function handleStartConvert(c) {') &&
    ['name: c.name', 'phone: c.phone', 'visitRoutes: Array.isArray(c.visitRoutes)', 'consultMemo: c.consultMemo', 'preferredSchedule: c.preferredSchedule']
      .every(x => app.includes(x)) &&
    app.includes('const fromConsultation = !isEdit && !!prefill?.consultationId;')
  ],
  ['상담 분리: 정식 회원 전환은 상담 상태가 "등록 확정"일 때만 가능',
    app.includes('disabled={c.status !== "registered"}')
  ],
  ['상담 분리: Firestore Rules consultations는 trainerUid 소유자 전용(회원 계정 접근 차단)',
    firestoreRules.includes('match /consultations/{consultationId}') &&
    firestoreRules.includes("allow read: if isSignedIn() && resource.data.get('trainerUid', '') == uid();")
  ],
  ['상담 분리: 신규 회원 등록 화면에서 운동 설문 11단계 제거(수정 모드 8개 탭은 그대로 유지)',
    !app.includes('"약점 & 선호 스타일", "운동 강도 성향", "목표 우선순위"') &&
    app.includes('const survey = isEdit ? {') &&
    app.includes('const EDIT_TABS = ["기본","목표·목적","통증·건강","운동경험","방문계기","생활습관","스케줄","메모"];')
  ],
  ['유입 분석: 미등록 상담 고객도 포함하되 전환 완료건은 중복 집계하지 않음',
    app.includes('.filter(c => c && !c.convertedMemberId && !linkedConsultIds.has(String(c.id)))') &&
    app.includes('function buildAcquisitionRows(')
  ],

  ['온보딩 v2: 저장 위치는 기존 memberOnboarding/main 한 곳이고 v2 맵만 추가(중복 저장 없음)',
    db.includes('doc(db, "members", memberId, "memberOnboarding", "main")') &&
    db.includes('"v2", "v2Draft", "onboardingVersion", "startedAt",') &&
    app.includes('v2, v2Draft: {},')
  ],
  ['온보딩 v2: Firestore Rules 화이트리스트에 v2/v2Draft/onboardingVersion/startedAt 추가(생성·수정 모두)',
    (firestoreRules.match(/"v2", "v2Draft", "onboardingVersion", "startedAt"/g) || []).length === 2
  ],
  ['온보딩 v2: 단계별 임시 저장 + 중간 이탈 후 재진입 시 입력값·단계 복원',
    db.includes('export async function saveMemberOnboardingDraft') &&
    app.includes('const persistDraft = (nextStep) => {') &&
    app.includes('const draft = (!isEditMode && existing?.v2Draft) || null;') &&
    app.includes('const s = Number(draft?.step);')
  ],
  ['온보딩 v2: 조건부 질문(통증 없음/수술 없음/약물 없음/이전 PT 없음/바디프로필/재활) 적용',
    app.includes('if (part === "없음") next = cur.includes("없음") ? [] : ["없음"];') &&
    app.includes('{v.experience.prevPT === "있음" &&') &&
    app.includes('{v.health.hasSurgery === "있음" &&') &&
    app.includes('{v.health.hasMedication === "있음" &&') &&
    app.includes('{goalList.includes("바디프로필") &&') &&
    app.includes('{goalList.includes("재활 목적") &&')
  ],
  ['온보딩 v2: 상위 선택을 해제해도 상세 값을 즉시 지우지 않고 최종 제출에서만 정리',
    app.includes('function ob2Finalize(v = {}) {') &&
    app.includes('const cleanV2 = ob2Finalize(v);')
  ],
  ['온보딩 v2: 제출 중 중복 클릭 방지 + 저장 무한 대기 방지(타임아웃)',
    app.includes('const completeOnboarding = async () => {') &&
    app.includes('await withOnboardingTimeout(saveMemberOnboarding(profile.id, payload));')
  ],
  ['온보딩 v2: 기존 평탄 필드(성별/키/체중/집중부위)와 약관 동의·프로필 동기화를 그대로 유지',
    app.includes('gender: draft?.d?.gender || existing?.gender || profile.gender || "",') &&
    app.includes('agreedTermsAt: existing?.agreedTermsAt || now,') &&
    app.includes('syncOnboardingToMemberProfile(profile.id, payload).catch(() => {});')
  ],
  ['온보딩 v2: 최우선 목표 12종 → 기존 목표 어휘 5종 자동 환산(같은 질문 두 번 하지 않음)',
    app.includes('const OB2_GOAL_TO_LEGACY = {') &&
    app.includes('function legacyGoalFromOb2(primaryGoal, goals = [], fallback = "") {')
  ],
  ['온보딩 상태: 6단계 상태 + 온보딩 데이터가 없는 기존 회원도 오류 없이 표시',
    ['not_invited', 'invited', 'account_created', 'in_progress', 'completed', 'needs_update', 'legacy']
      .every(k => app.includes(`${k}:`)) &&
    app.includes('function getOnboardingStatus(member = {}, onboarding = null) {') &&
    app.includes('if (member?.birthSource === "onboarding") return "legacy";')
  ],
  ['온보딩 상태: 회원 목록 배지는 members 미러 필드만 사용(목록에서 서브문서 추가 조회 없음)',
    app.includes('function getOnboardingStatusFromMember(member = {}) {') &&
    app.includes('const obStatus = getOnboardingStatusFromMember(m);') &&
    !app.includes('getMemberOnboarding(m.id)')
  ],
  ['온보딩 상태: 미러 필드가 Rules 회원 쓰기 화이트리스트에 포함되고 전용 저장 함수 사용',
    firestoreRules.includes('"onboardingStatus", "onboardingCompletedAt", "onboardingUpdatedAt", "onboardingHasCaution"') &&
    db.includes('export async function syncOnboardingStatusToMember')
  ],
  ['관리자 요약: 회원 상세에 사전 문진 요약 카드 + 통증·병력·약물·주의사항 별도 강조 영역',
    app.includes('function OnboardingSummaryCard({ member, onboarding, onPatch, showToast }) {') &&
    app.includes('<OnboardingSummaryCard member={member} onboarding={ob} onPatch={onMemberPatch} showToast={showToast} />') &&
    app.includes('수업 전 반드시 확인') &&
    app.includes('function ob2HasCaution(v2 = {}) {')
  ],
  ['관리자 요약: 사전 문진 카드는 기본 접힘 + 접힌 상태에서도 주의 N건 요약 노출',
    app.includes('function ob2CautionItems(v2 = {}) {') &&
    app.includes('const cautionItems = v2 ? ob2CautionItems(v2) : [];') &&
    app.includes('`⚠ 주의 ${cautionItems.length}건`') &&
    app.includes('주의사항 없음 · 통증 · 병력 · 복용 약물 모두 “없음”으로 확인됨')
  ],
  ['관리자 요약: 전체 답변 보기 / 수정 요청 / 내용 확인 완료 액션 제공',
    app.includes('전체 답변 보기') && app.includes('회원에게 수정 요청') && app.includes('내용 확인 완료') &&
    db.includes('export async function markOnboardingReviewed') &&
    db.includes('export async function requestOnboardingUpdate')
  ],
  ['관리자 요약: 회원이 통증·병력·약물·주의사항을 바꾸면 확인 완료가 풀리고 변경 확인 필요로 전환',
    app.includes('function ob2CriticalSignature(v2 = {}) {') &&
    app.includes('const criticalChanged = !savedV2 || prevSig !== nextSig;') &&
    app.includes('if (criticalAt && (!reviewedAt || String(criticalAt) > String(reviewedAt))) return "needs_update";')
  ],
  ['관리자 홈: 오늘 해야 할 일에 사전 문진 미완료 카드 추가(기존 TodayListCard 펼치기 UX 재사용)',
    app.includes('const onboardingPendingList = useMemo(() => {') &&
    app.includes('title="사전 문진 미완료"') &&
    app.includes('id="home-onboarding-pending"')
  ],
  // ══════════════════════════════════════════════════════════════════════
  // 홈 "오늘 해야 할 일" 배포 기준 시각(cutoff) — 수업일지 미확인·사전 문진 미완료 2개 항목만 적용,
  // "회원앱 확인 필요"는 이미 롤링 윈도우 판정이라 제외(사용자 확인 완료)
  // ══════════════════════════════════════════════════════════════════════
  ['홈 cutoff: HOME_TASK_CUTOFF_AT은 고정값이고 new Date()/Date.now()를 기준점으로 재계산하지 않음',
    /const HOME_TASK_CUTOFF_AT = new Date\("[\d-]+T[\d:]+\+09:00"\)\.getTime\(\);/.test(app) &&
    app.includes('function toMillisSafe(value)') &&
    app.includes('function isAtOrAfterHomeTaskCutoff(value)')
  ],
  ['홈 cutoff: "사전 문진 미완료"는 초대/가입 시각 또는 온보딩 초기화 시각, 안전정보 재확인은 실제 수정 시각 기준',
    app.includes('if (st === "needs_update") return isAtOrAfterHomeTaskCutoff(m.onboardingUpdatedAt);') &&
    app.includes('const invitedAt = m.memberAppInviteSentAt || m.memberUidLinkedAt || m.memberAppPasswordResetSentAt || null;') &&
    app.includes('return isAtOrAfterHomeTaskCutoff(invitedAt) || isAtOrAfterHomeTaskCutoff(m.onboardingResetAt);')
  ],
  ['홈 cutoff: "회원앱 확인 필요"는 cutoff 미적용(이미 최근 이용/입력 부재만 보는 롤링 윈도우라 누적 백로그 없음)',
    (() => {
      const inactiveFn = app.slice(app.indexOf('function getInactiveAppMembers'), app.indexOf('function getNoFeedbackActivityMembers'));
      const noFeedbackFn = app.slice(app.indexOf('function getNoFeedbackActivityMembers'), app.indexOf('function SessionReadBadge'));
      return app.includes('function getInactiveAppMembers') && app.includes('function getNoFeedbackActivityMembers') &&
        !inactiveFn.includes('isAtOrAfterHomeTaskCutoff') && !noFeedbackFn.includes('isAtOrAfterHomeTaskCutoff');
    })()
  ],
  ['온보딩 초기화: resetMemberOnboarding이 writeBatch(문서 삭제+onboardingResetAt 기록)를 원자적으로 commit',
    db.includes('export async function resetMemberOnboarding(memberId) {') &&
    (() => {
      const fn = db.slice(db.indexOf('export async function resetMemberOnboarding'), db.indexOf('export async function resetMemberOnboarding') + 1200);
      return fn.includes('const batch = writeBatch(db);') &&
        fn.includes('batch.delete(onboardingRef);') &&
        fn.includes('onboardingResetAt: serverTimestamp()') &&
        fn.includes('batch.update(memberRef, patch);') &&
        fn.includes('await batch.commit();');
    })()
  ],
  ['회원앱: 제출 후에도 프로필에서 사전 문진을 다시 수정할 수 있음',
    app.includes('mode="edit"') && app.includes('사전 문진 수정하기') &&
    app.includes('const isEditMode = mode === "edit";')
  ],
  // ══════════════════════════════════════════════════════════════════════
  // 개인운동 기록 1차 — 회원앱 기록/복원/불러오기 + 관리자 조회 + Rules 보안 + 회귀
  // ══════════════════════════════════════════════════════════════════════
  ['개인운동 저장 경로: members/{id}/personalWorkouts 전용 서브컬렉션 + 상한값 단일 정의',
    db.includes('/members/{id}/personalWorkouts/{id}') &&
    db.includes('export const PERSONAL_WORKOUT_LIMITS = {') &&
    db.includes('maxExercises: 20') && db.includes('maxSetsPerExercise: 20') &&
    db.includes('maxMemoLength: 1000') && db.includes('maxParts: 4') &&
    db.includes('collection(db, "members", memberId, "personalWorkouts")')
  ],
  ['개인운동 데이터 함수: 시작/진행 저장/완료/삭제/목록/진행중 조회가 모두 존재하고 목록은 limit 사용',
    db.includes('export async function createPersonalWorkout') &&
    db.includes('export async function updatePersonalWorkoutProgress') &&
    db.includes('export async function completePersonalWorkout') &&
    db.includes('export async function deletePersonalWorkout') &&
    db.includes('export async function getPersonalWorkouts') &&
    db.includes('export async function getInProgressPersonalWorkouts') &&
    db.includes('orderBy("workoutDate", "desc"), limit(max)') &&
    db.includes('where("status", "==", "in_progress")')
  ],
  ['개인운동 시작: status는 항상 in_progress + startedAt/createdAt은 서버 타임스탬프',
    (() => {
      const fn = db.slice(db.indexOf('export async function createPersonalWorkout'), db.indexOf('export async function updatePersonalWorkoutProgress'));
      return fn.includes('status: "in_progress"') && fn.includes('startedAt: serverTimestamp()') && fn.includes('createdAt: serverTimestamp()');
    })()
  ],
  ['개인운동 진행 중 저장: status/startedAt/createdAt/completedAt을 절대 갱신하지 않는다(허용 필드 화이트리스트)',
    (() => {
      const start = db.indexOf('export async function updatePersonalWorkoutProgress');
      const fn = db.slice(start, db.indexOf('return { id: workoutId, ...allowed };', start));
      return !fn.includes('status') && !fn.includes('startedAt') && !fn.includes('createdAt') && !fn.includes('completedAt') &&
        fn.includes('allowed.exercises') && fn.includes('allowed.memo') && fn.includes('updatedAt: serverTimestamp()');
    })()
  ],
  ['개인운동 완료: endedAt/completedAt은 완료 저장 1회에서만 서버 시각으로 확정',
    (() => {
      const fn = db.slice(db.indexOf('export async function completePersonalWorkout'), db.indexOf('export async function deletePersonalWorkout'));
      return fn.includes('status: "completed"') && fn.includes('endedAt: serverTimestamp()') && fn.includes('completedAt: serverTimestamp()');
    })()
  ],
  ['개인운동 appUsage 중복 방지: 저장마다 appUsage를 따로 쓰지 않고 완료 시 기존 touchMemberActivities만 1회 호출',
    (() => {
      const block = db.slice(db.indexOf('// 개인운동 기록 — members/{memberId}/personalWorkouts'));
      return !block.includes('recordMemberAppUsage') &&
        block.includes('await touchMemberActivities(memberId, [{') &&
        block.includes('type: "personalWorkout"') &&
        // touchMemberActivities는 완료 함수 안에서만 호출된다(진행 중 자동 저장에서는 호출 없음)
        !db.slice(db.indexOf('export async function updatePersonalWorkoutProgress'), db.indexOf('export async function completePersonalWorkout')).includes('touchMemberActivities');
    })()
  ],
  ['개인운동 공통 헬퍼: 화면마다 재계산하지 않는 단일 계산 함수 세트가 존재',
    app.includes('function normalizePersonalWorkout(') &&
    app.includes('function normalizePersonalWorkoutSet(') &&
    app.includes('function normalizePersonalWorkoutExercise(') &&
    app.includes('function calculatePersonalExerciseVolume(') &&
    app.includes('function calculatePersonalWorkoutTotals(') &&
    app.includes('function getLastCompletedPersonalExerciseRecord(') &&
    app.includes('function summarizePersonalWorkoutExercise(') &&
    app.includes('function buildPersonalWorkoutCardSummary(') &&
    app.includes('function getPersonalWorkoutDurationMinutes(') &&
    app.includes('function validatePersonalWorkoutForComplete(')
  ],
  ['개인운동 볼륨: 기존 exVol()을 재사용하고 별도 볼륨 계산식을 새로 만들지 않음',
    (() => {
      const fn = app.slice(app.indexOf('function calculatePersonalExerciseVolume'), app.indexOf('function normalizePersonalWorkoutExercise'));
      return fn.includes('exVol(') && !fn.includes('parseFloat');
    })()
  ],
  ['개인운동 부위 옵션: 새 한국어 enum을 만들지 않고 기존 저장값(SESSION_TYPE_OPTIONS / MUSCLE_MAP 키)만 사용, 이두·삼두 분리 + 팔 신규 옵션 제거',
    (() => {
      const m = app.match(/const PERSONAL_WORKOUT_PART_OPTIONS = \[([^\]]+)\]/);
      if (!m) return false;
      const parts = m[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const sessionTypes = (app.match(/const SESSION_TYPE_OPTIONS = \[([\s\S]*?)\];/) || [])[1] || '';
      const muscleMap = (app.match(/const MUSCLE_MAP\s+= \{([\s\S]*?)\n\};/) || [])[1] || '';
      return parts.length === 9 && parts.includes('이두') && parts.includes('삼두') && !parts.includes('팔') &&
        parts.every(p => sessionTypes.includes(`"${p}"`) || muscleMap.includes(`"${p}"`));
    })()
  ],
  ['개인운동 부위 레거시 호환: "팔" 값이 있는 기존 문서는 자동 변환 없이 칩 목록에 그대로 노출되어 확인·해제 가능',
    app.includes('function getPersonalWorkoutPartChipOptions(currentParts=[]){') &&
    app.includes('getPersonalWorkoutPartChipOptions(parts).map(part=>(') &&
    !app.includes('PERSONAL_WORKOUT_PART_OPTIONS.map(part=>(') &&
    pwScenario('레거시 팔 칩 호환', lib => {
      const withLegacy = lib.getPersonalWorkoutPartChipOptions(['가슴', '팔']);
      const withoutLegacy = lib.getPersonalWorkoutPartChipOptions(['가슴', '이두']);
      return withLegacy.includes('팔') && withLegacy.includes('이두') && withLegacy.includes('삼두') &&
        !withoutLegacy.includes('팔') && withoutLegacy.length === lib.PERSONAL_WORKOUT_PART_OPTIONS.length;
    })[1]
  ],
  ['개인운동 무한 로딩 방지: 시작·완료·삭제·진행저장이 모두 withTimeout으로 보호되고, 화면 전환은 재조회(reloadPersonalWorkouts) 완료를 기다리지 않음',
    (() => {
      const startFn = app.slice(app.indexOf('const startPersonalWorkout=async(parts)=>{'), app.indexOf('const savePersonalWorkoutProgress=async(workoutId,patch)=>{'));
      const saveFn = app.slice(app.indexOf('const savePersonalWorkoutProgress=async(workoutId,patch)=>{'), app.indexOf('const completePersonalWorkoutRecord=async(workoutId,payload)=>{'));
      const completeFn = app.slice(app.indexOf('const completePersonalWorkoutRecord=async(workoutId,payload)=>{'), app.indexOf('const removePersonalWorkout=async(workout)=>{'));
      const removeFn = app.slice(app.indexOf('const removePersonalWorkout=async(workout)=>{'), app.indexOf('// 운동 종목 후보'));
      const reloadFn = app.slice(app.indexOf('const reloadPersonalWorkouts=async()=>{'), app.indexOf('const openPersonalWorkoutStart=()=>{'));
      const allWrapped = [startFn, saveFn, completeFn, removeFn, reloadFn].every(fn => fn.includes('withTimeout(') && fn.includes('PERSONAL_WORKOUT_TIMEOUT_MS'));
      // 성공 경로에서 setPersonalRecordTarget(화면 전환)이 reloadPersonalWorkouts 호출보다 먼저 실행돼야
      // "재조회를 기다려야만 화면이 열리는" 구조로 되돌아가지 않는다.
      const startOrderOk = startFn.indexOf('setPersonalRecordTarget({workoutId:created.id') < startFn.indexOf('reloadPersonalWorkouts();');
      const completeOrderOk = completeFn.indexOf('setPersonalRecordTarget(null);') < completeFn.lastIndexOf('reloadPersonalWorkouts();');
      // 실패 시에도 reloadPersonalWorkouts를 await하지 않아야 catch 이후 finally(로딩 해제)가 즉시 실행된다
      const startCatchNoAwait = !/catch\(e\)\{[\s\S]*?await reloadPersonalWorkouts\(\)[\s\S]*?\}\s*finally/.test(startFn);
      return allWrapped && startOrderOk && completeOrderOk && startCatchNoAwait &&
        startFn.includes('finally{ setPersonalBusy(false); }');
    })()
  ],
  ['개인운동 시작: 생성 성공 시 로컬 in_progress 상태를 즉시 구성해 재조회 없이 기록 화면 진입',
    app.includes('const localWorkout=normalizePersonalWorkout({') &&
    app.includes('status:"in_progress", source:"memberApp",') &&
    app.includes('setPersonalInProgress(prev=>[localWorkout,...prev.filter(w=>w.id!==localWorkout.id)]);')
  ],
  ['개인운동 완료 안내: alert() 대신 비차단 토스트(기존 sj-fb-saved-toast 재사용) — 실기기 자동화 검증 중 alert()가 스크립트 실행 자체를 막는 것을 확인해 제거함',
    !app.slice(app.indexOf('const completePersonalWorkoutRecord=async(workoutId,payload)=>{'), app.indexOf('const removePersonalWorkout=async(workout)=>{')).includes('alert(') &&
    app.includes('setPersonalWorkoutToast("개인운동이 저장됐어요");') &&
    app.includes('{p.personalWorkoutToast&&<div className="sj-fb-saved-toast" role="status">{p.personalWorkoutToast}</div>}')
  ],
  ['개인운동 운동 종목: 별도 운동 사전을 신설하지 않고 본인 PT 기록·개인운동·기존 분류 상수만 후보로 사용',
    (() => {
      const fn = app.slice(app.indexOf('function buildPersonalExerciseCandidates'), app.indexOf('function validatePersonalWorkoutForComplete'));
      return fn.includes('EXERCISE_LIBRARY.forEach') && fn.includes('EX_MUSCLE_SUGGEST.forEach') &&
        fn.includes('canonicalExerciseKey(label)') && fn.includes('suggestMuscle(label,{})') &&
        !fn.includes('exerciseClassifications');
    })()
  ],
  ['개인운동 식별자: 새 exerciseId 체계를 만들지 않고 기존 canonicalExerciseKey를 저장·비교 키로 사용',
    app.includes('exerciseKey:canonicalExerciseKey(name)||""') &&
    (() => {
      const fn = app.slice(app.indexOf('function getLastCompletedPersonalExerciseRecord'), app.indexOf('function buildPersonalExerciseCandidates'));
      // 운동명 문자열 부분 일치(includes)로 느슨하게 비교하지 않는다
      return fn.includes('canonicalExerciseKey(e?.name))===key') && !fn.includes('.includes(');
    })()
  ],
  ['하단 탭: 표시 문구만 "수업"→"운동"으로 변경, 내부 라우팅 key(workout)와 appUsage 기록은 그대로 유지',
    app.includes('["workout",HM_PATHS.dumbbell,"운동"]') &&
    !app.includes('["workout",HM_PATHS.dumbbell,"수업"]') &&
    app.includes('{tab==="workout"&&<MemberWorkout {...common}/>}') &&
    app.includes('recordMemberAppUsage(profile.id,tab).catch(()=>{});') &&
    app.includes('p.setWorkoutView?.("calendar"); p.setTab("workout");')
  ],
  ['운동 탭: 상단 개인운동 진입 + 기존 수업일지(MemberJournal) 유지 + 캘린더 세그먼트 유지',
    (() => {
      const fn = app.slice(app.indexOf('function MemberWorkout(p){'), app.indexOf('const JOURNAL_OPEN_ID_KEY'));
      return fn.includes('<MemberPersonalWorkoutEntry') && fn.includes('<MemberJournal {...p}/>') &&
        fn.includes('<MemberCalendar {...p}/>') && fn.includes('options={[["journal","운동 기록"],["calendar","캘린더"]]}') &&
        fn.includes('<h1 className="sj-page-title">운동</h1>');
    })()
  ],
  ['운동 탭 통합 목록: 최신 PT 수업 자동 펼침·sessionReads 대상은 PT 수업만 유지하고 개인운동만 날짜순 병합',
    (() => {
      const fn = app.slice(app.indexOf('function MemberJournal({'), app.indexOf('// ════════════════════════════════════════════════════\r\n// 개인운동 기록 — 공통 계산 헬퍼') >= 0
        ? app.indexOf('// 개인운동 기록 — 공통 계산 헬퍼')
        : app.length);
      return fn.includes('const isExp=(s)=>!!lq||(openId==null&&s.id===latestId)||openId===s.id;') &&
        fn.includes('const displayed=[...(heroSession?[heroSession]:[]),...visibleRows.filter(r=>r.kind==="session").map(r=>r.s)];') &&
        fn.includes('markSessionDetailRead(latestId,"auto_expanded_recent_session")') &&
        fn.includes('kind:"personal"') && fn.includes('w.status==="completed"') &&
        // 개인운동 카드 렌더에서는 어떤 확인/읽음 처리도 하지 않는다
        !app.slice(app.indexOf('const renderPersonal=(w)=>('), app.indexOf('const heroItems=[]; const prevItems=[];')).includes('markSession');
    })()
  ],
  ['개인운동 카드: sessionReads(수업일지 회원 확인)를 만들지 않는다',
    (() => {
      const comp = app.slice(app.indexOf('function MemberPersonalWorkoutCard'), app.indexOf('function MemberPersonalWorkoutEntry'));
      return !comp.includes('markSessionDetailRead') && !comp.includes('markSessionsAsRead') && comp.includes('개인운동');
    })()
  ],
  ['개인운동 중복 시작 차단: 진행 중 기록이 있으면 시작 버튼 대신 이어서 기록/종료/삭제 안내',
    app.includes('if(personalInProgress.length>0){') &&
    app.includes('alert("진행 중인 개인운동이 있어요. 기존 기록을 이어서 작성하거나 종료해주세요.");') &&
    (() => {
      const comp = app.slice(app.indexOf('function MemberPersonalWorkoutEntry'), app.indexOf('function MemberPersonalExercisePicker'));
      return comp.includes('if(inProgress.length>0){') && comp.includes('이어서 기록') && comp.includes('운동 종료') && comp.includes('기록 삭제');
    })()
  ],
  ['개인운동 진행 중 저장: 구조 변경은 즉시, 값 입력은 디바운스, 화면 이탈 시 flush (매초 쓰기 없음)',
    (() => {
      const comp = app.slice(app.indexOf('function MemberPersonalWorkoutScreen({'), app.indexOf('// Firestore에 저장된 세트(숫자)를 입력창에서'));
      return comp.includes('timerRef.current=setTimeout(()=>flush(),1500)') &&
        comp.includes('markDirty(true)') && comp.includes('markDirty(false)') &&
        comp.includes('window.addEventListener("pagehide",onHide)') &&
        comp.includes('document.addEventListener("visibilitychange",onVisibility)') &&
        // 경과 시간은 화면 계산만 — 저장 호출 없이 setInterval로 표시값만 갱신
        comp.includes('const t=setInterval(()=>setNowMs(Date.now()),30000)') &&
        !comp.includes('setInterval(()=>onSaveProgress');
    })()
  ],
  ['개인운동 세트 추가: 직전 세트의 중량·횟수를 기본값으로 복사',
    app.includes('const lastSet=e.sets[e.sets.length-1]||{weight:"",reps:""};') &&
    app.includes('return {...e,sets:[...e.sets,{weight:lastSet.weight||"",reps:lastSet.reps||""}]};')
  ],
  ['개인운동 지난 기록 불러오기: 자동 덮어쓰기 금지 + 입력값이 있으면 확인 절차 + 세트 배열 전체 복사',
    (() => {
      const fn = app.slice(app.indexOf('const loadLastRecord ='), app.indexOf('const openSummary=()=>{'));
      return fn.includes('window.confirm("현재 입력한 세트를 지난 기록으로 바꿀까요?")') &&
        fn.includes('getPersonalWorkoutValidSets(last.exercise).map(') &&
        // 요약값만 복사하지 않고 세트 배열 전체를 그대로 옮긴다
        fn.includes('sets:copied');
    })()
  ],
  ['개인운동 종료: Firestore를 건드리지 않고 요약만 띄우고, 완료 전환은 "운동 저장" 1회에서만 발생',
    (() => {
      const openFn = app.slice(app.indexOf('const openSummary=()=>{'), app.indexOf('const saveCompleted=async(rpeValue)=>{'));
      const saveFn = app.slice(app.indexOf('const saveCompleted=async(rpeValue)=>{'), app.indexOf('const summaryPreview='));
      return openFn.includes('validatePersonalWorkoutForComplete(') && !openFn.includes('onComplete') && !openFn.includes('onSaveProgress') &&
        saveFn.includes('await onComplete(workout.id,{') && saveFn.includes('pendingRef.current=false;') &&
        saveFn.includes('rpe:rpeValue??null');
    })()
  ],
  ['개인운동 종료 RPE: 종료 시 강도 선택 단계가 있고 미입력으로도 완료 가능(나중에 입력)',
    (() => {
      const sheet = app.slice(app.indexOf('<MemberBottomSheet open={summaryOpen}'), app.indexOf('// "HH:MM" 입력창 값'));
      return sheet.includes('오늘 개인운동은 전체적으로 얼마나 힘들었나요?') &&
        sheet.includes('onClick={()=>saveCompleted(rpeChoice)}') &&
        sheet.includes('onClick={()=>saveCompleted(null)}') &&
        // 나중에 입력 버튼은 RPE 선택 여부와 무관하게 항상 눌러 완료할 수 있어야 한다(disabled 조건에 rpeChoice가 없어야 함)
        /나중에 입력<\/button>/.test(sheet) &&
        !/disabled=\{completing\|\|rpeChoice==null\}[^>]*>나중에 입력/.test(sheet);
    })()
  ],
  ['개인운동 종료: 완료 저장 전 진행 중이던 자동 저장(flush)이 있으면 먼저 기다려 같은 문서에 write가 동시에 도착하지 않게 함',
    (() => {
      const flushFn = app.slice(app.indexOf('const flush=useCallback(async()=>{'), app.indexOf('const markDirty=useCallback'));
      const saveFn = app.slice(app.indexOf('const saveCompleted=async(rpeValue)=>{'), app.indexOf('const summaryPreview='));
      return flushFn.includes('flushInFlightRef.current=run;') &&
        saveFn.includes('if(flushInFlightRef.current) await flushInFlightRef.current;') &&
        // 완료 저장 호출보다 먼저 대기해야 한다(순서가 바뀌면 동시 write 문제가 재발함)
        saveFn.indexOf('if(flushInFlightRef.current) await flushInFlightRef.current;') < saveFn.indexOf('await onComplete(workout.id,{');
    })()
  ],
  ['개인운동 종료: 저장 실패해도 Firebase 원문(영어) 오류를 그대로 노출하지 않고 고정 한글 안내만 표시 + finally에서 저장 상태 해제 + 연속 클릭 방지',
    (() => {
      const saveFn = app.slice(app.indexOf('const saveCompleted=async(rpeValue)=>{'), app.indexOf('const summaryPreview='));
      return saveFn.includes('if(completing) return;') &&
        saveFn.includes('setErrorMsg("운동 기록을 저장하지 못했습니다.\\n잠시 후 다시 시도해주세요.");') &&
        !saveFn.includes('setErrorMsg(e?.message') &&
        saveFn.includes('finally{ setCompleting(false); }');
    })()
  ],
  ['개인운동 종료 후 RPE 저장(운동 후 상태 카드): 실패해도 Firebase 원문을 노출하지 않고 finally에서 저장 상태를 해제하며, 저장 중에는 버튼이 비활성화됨',
    (() => {
      const fn = app.slice(app.indexOf('function PersonalWorkoutStatusSection'), app.indexOf('function MemberPersonalExercisePicker'));
      return fn.includes('if(savingRpe||rpe==null) return;') &&
        fn.includes('setRpeError("운동 기록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");') &&
        !fn.includes('setRpeError(e?.message') &&
        fn.includes('finally{ setSavingRpe(false); }') &&
        fn.includes('disabled={savingRpe||rpe==null}');
    })()
  ],
  ['관리자 회원 상세: "최근 개인운동" 카드가 최근 수업 카드 아래에 배치되고 조회 전용(수정·삭제 없음)',
    app.includes('const secPersonalWorkout = canUseMemberLinkedFeatures(member) ? (() => {') &&
    app.includes('<span style={cardTitle}>최근 개인운동</span>') &&
    app.includes('{secBrief}{secAnalysis}{secManage}{secRecent}{secPersonalWorkout}{secAppUsage}') &&
    app.includes('{secToday}{secBrief}{secRecent}{secPersonalWorkout}{secAppUsage}{secPrep}') &&
    (() => {
      const sec = app.slice(app.indexOf('const secPersonalWorkout = canUseMemberLinkedFeatures(member)'), app.indexOf('// ⑤-2 회원 앱 이용 현황'));
      return !sec.includes('updatePersonalWorkout') && !sec.includes('deletePersonalWorkout') && !sec.includes('completePersonalWorkout') &&
        sec.includes('아직 개인운동 기록이 없습니다.') &&
        sec.includes('전체 개인운동 보기') &&
        // 세트별 값이 다르면 한 줄로 왜곡하지 않고 세트별로 펼쳐 보여준다
        sec.includes('s.uniform?s.text:`${s.setCount}세트 (세트별 상이)`') &&
        sec.includes('메모');
    })()
  ],
  ['관리자 회원 상세: 개인운동은 최근 10건만 읽고 회원 활동 기록(appUsage/sessionReads)을 만들지 않음',
    app.includes('getPersonalWorkouts(memberId, 10).catch(') &&
    app.includes('personalWorkouts={memberPersonalWorkouts}') &&
    (() => {
      const sec = app.slice(app.indexOf('const secPersonalWorkout = canUseMemberLinkedFeatures(member)'), app.indexOf('// ⑤-2 회원 앱 이용 현황'));
      return !sec.includes('recordMemberAppUsage') && !sec.includes('markSessionDetailRead') && !sec.includes('markSessionsRead');
    })()
  ],
  ['관리자 회원 상세: teo(대표)도 "최근 개인운동"·"회원 앱 이용 현황" 카드를 일반 회원과 동일하게 사용(isOwner로 카드 자체를 숨기지 않음)',
    !app.includes('const secPersonalWorkout = isOwner(member) ? null') &&
    !app.includes('const secAppUsage = isOwner(member) ? null') &&
    app.includes('function canUseMemberLinkedFeatures(member) {') &&
    app.includes('return !!member?.id;')
  ],
  ['관리자 회원 상세: "오늘 회원 상태"(통증·근육통·컨디션·RPE·메모) 섹션은 isOwner 분기 없이 항상 계산·표시 — teo(대표)의 회원앱 입력도 그대로 보인다',
    (() => {
      const sec = app.slice(app.indexOf('const ciPain = ci.find'), app.indexOf('const latestMsg = ms[0]||null;'));
      return sec.length > 0 &&
        sec.includes('const soreInfo = (()=>{') &&
        sec.includes('const memberRpe = (()=>{') &&
        !sec.includes('isOwner') && !sec.includes('isExcludedAdminMember') && !sec.includes('canUseMemberLinkedFeatures');
    })()
  ],
  ['Firestore Rules: personalWorkouts는 회원 본인 쓰기 + 트레이너 읽기, memberId 위조·필드 위조·과대 배열 차단',
    (() => {
      const block = membersBlockFlat.slice(membersBlockFlat.indexOf('match /personalWorkouts/{workoutId}'), membersBlockFlat.indexOf('match /memberMessages/{messageId}'));
      return block.includes('allow read: if isTrainerOfMember(memberId) || isMemberSelfActive(memberId);') &&
        block.includes('allow create: if isMemberSelfActive(memberId)') &&
        block.includes('request.resource.data.memberId == memberId') &&
        block.includes('request.resource.data.status == "in_progress"') &&
        block.includes('request.resource.data.keys().hasOnly([') &&
        block.includes('request.resource.data.exercises.size() <= 20') &&
        block.includes('request.resource.data.memo.size() <= 1000') &&
        block.includes('request.resource.data.workoutParts.size() <= 4') &&
        block.includes('personalWorkoutTotalsValid(request.resource.data)') &&
        block.includes('request.resource.data.startedAt == resource.data.startedAt') &&
        block.includes('request.resource.data.createdAt == resource.data.createdAt') &&
        block.includes('resource.data.status == "in_progress"') &&
        block.includes('allow delete: if isTrainerOfMember(memberId) || isMemberSelfActive(memberId);');
    })()
  ],
  ['Firestore Rules: 개인운동 파생 합계 타입·범위 검증 헬퍼가 존재하고 규칙을 넓게 열지 않음',
    firestoreRules.includes('function personalWorkoutTotalsValid(data) {') &&
    firestoreRules.includes('data.totalExercises is number') &&
    firestoreRules.includes('data.totalSets is number') &&
    firestoreRules.includes('data.totalVolume is number') &&
    firestoreRules.includes('data.exerciseKeys is list') &&
    // 트레이너는 1차에서 개인운동을 수정하지 않는다(회원 본인만 create/update)
    !membersBlockFlat.slice(membersBlockFlat.indexOf('match /personalWorkouts/{workoutId}'), membersBlockFlat.indexOf('match /memberMessages/{messageId}')).includes('allow write')
  ],
  ['Firestore 규칙 테스트: 개인운동 보안 시나리오(타회원 읽기/쓰기·memberId 위조·필드 위조·과대 배열·타입·타임스탬프·비로그인) 케이스 존재',
    (() => {
      const testSrc = fs.readFileSync(path.join(root, 'tests', 'rules', 'firestore.rules.test.mjs'), 'utf8');
      return testSrc.includes('describe("6-3. personalWorkouts') &&
        testSrc.includes('[관리자] 회원 개인운동 read 허용') &&
        testSrc.includes('[회원 A] 회원 B 개인운동 read 차단') &&
        testSrc.includes('[회원 A] 회원 B 경로에 개인운동 write 차단') &&
        testSrc.includes('[진행중 회원] memberId 위조 차단') &&
        testSrc.includes('[진행중 회원] 허용되지 않은 필드 저장 차단') &&
        testSrc.includes('[진행중 회원] 과도한 종목·세트·부위·메모 차단') &&
        testSrc.includes('[진행중 회원] 잘못된 타입(문자 합계·문자 배열 아님) 차단') &&
        testSrc.includes('[진행중 회원] startedAt/createdAt/workoutDate 변조 차단') &&
        testSrc.includes('[진행중 회원] completed 상태로 바로 생성 차단') &&
        testSrc.includes('[휴식중 회원] 개인운동 read/write 차단') &&
        testSrc.includes('[비로그인] 개인운동 read/write 차단');
    })()
  ],
  ['개인운동 시나리오: 부위 미선택 시작 차단 / 빈 운동 종료 차단 / 세트 없는 종목 종료 차단',
    pwScenario('시작·종료 검증', lib => {
      const noPart = lib.validatePersonalWorkoutForComplete({ workoutParts: [], exercises: [{ name: '벤치프레스', sets: [{ weight: 20, reps: 10 }] }], startedAt: new Date(Date.now() - 600000) });
      const noEx = lib.validatePersonalWorkoutForComplete({ workoutParts: ['가슴'], exercises: [], startedAt: new Date(Date.now() - 600000) });
      const noSets = lib.validatePersonalWorkoutForComplete({ workoutParts: ['가슴'], exercises: [{ name: '벤치프레스', sets: [] }], startedAt: new Date(Date.now() - 600000) });
      const noStart = lib.validatePersonalWorkoutForComplete({ workoutParts: ['가슴'], exercises: [{ name: '벤치프레스', sets: [{ weight: 20, reps: 10 }] }], startedAt: null });
      const ok = lib.validatePersonalWorkoutForComplete({ workoutParts: ['가슴'], exercises: [{ name: '벤치프레스', sets: [{ weight: 20, reps: 10 }] }], startedAt: new Date(Date.now() - 600000) });
      return !noPart.ok && noPart.message.includes('운동 부위') &&
        !noEx.ok && !noSets.ok && !noStart.ok && ok.ok && ok.durationMinutes === 10;
    })[1]
  ],
  ['개인운동 시나리오: 음수·문자·과대 중량/횟수는 저장되지 않고 빈 세트는 완료 저장에서 정리됨',
    pwScenario('세트 검증', lib => {
      const ex = lib.normalizePersonalWorkoutExercise({ name: '벤치프레스', sets: [
        { weight: '20', reps: '12' },
        { weight: '-5', reps: '10' },      // 음수 중량 → null
        { weight: 'abc', reps: 'xyz' },    // 문자 → 세트 자체가 무효
        { weight: '99999', reps: '9999' }, // 과대값 → 상한으로 절단
        { weight: '', reps: '' },          // 빈 세트 → 제거
      ] }, 0);
      const kept = lib.normalizePersonalWorkoutExercise({ name: '벤치프레스', sets: [{ weight: '', reps: '' }] }, 0, { keepEmptySets: true });
      return ex.sets.length === 3 &&
        ex.sets[0].weight === 20 && ex.sets[0].reps === 12 && ex.sets[0].volume === 240 &&
        ex.sets[1].weight === null && ex.sets[1].reps === 10 && ex.sets[1].volume === 0 &&
        ex.sets[2].weight === lib.PERSONAL_WORKOUT_LIMITS.maxWeight && ex.sets[2].reps === lib.PERSONAL_WORKOUT_LIMITS.maxReps &&
        ex.sets.every((s, i) => s.setNumber === i + 1) &&
        kept.sets.length === 1;   // 진행 중 저장에서는 빈 세트 줄을 그대로 보존해 새로고침 후 복원된다
    })[1]
  ],
  ['개인운동 시나리오: 소수 중량(2.5/7.5/22.5) 정상 저장 + 중량 없는 운동 볼륨 0 처리',
    pwScenario('소수·맨몸', lib => {
      const ex = lib.normalizePersonalWorkoutExercise({ name: '덤벨 컬', sets: [{ weight: '2.5', reps: '12' }, { weight: '7.5', reps: '10' }, { weight: '22.5', reps: '8' }] }, 0);
      const bw = lib.normalizePersonalWorkoutExercise({ name: '플랭크', sets: [{ weight: '', reps: '30' }] }, 0);
      return ex.sets.map(s => s.weight).join(',') === '2.5,7.5,22.5' &&
        ex.totalVolume === 2.5 * 12 + 7.5 * 10 + 22.5 * 8 &&
        bw.sets[0].weight === null && bw.totalVolume === 0 && bw.totalSets === 1;
    })[1]
  ],
  ['개인운동 시나리오: 총 종목·총 세트·총 볼륨이 유효 세트만으로 일관되게 계산됨',
    pwScenario('합계 계산', lib => {
      const exercises = [
        lib.normalizePersonalWorkoutExercise({ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 15 }, { weight: 20, reps: 15 }] }, 0),
        lib.normalizePersonalWorkoutExercise({ name: '인클라인 덤벨프레스', sets: [{ weight: 12, reps: 12 }] }, 1),
        lib.normalizePersonalWorkoutExercise({ name: '', sets: [{ weight: 30, reps: 10 }] }, 2),   // 이름 없는 항목은 집계 제외
      ];
      const t = lib.calculatePersonalWorkoutTotals(exercises);
      return t.totalExercises === 2 && t.totalSets === 3 && t.totalVolume === 20 * 15 * 2 + 12 * 12;
    })[1]
  ],
  ['개인운동 시나리오: 마지막 동일 운동은 본인 완료 기록만 사용(진행 중·다른 운동 제외)',
    pwScenario('마지막 기록', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const workouts = [
        { id: 'w_progress', status: 'in_progress', workoutDate: daysAgoStr(0), exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 60, reps: 5 }] }] },
        { id: 'w_old', status: 'completed', workoutDate: daysAgoStr(20), exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 15, reps: 12 }] }] },
        { id: 'w_recent', status: 'completed', workoutDate: daysAgoStr(5), exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 15 }, { weight: 20, reps: 15 }, { weight: 22.5, reps: 10 }] }] },
        { id: 'w_other', status: 'completed', workoutDate: daysAgoStr(1), exercises: [{ name: '랫풀다운', sets: [{ weight: 40, reps: 12 }] }] },
      ].map(w => lib.normalizePersonalWorkout(w));
      const found = lib.getLastCompletedPersonalExerciseRecord(workouts, key, 'w_progress');
      const none = lib.getLastCompletedPersonalExerciseRecord(workouts, lib.canonicalExerciseKey('스쿼트'), null);
      // 세트별 값이 다르면 요약 한 줄로 왜곡하지 않고 세트 배열 전체를 그대로 돌려준다
      return found && found.workoutId === 'w_recent' && found.exercise.sets.length === 3 &&
        found.summary.uniform === false && found.summary.lines.length === 3 &&
        found.summary.lines[2] === '22.5kg × 10회' && none === null;
    })[1]
  ],
  ['개인운동 시나리오: 마지막 기록 판정에 다른 회원 기록이 섞이지 않음(본인 경로 목록만 입력)',
    // getLastCompletedPersonalExerciseRecord는 memberId나 Firestore를 전혀 참조하지 않고 호출부가 넘긴 배열만 훑는다.
    // 호출부는 항상 본인 경로(members/{본인}/personalWorkouts)에서 읽은 목록만 넘기므로 다른 회원 기록을 조회할 경로 자체가 없다.
    (() => {
      const fn = app.slice(app.indexOf('function getLastCompletedPersonalExerciseRecord'), app.indexOf('function buildPersonalExerciseCandidates'));
      const noCrossMember = !fn.includes('memberId') && !fn.includes('getDocs') && !fn.includes('collection(');
      const callSites = app.includes('getLastCompletedPersonalExerciseRecord(personalWorkouts,') &&
        app.includes('personalWorkouts={p.personalWorkouts||[]}') &&
        app.includes('personalWorkouts:completedPersonalWorkouts');
      return noCrossMember && callSites;
    })() &&
    pwScenario('본인 기록만', lib => lib.getLastCompletedPersonalExerciseRecord([], lib.canonicalExerciseKey('바벨 벤치프레스'), null) === null)[1]
  ],
  ['개인운동 시나리오: 세트가 모두 같으면 한 줄 요약, 다르면 세트별로 표시(왜곡 없음)',
    pwScenario('종목 요약', lib => {
      const same = lib.summarizePersonalWorkoutExercise(lib.normalizePersonalWorkoutExercise({ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 15 }, { weight: 20, reps: 15 }, { weight: 20, reps: 15 }, { weight: 20, reps: 15 }, { weight: 20, reps: 15 }] }, 0));
      const diff = lib.summarizePersonalWorkoutExercise(lib.normalizePersonalWorkoutExercise({ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 15 }, { weight: 20, reps: 15 }, { weight: 22.5, reps: 10 }] }, 0));
      const bw = lib.summarizePersonalWorkoutExercise(lib.normalizePersonalWorkoutExercise({ name: '플랭크', sets: [{ weight: '', reps: 30 }, { weight: '', reps: 30 }] }, 0));
      return same.uniform && same.text === '20kg × 15회 × 5세트' &&
        !diff.uniform && diff.lines.join(' / ') === '20kg × 15회 / 20kg × 15회 / 22.5kg × 10회' &&
        bw.uniform && bw.text === '30회 × 2세트';   // 중량 없는 운동에 잘못된 "0kg"를 붙이지 않는다
    })[1]
  ],
  ['개인운동 시나리오: 운동 시간·카드 요약 문구가 저장값 기준으로 일관되게 만들어짐',
    pwScenario('카드 요약', lib => {
      const started = new Date('2026-07-30T19:12:00+09:00');
      const completed = lib.normalizePersonalWorkout({
        id: 'w1', status: 'completed', workoutDate: '2026-07-30', workoutParts: ['가슴', '팔'],
        startedAt: started, endedAt: new Date(started.getTime() + 52 * 60000), durationMinutes: 52,
        exercises: [
          { name: '바벨 벤치프레스', muscleTop: '가슴', sets: [{ weight: 20, reps: 15 }, { weight: 20, reps: 15 }] },
          { name: '인클라인 덤벨프레스', muscleTop: '가슴', sets: [{ weight: 12, reps: 12 }] },
        ],
        memo: '가슴 자극이 잘 느껴졌음',
      });
      const sum = lib.buildPersonalWorkoutCardSummary(completed);
      const inProgress = lib.normalizePersonalWorkout({ id: 'w2', status: 'in_progress', workoutDate: '2026-07-30', startedAt: new Date(Date.now() - 25 * 60000), exercises: [] });
      const live = lib.buildPersonalWorkoutCardSummary(inProgress, Date.now());
      return sum.partsLabel === '가슴·팔' && sum.durationLabel === '52분' &&
        sum.metaLabel === '운동 2종목 · 총 3세트' && sum.volumeLabel === '총 744kg' &&
        // 진행 중 기록은 endedAt 없이 화면 현재 시각으로만 경과 시간을 계산한다(Firestore 쓰기 없음)
        live.durationLabel === '25분' && live.metaLabel === '기록된 운동 없음' &&
        lib.formatPersonalWorkoutDuration(75) === '1시간 15분';
    })[1]
  ],
  ['개인운동 시나리오: 운동 종목 후보가 본인 PT 기록을 최우선으로 포함하고 부위 이름은 후보에서 제외',
    pwScenario('종목 후보', lib => {
      const candidates = lib.buildPersonalExerciseCandidates({
        sessions: [{ date: daysAgoStr(3), exercises: [{ name: '스미스 벤치프레스' }] }],
        personalWorkouts: [{ status: 'completed', exercises: [{ name: '케이블 크로스오버' }] }],
      });
      const names = candidates.map(c => c.name);
      const first = candidates[0];
      return first.name === '스미스 벤치프레스' && first.source === 'session' &&
        names.includes('케이블 크로스오버') && names.includes('랫풀다운') && names.includes('벤치프레스') &&
        !names.includes('컬') && !names.includes('복부') && !names.includes('윗가슴') &&
        // 중복 표기는 정규화 키로 하나만 남는다
        new Set(candidates.map(c => c.key)).size === candidates.length;
    })[1]
  ],
  ['개인운동 시나리오: 기능운동(시간 기반) 분류값을 저장하지 않아 볼륨 규칙이 중량×횟수 하나로 유지됨',
    pwScenario('기능운동 배제', lib => {
      const ex = lib.normalizePersonalWorkoutExercise({ name: '오픈북', muscleTop: '기능', equipment: '기능', sets: [{ weight: 5, reps: 10 }] }, 0);
      return ex.muscleTop !== '기능' && ex.equipment !== '기능' && ex.totalVolume === 50;
    })[1]
  ],

  // ── 개인운동 2차 5단계: 운동 종목 검색 시트 iOS 키보드 대응 ────────────────────────
  ['키보드 시트 레이아웃: visualViewport 미지원 환경에서는 기존 레이아웃 그대로(오프셋 0, 높이 제한 없음)',
    ksScenario('미지원 fallback', lib => {
      const r = lib.computeKeyboardSheetLayout({});
      return r.keyboardInset === 0 && r.availableHeight === null;
    })[1]
  ],
  ['키보드 시트 레이아웃: 키보드가 닫혀 있으면(레이아웃=뷰포트 높이) 오프셋 0',
    ksScenario('키보드 닫힘', lib => {
      const r = lib.computeKeyboardSheetLayout({ layoutHeight: 844, viewportHeight: 844, offsetTop: 0 });
      return r.keyboardInset === 0 && r.availableHeight === null;
    })[1]
  ],
  ['키보드 시트 레이아웃: 키보드가 열리면(뷰포트 축소) 오프셋만큼 시트를 올리고 가용 높이를 제한',
    ksScenario('키보드 열림', lib => {
      const r = lib.computeKeyboardSheetLayout({ layoutHeight: 844, viewportHeight: 480, offsetTop: 0 });
      return r.keyboardInset === 364 && r.availableHeight === 468;
    })[1]
  ],
  ['키보드 시트 레이아웃: visualViewport.offsetTop이 0이 아니어도(포커스로 인한 뷰포트 이동) 오프셋을 정확히 계산',
    ksScenario('offsetTop != 0', lib => {
      const r = lib.computeKeyboardSheetLayout({ layoutHeight: 844, viewportHeight: 460, offsetTop: 20 });
      return r.keyboardInset === 364 && r.availableHeight !== null;
    })[1]
  ],
  ['키보드 시트 레이아웃: 가로모드처럼 레이아웃 높이가 작아도 같은 공식으로 동작(가용 높이 최소 260px 보장)',
    ksScenario('가로모드', lib => {
      const r = lib.computeKeyboardSheetLayout({ layoutHeight: 400, viewportHeight: 200, offsetTop: 0 });
      return r.keyboardInset === 200 && r.availableHeight === 260;
    })[1]
  ],
  ['운동 종목 검색 시트: 배경 스크롤 잠금(useLockBodyScroll)이 열릴 때 scrollY를 저장하고 닫힐 때 원래 위치로 복원',
    (() => {
      const comp = app.slice(app.indexOf('function useLockBodyScroll'), app.indexOf('function MemberBottomSheet('));
      return comp.includes('body.style.position="fixed"') && comp.includes('body.style.top=`-${scrollY}px`') &&
        comp.includes('window.scrollTo(0,scrollY)');
    })()
  ],
  ['운동 종목 검색 시트: 제목·검색창(pw-picker-fixed)은 고정하고 검색 결과(pw-picker-scroll)만 내부 스크롤',
    (() => {
      const comp = app.slice(app.indexOf('function MemberPersonalExercisePicker'), app.indexOf('// 개인운동 기록 화면 — 시작(부위 선택)'));
      return comp.includes('className="pw-picker-fixed"') && comp.includes('className="pw-picker-scroll"') &&
        comp.includes('useKeyboardAwareViewport(open)') && comp.includes('useLockBodyScroll(open)');
    })()
  ],
  ['운동 종목 검색 시트: 검색 input은 연락처 자동완성 대신 검색 입력으로 동작하는 속성을 사용',
    (() => {
      const comp = app.slice(app.indexOf('function MemberPersonalExercisePicker'), app.indexOf('// 개인운동 기록 화면 — 시작(부위 선택)'));
      return comp.includes('name="exercise-query"') && comp.includes('autoComplete="off"') &&
        comp.includes('autoCapitalize="none"') && comp.includes('enterKeyHint="search"');
    })()
  ],
  ['키보드 시트 레이아웃: 값 변화가 임계값(8px) 미만이면 리렌더 신호를 보내지 않아 미세 진동으로 흔들리지 않음',
    ksScenario('임계값 미만 변화 무시', lib => {
      const prev = { keyboardInset: 364, availableHeight: 468 };
      const next = { keyboardInset: 366, availableHeight: 470 }; // 2px 차이 — iOS 애니메이션 중 흔한 미세 변화
      return lib.keyboardSheetLayoutChanged(prev, next) === false;
    })[1]
  ],
  ['키보드 시트 레이아웃: 값 변화가 임계값(8px) 이상이면 리렌더 신호를 보냄',
    ksScenario('임계값 이상 변화 반영', lib => {
      const prev = { keyboardInset: 364, availableHeight: 468 };
      const next = { keyboardInset: 300, availableHeight: 530 }; // 검색 결과 변화가 아니라 실제 키보드 높이 변화
      return lib.keyboardSheetLayoutChanged(prev, next) === true;
    })[1]
  ],
  ['키보드 시트 레이아웃: 키보드가 열림/닫힘으로 전환될 때(availableHeight null↔값)는 임계값과 무관하게 항상 반영',
    ksScenario('열림/닫힘 전환', lib => {
      const closed = { keyboardInset: 0, availableHeight: null };
      const opened = { keyboardInset: 364, availableHeight: 468 };
      return lib.keyboardSheetLayoutChanged(closed, opened) === true && lib.keyboardSheetLayoutChanged(opened, closed) === true;
    })[1]
  ],
  ['운동 종목 검색 시트: 키보드가 열리면 max-height뿐 아니라 height도 동일 값으로 고정해, 검색 결과 개수가 바뀌어도 시트 외곽 크기가 변하지 않음',
    (() => {
      const comp = app.slice(app.indexOf('function MemberPersonalExercisePicker'), app.indexOf('// 개인운동 기록 화면 — 시작(부위 선택)'));
      const css = app.slice(app.indexOf('/* 운동 종목 검색 시트 — iOS 키보드 대응'), app.indexOf('/* 섹션 헤더 */'));
      return comp.includes('style["--pw-sheet-h"]') && css.includes('height:var(--pw-sheet-h,auto)');
    })()
  ],
  ['운동 종목 검색 시트: 시트 본문(pw-picker-body)은 자체 스크롤을 막고 결과 목록(pw-picker-scroll)만 flex:1로 남는 공간을 채워 스크롤',
    (() => {
      const css = app.slice(app.indexOf('/* 운동 종목 검색 시트 — iOS 키보드 대응'), app.indexOf('/* 섹션 헤더 */'));
      return css.includes('.mv2-sheet-body.pw-picker-body{display:flex;flex-direction:column;min-height:0;overflow-y:hidden}') &&
        css.includes('.pw-picker-scroll{flex:1;min-height:0;overflow-y:auto');
    })()
  ],

  // ── 개인운동 2차 1단계: PT 수업 ↔ 개인운동 같은 운동 비교 ──────────────────────────
  // 회원앱(PT 수업 상세·개인운동 상세)과 관리자 "최근 개인운동" 카드가 모두 이 헬퍼 하나만 쓴다.
  // 비교 결과는 어디에도 저장하지 않고 원본에서 매번 계산하므로, 아래 시나리오가 곧 화면 표시 결과다.
  ['비교 시나리오: canonicalExerciseKey가 정확히 같은 운동만 매칭하고 유사한 다른 운동은 매칭하지 않음',
    pwScenario('동일 운동 판정', lib => {
      const idx = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [
          { name: '벤치 프레스', sets: [{ weight: 20, reps: 12 }] },
          { name: '인클라인 벤치프레스', sets: [{ weight: 30, reps: 10 }] },
          { name: '바벨 컬', sets: [{ weight: 20, reps: 10 }] },
        ] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [
          { exerciseKey: lib.canonicalExerciseKey('Bench Press'), name: 'Bench Press', sets: [{ weight: 22.5, reps: 10 }] },
          { exerciseKey: lib.canonicalExerciseKey('덤벨 컬'), name: '덤벨 컬', sets: [{ weight: 20, reps: 12 }] },
        ] }],
      });
      // "벤치 프레스" ↔ "Bench Press"는 EXERCISE_LIBRARY 별칭으로 같은 canonical key → 매칭
      const matched = idx.getComparison('personal', 'p1', { name: 'Bench Press' });
      // 인클라인 벤치프레스(이름 부분 포함)·바벨 컬 vs 덤벨 컬(기구만 다름)은 서로 다른 운동 → 매칭 없음
      const incline = idx.getComparison('pt', 's1', { name: '인클라인 벤치프레스' });
      const curl = idx.getComparison('pt', 's1', { name: '바벨 컬' });
      return !!matched && matched.exerciseKey === lib.canonicalExerciseKey('벤치프레스') && incline === null && curl === null;
    })[1]
  ],
  ['비교 시나리오: PT가 더 과거면 "PT → 개인운동", 개인운동이 더 과거면 "개인운동 → PT"로 방향이 뒤집힘',
    pwScenario('비교 방향', lib => {
      const ptEx = { name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 12 }, { weight: 20, reps: 12 }, { weight: 20, reps: 12 }] };
      const pwEx = { exerciseKey: lib.canonicalExerciseKey('바벨 벤치프레스'), name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }, { weight: 22.5, reps: 10 }, { weight: 22.5, reps: 10 }] };
      const ptFirst = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [ptEx] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [pwEx] }],
      }).getComparison('personal', 'p1', pwEx);
      const pwFirst = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-25', isPublished: true, exercises: [ptEx] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-20', status: 'completed', exercises: [pwEx] }],
      }).getComparison('pt', 's1', ptEx);
      return ptFirst.previous.kind === 'pt' && ptFirst.recent.kind === 'personal' &&
        ptFirst.directionLabel === '7월 20일 PT 수업 → 7월 25일 개인운동' && ptFirst.isCurrentRecent === true &&
        pwFirst.previous.kind === 'personal' && pwFirst.recent.kind === 'pt' &&
        pwFirst.directionLabel === '7월 20일 개인운동 → 7월 25일 PT 수업' && pwFirst.isCurrentRecent === true;
    })[1]
  ],
  ['비교 시나리오: 최고 중량 증가·감소가 부호까지 정확히 표시됨',
    pwScenario('최고 중량', lib => {
      const prev = lib.buildExercisePerformanceSnapshot({ name: '스쿼트', sets: [{ weight: 60, reps: 10 }] });
      const up = lib.buildExercisePerformanceSnapshot({ name: '스쿼트', sets: [{ weight: 62.5, reps: 10 }] });
      const down = lib.buildExercisePerformanceSnapshot({ name: '스쿼트', sets: [{ weight: 55, reps: 10 }] });
      const same = lib.buildExercisePerformanceSnapshot({ name: '스쿼트', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }] });
      const upLabels = lib.compareExercisePerformance(prev, up).metrics.map(m => m.label);
      const downCmp = lib.compareExercisePerformance(prev, down);
      const sameCmp = lib.compareExercisePerformance(prev, same);
      return prev.topWeight === 60 && upLabels.includes('중량 +2.5kg') &&
        downCmp.metrics.some(m => m.key === 'weight' && m.label === '중량 -5kg' && m.dir === 'down') &&
        // 중량이 같으면 중량 문구를 만들지 않고 weightSame으로만 표시한다
        sameCmp.weightSame === true && !sameCmp.metrics.some(m => m.key === 'weight');
    })[1]
  ],
  ['비교 시나리오: 동일 중량 최고 반복만 비교하고, 공통 중량이 없으면 반복 비교를 제외함',
    pwScenario('동일 중량 반복', lib => {
      const prev = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 20, reps: 10 }, { weight: 30, reps: 6 }] });
      const recent = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 20, reps: 12 }, { weight: 30, reps: 6 }] });
      const noCommon = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 25, reps: 15 }, { weight: 35, reps: 15 }] });
      const withCommon = lib.compareExercisePerformance(prev, recent);
      const without = lib.compareExercisePerformance(prev, noCommon);
      // 공통 중량 중 가장 무거운 30kg은 반복이 같으므로, 변화가 있는 20kg 기준으로만 문구가 나오면 안 된다 —
      // 기준은 "공통 중량 중 최고 중량"이라 30kg(변화 0)이 선택돼 반복 문구 자체가 생기지 않아야 한다.
      const prev2 = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 20, reps: 10 }] });
      const recent2 = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 20, reps: 12 }] });
      const single = lib.compareExercisePerformance(prev2, recent2);
      return !withCommon.metrics.some(m => m.key === 'reps') &&
        single.metrics.some(m => m.key === 'reps' && m.label === '20kg 기준 반복 +2회') &&
        !without.metrics.some(m => m.key === 'reps');
    })[1]
  ],
  ['비교 시나리오: 총 유효 세트 변화는 기존 유효 세트 판정(횟수 1회 이상)으로만 계산됨',
    pwScenario('세트 변화', lib => {
      // 빈 세트·횟수 누락 줄은 입력 줄 개수로 세지 않는다
      const prev = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: null }, {}] });
      const recent = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }] });
      return prev.setCount === 2 && recent.setCount === 3 &&
        lib.compareExercisePerformance(prev, recent).metrics.some(m => m.key === 'sets' && m.label === '세트 +1');
    })[1]
  ],
  ['비교 시나리오: 볼륨 변화율이 기존 볼륨 규칙(중량×횟수)으로 계산되고 이전 볼륨 0이면 계산하지 않음',
    pwScenario('볼륨 변화율', lib => {
      const prev = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100, reps: 12 }] });   // 1,200kg
      const recent = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100, reps: 15 }] }); // 1,500kg
      const pct = lib.compareExercisePerformance(prev, recent).metrics.find(m => m.key === 'volume');
      // 맨몸(중량 없음) → 볼륨 0이라 퍼센트 계산 자체를 하지 않는다(0으로 나눈 Infinity 방지)
      const bwPrev = lib.buildExercisePerformanceSnapshot({ name: '푸쉬업', sets: [{ reps: 15 }] });
      const bwRecent = lib.buildExercisePerformanceSnapshot({ name: '푸쉬업', sets: [{ reps: 20 }] });
      const bwCmp = lib.compareExercisePerformance(bwPrev, bwRecent);
      // 1% 미만의 미세한 차이는 과장하지 않고 표시하지 않는다
      const tinyPrev = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100, reps: 100 }] });
      const tinyRecent = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100.2, reps: 100 }] });
      const tiny = lib.compareExercisePerformance(tinyPrev, tinyRecent);
      return prev.totalVolume === 1200 && recent.totalVolume === 1500 && pct.label === '볼륨 +25%' &&
        bwPrev.totalVolume === 0 && !bwCmp.metrics.some(m => m.key === 'volume') &&
        !tiny.metrics.some(m => m.key === 'volume');
    })[1]
  ],
  ['비교 시나리오: 맨몸 운동에 0kg 향상 문구를 만들지 않고 NaN·Infinity가 표시되지 않음',
    pwScenario('맨몸·NaN 방어', lib => {
      const prev = lib.buildExercisePerformanceSnapshot({ name: '푸쉬업', sets: [{ weight: null, reps: 15 }, { weight: 0, reps: 15 }] });
      const recent = lib.buildExercisePerformanceSnapshot({ name: '푸쉬업', sets: [{ weight: null, reps: 20 }, { weight: null, reps: 18 }, { weight: null, reps: 15 }] });
      const cmp = lib.compareExercisePerformance(prev, recent);
      const all = [...cmp.metrics.map(m => m.label), lib.formatExerciseSnapshotLine(prev), lib.formatExerciseSnapshotLine(recent)].join(' ');
      return prev.hasWeight === false && !/0kg|NaN|Infinity|undefined|null/.test(all) &&
        cmp.metrics.some(m => m.label === '반복 +5회') && cmp.metrics.some(m => m.label === '세트 +1') &&
        lib.formatExerciseSnapshotLine(prev) === '15회 · 2세트';
    })[1]
  ],
  ['비교 시나리오: 진행 중 개인운동·비공개 PT·유효 세트 없는 기록은 비교 대상에서 제외됨',
    pwScenario('제외 조건', lib => {
      const ex = { name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] };
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const pwEx = { exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] };
      // 비공개(isPublished !== true) PT만 있으면 개인운동 쪽 비교가 생기지 않는다
      const draftOnly = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: false, exercises: [ex] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [pwEx] }],
      }).getComparison('personal', 'p1', pwEx);
      // 진행 중(in_progress) 개인운동만 있으면 PT 쪽 비교가 생기지 않는다
      const inProgressOnly = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [ex] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'in_progress', exercises: [pwEx] }],
      }).getComparison('pt', 's1', ex);
      // 유효 세트(횟수 1회 이상)가 없는 운동은 양쪽 모두 비교 대상이 아니다
      const emptySets = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 0 }, {}] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [pwEx] }],
      }).getComparison('personal', 'p1', pwEx);
      return draftOnly === null && inProgressOnly === null && emptySets === null;
    })[1]
  ],
  ['비교 시나리오: 같은 기록 안에 동일 운동이 두 번 있으면 세트를 합쳐 하나의 수행으로 비교함',
    pwScenario('중복 운동 병합', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const dupEx = { exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }, { weight: 20, reps: 10 }] };
      const idx = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        // 같은 기록 안 앞뒤로 나눠 기록된 동일 운동 2건 → 4세트 · 볼륨 800kg 하나로 합산
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [dupEx, dupEx] }],
      });
      const cmp = idx.getComparison('personal', 'p1', dupEx);
      return cmp.recent.snapshot.setCount === 4 && cmp.recent.snapshot.totalVolume === 800 &&
        cmp.previous.snapshot.setCount === 1 && cmp.metrics.some(m => m.label === '세트 +3');
    })[1]
  ],
  ['비교 시나리오: 상대 기록이 없거나 지표 변화가 하나도 없으면 비교 영역을 만들지 않음',
    pwScenario('빈 비교 방지', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const sets = [{ weight: 20, reps: 10 }, { weight: 20, reps: 10 }];
      // PT만 존재 / 개인운동만 존재 → null
      const ptOnly = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets }] }],
        personalWorkouts: [],
      }).getComparison('pt', 's1', { name: '바벨 벤치프레스' });
      const pwOnly = lib.buildMemberExerciseComparisonIndex({
        sessions: [],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets }] }],
      }).getComparison('personal', 'p1', { exerciseKey: key });
      // 두 기록이 완전히 동일하면 변화 지표가 0개 → 비교 영역 없음
      const identical = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets }] }],
      }).getComparison('personal', 'p1', { exerciseKey: key });
      return ptOnly === null && pwOnly === null && identical === null;
    })[1]
  ],
  ['비교 시나리오: 모두 증가면 "수행 증가" 배지, 감소가 섞이면 중립 문구만 사용(퇴보 표현 금지)',
    pwScenario('문구 톤', lib => {
      const prev = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }] });
      const allUp = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 110, reps: 10 }, { weight: 110, reps: 10 }, { weight: 110, reps: 10 }] });
      const mixed = lib.buildExercisePerformanceSnapshot({ name: '레그프레스', sets: [{ weight: 110, reps: 5 }] });
      const up = lib.formatExerciseComparisonSummary(lib.compareExercisePerformance(prev, allUp));
      const mix = lib.formatExerciseComparisonSummary(lib.compareExercisePerformance(prev, mixed));
      const text = [...up.lines, ...mix.lines, up.badgeLabel || '', mix.neutralNote || ''].join(' ');
      return up.badgeLabel === '수행 증가' && up.tone === 'up' && up.headline.length <= 2 &&
        mix.badgeLabel === null && mix.neutralNote === '이전 기록과 차이가 있어요' &&
        !/퇴보|향상됐|떨어졌|실력/.test(text);
    })[1]
  ],
  ['비교 시나리오: 중량이 같으면 "중량은 같고 …" 형태로 조건을 함께 표시함',
    pwScenario('중량 동일 문구', lib => {
      const prev = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 20, reps: 10 }] });
      const recent = lib.buildExercisePerformanceSnapshot({ name: '랫풀다운', sets: [{ weight: 20, reps: 12 }] });
      const sum = lib.formatExerciseComparisonSummary(lib.compareExercisePerformance(prev, recent));
      return sum.headline[0] === '중량은 같고 20kg 기준 반복 +2회';
    })[1]
  ],
  ['비교 시나리오: 같은 날짜 기록과 Timestamp/문자열 날짜 혼재를 안전하게 처리함',
    pwScenario('날짜 방어', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const pwEx = { exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }] };
      const sameDay = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-25', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', exercises: [pwEx] }],
      }).getComparison('personal', 'p1', pwEx);
      // Firestore Timestamp 형태(toDate)로 들어와도 같은 날짜 키로 변환된다
      const ts = { toDate: () => new Date(2026, 6, 25, 12, 0, 0) };
      return sameDay.sameDay === true && sameDay.previous.kind === 'pt' && sameDay.recent.kind === 'personal' &&
        sameDay.directionLabel === '7월 25일 PT 수업 · 개인운동 (같은 날)' &&
        lib.getExerciseRecordDateKey({ workoutDate: ts }) === '2026-07-25' &&
        lib.getExerciseRecordDateKey({}) === '';
    })[1]
  ],
  ['비교 시나리오: 이두·삼두 및 레거시 "팔" 부위 기록도 정상적으로 비교됨',
    pwScenario('이두·삼두·레거시 팔', lib => {
      const key = lib.canonicalExerciseKey('덤벨 컬');
      const pwEx = { exerciseKey: key, name: '덤벨 컬', muscleTop: '팔-이두근', sets: [{ weight: 12, reps: 12 }] };
      const cmp = lib.buildMemberExerciseComparisonIndex({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '덤벨 컬', muscleTop: '팔', sets: [{ weight: 10, reps: 12 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-25', status: 'completed', workoutParts: ['팔'], exercises: [pwEx] }],
      }).getComparison('personal', 'p1', pwEx);
      // 부위(muscleTop) 표기가 달라도 비교 기준은 운동명 canonical key 하나뿐이다
      return !!cmp && cmp.metrics.some(m => m.label === '중량 +2kg');
    })[1]
  ],
  ['비교 UI: 회원앱 개인운동 상세는 비교를 붙여도 sessionReads/markSessionsAsRead를 호출하지 않음',
    app.includes('function MemberExerciseComparison') &&
    // 개인운동 카드 렌더 경로(renderPersonal)에는 markSessionsAsRead/markSessionDetailRead 호출이 없다
    !/const renderPersonal=[\s\S]{0,400}?markSession/.test(app) &&
    // PT 수업 카드의 기존 확인 기록 호출은 그대로 유지된다
    app.includes('markSessionDetailRead(s.id,"session_content_open")') &&
    app.includes('markSessionDetailRead(latestId,"auto_expanded_recent_session")')
  ],
  ['비교 UI: 회원앱 PT 수업 상세는 "웨이트 트레이닝" 섹션에만 비교를 붙임(움직임 준비 제외)',
    app.includes('<ExerciseReportSection title="웨이트 트레이닝"') &&
    /title="웨이트 트레이닝"[^/]*comparisonIndex=\{comparisonIndex\}/.test(app) &&
    !/title="움직임 준비"[^/]*comparisonIndex/.test(app)
  ],
  ['비교 UI: 관리자 "최근 개인운동" 카드는 조회 전용이며 비교도 이미 로드된 목록만 사용함',
    app.includes('const cmpIndex = buildMemberExerciseComparisonIndex({ sessions, personalWorkouts: completed })') &&
    app.includes('cmpIndex.getComparison("personal", w.id, e)') &&
    // 비교를 위해 새 Firestore 조회를 추가하지 않았다(카드 안 getPersonalWorkouts/getSessions 호출 없음)
    !/hub-sec-personal[\s\S]{0,4000}?(getSessions\(|getPersonalWorkouts\()/.test(app)
  ],
  // ── 개인운동 2차 2단계: 관리자 "오늘 수업 준비" 카드 ──────────────────────────────
  // 조회 + 추천 표시까지만이다. 세트·중량·종목 자동 입력, 자동 저장, PT 기록 수정은 절대 하지 않는다.
  ['수업 준비 시나리오: 완료된 개인운동이 없으면 카드 데이터를 만들지 않음(빈 카드 금지)',
    pwScenario('개인운동 없음', lib => {
      const ex = { name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] };
      const sessions = [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [ex] }];
      const none = lib.buildSessionPrepSummary({ sessions, personalWorkouts: [], todayKey: '2026-07-31' });
      // 진행 중(in_progress)만 있으면 최근 completed가 없으므로 역시 null
      const onlyInProgress = lib.buildSessionPrepSummary({
        sessions, personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-30', status: 'in_progress', exercises: [ex] }], todayKey: '2026-07-31' });
      // 유효 세트가 하나도 없는 완료 기록도 보여줄 내용이 없어 null
      const noValidSets = lib.buildSessionPrepSummary({
        sessions, personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-30', status: 'completed', exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 0 }] }] }], todayKey: '2026-07-31' });
      return none === null && onlyInProgress === null && noValidSets === null;
    })[1]
  ],
  ['수업 준비 시나리오: 최근 completed 1건만 사용하고 날짜·경과일·부위·종목 수를 표시',
    pwScenario('최근 1건·경과일·부위', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const prep = lib.buildSessionPrepSummary({
        sessions: [],
        personalWorkouts: [
          { id: 'old', workoutDate: '2026-07-10', status: 'completed', workoutParts: ['등'], exercises: [{ exerciseKey: lib.canonicalExerciseKey('랫풀다운'), name: '랫풀다운', sets: [{ weight: 40, reps: 10 }] }] },
          // 복수 부위 + 진행 중 기록이 더 최근이어도 completed 최신 1건만 쓴다
          { id: 'p1', workoutDate: '2026-07-29', status: 'completed', workoutParts: ['가슴', '삼두'], exercises: [
            { exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }, { weight: 22.5, reps: 10 }, { weight: 22.5, reps: 10 }] },
            { exerciseKey: lib.canonicalExerciseKey('케이블 프레스다운'), name: '케이블 프레스다운', sets: [{ weight: 15, reps: 12 }] },
          ] },
          { id: 'p2', workoutDate: '2026-07-30', status: 'in_progress', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 30, reps: 10 }] }] },
        ],
        todayKey: '2026-07-31',
      });
      return prep.workoutId === 'p1' && prep.dateLabel === '7월 29일' &&
        prep.elapsedDays === 2 && prep.elapsedLabel === '2일 전' && prep.elapsedNote === '개인운동 후 2일 경과' &&
        prep.partsLabel === '가슴·삼두' && prep.exerciseCount === 2 && prep.totalSets === 4 &&
        // 대표 운동 = 볼륨 최대 종목(675kg > 180kg)
        prep.topExercise.name === '바벨 벤치프레스' && prep.topExercise.line === '22.5kg × 10회 · 3세트' &&
        prep.otherExerciseNames.length === 1 && prep.otherExerciseNames[0] === '케이블 프레스다운';
    })[1]
  ],
  ['수업 준비 시나리오: 경과일 라벨이 오늘/1일 전/7일 전으로 정확히 계산됨',
    pwScenario('경과일 계산', lib => {
      return lib.getDayDiffFromDateKeys('2026-07-31', '2026-07-31') === 0 &&
        lib.getDayDiffFromDateKeys('2026-07-30', '2026-07-31') === 1 &&
        lib.getDayDiffFromDateKeys('2026-07-24', '2026-07-31') === 7 &&
        // 월 경계도 정상 계산
        lib.getDayDiffFromDateKeys('2026-06-30', '2026-07-01') === 1 &&
        lib.formatElapsedDayLabel(0) === '오늘' && lib.formatElapsedDayLabel(1) === '1일 전' && lib.formatElapsedDayLabel(7) === '7일 전' &&
        // 미래 날짜(음수)·잘못된 날짜에도 이상한 문구가 나오지 않는다
        lib.formatElapsedDayLabel(-3) === '오늘' && lib.getDayDiffFromDateKeys('', '2026-07-31') === null &&
        lib.formatElapsedDayLabel(null) === null;
    })[1]
  ],
  // 추천 시작 중량은 "가장 최근에 실제로 수행한 기록의 최고 중량"이다.
  // 과거 기록이 더 무거워도 추천값으로 승격하지 않는다(폐기된 max 규칙이 되살아나지 않는지 함께 확인).
  ['수업 준비 시나리오: 추천 시작 중량 = 가장 최근 수행 기록의 최고 중량 (개인운동이 최근)',
    pwScenario('추천 중량 · 개인운동 최근', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const make = (ptW, pwW) => lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: ptW, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: pwW, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      const up = make(20, 22.5);   // 과거 PT 20 → 최근 개인 22.5 → 22.5
      const down = make(25, 20);   // 과거 PT 25 → 최근 개인 20 → 20 (과거 25kg으로 올리지 않는다)
      return up.weightLabel === '22.5kg' && up.sourceKind === 'personal' &&
        up.sourceLabel === '7월 29일 개인운동 기준' && up.orderBy === 'date' && up.previousHigherNote === null &&
        down.weightLabel === '20kg' && down.sourceKind === 'personal' && down.sourceLabel === '7월 29일 개인운동 기준' &&
        // 더 무거웠던 과거 PT 기록은 참고 문구로만 노출된다
        down.previousHigherNote === '이전 PT 수업 최고 중량 25kg' &&
        down.ptWeightLabel === '25kg' && down.personalWeightLabel === '20kg' && down.ptDateLabel === '7월 20일';
    })[1]
  ],
  ['수업 준비 시나리오: 추천 시작 중량 = 가장 최근 수행 기록의 최고 중량 (PT가 최근)',
    pwScenario('추천 중량 · PT 최근', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const make = (pwW, ptW) => lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: ptW, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-20', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: pwW, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      const up = make(20, 25);     // 과거 개인 20 → 최근 PT 25 → 25
      const down = make(25, 20);   // 과거 개인 25 → 최근 PT 20 → 20 (과거 25kg으로 올리지 않는다)
      return up.weightLabel === '25kg' && up.sourceKind === 'pt' && up.sourceLabel === '7월 29일 PT 수업 기준' &&
        up.previousHigherNote === null &&
        down.weightLabel === '20kg' && down.sourceKind === 'pt' && down.sourceLabel === '7월 29일 PT 수업 기준' &&
        down.previousHigherNote === '이전 개인운동 최고 중량 25kg';
    })[1]
  ],
  ['수업 준비 시나리오: 폐기된 max 규칙이 되살아나지 않음 — 과거 최고 중량은 절대 추천값이 되지 않는다',
    pwScenario('max 규칙 폐기', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const cases = [
        // [PT날짜, PT중량, 개인날짜, 개인중량, 기대 추천] — 앞 2건은 max(=100)과 결과가 다르다
        ['2026-07-20', 100, '2026-07-29', 60, 60],
        ['2026-07-29', 60, '2026-07-20', 100, 60],
        ['2026-07-20', 40, '2026-07-29', 80, 80],
      ];
      return cases.every(([ptDate, ptW, pwDate, pwW, expected]) => {
        const rec = lib.buildSessionPrepSummary({
          sessions: [{ id: 's1', date: ptDate, isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: ptW, reps: 10 }] }] }],
          personalWorkouts: [{ id: 'p1', workoutDate: pwDate, status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: pwW, reps: 10 }] }] }],
          todayKey: '2026-07-31',
        }).recommendation;
        return rec.undecided === false && rec.weight === expected;
      }) &&
      // 앞 2건은 실제로 max와 결과가 달라야 의미가 있다
      cases.slice(0, 2).every(([, ptW, , pwW, expected]) => Math.max(ptW, pwW) !== expected);
    })[1]
  ],
  // PT session 저장 코드(addSession/updateSession, db.js)를 확인한 결과 session 문서에는
  // createdAt(생성)·updatedAt(수정)·publishedAt(전송) 시각만 저장되고 셋 다 "실제 수업 수행 시각"이
  // 아니다. completedAt은 session 문서에 아예 기록되지 않는다(personalWorkouts·온보딩 전용).
  // 따라서 PT 쪽 같은 날짜 순서 판정에는 performedAt만 허용한다(현재 어떤 저장 경로도 채우지 않지만,
  // 향후 실제 수행 시각 필드가 추가된다면 이 이름을 쓴다는 전제로 유일하게 허용한다).
  ['수업 준비 시나리오: 같은 날 PT performedAt이 개인운동 endedAt보다 이르면 개인운동이 최근',
    pwScenario('같은 날 시각 판정 · 개인운동 최근', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, performedAt: '2026-07-29T10:00:00.000Z',
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: '2026-07-29T18:00:00.000Z',
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      // 개인운동(20kg)이 PT(25kg)보다 늦게 끝났다 → 더 가벼워도 20kg을 추천한다
      return rec.undecided === false && rec.weightLabel === '20kg' &&
        rec.orderBy === 'time' && rec.sourceKind === 'personal' &&
        rec.previousHigherNote === '이전 PT 수업 최고 중량 25kg';
    })[1]
  ],
  ['수업 준비 시나리오: 같은 날 PT performedAt이 개인운동 endedAt보다 늦으면 PT가 최근',
    pwScenario('같은 날 시각 판정 · PT 최근', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, performedAt: '2026-07-29T20:00:00.000Z',
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: '2026-07-29T18:00:00.000Z',
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      // Firestore Timestamp(toDate) 형태도 동일하게 처리되는지 함께 확인
      const ts = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, performedAt: { toDate: () => new Date(Date.UTC(2026, 6, 29, 20)) },
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: { toDate: () => new Date(Date.UTC(2026, 6, 29, 18)) },
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return rec.undecided === false && rec.weightLabel === '25kg' && rec.orderBy === 'time' && rec.sourceKind === 'pt' &&
        ts.weightLabel === '25kg' && ts.orderBy === 'time';
    })[1]
  ],
  ['수업 준비 시나리오: 같은 날 PT publishedAt만 있고 performedAt이 없으면 순서 불명(전송 시각은 신뢰하지 않음)',
    pwScenario('같은 날 publishedAt만', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, publishedAt: '2026-07-29T21:00:00.000Z',
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: '2026-07-29T18:00:00.000Z',
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return rec.undecided === true && rec.weight === null && rec.orderBy === null &&
        rec.undecidedNote === '같은 날 기록 · 직접 확인 필요' &&
        rec.ptWeightLabel === '25kg' && rec.personalWeightLabel === '20kg';
    })[1]
  ],
  ['수업 준비 시나리오: 같은 날 PT createdAt만 늦게 존재해도 순서 불명(생성 시각은 신뢰하지 않음)',
    pwScenario('같은 날 createdAt만', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, createdAt: '2026-07-29T23:00:00.000Z',
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: '2026-07-29T18:00:00.000Z',
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return rec.undecided === true && rec.weight === null && rec.orderBy === null &&
        rec.undecidedNote === '같은 날 기록 · 직접 확인 필요';
    })[1]
  ],
  ['수업 준비 시나리오: 같은 날 PT updatedAt만 늦게 존재해도 순서 불명(수정 시각은 신뢰하지 않음)',
    pwScenario('같은 날 updatedAt만', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, updatedAt: '2026-07-29T23:00:00.000Z',
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: '2026-07-29T18:00:00.000Z',
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return rec.undecided === true && rec.weight === null && rec.orderBy === null &&
        rec.undecidedNote === '같은 날 기록 · 직접 확인 필요';
    })[1]
  ],
  ['수업 준비 시나리오: 같은 날짜 + 어떤 시각 필드도 없으면 순서 불명(기존 동작 유지)',
    pwScenario('같은 날 순서 불명', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-29', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return rec.undecided === true && rec.weight === null && rec.weightLabel === null &&
        rec.undecidedNote === '같은 날 기록 · 직접 확인 필요' && rec.sourceKind === null &&
        // 참고 정보(두 기록의 날짜·중량)는 그대로 제공한다
        rec.ptWeightLabel === '25kg' && rec.personalWeightLabel === '20kg';
    })[1]
  ],
  ['수업 준비 시나리오: 가장 최근 기록에 유효 중량이 없으면 과거 중량으로 대체하지 않고 추천을 숨김',
    pwScenario('최근 기록 중량 없음', lib => {
      const key = lib.canonicalExerciseKey('푸쉬업');
      // 과거 PT는 가중 20kg, 최근 개인운동은 맨몸 → 최근 기록에 중량이 없으므로 추천하지 않는다
      const latestBodyweight = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '푸쉬업', sets: [{ weight: 20, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: key, name: '푸쉬업', sets: [{ reps: 20 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      // 양쪽 모두 맨몸이면 시작 중량 개념 자체가 없어 null
      const bothBodyweight = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '푸쉬업', sets: [{ reps: 15 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: key, name: '푸쉬업', sets: [{ reps: 20 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return latestBodyweight === null && bothBodyweight === null;
    })[1]
  ],
  ['수업 준비 시나리오: 날짜가 다르면 기록 시각(publishedAt)이 아무리 늦어도 수행 날짜 순서를 뒤집지 않음',
    pwScenario('늦은 전송 방어', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      // 트레이너가 7월 20일 수업을 7월 30일에 뒤늦게 전송해도, 실제 수행일 기준으로 개인운동(7/29)이 최근이다
      const rec = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, publishedAt: '2026-07-30T22:00:00.000Z',
          exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 25, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', endedAt: '2026-07-29T18:00:00.000Z',
          exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      return rec.orderBy === 'date' && rec.sourceKind === 'personal' && rec.weightLabel === '20kg';
    })[1]
  ],
  ['수업 준비 UI: 추천 문구가 "최근 수행 기록 기준"이고 폐기된 "최고 중량 기준" 표기가 남아있지 않음',
    (() => {
      const i = app.indexOf('function SessionPrepCard');
      const j = app.indexOf('function SessionScreen({ member, sessions, editData');
      const body = app.slice(i, j);
      const helper = app.slice(app.indexOf('function buildNextStartWeightRecommendation'), app.indexOf('function buildSessionPrepSummary'));
      return body.includes('최근 수행 기록 기준') && body.includes('recommendation.sourceLabel') &&
        body.includes('recommendation.previousHigherNote') && body.includes('recommendation.undecidedNote') &&
        // 추천 출처 라벨에서 "최고 중량 기준" 표기가 사라졌다
        !/최고 중량 기준/.test(body) && !/최고 중량 기준/.test(helper) &&
        // max 규칙 잔재가 없다
        !/Math\.max\(ptWeight/.test(helper) && helper.includes('getExerciseRecordOrder(pt,personal)');
    })()
  ],
  ['수업 준비 시나리오: 동일 운동이 없거나 맨몸 운동이면 추천 영역을 숨김',
    pwScenario('추천 숨김', lib => {
      const noMatch = lib.buildSessionPrepSummary({
        // PT에는 다른 운동만 있어 같은 운동 비교 자체가 불가능하다
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '랫풀다운', sets: [{ weight: 40, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: lib.canonicalExerciseKey('바벨 벤치프레스'), name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      });
      const bodyweight = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '푸쉬업', sets: [{ reps: 15 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: lib.canonicalExerciseKey('푸쉬업'), name: '푸쉬업', sets: [{ reps: 20 }] }] }],
        todayKey: '2026-07-31',
      });
      // 비공개 PT만 있으면 비교·추천 모두 없다
      const draftOnly = lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: false, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: lib.canonicalExerciseKey('바벨 벤치프레스'), name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      });
      return noMatch.comparison === null && noMatch.recommendation === null &&
        bodyweight.recommendation === null && bodyweight.comparison !== null &&
        draftOnly.comparison === null && draftOnly.recommendation === null &&
        lib.buildNextStartWeightRecommendation(null) === null;
    })[1]
  ],
  ['수업 준비 시나리오: 메모는 있을 때만 내려주고 없으면 빈 문자열(영역 숨김)',
    pwScenario('메모 조건', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const base = memo => lib.buildSessionPrepSummary({
        sessions: [],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', memo, exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      });
      return base('왼쪽 어깨가 약간 불편했습니다.').memo === '왼쪽 어깨가 약간 불편했습니다.' &&
        base('').memo === '' && base('   ').memo === '' && base(undefined).memo === '';
    })[1]
  ],
  ['수업 준비 시나리오: 비교는 Step1 헬퍼 결과를 그대로 사용(자체 비교 로직 없음)',
    pwScenario('Step1 재사용', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const sessions = [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: 20, reps: 12 }, { weight: 20, reps: 12 }] }] }];
      const personalWorkouts = [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: 22.5, reps: 10 }, { weight: 22.5, reps: 10 }, { weight: 22.5, reps: 10 }] }] }];
      const prep = lib.buildSessionPrepSummary({ sessions, personalWorkouts, todayKey: '2026-07-31' });
      const direct = lib.buildMemberExerciseComparisonIndex({ sessions, personalWorkouts })
        .getComparison('personal', 'p1', { exerciseKey: key });
      return JSON.stringify(prep.comparison.lines) === JSON.stringify(direct.lines) &&
        prep.comparison.directionLabel === direct.directionLabel &&
        prep.comparison.directionLabel === '7월 20일 PT 수업 → 7월 29일 개인운동';
    })[1]
  ],
  ['수업 준비 UI: SessionScreen 상단 카드가 "오늘의 운동 부위" 아래 · "운동 목록" 위에 배치됨',
    (() => {
      const prep = app.indexOf('<SessionPrepCard prep={sessionPrep}');
      const parts = app.indexOf('<label>오늘의 운동 부위');
      const exList = app.indexOf('<Card title="운동 목록"');
      return prep !== -1 && parts !== -1 && exList !== -1 && parts < prep && prep < exList;
    })()
  ],
  ['수업 준비 UI: 카드는 값 변경·저장 콜백을 받지 않고, 사용자가 누르는 가져오기 버튼 외에 자동 입력 경로가 없음',
    (() => {
      const i = app.indexOf('function SessionPrepCard');
      const j = app.indexOf('function SessionScreen({ member, sessions, editData');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        // prep + onImport(사용자 클릭 콜백) + title(문구 전용)만 받는다 — setExercises/onSave/onChange 계열 prop은 없다
        /function SessionPrepCard\(\{ prep, onImport = null, title = "오늘 수업 준비" \}\)/.test(body) &&
        !/setExercises|setSelectedTypes|onSave|onChange|addDoc|updateDoc|setDoc/.test(body) &&
        // onImport는 오직 onClick에 넘겨질 뿐, 렌더 중에 직접 호출되는 곳이 없다
        /onClick=\{onImport\}/.test(body) && !/onImport\s*(\?\.)?\s*\(/.test(body) &&
        // "자동 적용되지 않습니다" 안내를 항상 함께 노출한다
        body.includes('자동 적용되지 않습니다');
    })()
  ],
  ['수업 준비 UI: Firestore 추가 조회 없이 이미 로드된 personalWorkouts prop만 사용(N+1 금지)',
    app.includes('personalWorkouts={memberPersonalWorkouts} personalSorenessMap={memberPersonalSorenessMap} />}') &&
    app.includes('buildSessionPrepSummary({ sessions, personalWorkouts, todayKey: getKoreaDateString() })') &&
    (() => {
      const i = app.indexOf('function SessionPrepCard');
      const j = app.indexOf('const [sessionType, setSessionType]');
      // SessionPrepCard 정의 ~ SessionScreen 초반(카드 데이터 계산 구간)에 Firestore 조회 호출이 없다
      return !/getPersonalWorkouts\(|getSessions\(|getDocs\(|getPersonalWorkoutSorenessMap\(/.test(app.slice(i, j));
    })()
  ],
  ['수업 준비: PT 저장 구조·저장 로직에 영향 없음(기존 handleSaveSession 경로 그대로)',
    app.includes('async function handleSaveSession') && app.includes('addSession(member.id, { ...payload, createdAt: now })') && app.includes('updateSession(member.id, editSess.id, payload)') && app.includes('await withTimeout(writePromise') &&
    // 준비 카드에서 파생된 값을 세션 문서에 저장하지 않는다
    !/recommendedStartWeight|sessionPrepResult|prepRecommendation/.test(app) &&
    !/recommendedStartWeight|sessionPrepResult|prepRecommendation/.test(db)
  ],
  ['비교 결과 미저장: comparisonResult/improvementPercent 등 파생 필드를 Firestore에 쓰지 않음',
    !/comparisonResult|improvementPercent|previousPtWeight|performanceStatus/.test(app) &&
    !/comparisonResult|improvementPercent|previousPtWeight|performanceStatus/.test(db) &&
    // personalWorkouts 저장 경로(생성·진행 중 저장·완료)는 1차 구현 그대로다
    db.includes('export async function createPersonalWorkout') &&
    db.includes('export async function updatePersonalWorkoutProgress') &&
    db.includes('export async function completePersonalWorkout')
  ],

  // ── 개인운동 2차 3단계: 관리자 PT 기록 "개인운동에서 가져오기" ────────────────────
  // 자동 반영이 아니라 "트레이너가 고른 것만" 로컬 state에 넣는 기능이다. 아래 검사는
  // ① 자동 저장·자동 덮어쓰기 경로가 생기지 않았는지 ② 순수 변환이 실제로 맞는 값을 만드는지를 본다.
  ['가져오기 대상: 완료 개인운동 정렬 규칙을 수업 준비 카드와 공유(정렬 규칙 중복 정의 없음)',
    app.includes('function getCompletedPersonalWorkoutsLatestFirst') &&
    app.includes('function buildPersonalWorkoutImportCandidates') &&
    app.includes('const completed=getCompletedPersonalWorkoutsLatestFirst(personalWorkouts);') &&
    // 같은 날짜 순서는 기존 개인운동 시각 우선순위(endedAt→completedAt→startedAt)를 그대로 재사용한다
    app.includes('const ta=getExerciseRecordTimeMs(a,"personal"), tb=getExerciseRecordTimeMs(b,"personal");') &&
    // 정렬식이 두 곳에 복사되어 있지 않다
    (app.match(/w\.status==="completed"&&getExerciseRecordDateKey\(w\)/g) || []).length === 1
  ],
  pwScenario('가져오기 시나리오: 완료된 개인운동이 있고 유효 세트가 있으면 선택 목록을 만든다', L => {
    const w = { id:'p1', status:'completed', workoutDate:'2026-07-29', workoutParts:['가슴','삼두'], memo:'가슴 위주',
      exercises:[{ name:'벤치프레스', muscleTop:'가슴', muscleSub:'윗가슴', equipment:'바벨',
        sets:[{setNumber:1,weight:20,reps:10},{setNumber:2,weight:22.5,reps:8}] }] };
    const picked = L.buildPersonalWorkoutImportCandidates([w])[0];
    const o = L.buildPersonalWorkoutImportOptions(picked.workout);
    return o && o.exerciseCount === 1 && o.totalSets === 2 && o.dateLabel === '7월 29일' && o.memo === '가슴 위주';
  }),
  pwScenario('가져오기 시나리오: 개인운동이 없거나 진행 중(in_progress)뿐이면 대상 자체가 없다(버튼 숨김)', L => {
    const inProgress = { id:'p1', status:'in_progress', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] };
    return L.buildPersonalWorkoutImportCandidates([]).length === 0 &&
           L.buildPersonalWorkoutImportCandidates([inProgress]).length === 0;
  }),

  // ── 개인운동 2차 4단계: 여러 개인운동 기록 중 선택 ────────────────────────────
  pwScenario('기록 선택 목록: completed만 담고 진행 중(in_progress)은 섞이지 않는다', L => {
    const mk = (id, status, date) => ({ id, status, workoutDate:date,
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] });
    const list = L.buildPersonalWorkoutImportCandidates([
      mk('p1','completed','2026-07-29'), mk('p2','in_progress','2026-07-31'), mk('p3','completed','2026-07-30')]);
    return list.length === 2 && list.every(c => c.workout.status === 'completed') &&
      list.map(c => c.candidateId).join(',') === 'p3,p1';
  }),
  pwScenario('기록 선택 목록: workoutDate 최신순으로 정렬한다', L => {
    const mk = (id, date) => ({ id, status:'completed', workoutDate:date,
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] });
    const list = L.buildPersonalWorkoutImportCandidates([mk('a','2026-07-20'), mk('b','2026-07-31'), mk('c','2026-07-25')]);
    return list.map(c => c.candidateId).join(',') === 'b,c,a' && list[0].dateLabel === '7월 31일';
  }),
  pwScenario('기록 선택 목록: 같은 날짜면 endedAt이 늦은 기록이 위로 온다', L => {
    const mk = (id, endedAt) => ({ id, status:'completed', workoutDate:'2026-07-31', endedAt,
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] });
    const list = L.buildPersonalWorkoutImportCandidates([
      mk('a', '2026-07-31T09:30:00'), mk('b', '2026-07-31T19:10:00'), mk('c', '2026-07-31T13:00:00')]);
    return list.map(c => c.candidateId).join(',') === 'b,c,a';
  }),
  pwScenario('기록 선택 목록: 날짜·시각이 같으면 id로 순서를 고정한다(매번 순서가 바뀌지 않는다)', L => {
    const mk = id => ({ id, status:'completed', workoutDate:'2026-07-31', endedAt:'2026-07-31T19:10:00',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] });
    const ids = ['pw-a','pw-c','pw-b'];
    const once  = L.buildPersonalWorkoutImportCandidates(ids.map(mk)).map(c => c.candidateId).join(',');
    const twice = L.buildPersonalWorkoutImportCandidates([...ids].reverse().map(mk)).map(c => c.candidateId).join(',');
    return once === 'pw-c,pw-b,pw-a' && once === twice;
  }),
  pwScenario('기록 선택 목록: 완료 기록 기준 최근 10건까지만 표시한다', L => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id:`p${i}`, status:'completed',
      workoutDate:`2026-07-${String(i + 1).padStart(2, '0')}`,
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] }));
    const list = L.buildPersonalWorkoutImportCandidates(many);
    return L.PERSONAL_WORKOUT_IMPORT_LIST_LIMIT === 10 && list.length === 10 &&
      list[0].dateKey === '2026-07-14' && list[9].dateKey === '2026-07-05';
  }),
  pwScenario('기록 선택 목록: 가져올 수 없는 완료 기록도 목록에 남기고(사라진 것처럼 보이지 않게) 선택만 막는다', L => {
    const empty = { id:'p1', status:'completed', workoutDate:'2026-07-31',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:0}] }] };
    const noEx  = { id:'p2', status:'completed', workoutDate:'2026-07-30', exercises:[] };
    const ok    = { id:'p3', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] };
    const list = L.buildPersonalWorkoutImportCandidates([empty, noEx, ok]);
    return list.length === 3 && list.map(c => c.candidateId).join(',') === 'p1,p2,p3' &&
      list[0].importable === false && list[1].importable === false && list[2].importable === true &&
      list[0].disabledReason === '가져올 수 있는 운동이 없습니다.' && list[2].disabledReason === '' &&
      // 가져올 수 없는 기록도 날짜·부위는 그대로 보이고, 수치는 0으로 정직하게 표시한다
      list[0].dateLabel === '7월 31일' && list[0].exerciseCount === 0 && list[0].totalSets === 0;
  }),
  pwScenario('기록 선택 목록: 가져올 수 없는 기록만 있으면 가져오기 버튼 자체가 없다(빈 모달 방지)', L => {
    const empty = { id:'p1', status:'completed', workoutDate:'2026-07-31',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:0}] }] };
    const list = L.buildPersonalWorkoutImportCandidates([empty]);
    return list.length === 1 && list.some(c => c.importable) === false;
  }),
  pwScenario('기록 선택 카드: 날짜·부위·종목 수·총 세트·운동 시간·메모 첫 줄을 기존 헬퍼 결과 그대로 쓴다', L => {
    const w = { id:'p1', status:'completed', workoutDate:'2026-07-31', workoutParts:['가슴','삼두'],
      durationMinutes:52, memo:'가슴 위주로 진행\n다음엔 중량 올리기',
      exercises:[
        { name:'벤치프레스', sets:[{weight:20,reps:10},{weight:22.5,reps:8}] },
        { name:'딥스', sets:[{weight:null,reps:12}] }] };
    const c = L.buildPersonalWorkoutImportCandidates([w])[0];
    return c.dateLabel === '7월 31일' && c.partsLabel === L.formatPersonalWorkoutPartsLabel(w) && c.partsLabel === '가슴·삼두' &&
      c.exerciseCount === 2 && c.totalSets === 3 &&
      c.durationLabel === L.formatPersonalWorkoutDuration(L.getPersonalWorkoutDurationMinutes(w)) && c.durationLabel === '52분' &&
      c.memoFirstLine === '가슴 위주로 진행';
  }),
  pwScenario('기록 선택 카드: 카드에 보이는 종목·세트 수는 실제로 가져올 수 있는 양과 일치한다(reps 0 제외)', L => {
    const w = { id:'p1', status:'completed', workoutDate:'2026-07-31',
      exercises:[
        { name:'벤치프레스', sets:[{weight:20,reps:10},{weight:22.5,reps:0}] },
        { name:'', sets:[{weight:10,reps:10}] }] };
    const c = L.buildPersonalWorkoutImportCandidates([w])[0];
    const o = L.buildPersonalWorkoutImportOptions(c.workout);
    return c.exerciseCount === o.exerciseCount && c.totalSets === o.totalSets && c.exerciseCount === 1 && c.totalSets === 1;
  }),
  pwScenario('기록 선택 → 가져오기: 고른 기록이 그대로 다음 화면 옵션·draft로 이어진다(원본 mutate 없음)', L => {
    const older = { id:'p1', status:'completed', workoutDate:'2026-07-20',
      exercises:[{ name:'스쿼트', muscleTop:'하체', equipment:'바벨', sets:[{weight:60,reps:10}] }] };
    const newer = { id:'p2', status:'completed', workoutDate:'2026-07-31',
      exercises:[{ name:'벤치프레스', muscleTop:'가슴', equipment:'바벨', sets:[{weight:20,reps:10}] }] };
    const snapshot = JSON.stringify([older, newer]);
    const list = L.buildPersonalWorkoutImportCandidates([older, newer]);
    // 기본 선택(첫 번째)이 아니라 트레이너가 고른 두 번째 기록을 그대로 넘긴다
    const chosen = list[1];
    const o = L.buildPersonalWorkoutImportOptions(chosen.workout);
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]),
      baseExercise:L.mkEx('가슴'), workoutParts:o.workoutParts, todayMuscleTop:'가슴' });
    return chosen.candidateId === 'p1' && o.workoutId === 'p1' && draft.name === '스쿼트' &&
      draft.sets[0].weight === '60' && JSON.stringify([older, newer]) === snapshot;
  }),
  pwScenario('기록 선택 목록: 원본 문서를 복사하지 않고 그대로 참조한다(사본으로 인한 값 불일치 방지)', L => {
    const w = { id:'p1', status:'completed', workoutDate:'2026-07-31',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:10}] }] };
    const list = L.buildPersonalWorkoutImportCandidates([w]);
    return list[0].workout === w;
  }),
  pwScenario('가져오기 시나리오: 유효 세트가 하나도 없으면 목록을 만들지 않는다(빈 모달 금지)', L => {
    const w = { id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', sets:[{weight:20,reps:0},{weight:'',reps:''}] }, { name:'', sets:[{weight:10,reps:10}] }] };
    return L.buildPersonalWorkoutImportOptions(w) === null;
  }),
  pwScenario('가져오기 시나리오: 유효 세트 기준은 기존 getPersonalWorkoutValidSets 그대로 — reps 0·빈 세트는 목록에 없다', L => {
    const ex = { name:'벤치프레스', sets:[{weight:20,reps:10},{weight:22.5,reps:0},{weight:'',reps:''},{weight:22.5,reps:8}] };
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29', exercises:[ex] });
    return o.exercises[0].sets.length === L.getPersonalWorkoutValidSets(ex).length && o.exercises[0].sets.length === 2;
  }),
  pwScenario('가져오기 시나리오: 맨몸 세트는 중량 없이도 가져올 수 있고 "0kg" 문자열을 만들지 않는다', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'푸쉬업', equipment:'맨몸', sets:[{weight:null,reps:15},{weight:0,reps:12}] }] });
    const sets = o.exercises[0].sets;
    return sets.length === 2 && sets.every(s => s.weight === null && !s.label.includes('0kg')) &&
           sets[0].label === '15회' && sets[1].label === '12회';
  }),
  pwScenario('가져오기 시나리오: 비정상 항목(이름 없음·sets 배열 아님)은 목록에서 빼고 나머지는 그대로 가져올 수 있다', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'', sets:[{weight:20,reps:10}] }, { name:'깨진기록', sets:'배열아님' }, null,
                  { name:'벤치프레스', sets:[{weight:20,reps:10}] }] });
    // null 슬롯은 "기록"이 아니라 빈 자리이므로 안내 개수에 넣지 않는다(이름 없음 1건 + sets 깨짐 1건 = 2건)
    return o && o.exerciseCount === 1 && o.exercises[0].name === '벤치프레스' && o.skippedCount === 2;
  }),
  pwScenario('가져오기 변환: 선택한 세트만 · 원래 순서 유지 · 세트번호는 PT 배열 순서로 정규화(1,2,4 → 1,2,3)', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', muscleTop:'가슴', equipment:'바벨',
        sets:[{setNumber:1,weight:20,reps:10},{setNumber:2,weight:22.5,reps:8},{setNumber:3,weight:25,reps:6},{setNumber:4,weight:27.5,reps:4}] }] });
    const s = o.exercises[0].sets;
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([s[0].setId, s[1].setId, s[3].setId]),
      baseExercise:L.mkEx('가슴'), workoutParts:o.workoutParts, todayMuscleTop:'가슴' });
    return draft.name === '벤치프레스' && draft.sets.length === 3 &&
      JSON.stringify(draft.sets.map(x => [x.weight, x.reps])) === JSON.stringify([['20','10'],['22.5','8'],['27.5','4']]) &&
      // PT 세트 구조는 배열 index로 세트 번호를 표시하므로 개인운동 setNumber를 옮기지 않는다
      draft.sets.every(x => !('setNumber' in x) && x.recordType === 'weightReps');
  }),
  pwScenario('가져오기 변환: PT 세트 볼륨은 기존 calcVol과 동일한 값(직접 입력했을 때와 같은 결과)', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', muscleTop:'가슴', equipment:'바벨', sets:[{weight:20,reps:10}] }] });
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]), baseExercise:L.mkEx('가슴') });
    return draft.sets[0].volume === 200;
  }),
  pwScenario('가져오기 변환: 개인운동 전용 필드(exerciseKey/order/totals/id/메모)는 PT draft에 담기지 않는다', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29', memo:'회원 메모',
      exercises:[{ name:'벤치프레스', exerciseKey:'벤치프레스', order:0, totalSets:1, totalVolume:200,
        muscleTop:'가슴', equipment:'바벨', sets:[{setNumber:1,weight:20,reps:10,volume:200}] }] });
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]), baseExercise:L.mkEx('가슴') });
    const base = L.mkEx('가슴');
    const extra = Object.keys(draft).filter(k => !(k in base) && k !== 'partAutoAssigned');
    return extra.length === 0 && !JSON.stringify(draft).includes('회원 메모') && !JSON.stringify(draft).includes('p1') &&
      draft.feedback === '' && draft.nextPlan === '';
  }),
  pwScenario('가져오기 변환: 원본 개인운동 객체를 mutate하지 않는다', L => {
    const w = { id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', muscleTop:'가슴', equipment:'바벨', sets:[{setNumber:1,weight:20,reps:10}] }] };
    const snapshot = JSON.stringify(w);
    const o = L.buildPersonalWorkoutImportOptions(w);
    L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]), baseExercise:L.mkEx('가슴') });
    return JSON.stringify(w) === snapshot;
  }),
  pwScenario('가져오기 부위: 개인운동에 저장된 부위를 그대로 쓰고, 오늘의 운동 부위 자동 상속 대상에서 제외한다', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29', workoutParts:['등'],
      exercises:[{ name:'벤치프레스', muscleTop:'가슴', muscleSub:'윗가슴', equipment:'바벨', sets:[{weight:20,reps:10}] }] });
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]),
      baseExercise:L.mkEx('등'), workoutParts:o.workoutParts, todayMuscleTop:'등' });
    return draft.muscleTop === '가슴' && draft.muscleSub === '윗가슴' && draft.partAutoAssigned === false;
  }),
  pwScenario('가져오기 부위: 저장값이 없으면 운동명 분류 → 개인운동 부위 → 오늘의 운동 부위 순으로 복원(이두·삼두 분리 유지)', L => {
    const build = (name, parts, today) => {
      const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29', workoutParts:parts,
        exercises:[{ name, muscleTop:'', muscleSub:'', equipment:'', sets:[{weight:20,reps:10}] }] });
      return L.buildSessionExerciseDraftFromPersonalExercise({
        option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]),
        baseExercise:L.mkEx(today || undefined), workoutParts:o.workoutParts, todayMuscleTop:today });
    };
    const byName = build('벤치프레스', ['삼두'], '등');
    const byParts = build('알수없는운동xyz', ['삼두'], '등');
    const byToday = build('알수없는운동xyz', [], '등');
    return byName.muscleTop === '가슴' && byName.partAutoAssigned === false &&
           byParts.muscleTop === '팔-삼두근' && byParts.partAutoAssigned === false &&
           byToday.muscleTop === '등' && byToday.partAutoAssigned === true;
  }),
  pwScenario('가져오기 부위: 레거시 "팔"은 이두/삼두로 임의 변환하지 않고 오늘의 운동 부위 기본값으로 넘어간다', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29', workoutParts:['팔'],
      exercises:[{ name:'알수없는운동xyz', muscleTop:'', muscleSub:'', equipment:'', sets:[{weight:20,reps:10}] }] });
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]),
      baseExercise:L.mkEx('가슴'), workoutParts:o.workoutParts, todayMuscleTop:'가슴' });
    return draft.muscleTop !== '팔-이두근' && draft.muscleTop !== '팔-삼두근' && draft.muscleTop === '가슴';
  }),
  pwScenario('가져오기 변환: "기능"(시간 기반) 분류는 가져오지 않고 항상 중량×횟수 웨이트 카드로 만든다', L => {
    const o = L.buildPersonalWorkoutImportOptions({ id:'p1', status:'completed', workoutDate:'2026-07-29',
      exercises:[{ name:'벤치프레스', muscleTop:'기능', muscleSub:'기능', equipment:'기능', sets:[{weight:20,reps:10}] }] });
    const draft = L.buildSessionExerciseDraftFromPersonalExercise({
      option:o.exercises[0], selectedSetIds:new Set([o.exercises[0].sets[0].setId]),
      baseExercise:L.mkEx('가슴'), todayMuscleTop:'가슴' });
    return draft.muscleTop !== '기능' && draft.equipment !== '기능' &&
      draft.sets.every(s => s.recordType === 'weightReps') && draft.funcCategory === '';
  }),
  pwScenario('빈 카드 판정: 초기 기본 카드만 있으면 "사실상 비어 있음", 사용자 입력이 하나라도 있으면 아니다', L => {
    const blank = { ...L.mkEx('가슴'), partAutoAssigned:true };
    const named = { ...blank, name:'벤치프레스' };
    const withSet = { ...blank, sets:[{ weight:'40', reps:'', volume:0, recordType:'weightReps' }] };
    const withMemo = { ...blank, feedback:'허리 주의' };
    const partChanged = { ...blank, partAutoAssigned:false };
    const manual = { ...blank, _equipManual:true };
    return L.isSessionExerciseListEssentiallyEmpty([blank]) &&
      !L.isSessionExerciseListEssentiallyEmpty([named]) &&
      !L.isSessionExerciseListEssentiallyEmpty([withSet]) &&
      !L.isSessionExerciseListEssentiallyEmpty([withMemo]) &&
      !L.isSessionExerciseListEssentiallyEmpty([partChanged]) &&
      !L.isSessionExerciseListEssentiallyEmpty([manual]) &&
      // 일부만 비어 있으면 사용자가 만든 배치이므로 비어 있다고 보지 않는다
      !L.isSessionExerciseListEssentiallyEmpty([named, blank]);
  }),
  pwScenario('가져오기 적용: 사실상 비어 있는 기록이면 빈 카드를 대체하고, 입력이 있으면 절대 지우지 않는다', L => {
    const draft = { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const blank = { ...L.mkEx('가슴'), partAutoAssigned:true };
    const onBlank = L.applyPersonalWorkoutImport({ exercises:[blank], drafts:[draft], mode:'append' });
    const existing = { ...L.mkEx('등'), name:'랫풀다운', sets:[{ weight:'30', reps:'12', volume:360, recordType:'weightReps' }] };
    const onFilled = L.applyPersonalWorkoutImport({ exercises:[existing], drafts:[draft], mode:'append' });
    return onBlank.replacedBlank === true && onBlank.exercises.length === 1 && onBlank.exercises[0].name === '벤치프레스' &&
      onFilled.replacedBlank === false && onFilled.exercises.length === 2 &&
      onFilled.exercises[0].name === '랫풀다운' && onFilled.exercises[0].sets[0].weight === '30';
  }),
  pwScenario('가져오기 적용(뒤에 추가): 기존 운동 보존 + 선택 순서대로 마지막에 추가 + 동일 운동도 별도 카드', L => {
    const d1 = { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const d2 = { ...L.mkEx('가슴'), name:'케이블 플라이', sets:[{ weight:'15', reps:'12', volume:180, recordType:'weightReps' }] };
    const cur = [{ ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] }];
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[d1, d2], mode:'append' });
    return r.exercises.length === 3 && r.addedExercises === 2 && r.mergedExercises === 0 && r.addedSets === 2 &&
      r.exercises[0].sets.length === 1 && r.exercises[0].sets[0].weight === '40' &&
      r.exercises[1].name === '벤치프레스' && r.exercises[2].name === '케이블 플라이';
  }),
  pwScenario('가져오기 적용(같은 운동에 세트 추가): 동일 key 카드 1개면 기존 이름·부위·기구·세트를 유지하고 뒤에만 붙인다', L => {
    const d1 = { ...L.mkEx('가슴'), name:'bench press', muscleTop:'가슴', equipment:'덤벨',
      sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const d2 = { ...L.mkEx('가슴'), name:'케이블 플라이', sets:[{ weight:'15', reps:'12', volume:180, recordType:'weightReps' }] };
    const cur = [
      { ...L.mkEx('등'), name:'랫풀다운', sets:[{ weight:'30', reps:'12', volume:360, recordType:'weightReps' }] },
      { ...L.mkEx('가슴'), name:'벤치프레스', muscleTop:'가슴', muscleSub:'윗가슴', equipment:'바벨',
        sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] },
    ];
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[d1, d2], mode:'merge' });
    const merged = r.exercises[1];
    return r.exercises.length === 3 && r.mergedExercises === 1 && r.addedExercises === 1 &&
      // 표기가 달라도 canonical key가 같으면 기존 PT 운동명을 덮어쓰지 않는다
      merged.name === '벤치프레스' && merged.muscleTop === '가슴' && merged.muscleSub === '윗가슴' && merged.equipment === '바벨' &&
      merged.sets.length === 2 && merged.sets[0].weight === '40' && merged.sets[1].weight === '20' &&
      r.exercises[0].sets.length === 1 && r.exercises[2].name === '케이블 플라이';
  }),
  pwScenario('가져오기 적용(같은 운동에 세트 추가): canonical key가 다르면 이름이 비슷해도 합치지 않는다', L => {
    const draft = { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const cur = [{ ...L.mkEx('가슴'), name:'인클라인 벤치프레스', sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] }];
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[draft], mode:'merge' });
    return L.getSessionExerciseCanonicalKey(cur[0]) !== L.getSessionExerciseCanonicalKey(draft) &&
      r.exercises.length === 2 && r.mergedExercises === 0 && r.exercises[0].sets.length === 1;
  }),
  pwScenario('가져오기 적용: 동일 key 기존 카드가 2개 이상이면 병합을 막고(mergeBlocked) 임의 병합 없이 새 카드로 추가', L => {
    const draft = { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const cur = [
      { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] },
      { ...L.mkEx('가슴'), name:'Bench Press', sets:[{ weight:'45', reps:'6', volume:270, recordType:'weightReps' }] },
    ];
    const info = L.analyzePersonalWorkoutImportMerge({ exercises:cur, drafts:[draft] });
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[draft], mode:'merge' });
    return info.mergeBlocked === true && info.duplicatedNames.length === 1 &&
      r.exercises.length === 3 && r.mergedExercises === 0 &&
      r.exercises[0].sets.length === 1 && r.exercises[1].sets.length === 1;
  }),
  pwScenario('가져오기 적용: 운동명이 비어 있는 기존 카드는 어떤 draft와도 동일 운동으로 판정하지 않는다', L => {
    const draft = { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const cur = [{ ...L.mkEx('가슴'), name:'', sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] }];
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[draft], mode:'merge' });
    return L.getSessionExerciseCanonicalKey(cur[0]) === '' && r.mergedExercises === 0 && r.exercises.length === 2;
  }),
  pwScenario('가져오기 적용: 기존 PT exercises 배열·객체를 mutate하지 않는다(항상 새 배열/새 객체)', L => {
    const draft = { ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'20', reps:'10', volume:200, recordType:'weightReps' }] };
    const cur = [{ ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] }];
    const snapshot = JSON.stringify(cur);
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[draft], mode:'merge' });
    return JSON.stringify(cur) === snapshot && r.exercises !== cur && r.exercises[0] !== cur[0] && r.exercises[0].sets !== cur[0].sets;
  }),
  pwScenario('가져오기 적용: 선택 결과가 없으면 현재 exercises를 그대로 돌려주고 아무것도 바꾸지 않는다', L => {
    const cur = [{ ...L.mkEx('가슴'), name:'벤치프레스', sets:[{ weight:'40', reps:'8', volume:320, recordType:'weightReps' }] }];
    const r = L.applyPersonalWorkoutImport({ exercises:cur, drafts:[], mode:'append' });
    return r.changed === false && r.exercises === cur && r.addedSets === 0;
  }),
  ['가져오기 UI: 선택 모달은 기본 미선택 + 다시 열면 초기화 + 운동/세트 2단 체크박스 + 부분 선택 개수 표시',
    (() => {
      const i = app.indexOf('function PersonalWorkoutImportSheet');
      const j = app.indexOf('function SessionPrepCard');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        body.includes('const [selected, setSelected] = useState(() => new Set());') &&
        body.includes('type="checkbox"') && body.includes('el.indeterminate = picked > 0 && !all') &&
        body.includes('세트 선택`') && body.includes('총 ${selectedSetCount}세트 선택') &&
        // 선택 0개면 적용 버튼 비활성화
        body.includes('disabled={!selectedSetCount || applying}') &&
        // 기록 선택 화면으로 되돌아갈 수 있다(4단계)
        body.includes('다른 운동기록 선택') && body.includes('onClick={onBack}') &&
        // ESC / 닫기 버튼 지원
        body.includes('e.key === "Escape"') && body.includes('aria-label="닫기"') &&
        body.includes('role="dialog"') && body.includes('aria-modal="true"');
    })()
  ],
  ['가져오기 UI: 모달 본문만 스크롤하고 하단 적용 버튼은 항상 화면에 남는다(iPad·모바일 대응)',
    (() => {
      const i = app.indexOf('function PersonalWorkoutImportSheet');
      const j = app.indexOf('function SessionPrepCard');
      const body = app.slice(i, j);
      return body.includes('maxHeight:"88vh"') && body.includes('flexDirection:"column"') &&
        body.includes('flex:1,minHeight:0,overflowY:"auto"') &&
        body.includes('calc(14px + env(safe-area-inset-bottom))');
    })()
  ],
  ['가져오기 UI: 충돌 선택지는 "뒤에 추가"·"같은 운동에 세트 추가"·"취소"뿐 — 전체 덮어쓰기/삭제 옵션 없음',
    (() => {
      const i = app.indexOf('function PersonalWorkoutImportSheet');
      const j = app.indexOf('function SessionPrepCard');
      const body = app.slice(i, j);
      return body.includes('기존 기록 뒤에 추가') && body.includes('같은 운동에 세트 추가') &&
        body.includes('기존에 입력한 운동과 세트는 지워지지 않습니다') &&
        body.includes('같은 운동 카드가 여러 개 있습니다. 기존 기록 뒤에 새 운동으로 추가해주세요.') &&
        !/전체 덮어쓰기|덮어쓰기|기존 기록 삭제/.test(body);
    })()
  ],
  ['가져오기 UI: 확인 버튼 더블클릭으로 두 번 반영되지 않는다(성공 시 가드를 풀지 않음 + 버튼 비활성화)',
    (() => {
      const i = app.indexOf('function PersonalWorkoutImportSheet');
      const j = app.indexOf('function SessionPrepCard');
      const body = app.slice(i, j);
      return body.includes('const applyingRef             = useRef(false);') &&
        body.includes('if (applyingRef.current || !drafts.length) return;') &&
        body.includes('applyingRef.current = true; setApplying(true);') &&
        // 성공 경로에서 가드를 되돌리면 더블클릭 2번째가 통과한다 — finally로 즉시 해제하지 않는다
        !/finally\s*\{\s*applyingRef/.test(body) &&
        body.includes('catch (e) { applyingRef.current = false; setApplying(false); }') &&
        body.includes('disabled={applying}');
    })()
  ],
  ['가져오기: 확정 시 로컬 exercises state만 바꾸고 Firestore 쓰기·자동 저장을 하지 않는다',
    (() => {
      const i = app.indexOf('function handleApplyPersonalImport');
      const j = app.indexOf('const [showBodyPartPicker, setShowBodyPartPicker]');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        body.includes('setExercises(result.exercises);') &&
        // 저장·전송 경로를 직접 부르지 않는다
        !/handleSave|onSave\(|addSession|updateSession|addDoc|updateDoc|setDoc|publishSession/.test(body) &&
        // 실패해도 기존 state를 유지한다
        body.includes('기존 기록은 그대로입니다');
    })()
  ],
  ['가져오기: 추가 Firestore 조회 없이 이미 전달된 personalWorkouts prop만 사용하고, teo(대표)도 일반 회원과 동일하게 후보를 만들며(canUseMemberLinkedFeatures) 2:1에서만 버튼을 숨긴다',
    (() => {
      const i = app.indexOf('const importCandidates = useMemo(');
      const j = app.indexOf('function handleUndoPersonalImport');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        body.includes('canUseMemberLinkedFeatures(member) ? buildPersonalWorkoutImportCandidates(personalWorkouts) : []') &&
        body.includes('importCandidates.some(c => c.importable) && sessionType !== "2:1"') &&
        // 목록 계산은 useMemo로 한 번만 — 렌더마다 다시 만들지 않는다
        body.includes('const importOptions = useMemo(') &&
        !/getPersonalWorkouts\(|getSessions\(|getDocs\(|onSnapshot\(/.test(body) &&
        !body.includes('isOwner(member) ? [] :');
    })()
  ],
  ['기록 선택 UI: 모달은 항상 기록 선택 화면부터 시작하고 이전 선택을 기억하지 않는다',
    (() => {
      const i = app.indexOf('const importCandidates = useMemo(');
      const j = app.indexOf('function handleUndoPersonalImport');
      const body = app.slice(i, j);
      return body.includes('function openPersonalImport()  { setImportSelectedWorkout(null); setImportOpen(true); }') &&
        body.includes('function closePersonalImport() { setImportOpen(false); setImportSelectedWorkout(null); }') &&
        app.includes('onImport={canImportPersonal ? openPersonalImport : null}') &&
        // 선택 전에는 기록 선택 화면, 선택 후에만 운동/세트 선택 화면
        app.includes('<PersonalWorkoutRecordPickerSheet') &&
        app.includes('onNext={setImportSelectedWorkout}') &&
        app.includes('onBack={() => setImportSelectedWorkout(null)}');
    })()
  ],
  ['기록 선택 UI: 기본 선택은 목록 첫 번째(가장 최근) · 카드 선택 변경 가능 · 다음 버튼으로만 진행',
    (() => {
      const i = app.indexOf('function PersonalWorkoutRecordPickerSheet');
      const j = app.indexOf('// 개인운동 선택 모달(관리자 PT 기록 화면 전용).');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        // 기본 선택은 "가져올 수 있는" 기록 중 첫 번째 — 목록 첫 줄이 비활성 기록일 수 있다
        body.includes('useState(() => (candidates.find(c => c.importable) || {}).candidateId || "")') &&
        body.includes('onClick={() => { if (c.importable) setSelectedId(c.candidateId); }}') &&
        body.includes('role="radiogroup"') && body.includes('role="radio"') && body.includes('aria-checked={on}') &&
        body.includes('onClick={() => { if (picked) onNext?.(picked.workout); }} disabled={!picked}') &&
        // 목록 카드 표시값: 날짜 · 부위 · 종목 수 · 총 세트 · 운동 시간 · 메모 첫 줄
        body.includes('{c.dateLabel}') && body.includes('{c.partsLabel}') &&
        body.includes('운동 {c.exerciseCount}종목 · 총 {c.totalSets}세트') &&
        body.includes('c.durationLabel ? ` · ${c.durationLabel}` : ""') && body.includes('{c.memoFirstLine}') &&
        // ESC / 닫기 지원 + 목록만 스크롤하고 하단 버튼은 남는다
        body.includes('e.key === "Escape"') && body.includes('aria-label="닫기"') &&
        body.includes('role="dialog"') && body.includes('aria-modal="true"') &&
        body.includes('maxHeight:"88vh"') && body.includes('flex:1,minHeight:0,overflowY:"auto"') &&
        body.includes('calc(14px + env(safe-area-inset-bottom))') &&
        // 이 화면은 조회·선택만 한다 — Firestore도 부모 exercises state도 건드리지 않는다
        !/getPersonalWorkouts\(|getDocs\(|onSnapshot\(|setExercises|applyPersonalWorkoutImport/.test(body);
    })()
  ],
  ['기록 선택 UI: 가져올 수 없는 완료 기록도 목록에 그리되 선택 불가 + 사유 문구를 카드에 표시한다',
    (() => {
      const i = app.indexOf('function PersonalWorkoutRecordPickerSheet');
      const j = app.indexOf('// 개인운동 선택 모달(관리자 PT 기록 화면 전용).');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        app.includes('const PERSONAL_WORKOUT_IMPORT_EMPTY_REASON="가져올 수 있는 운동이 없습니다.";') &&
        // 목록에서 걸러 내지 않는다 — filter로 빼는 코드가 없어야 한다
        !/candidates\.filter\(/.test(body) &&
        body.includes('const off = !c.importable;') &&
        body.includes('disabled={off} aria-disabled={off}') &&
        body.includes('onClick={() => { if (c.importable) setSelectedId(c.candidateId); }}') &&
        body.includes('cursor: off ? "not-allowed" : "pointer"') &&
        body.includes('{c.disabledReason}') &&
        // 비활성 기록은 어떤 경로로도 "다음"의 결과가 되지 않는다
        body.includes('const picked = found?.importable ? found : null;');
    })()
  ],
  ['가져오기: 실행 취소는 로컬 스냅샷 1회분 복원뿐이고, 사용자가 직접 수정하기 시작하면 사라진다',
    app.includes('const [importUndo, setImportUndo] = useState(null);') &&
    app.includes('if (importedExercisesRef.current && exercises !== importedExercisesRef.current) setImportUndo(null);') &&
    app.includes('setImportUndo({ exercises: before, label:') &&
    app.includes('실행 취소</button>')
  ],
  ['가져오기: PT 저장 필드를 늘리지 않는다 — 개인운동 출처 id·비교값을 session 문서에 쓰지 않음',
    !/importedFromWorkoutId|sourceWorkoutId|personalWorkoutId/.test(app) &&
    !/importedFromWorkoutId|sourceWorkoutId|personalWorkoutId/.test(db) &&
    // 저장 직전 정규화(화면 전용 필드 제거)는 기존 로직 그대로다
    app.includes('const { _histIdx, _loaded, partAutoAssigned, ...rest } = e;')
  ],
  ['가져오기: 개인운동 원본은 읽기만 한다 — 관리자 화면에서 personalWorkouts 쓰기 함수를 호출하지 않음',
    (() => {
      const i = app.indexOf('function SessionScreen({ member, sessions, editData');
      const j = app.indexOf('function PairSessionFormScreen');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        !/updatePersonalWorkoutProgress|completePersonalWorkout|deletePersonalWorkout|createPersonalWorkout/.test(body);
    })()
  ],
  ['가져오기: 2:1 수업 화면(PairSessionFormScreen)은 이번 단계에서 전혀 손대지 않음',
    (() => {
      const i = app.indexOf('function PairSessionFormScreen');
      const body = app.slice(i, i + 60000);
      return i !== -1 && !/PersonalWorkoutImportSheet|applyPersonalWorkoutImport|buildPersonalWorkoutImportOptions/.test(body);
    })()
  ],
  // ════════════════════════════════════════════════════
  // 개인운동 수정·RPE·근육통 (2026-08)
  // ════════════════════════════════════════════════════
  ['개인운동 완료 기록 수정: 신규 함수가 생성/진행저장과 분리되고, memberId·createdAt은 patch로 받지도 쓰지도 않음(위조·불변성 위반 차단)',
    db.includes('export async function editCompletedPersonalWorkout(memberId, workoutId, patch = {}) {') &&
    !db.slice(db.indexOf('export async function editCompletedPersonalWorkout'), db.indexOf('function clampSorenessLevel(v) {')).includes('patch.memberId') &&
    !db.slice(db.indexOf('export async function editCompletedPersonalWorkout'), db.indexOf('function clampSorenessLevel(v) {')).includes('createdAt:')
  ],
  ['개인운동 완료 기록 수정: rpe는 null 허용 + 값이 있을 때만 rpeUpdatedAt 갱신(내용만 수정 시 손대지 않음)',
    (() => {
      const fn = db.slice(db.indexOf('export async function editCompletedPersonalWorkout'), db.indexOf('function clampSorenessLevel(v) {'));
      return fn.includes('if (patch.rpe !== undefined) {') &&
        fn.includes('body.rpe = Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : null;') &&
        fn.includes('body.rpeUpdatedAt = serverTimestamp();');
    })()
  ],
  ['개인운동 완료 시 RPE 동시 저장: completePersonalWorkout이 rpe 미전달이면 건드리지 않고, 전달 시 1~10으로 clamp',
    (() => {
      const fn = db.slice(db.indexOf('export async function completePersonalWorkout'), db.indexOf('function clampSorenessLevel(v) {'));
      return fn.includes('if (payload.rpe !== undefined) {') && fn.includes('Math.max(1, Math.min(10, Math.round(n)))');
    })()
  ],
  ['개인운동 삭제: personalWorkoutSoreness도 함께 정리해 고아 근육통 문서를 남기지 않음',
    (() => {
      const fn = db.slice(db.indexOf('export async function deletePersonalWorkout'), db.indexOf('// 완료된 기록 수정'));
      return fn.includes('deleteDoc(doc(db, "members", memberId, "personalWorkouts", workoutId))') &&
        fn.includes('deleteDoc(doc(db, "members", memberId, "personalWorkoutSoreness", workoutId))');
    })()
  ],
  ['개인운동 근육통 저장: 문서ID=workoutId 결정적 생성(1건당 1건) + upsert(getDoc으로 존재 여부 판정 후 create/update 분기)',
    (() => {
      const fn = db.slice(db.indexOf('export async function savePersonalWorkoutSoreness'), db.length);
      return fn.includes('doc(db, "members", memberId, "personalWorkoutSoreness", workoutId)') &&
        fn.includes('const existing = await getDoc(ref);') &&
        fn.includes('const isFirstSave = !existing.exists();') &&
        fn.includes('await setDoc(ref,') && fn.includes('await updateDoc(ref,');
    })()
  ],
  ['개인운동 근육통 저장: timing은 next_day/two_days_later만 허용하고 daysAfterWorkout이 timing에서 그대로 파생됨(값 어긋남 불가)',
    db.includes('const timing = data.timing === "two_days_later" ? "two_days_later" : "next_day";') &&
    db.includes('daysAfterWorkout: timing === "two_days_later" ? 2 : 1,') &&
    db.includes('source: "personalWorkout",')
  ],
  ['개인운동 근육통 저장: 부위 중복 방지(같은 part 재추가 불가) + 최대 개수 제한',
    db.includes('.filter(bp => bp.part && !seenParts.has(bp.part) && seenParts.add(bp.part))') &&
    db.includes('.slice(0, PERSONAL_WORKOUT_LIMITS.maxParts);')
  ],
  ['근육통 안내 날짜 계산: ms/24h 나눗셈이 아니라 두 YYYY-MM-DD 문자열의 자정 UTC 差로 계산(23시 완료도 다음날 오전 정상 판정)',
    (() => {
      const fn = app.slice(app.indexOf('function koreaDateDaysDiff(fromDateStr,toDateStr){'), app.indexOf('function getPersonalWorkoutCompletionDateKey'));
      return fn.includes('T00:00:00Z') && !fn.includes('/ 86400000 / 24') && fn.includes('Math.round((b.getTime()-a.getTime())/86400000)');
    })()
  ],
  ['근육통 안내 창(window): 당일(0)·72시간 초과(3일 이상)는 timing이 null 이 되어 자동 안내·신규 입력이 노출되지 않음, 1/2일만 next_day/two_days_later',
    (() => {
      const fn = app.slice(app.indexOf('function getPersonalWorkoutSorenessWindow'), app.indexOf('function normalizePersonalWorkoutSoreness'));
      return fn.includes('const timing=days===1?"next_day":days===2?"two_days_later":null;') &&
        fn.includes('withinAutoWindow:days===1||days===2,');
    })()
  ],
  ['근육통 완료 날짜 우선순위: endedAt → completedAt → workoutDate → updatedAt → createdAt 순으로 판정',
    (() => {
      const fn = app.slice(app.indexOf('function getPersonalWorkoutCompletionDateKey'), app.indexOf('function getPersonalWorkoutSorenessWindow'));
      return fn.indexOf('"endedAt","completedAt"') < fn.indexOf('workout?.workoutDate') &&
        fn.indexOf('workout?.workoutDate') < fn.indexOf('"updatedAt","createdAt"');
    })()
  ],
  ['홈/운동 탭 상단 근육통·RPE 입력 배너 제거: 개인운동 카드 내부 입력으로 통합되어 더 이상 별도 배너 컴포넌트가 존재하지 않음',
    !app.includes('function PersonalSorenessBanner') &&
    !app.includes('function buildPersonalSorenessPrompts') &&
    !app.includes('function PersonalSorenessSheet') &&
    !app.includes('<PersonalSorenessBanner')
  ],
  ['개인운동 카드 접힘 요약: RPE·근육통 모두 있으면 "RPE n · 부위 정도" 조합, 부분 입력/미입력도 각각 다른 문구',
    (() => {
      const fn = app.slice(app.indexOf('function buildPersonalWorkoutStatusSummary'), app.indexOf('function PersonalWorkoutStatusSection'));
      return fn.includes('"RPE 미입력"') &&
        fn.includes('"근육통 미입력"') &&
        fn.includes('"운동 후 상태를 기록해주세요"') &&
        fn.includes('sorenessLevelDescription(bp.level)');
    })()
  ],
  ['개인운동 카드 "운동 후 상태": RPE·근육통 각각 독립된 저장 버튼(PT 수업 후 몸 상태와 동일 패턴), 근육통 신규 입력은 기존 자동 안내 창 정책을 그대로 따름(창이 지나면 기존 기록 수정만 허용)',
    (() => {
      const fn = app.slice(app.indexOf('function PersonalWorkoutStatusSection'), app.indexOf('// 운동 종목 선택 시트'));
      return fn.includes('className="sj-feedback-card"') &&
        fn.includes('const canEditSoreness=!!soreness||sorenessWindow.withinAutoWindow;') &&
        fn.includes('const timing=soreness?.timing||(sorenessWindow.timing||"next_day");') &&
        fn.includes('onSaveRpe?.(workout.id,rpe)') &&
        fn.includes('onSaveSoreness?.(workout,{timing,overallLevel:overall,bodyParts:parts,memo})') &&
        fn.includes('근육통 입력 가능 기간(다음날~다다음날)이 지나 새로 기록할 수 없어요.') &&
        fn.includes('통증은 건강 탭에서 기록');
    })()
  ],
  ['완료 기록 수정 화면: 기존 값이 모두 채워진 채로 열리고, 변경 후 나가면 확인창을 띄운다(자동저장 아님)',
    (() => {
      const fn = app.slice(app.indexOf('function PersonalWorkoutEditScreen'), app.indexOf('// 건강 탭 대시보드'));
      return fn.includes('useState(()=>String(workout?.workoutDate||"").slice(0,10))') &&
        fn.includes('useState(()=>toTimeInputValue(workout?.startedAt))') &&
        fn.includes('useState(()=>workout?.rpe??null)') &&
        fn.includes('수정 중인 내용이 저장되지 않았습니다. 나가시겠어요?') &&
        !fn.includes('setTimeout(()=>flush()');
    })()
  ],
  ['완료 기록 수정: 시작<종료 검증은 화면에서도 선제 확인하고, rpe는 최초 로드값과 실제로 달라졌을 때만 patch에 포함(내용만 수정 시 rpeUpdatedAt 불변)',
    (() => {
      const fn = app.slice(app.indexOf('function PersonalWorkoutEditScreen'), app.indexOf('// 건강 탭 대시보드'));
      return fn.includes('종료 시각은 시작 시각보다 늦어야 해요') &&
        fn.includes('if(rpe!==initialRpeRef.current) patch.rpe=rpe;');
    })()
  ],
  ['완료 기록 수정 화면 모바일 스크롤: 바텀시트가 아니라 하단 내비게이션 유지된 전체 페이지라 body 스크롤을 잠그지 않고(useLockBodyScroll 호출 없음), 하단 저장바는 sticky로 안전영역까지 반영한다',
    (() => {
      const fn = app.slice(app.indexOf('function PersonalWorkoutEditScreen'), app.indexOf('// 건강 탭 대시보드'));
      const pwSticky = app.slice(app.indexOf('.pw-sticky-bar{'), app.indexOf('.pw-sticky-bar{')+300);
      return !fn.includes('useLockBodyScroll(true);') &&
        fn.includes('className="pw-screen"') &&
        pwSticky.includes('position:sticky') &&
        pwSticky.includes('env(safe-area-inset-bottom, 0px)') &&
        pwSticky.includes('var(--mb-h-tab, 60px)');
    })()
  ],
  ['운동 종목 추가 바텀시트(MemberPersonalExercisePicker)는 open 상태와 연동해 body 스크롤을 잠그고 닫히면 정확히 해제한다(useLockBodyScroll(open) + cleanup에서 이전 값 복원)',
    (() => {
      const fn = app.slice(app.indexOf('function MemberPersonalExercisePicker'), app.indexOf('function MemberPersonalExercisePicker')+2000);
      const hook = app.slice(app.indexOf('function useLockBodyScroll'), app.indexOf('function useLockBodyScroll')+1200);
      return fn.includes('useLockBodyScroll(open);') &&
        hook.includes('if(!active) return;') &&
        hook.includes('body.style.position=prev.position;') &&
        hook.includes('body.style.overflow=prev.overflow;') &&
        hook.includes('window.scrollTo(0,scrollY);');
    })()
  ],
  ['개인운동 카드 내부 RPE 저장(inline): 전체 수정 화면을 닫거나 스크롤을 리셋하지 않고, 실패해도 alert()를 띄우지 않음(카드가 자체 오류 문구 표시)',
    (() => {
      const fn = app.slice(app.indexOf('const saveCompletedPersonalWorkoutEdit=async'), app.indexOf('const savePersonalSorenessRecord=async'));
      return fn.includes('if(opts.inline){') &&
        fn.includes('setPersonalWorkoutToast(opts.toast||"저장됐어요");') &&
        fn.includes('if(!opts.inline) alert(');
    })()
  ],
  ['개인운동 근육통 저장(savePersonalSorenessRecord): 실패해도 alert()를 띄우지 않고 예외만 던져 호출자(카드)가 처리, 성공 시 공용 토스트로 안내',
    (() => {
      const fn = app.slice(app.indexOf('const savePersonalSorenessRecord=async'), app.indexOf('// 운동 종목 후보 —'));
      return fn.includes('setPersonalWorkoutToast("근육통이 저장됐어요");') && !fn.includes('alert(');
    })()
  ],
  ['개인운동 카드: RPE 배지(PT의 sj-rpe-chip과 동일 톤이지만 개인운동 카드 내부에 표시되어 출처 혼동 없음) + 카드 내부 "운동 후 상태" 섹션 + "기록 관리" 메뉴(수정/삭제, 근육통 메뉴는 운동 후 상태 섹션으로 통합되어 제거됨)',
    (() => {
      const fn = app.slice(app.indexOf('function MemberPersonalWorkoutCard'), app.indexOf('function MemberPersonalWorkoutEntry'));
      return fn.includes('workout?.rpe!=null?`RPE ${workout.rpe}`:"RPE 미입력"') &&
        fn.includes('<PersonalWorkoutStatusSection ') &&
        fn.includes('className="pw-manage-toggle"') &&
        fn.includes('운동 기록 수정') && fn.includes('기록 삭제') &&
        !fn.includes('근육통 기록하기') && !fn.includes('onEditSoreness');
    })()
  ],
  ['운동 종료 시 RPE 입력 단계: 필수가 아니며 "나중에 입력"으로도 완료 가능, 선택하면 저장 직전 값이 payload.rpe로 전달됨',
    app.includes('오늘 개인운동은 전체적으로 얼마나 힘들었나요?') &&
    app.includes('onClick={()=>saveCompleted(rpeChoice)}') &&
    app.includes('onClick={()=>saveCompleted(null)}')
  ],
  ['개인운동 RPE·근육통은 PT 수업 RPE/근육통과 별도 활동 type(personalWorkoutRpe/personalWorkoutSoreness)으로 기록되어 통계·표시가 섞이지 않음',
    db.includes('activities.push({ type: "personalWorkoutRpe", label: "개인운동 RPE"') &&
    db.includes('type: "personalWorkoutSoreness", label: `개인운동 근육통 ${isFirstSave ? "입력" : "수정"}`')
  ],
  ['Firestore rules: personalWorkouts 완료 후 수정은 화이트리스트+시작<종료 검증을 통과해야 하고 completed→in_progress 역행이 차단됨',
    firestoreRules.includes('완료된 기록의 재수정 — 회원 본인이 날짜·시작/종료시각·부위·종목·메모·집계·RPE를 화이트리스트로만 고칠 수 있다.') &&
    firestoreRules.includes('function personalWorkoutTimeOrderValid(data) {') &&
    firestoreRules.includes('resource.data.status == "completed"') &&
    firestoreRules.includes('request.resource.data.status == "completed"')
  ],
  ['Firestore rules: personalWorkoutSoreness는 문서ID=workoutId 강제 + 참조 개인운동이 본인 소유의 완료 기록인지 서버측에서 대조(get())',
    firestoreRules.includes('match /personalWorkoutSoreness/{workoutId} {') &&
    firestoreRules.includes('request.resource.data.workoutId == workoutId') &&
    firestoreRules.includes('get(/databases/$(database)/documents/members/$(memberId)/personalWorkouts/$(workoutId)).data.status == "completed"') &&
    firestoreRules.includes('function personalWorkoutSorenessDataValid(data) {')
  ],
  ['Firestore rules 테스트: 완료 기록 수정/RPE/근육통 시나리오가 tests/rules에 존재(npm run test:rules로 검증됨)',
    (() => {
      const rulesTest = fs.readFileSync(path.join(root, "tests", "rules", "firestore.rules.test.mjs"), "utf8");
      return rulesTest.includes('완료된 기록 화이트리스트 재수정 허용') &&
        rulesTest.includes('personalWorkoutSoreness (개인운동 후 근육통') &&
        rulesTest.includes('timing·daysAfterWorkout 불일치 차단');
    })()
  ],

  ['오늘의 운동 부위 옵션에 "팔"이 추가됨 — 1:1·2:1 화면이 공유하는 SESSION_BODY_PART_OPTIONS 하나에만 추가해 화면별 목록이 다시 어긋나지 않는다',
    app.includes('const SESSION_BODY_PART_OPTIONS = ["등","가슴","하체","어깨","이두","삼두","팔","상체"];')
  ],
  ['수업 기록 화면: 신규 기록 날짜·오늘의 운동 부위 초기값이 getInitialNewSessionValues 통합 헬퍼를 통해 계산됨',
    app.includes('const initialSessionValues = getInitialNewSessionValues({') &&
    app.includes('const [date,           setDate]           = useState(initialSessionValues.date);') &&
    app.includes('const [selectedTypes,  setSelectedTypes]  = useState(initialSessionValues.selectedTypes);')
  ],
  siScenario('신규 기록 초기값 시나리오A: 다음 수업 날짜+부위 모두 저장 → 둘 다 자동 적용', lib => {
    const member = { nextWorkoutDate: '2026-08-03', nextWorkoutPart: '어깨 · 가슴' };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return r.date === '2026-08-03' && JSON.stringify(r.selectedTypes) === JSON.stringify(['어깨', '가슴']);
  }),
  siScenario('신규 기록 초기값 시나리오B: 날짜만 저장 → 날짜만 자동 적용, 부위는 빈 선택(기존 기본 동작)', lib => {
    const member = { nextWorkoutDate: '2026-08-03' };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return r.date === '2026-08-03' && r.selectedTypes.length === 0;
  }),
  siScenario('신규 기록 초기값 시나리오C: 부위만 저장 → 오늘 날짜 유지, 부위만 자동 선택', lib => {
    const member = { nextWorkoutPart: '어깨 · 가슴' };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return r.date === '2026-08-01' && JSON.stringify(r.selectedTypes) === JSON.stringify(['어깨', '가슴']);
  }),
  siScenario('신규 기록 초기값 시나리오D: 다음 수업 준비 값이 전혀 없음 → 오늘 날짜 + 빈 선택(기존 기본 동작 유지)', lib => {
    const r = lib.getInitialNewSessionValues({ editingSession: null, member: {}, todayStr: '2026-08-01' });
    return r.date === '2026-08-01' && r.selectedTypes.length === 0;
  }),
  siScenario('신규 기록 초기값 시나리오E: 기존 기록 수정 → 다음 수업 준비와 무관하게 그 기록에 저장된 날짜·부위를 그대로 유지', lib => {
    const member = { nextWorkoutDate: '2026-08-03', nextWorkoutPart: '어깨 · 가슴' };
    const editingSession = { id: 'sess1', date: '2026-07-31', selectedTypes: ['등'] };
    const r = lib.getInitialNewSessionValues({ editingSession, member, todayStr: '2026-08-01' });
    return r.date === '2026-07-31' && JSON.stringify(r.selectedTypes) === JSON.stringify(['등']);
  }),
  siScenario('신규 기록 초기값: 레거시 필드(nextPtDate/nextPtPart)도 nextWorkoutDate/Part가 없을 때 대체로 인식된다', lib => {
    const member = { nextPtDate: '2026-08-05', nextPtPart: '하체' };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return r.date === '2026-08-05' && JSON.stringify(r.selectedTypes) === JSON.stringify(['하체']);
  }),
  siScenario('신규 기록 초기값: NEXT_PT_PART_OPTIONS 전용 값(코어 등 대응 없는 값)은 오늘의 운동 부위 UI 값이 아니므로 걸러지고, 대응되는 값만 적용 — "팔"은 SESSION_BODY_PART_OPTIONS에 포함돼 그대로 적용됨', lib => {
    const member = { nextWorkoutPart: '어깨 · 팔 · 코어' };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return JSON.stringify(r.selectedTypes) === JSON.stringify(['어깨', '팔']);
  }),
  siScenario('신규 기록 초기값: 다음 수업 부위가 "팔"만 저장된 경우 1:1 수업 기록 화면에 "팔"이 자동 선택된다', lib => {
    const member = { nextWorkoutPart: '팔' };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return JSON.stringify(r.selectedTypes) === JSON.stringify(['팔']);
  }),
  siScenario('신규 기록 초기값 시나리오H: Firestore Timestamp({seconds}) 날짜도 한국 기준 자정 경계에서 하루 밀리지 않는다', lib => {
    // 2026-08-03 00:30 KST = 2026-08-02 15:30 UTC — toISOString 기반이면 하루 밀릴 수 있는 경계 시각
    const seconds = Math.floor(Date.UTC(2026, 7, 2, 15, 30) / 1000);
    const member = { nextWorkoutDate: { seconds } };
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return r.date === '2026-08-03';
  }),
  siScenario('신규 기록 초기값: 날짜가 Date 객체로 저장돼 있어도 한국 기준 자정 경계에서 하루 밀리지 않는다', lib => {
    const member = { nextWorkoutDate: new Date(Date.UTC(2026, 7, 2, 15, 30)) }; // KST 2026-08-03 00:30
    const r = lib.getInitialNewSessionValues({ editingSession: null, member, todayStr: '2026-08-01' });
    return r.date === '2026-08-03';
  }),

  // ── 회원 수업일지 전송 무한 로딩 방지(2026-08-04) ──
  ['수업일지 전송 무한 로딩 방지: handlePublishSession이 오프라인 즉시 차단 + withTimeout(15초)으로 publishSession을 감싸고, 실패 시 항상 throw해 호출부(모달)가 재시도 UI를 그릴 수 있다',
    (() => {
      const fn = app.slice(app.indexOf('async function handlePublishSession'), app.indexOf('async function handleUnpublishSession'));
      return fn.includes('navigator.onLine === false') &&
        fn.includes('withTimeout(publishPromise, 15000') &&
        fn.includes('throw e;') &&
        fn.includes('finally { setLoading(false); }');
    })()
  ],
  ['수업일지 전송: 핵심 저장(refreshSessionsForMember 이전의 publishSession) 실패는 즉시 실패로 처리하고, 뒤이은 목록 재조회 실패는 별도 catch로 흡수해 "전송 완료" 처리를 뒤집지 않는다',
    (() => {
      const fn = app.slice(app.indexOf('async function handlePublishSession'), app.indexOf('async function handleUnpublishSession'));
      const publishIdx = fn.indexOf('withTimeout(publishPromise');
      const refreshIdx = fn.indexOf('withTimeout(refreshSessionsForMember');
      const refreshCatchIdx = fn.indexOf('catch(refreshErr)');
      return publishIdx >= 0 && refreshIdx > publishIdx && refreshCatchIdx > refreshIdx;
    })()
  ],
  ['수업일지 전송 상태 격리: HubScreen이 회원 전환 시(member.id 변경) 전송 중·전송 실패·미리보기 상태를 초기화하고, 언마운트 후에는 setState하지 않는다',
    (() => {
      const hub = app.slice(app.indexOf('function HubScreen('), app.indexOf('function HistoryScreen('));
      return hub.includes('const hubMountedRef = useRef(true);') &&
        hub.includes('useEffect(() => { setSendingToday(false); setSendTodayError(null); setShowPreview(false); }, [member.id]);') &&
        hub.includes('if (hubMountedRef.current)');
    })()
  ],
  ['수업일지 전송 UI 상태 구분: 실패 시 버튼 문구가 "다시 전송"으로 바뀌고, 전송 중에는 미리보기 모달의 닫기·뒤로 버튼이 비활성화된다',
    (() => {
      const hub = app.slice(app.indexOf('function HubScreen('), app.indexOf('function HistoryScreen('));
      return hub.includes('sendTodayError?"다시 전송"') &&
        (hub.match(/disabled=\{sendingToday\}/g) || []).length >= 3;
    })()
  ],
  ['publishSession(db.js): 핵심 저장(updateDoc) 실패는 즉시 throw로 전파하고, 회원 알림 생성은 await 없이 흘려보내 부가 작업 실패가 전송 결과에 영향을 주지 않는다',
    (() => {
      const fn = db.slice(db.indexOf('export async function publishSession'), db.indexOf('export async function sendPairSession'));
      return fn.includes('dbLog("publishSession", `session-save 실패: ${e.message}`);') &&
        fn.includes('throw e;') &&
        !fn.includes('await createMemberNotification');
    })()
  ],

  // ── 공지센터 개편(2026-08) ──
  ['공지센터: markNoticeRead가 memberName을 받아 members/noticeReads·notices/reads 양방향에 기록(이중 기록, 하위호환)',
    db.includes('export async function markNoticeRead(memberId,noticeId,memberName){') &&
    db.includes('doc(db,"members",memberId,"noticeReads",noticeId)') &&
    db.includes('doc(db,"notices",noticeId,"reads",memberId)')
  ],
  ['공지센터: getMemberNotices가 대상 스냅샷(audienceMemberIds)과 공개기간(publishedStartAt/EndAt)으로 회원앱 노출을 걸러낸다 — 필드 없는 레거시 공지는 그대로 노출(마이그레이션 불필요)',
    db.includes('n.audienceMemberIds.includes(memberId)') &&
    db.includes('isWithinPublishWindow(n,now)')
  ],
  ['공지센터: saveNotice가 isNewManual/publishedStartAt/publishedEndAt을 저장하고, 최초 게시 시점에만 대상 스냅샷을 고정한다',
    db.includes('isNewManual:!!data.isNewManual') &&
    db.includes('publishedStartAt:data.publishedStartAt||null') &&
    db.includes('publishedEndAt:data.publishedEndAt||null') &&
    db.includes('update.audienceMemberIds=options.audienceMemberIds') &&
    db.includes('createPayload.audienceMemberIds=options.audienceMemberIds')
  ],
  ['공지센터: republishNotice가 notices/reads 서브컬렉션과 회원별 noticeReads를 모두 초기화하고 버전을 올린다(일반 수정과 분리된 별도 경로)',
    db.includes('export async function republishNotice(id, nextAudienceMemberIds){') &&
    db.includes('collection(db,"notices",id,"reads")') &&
    db.includes('doc(db,"members",memberId,"noticeReads",id)') &&
    db.includes('version:(Number(before.version)||1)+1')
  ],
  ['공지센터: getNoticeReads(관리자 읽음 명단 조회) 함수 존재',
    db.includes('export async function getNoticeReads(noticeId){')
  ],
  ['공지센터: 회원앱 openNotice는 alert() 대신 읽음 기록만 남기고(상세를 실제로 열었을 때만 호출), 목록 렌더 경로에서는 호출되지 않는다',
    (() => {
      const s = app.indexOf('const openNotice=async(notice)=>');
      const e = app.indexOf(';', app.indexOf('markNoticeRead(profile.id,notice.id,profile.name)', s));
      const fn = app.slice(s, e + 1);
      return fn.includes('markNoticeRead(profile.id,notice.id,profile.name)') && !fn.includes('alert(');
    })()
  ],
  ['공지센터: MemberNoticeCenterScreen이 중요공지(고정 정렬+NEW배지)와 FAQ(검색) 두 영역으로 구성된다',
    app.includes('function MemberNoticeCenterScreen({notices=[],onOpen,onBack}){') &&
    app.includes('NOTICE_FAQ_ITEMS.filter(f=>matchSearch(f.q,faqQuery))') &&
    app.includes('sortNoticesForCenter(notices)') &&
    app.includes('isNoticeNew(n)')
  ],
  ['공지센터: 관리자 "읽음 기록 초기화 후 재공지"는 기본 OFF이고 지정된 확인 문구를 그대로 사용한다',
    app.includes('읽음 기록 초기화 후 재공지') &&
    app.includes('기존 읽음 기록이 초기화되며 모든 대상 회원에게 다시 미확인 공지로 표시됩니다. 재공지하시겠습니까?')
  ],
  ['공지센터: NoticeReadStatsScreen이 대상/읽음/미확인/읽음률을 계산하고 teo 대표·테스트 회원을 통계에서 제외한다',
    app.includes('function NoticeReadStatsScreen(') &&
    app.includes('!isExcludedAdminMember(m)') &&
    app.includes('const readRate = targetCount ? Math.round(readCount/targetCount*100) : 0')
  ],
  ['공지센터: 미확인 회원 명단 클릭 시 기존 회원 상세 화면(goHub)으로 이동한다',
    app.includes('onOpenMember={goHub}') &&
    app.includes('onClick={()=>onOpenMember?.(m)}')
  ],
  ['공지센터 Rules: notices/{noticeId}/reads/{memberId}는 회원 자신의 기록만 생성·수정 가능(다른 회원 몫 위조 차단), firstReadAt 불변, readCount는 1씩만 증가',
    firestoreRules.includes('match /reads/{memberId} {') &&
    firestoreRules.includes('request.resource.data.memberId == memberId') &&
    firestoreRules.includes('request.resource.data.authUid == uid()') &&
    firestoreRules.includes('request.resource.data.firstReadAt == resource.data.firstReadAt') &&
    firestoreRules.includes('request.resource.data.readCount == resource.data.readCount + 1')
  ],

  // ── 회원 목록 "오늘 수업"/"미기록" 분류(2026-08-05) ──
  ['오늘 수업 판정: getTodaySessionStatus가 세션 날짜 판정에 createdAt을 폴백으로 쓰지 않는다(과거 수업을 오늘 기록/수정해도 오늘 수업으로 오분류되지 않도록)',
    (() => {
      const fn = app.slice(app.indexOf('function getTodaySessionStatus'), app.indexOf('function getPastUnrecordedInfo'));
      return fn.includes('normalizeSessionDateKey(s.date || s.sessionDate)') && !fn.includes('s.createdAt');
    })()
  ],
  ['지난 수업 미기록 판정: getPastUnrecordedInfo가 다음 수업 준비일이 오늘보다 이전이고 그 날짜에 저장된 수업일지가 없을 때만 대상으로 판정한다(createdAt 미사용)',
    (() => {
      const fn = app.slice(app.indexOf('function getPastUnrecordedInfo'), app.indexOf('function isTodaySessionMember'));
      return fn.includes('info.date >= today') && fn.includes('hasDocForThatDate') && !fn.includes('s.createdAt');
    })()
  ],
  // ── 지난 수업 미기록 경고 UI 제거(2026-08-06) — 수업 예정일은 확정된 출석 기록이 아니므로,
  // 예정일이 지났고 그 날짜 기록이 없다는 이유만으로 카드를 경고색으로 강조하지 않는다 ──
  ['회원 목록 카드: 지난 수업 미기록 경고 톤(PAST_UNRECORDED_STYLE)과 그 배지가 소스에서 완전히 제거됐다',
    !app.includes('PAST_UNRECORDED_STYLE') &&
    !/pastUnrecorded\s*&&\s*<span/.test(app)
  ],
  ['회원 목록 카드: 카드 강조 테두리(accent)는 오늘 수업 상태(statusStyle)로만 결정되고 지난 수업 미기록으로는 강조되지 않는다',
    app.includes('accent={statusStyle}') && !/accent=\{cardAccent\}/.test(app)
  ],
  ['회원 아바타 상태 점: 지난 수업 미기록 여부와 무관하게 기존 방문 톤(visitTone)만 사용한다',
    app.includes('tone={statusStyle ? statusStyle.solid : visitTone(meta.daysSince,false)}')
  ],
  ['다음 수업 문구 아이콘·글자색: statusStyle/오늘 예정(next.hot) 여부로만 정해지고 지난 수업 미기록으로는 강조되지 않는다',
    app.includes('stroke={statusStyle?statusStyle.soft:next.hot?DB.mintSoft:DB.faint}') &&
    app.includes('fontWeight:(statusStyle||next.hot)?800:600,color:statusStyle?statusStyle.soft:next.hot?DB.mintSoft:DB.sub')
  ],
  ['지난 수업 미기록 보조문구: "N월 N일 예정" 형태의 회색 보조문구만 표시하고 경고 라벨은 붙이지 않는다',
    app.includes('return dm ? `${Number(dm[2])}월 ${Number(dm[3])}일 예정` : "예정일 확인 필요";')
  ],
  ['회원 목록 정렬: sortMembers의 그룹 판정은 오늘 수업 상태(getTodaySessionStatus)만 사용하고, 지난 수업 미기록 여부로 상단에 우선 배치하지 않는다',
    (() => {
      const fn = app.slice(app.indexOf('function sortMembers'), app.indexOf('// 검색 중이면 모든 상태 포함'));
      return fn.includes('getTodaySessionStatus') && !fn.includes('getPastUnrecordedInfo') && !fn.includes('PastUnrecorded');
    })()
  ],
  ['미기록 탭(opt-in 필터): 예정 날짜 내림차순(가장 최근에 놓친 수업이 위)으로 정렬한다 — 전체/기본 목록의 자동 우선 정렬이 아니라 관리자가 직접 선택하는 별도 탭에서만 적용',
    app.includes('"미기록" 탭 — 가장 최근에 놓친 예정일이 위로 오도록') &&
    app.includes('return db.localeCompare(da);')
  ],
  ['수업일지 미전송 판정(buildUnsentSessionMembers)은 지난 수업 미기록 판정과 완전히 분리돼 있다 — nextWorkoutDate/getPastUnrecordedInfo를 전혀 참조하지 않고, 실제 저장된 세션의 isPublished만으로 판정한다',
    (() => {
      const fn = app.slice(app.indexOf('function buildUnsentSessionMembers'), app.indexOf('// 홈 "수업일지 미확인" — "수업일지 미전송"(관리자가 아직 공개 안 함)과는 완전히 다른 상태다.'));
      return fn.includes('s.isPublished === true') && fn.includes('hasRealExercise') &&
        !fn.includes('nextWorkoutDate') && !fn.includes('getPastUnrecordedInfo');
    })()
  ],
  tsScenario('시나리오A: 어제 예정됐지만 미기록인 회원 — 오늘 수업 미노출·getPastUnrecordedInfo는 여전히 데이터를 반환(미기록 탭 필터용, 카드 경고 표시는 더 이상 하지 않음)', lib => {
    const today = '2026-08-05';
    const member = { id: 'a1', nextWorkoutDate: '2026-08-04' };
    const sessionsMap = { a1: [] };
    const isToday = lib.isTodaySessionMember(member, sessionsMap, today);
    const past = lib.getPastUnrecordedInfo(member, sessionsMap, today);
    return isToday === false && !!past && past.date === '2026-08-04';
  }),
  tsScenario('시나리오B: 어제 날짜의 수업일지를 오늘 작성 중인 회원 — 오늘 수업 미노출', lib => {
    const today = '2026-08-05';
    const member = { id: 'b1', nextWorkoutDate: '2026-08-04' };
    const sessionsMap = { b1: [{ date: '2026-08-04', createdAt: '2026-08-05T09:00:00.000Z', exercises: [{ name: '스쿼트' }], isPublished: false }] };
    return lib.isTodaySessionMember(member, sessionsMap, today) === false;
  }),
  tsScenario('시나리오C: 어제 수업일지를 완료한 회원 — 오늘 수업·미기록 모두 미노출(히스토리에서만 확인)', lib => {
    const today = '2026-08-05';
    const member = { id: 'c1', nextWorkoutDate: '2026-08-04' };
    const sessionsMap = { c1: [{ date: '2026-08-04', exercises: [{ name: '벤치프레스' }], isPublished: true }] };
    const isToday = lib.isTodaySessionMember(member, sessionsMap, today);
    const past = lib.getPastUnrecordedInfo(member, sessionsMap, today);
    return isToday === false && past === null;
  }),
  tsScenario('시나리오D: 오늘 예정이며 시간이 있는 회원 — 오늘 수업 노출·시간 정렬 키 확보', lib => {
    const today = '2026-08-05';
    const member = { id: 'd1', nextWorkoutDate: '2026-08-05', nextWorkoutTime: '18:00' };
    const sessionsMap = { d1: [] };
    return lib.getTodaySessionStatus(member, sessionsMap, today) === 'scheduled' &&
      lib.getTodaySortTimeKey(member, today) === '18:00';
  }),
  tsScenario('시나리오E: 오늘 예정이지만 시간 미정인 회원 — 오늘 수업 노출·정렬 키는 null(시간 지정 회원보다 아래)', lib => {
    const today = '2026-08-05';
    const member = { id: 'e1', nextWorkoutDate: '2026-08-05' };
    const sessionsMap = { e1: [] };
    const timed = { id: 'd1', nextWorkoutDate: '2026-08-05', nextWorkoutTime: '18:00' };
    const status = lib.getTodaySessionStatus(member, sessionsMap, today);
    const timeKey = lib.getTodaySortTimeKey(member, today);
    const timedKey = lib.getTodaySortTimeKey(timed, today);
    return status === 'scheduled' && timeKey === null && !!timedKey;
  }),
  tsScenario('시나리오F: 내일 예정된 회원 — 오늘 수업 미노출', lib => {
    const today = '2026-08-05';
    const member = { id: 'f1', nextWorkoutDate: '2026-08-06' };
    const sessionsMap = { f1: [] };
    return lib.isTodaySessionMember(member, sessionsMap, today) === false;
  }),
  tsScenario('시나리오G: 기록 시작 시각(createdAt)은 오늘이지만 sessionDate가 어제인 기록 — 오늘 수업 미노출(createdAt 폴백 금지)', lib => {
    const today = '2026-08-05';
    const member = { id: 'g1', nextWorkoutDate: '2026-08-04' };
    const sessionsMap = { g1: [{ date: '2026-08-04', createdAt: '2026-08-05T10:00:00.000Z', exercises: [{ name: '데드리프트' }], isPublished: false }] };
    return lib.getTodaySessionStatus(member, sessionsMap, today) === null;
  }),
  tsScenario('시나리오H: 어제 미기록 일정(다음 수업 준비 미갱신)과 오늘 실제 기록이 공존 — 오늘 수업엔 오늘 일정만, 미기록엔 어제 일정만 각각 노출(중복 없음)', lib => {
    const today = '2026-08-05';
    const member = { id: 'h1', nextWorkoutDate: '2026-08-04' };
    const sessionsMap = { h1: [{ date: '2026-08-05', exercises: [{ name: '스쿼트' }], isPublished: false }] };
    const status = lib.getTodaySessionStatus(member, sessionsMap, today);
    const past = lib.getPastUnrecordedInfo(member, sessionsMap, today);
    return status === 'recording' && !!past && past.date === '2026-08-04';
  }),
  tsScenario('시나리오F(신규): 지난 예정일 이후 새 미래 예정일을 저장한 회원 — 더 이상 지난 수업 미기록 대상이 아니고, 가장 최근에 저장된 미래 예정일만 노출된다', lib => {
    const today = '2026-08-05';
    // 8/4로 예정됐다가 미기록 상태였던 회원이 8/10으로 예정일을 다시 잡은 상황(nextWorkoutDate는 최신 값 1건만 저장)
    const member = { id: 'f2', nextWorkoutDate: '2026-08-10' };
    const sessionsMap = { f2: [] };
    const past = lib.getPastUnrecordedInfo(member, sessionsMap, today);
    const info = lib.getMemberNextSessionInfo(member);
    return past === null && info.date === '2026-08-10';
  }),
  tsScenario('시나리오I: 한국 시간 자정 전후 — UTC 변환 때문에 날짜가 하루씩 밀리지 않는다', lib => {
    const justAfterMidnightKST = lib.getKoreaDateString(new Date(Date.UTC(2026, 7, 4, 15, 30))); // KST 2026-08-05 00:30
    const justBeforeMidnightKST = lib.getKoreaDateString(new Date(Date.UTC(2026, 7, 4, 14, 30))); // KST 2026-08-04 23:30
    return justAfterMidnightKST === '2026-08-05' && justBeforeMidnightKST === '2026-08-04';
  }),

  // ── "오늘 수업" 카드 부위 선택 — 근육통·통증은 참고 경고일 뿐 선택을 막지 않는다 ──
  hbaScenario('시나리오A: 2일 전 가슴 근육통(PT 수업) — 최근 3일 이내라 참고 표시 대상(sore)', lib => {
    const sessions = [{ date: '2026-08-08', memberFeedback: { sorenessLevel: '보통', sorenessBodyParts: ['가슴'] } }];
    const info = lib.getHubBodyPartAwareness({ sessions, todayKey: '2026-08-10' });
    return info['가슴']?.kind === 'sore';
  }),
  hbaScenario('시나리오B: 3일 전 어깨 통증 VAS 5 — 최근 7일 이내라 참고 표시 대상(pain), VAS 값도 함께 노출', lib => {
    const ci = [{ date: '2026-08-07', painPart: '어깨', painVas: 5 }];
    const info = lib.getHubBodyPartAwareness({ ci, todayKey: '2026-08-10' });
    return info['어깨']?.kind === 'pain' && info['어깨']?.vas === 5;
  }),
  hbaScenario('시나리오C: 4일 전 근육통 — 최근 3일 초과라 "오늘 수업" 참고 표시에서 제외(히스토리 자체는 건드리지 않음)', lib => {
    const sessions = [{ date: '2026-08-06', memberFeedback: { sorenessLevel: '약간', sorenessBodyParts: ['등'] } }];
    const info = lib.getHubBodyPartAwareness({ sessions, todayKey: '2026-08-10' });
    return info['등'] === undefined;
  }),
  hbaScenario('시나리오D: 8일 전 일반 통증 — 최근 7일 초과라 "오늘 수업" 참고 표시에서 제외', lib => {
    const ci = [{ date: '2026-08-02', painPart: '가슴', painVas: 3 }];
    const info = lib.getHubBodyPartAwareness({ ci, todayKey: '2026-08-10' });
    return info['가슴'] === undefined;
  }),
  hbaScenario('시나리오E: PT 근육통과 개인운동 근육통이 같은 부위(등)에 있으면 가장 최근 기록 하나만 표시(중복 없음)', lib => {
    const sessions = [{ date: '2026-08-05', memberFeedback: { sorenessLevel: '보통', sorenessBodyParts: ['등'] } }];
    const personalWorkouts = [{ id: 'w1', status: 'completed' }];
    const personalSorenessMap = { w1: { workoutDate: '2026-08-08', bodyParts: [{ part: '등', level: 3 }] } };
    const info = lib.getHubBodyPartAwareness({ sessions, personalWorkouts, personalSorenessMap, todayKey: '2026-08-10' });
    return info['등']?.kind === 'sore' && info['등']?.source === 'personal' && info['등']?.date === '2026-08-08';
  }),
  hbaScenario('시나리오F: 같은 부위(가슴)에 근육통과 통증이 동시에 최근 기록으로 있으면 통증 경고를 우선 표시', lib => {
    const sessions = [{ date: '2026-08-09', memberFeedback: { sorenessLevel: '보통', sorenessBodyParts: ['가슴'] } }];
    const ci = [{ date: '2026-08-07', painPart: '가슴', painVas: 4 }];
    const info = lib.getHubBodyPartAwareness({ sessions, ci, todayKey: '2026-08-10' });
    return info['가슴']?.kind === 'pain';
  }),
  hbaScenario('시나리오G: VAS 값 없는 레거시 통증 데이터도 오류 없이 처리되고(vas:null) 참고 표시 대상이 된다', lib => {
    const ci = [{ date: '2026-08-08', painPart: '무릎' }];
    const info = lib.getHubBodyPartAwareness({ ci, todayKey: '2026-08-10' });
    return info['무릎']?.kind === 'pain' && info['무릎']?.vas === null;
  }),

  // ── 관리자 홈 좁은 화면(<768px) 회원 검색 (3차 — 별도 모달/바텀시트 제거, 데스크톱과 동일한 인라인 <input> 직접 배치) ──
  // 1차(dc9cbc7)는 모바일 전용 바텀시트를 열었고, 2차(77da7ce)는 그 바텀시트가 MEMBER_CSS 스코프 밖이라 안 열리던
  // 버그를 고쳤지만, 여전히 "버튼 → 별도 시트"라는 한 단계가 남아 사용성이 나빴다. 3차는 그 우회로 자체를 없애고
  // isWide 여부와 무관하게 searchQuery/handleSearchChange/searchResultsShown/searchHasMore/openMemberFromSearch/
  // todayMemberIds(HomeScreen 로컬 상태) 하나만 쓰는 searchResultsPanel(공유 JSX)을 데스크톱 입력창과 모바일
  // 인라인 입력창이 함께 참조하도록 재구성했다. AdminMemberSearchSheet/mobileSearchOpen은 완전히 삭제됨 —
  // 아래는 그 삭제와 새 인라인 구조를 검증한다.
  ['좁은 화면 회원 검색: 별도 바텀시트/모달(AdminMemberSearchSheet, mobileSearchOpen)이 완전히 제거됐다',
    !app.includes('AdminMemberSearchSheet') &&
    !app.includes('mobileSearchOpen') &&
    !app.includes('setMobileSearchOpen')
  ],
  ['좁은 화면 회원 검색: isWide(768px)가 false면 버튼이 아니라 실제 <input>이 곧바로 렌더링된다(모달을 여는 버튼 없음)',
    /\{!isWide && \(\r?\n\s*<div ref=\{searchWrapRef\}/.test(app) &&
    app.includes('className="home-search-bar" onClick={()=>searchInputRef.current?.focus()}') &&
    app.includes('placeholder="이름으로 회원 검색"') &&
    !/\{!isWide && \(\r?\n\s*<button/.test(app)
  ],
  ['좁은 화면 회원 검색 input: onChange가 기존 handleSearchChange를 그대로 호출한다(새 모바일 전용 검색 상태 없음)',
    (() => {
      const idx = app.indexOf('className="home-search-bar"');
      if (idx === -1) return false;
      const block = app.slice(idx, idx + 1200);
      return block.includes('value={searchQuery}') &&
        block.includes('onChange={handleSearchChange}') &&
        !block.includes('readOnly');
    })()
  ],
  ['좁은 화면 회원 검색: 데스크톱 드롭다운과 완전히 동일한 searchResultsPanel(검색어 없으면 비표시, 회원 클릭 시 openMemberFromSearch)을 공유한다',
    app.includes('const searchResultsPanel = (') &&
    app.includes('{searchOpen && searchQuery.trim().length>0 && searchResultsPanel}') &&
    (app.match(/\{searchOpen && searchQuery\.trim\(\)\.length>0 && searchResultsPanel\}/g) || []).length === 2 &&
    app.includes('onClick={()=>openMemberFromSearch(m)}') &&
    app.includes('검색 결과가 없습니다')
  ],
  ['좁은 화면 회원 검색: 모달이 아니라 페이지 안 일반 input이므로 useLockBodyScroll/useKeyboardAwareViewport(바텀시트 전용 키보드 오프셋 로직)를 쓰지 않는다',
    (() => {
      const start = app.indexOf('function HomeScreen(');
      const nextFnIdx = app.indexOf('\nfunction ', start + 20);
      const slice = app.slice(start, nextFnIdx === -1 ? app.length : nextFnIdx);
      return !slice.includes('useLockBodyScroll') && !slice.includes('useKeyboardAwareViewport') && !slice.includes('--pw-keyboard-offset');
    })()
  ],
  ['768px 이상: 기존 데스크톱 검색창(width:200 고정, isWide&&)은 그대로 유지되고 모바일 입력창과 동시 노출되지 않는다',
    /\{isWide && \(\r?\n\s*<div ref=\{searchWrapRef\} style=\{\{position:"relative",width:200,flexShrink:0\}\}/.test(app) &&
    app.includes('placeholder="회원 검색"') // 데스크톱 placeholder는 좁은 화면과 문구를 다르게 유지(기존 그대로)
  ],
  ['모바일 검색창 placeholder 대비: .home-search-bar 전용 스코프 규칙이 있고, 전역(거의 흰색) 규칙과 분리돼 데스크톱에는 영향 없음',
    app.includes('.home-search-bar input::placeholder{color:') &&
    !app.includes('.home-search-bar input::placeholder{color:rgba(255,255,255')
  ],

  // ════════════════════════════════════════════
  // 유입 분석 개편 (방문계기 데이터 통합 + 분석 리포트 연결 + 마케팅 대시보드)
  // ════════════════════════════════════════════
  acqScenario('유입 정규화 1: 회원 프로필 방문계기(survey.visitRoutes/visitDetail/visitEtc/visitRealMemo)가 그대로 반영된다', L => {
    const r = L.normalizeMemberAcquisitionData({ survey: {
      visitRoutes: ['네이버 블로그', 'AI 검색'], visitDetail: '가격 안내 글', visitEtc: '기타 메모',
      visitRealMemo: '블로그 보고 왔어요', visitAiTool: 'ChatGPT', visitKeyword: '청라 PT',
    }});
    return r.sources.join(',') === '네이버 블로그,AI 검색' && r.sourceDetail === '가격 안내 글'
      && r.otherSource === '기타 메모' && r.memberReason === '블로그 보고 왔어요'
      && r.aiSources.join(',') === 'ChatGPT' && r.keyword === '청라 PT';
  }),
  acqScenario('유입 정규화 2: 과거 온보딩 v2(v2.acquisition.firstTouch 코드값)도 같은 표준 채널로 정규화된다', L => {
    const naver = L.normalizeMemberAcquisitionData({}, { v2: { acquisition: { firstTouch: 'naver_place' } } });
    const ai = L.normalizeMemberAcquisitionData({}, { v2: { acquisition: { firstTouch: 'chatgpt' } } });
    const etc = L.normalizeMemberAcquisitionData({}, { v2: { acquisition: { firstTouch: 'other', firstTouchOther: '헬스장 앞 배너' } } });
    return naver.sources.join(',') === '네이버 플레이스'
      && ai.sources.join(',') === L.ACQ_AI_CHANNEL && ai.aiSources.join(',') === 'ChatGPT'
      && etc.sources.join(',') === '기타' && etc.otherSource === '헬스장 앞 배너';
  }),
  acqScenario('유입 정규화 3: 상담 문서(평탄 필드)의 다른 표기("지인 추천"·"지나가다가")가 회원 프로필 라벨로 통합된다', L => {
    const r = L.normalizeMemberAcquisitionData({ visitRoutes: ['지인 추천', '지나가다가', '네이버 검색'], consultMemo: '친구가 추천함' });
    return r.sources.join(',') === '지인 소개,지나가다 발견,네이버 검색' && r.memberReason === '친구가 추천함';
  }),
  acqScenario('유입 집계 1: 복수 경로는 각 채널에 모두 집계되지만 회원 총계는 중복되지 않는다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: { visitRoutes: ['네이버 블로그', 'AI 검색'] } },
      { id: 'b', name: 'B', startDate: '2026-08-02', survey: { visitRoutes: ['AI 검색'] } },
    ]});
    const s = L.summarizeAcquisitionRows(rows);
    return s.total === 2
      && (s.channels.find(c => c.name === 'AI 검색') || {}).count === 2
      && (s.channels.find(c => c.name === '네이버 블로그') || {}).count === 1;
  }),
  acqScenario('유입 집계 2: 같은 회원이 같은 채널을 중복 선택해도 1명으로만 센다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: { visitRoutes: ['지인 소개', '지인 추천'] } },
    ]});
    const s = L.summarizeAcquisitionRows(rows);
    return s.total === 1 && (s.channels.find(c => c.name === '지인 소개') || {}).count === 1;
  }),
  acqScenario('유입 집계 3: 정식 회원으로 전환된 상담(convertedMemberId / member.consultationId)은 양쪽에 중복 집계되지 않는다', L => {
    const rows = L.buildAcquisitionRows({
      members: [{ id: 'm1', name: '김회원', consultationId: 'c2', startDate: '2026-08-01', survey: { visitRoutes: ['지인 소개'] } }],
      consultations: [
        { id: 'c1', name: '전환됨', convertedMemberId: 'mX', consultDate: '2026-07-20', visitRoutes: ['유튜브'] },
        { id: 'c2', name: '김회원', consultDate: '2026-07-25', visitRoutes: ['지인 소개'] }, // convertedMemberId는 없지만 member.consultationId가 가리킴
        { id: 'c3', name: '미등록', consultDate: '2026-07-28', visitRoutes: ['인스타그램'] },
      ],
    });
    const s = L.summarizeAcquisitionRows(rows);
    return s.total === 2 && s.memberCount === 1 && s.leadCount === 1
      && rows.some(r => r.key === 'lead_c3') && !rows.some(r => r.key === 'lead_c1' || r.key === 'lead_c2');
  }),
  acqScenario('유입 집계 4: 방문 경로가 전혀 없는 회원은 "미기재"로 집계된다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: {} },
      { id: 'b', name: 'B', startDate: '2026-08-02', survey: { visitRoutes: ['유튜브'] } },
    ]});
    const s = L.summarizeAcquisitionRows(rows);
    return s.unknownCount === 1 && s.unknownPct === 50
      && (s.channels.find(c => c.name === L.ACQ_UNKNOWN) || {}).count === 1
      && s.namedChannels.every(c => c.name !== L.ACQ_UNKNOWN);
  }),
  acqScenario('AI 세부 출처: 표기 차이(chat gpt·챗지피티·GPT)는 ChatGPT로 묶고, 미입력은 "세부 출처 미기재"로 집계한다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: { visitRoutes: ['AI 검색'], visitAiTool: 'chat gpt' } },
      { id: 'b', name: 'B', startDate: '2026-08-01', survey: { visitRoutes: ['AI 검색'], visitAiTool: '챗지피티' } },
      { id: 'c', name: 'C', startDate: '2026-08-01', survey: { visitRoutes: ['AI 검색'], visitAiTool: '네이버 Cue' } },
      { id: 'd', name: 'D', startDate: '2026-08-01', survey: { visitRoutes: ['AI 검색'] } },
      { id: 'e', name: 'E', startDate: '2026-08-01', survey: { visitRoutes: ['AI 검색'], visitAiTool: '코파일럿' } },
    ]});
    const s = L.summarizeAcquisitionRows(rows);
    const get = n => (s.aiSources.find(a => a.name === n) || {}).count || 0;
    return s.aiCount === 5 && get('ChatGPT') === 2 && get('네이버 AI 브리핑') === 1
      && get('Copilot') === 1 && get(L.ACQ_AI_UNSPECIFIED) === 1;
  }),
  acqScenario('AI 세부 출처: 매칭되지 않는 자유 입력은 추측하지 않고 "기타 AI 검색"으로 둔다', L => {
    return L.normalizeAiSourceList('회사 사내 검색툴').join(',') === L.ACQ_AI_OTHER
      && L.normalizeAiSourceList('').length === 0
      && L.normalizeAiSourceList('ChatGPT, Perplexity').join(',') === 'ChatGPT,Perplexity';
  }),
  acqScenario('기간 필터: 직전 동일 기간과 비교하고, 전체 기간은 비교 대상이 없음을 명시한다', L => {
    const p30 = L.buildAcquisitionPeriod('30', '2026-08-06');
    const all = L.buildAcquisitionPeriod('all', '2026-08-06');
    return p30.curFrom === '2026-07-08' && p30.curTo === '2026-08-06'
      && p30.prevFrom === '2026-06-08' && p30.prevTo === '2026-07-07' && p30.comparable === true
      && all.comparable === false && L.acqDelta(5, 3, false).text === '비교 데이터 없음';
  }),
  acqScenario('증감 계산: 이전 값이 0이면 Infinity/NaN 대신 "신규 유입 발생"으로 표시한다', L => {
    const a = L.acqDelta(3, 0, true), b = L.acqDelta(0, 0, true), c = L.acqDelta(4, 2, true), d = L.acqDelta(2, 2, true);
    return a.type === 'new' && a.pct === null && a.text === '신규 유입 발생'
      && b.type === 'none' && Number.isFinite(c.pct) && c.pct === 100 && d.type === 'flat';
  }),
  acqScenario('유입일: 방문계기 수정일이 아니라 상담일 → 등록일 순으로 유입일을 잡고, 날짜 없는 레거시는 기간 집계에서 빠진다', L => {
    const withConsult = L.getAcquisitionDate({ consultDate: '2026-07-01', startDate: '2026-07-20', updatedAt: '2026-08-05' });
    const onlyStart = L.getAcquisitionDate({ startDate: '2026-07-20', updatedAt: '2026-08-05' });
    const none = L.getAcquisitionDate({ updatedAt: '2026-08-05' });
    return withConsult === '2026-07-01' && onlyStart === '2026-07-20' && none === ''
      && L.inAcqRange('', '2026-07-08', '2026-08-06') === false;
  }),
  acqScenario('인사이트·추천 액션: 실제 집계값 조건을 만족할 때만, 최대 3개까지 생성된다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: { visitRoutes: ['지인 소개'] } },
      { id: 'b', name: 'B', startDate: '2026-08-02', survey: { visitRoutes: ['지인 소개'] } },
      { id: 'c', name: 'C', startDate: '2026-08-03', survey: { visitRoutes: ['지인 소개'] } },
      { id: 'd', name: 'D', startDate: '2026-08-04', survey: {} },
    ]});
    const period = L.buildAcquisitionPeriod('30', '2026-08-06');
    const cur = L.summarizeAcquisitionRows(rows);
    const prev = L.summarizeAcquisitionRows([]);
    const ins = L.buildAcquisitionInsights(cur, prev, period);
    const act = L.buildAcquisitionActions(cur, prev, period);
    const empty = L.buildAcquisitionInsights(L.summarizeAcquisitionRows([]), prev, period);
    return ins.length > 0 && ins.length <= 3 && act.length > 0 && act.length <= 3
      && ins.some(i => i.text.includes('미기재')) && empty.length === 0;
  }),
  acqScenario('채널 추이: 기간에 따라 일/주/월 단위를 자동 선택하고, 데이터가 없으면 빈 버킷을 반환한다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-03', survey: { visitRoutes: ['유튜브'] } },
    ]});
    const d7 = L.buildAcquisitionBuckets(rows, L.buildAcquisitionPeriod('7', '2026-08-06'), '2026-08-06');
    const d30 = L.buildAcquisitionBuckets(rows, L.buildAcquisitionPeriod('30', '2026-08-06'), '2026-08-06');
    const dAll = L.buildAcquisitionBuckets(rows, L.buildAcquisitionPeriod('all', '2026-08-06'), '2026-08-06');
    const none = L.buildAcquisitionBuckets([], L.buildAcquisitionPeriod('30', '2026-08-06'), '2026-08-06');
    return d7.unit === 'day' && d30.unit === 'week' && dAll.unit === 'month'
      && d7.buckets.some(b => b.byChannel['유튜브'] === 1) && none.buckets.length === 0;
  }),
  acqScenario('개인정보: 방문 이유 카드용 이름 마스킹은 성만 남긴다', L =>
    L.maskAcquisitionName('홍길동') === '홍**' && L.maskAcquisitionName('김민') === '김*' && L.maskAcquisitionName('') === '회원'
  ),

  // ════════════════════════════════════════════
  // 유입 분석: 방문계기 "최근 기록 1개만" 선택(합산 금지) — 이희경 회원 버그 수정
  // ════════════════════════════════════════════
  acqScenario('최신 선택 1: 과거 onboarding(지나가다 발견) + 최근 profile(간판) → 최종 sources는 [간판]만(합쳐지지 않음)', L => {
    const r = L.normalizeMemberAcquisitionData(
      { survey: { visitRoutes: ['간판'], visitUpdatedAt: { toDate: () => new Date('2026-08-06T10:00:00Z') } } },
      { v2: { updatedAt: '2026-08-01T00:00:00.000Z', acquisition: { firstTouch: 'walk_by' } } }
    );
    return r.sources.length === 1 && r.sources[0] === '간판' && r.selectedSource === 'profile';
  }),
  acqScenario('최신 선택 2: 과거 profile(간판, timestamp 없음) + 최근 onboarding(네이버 검색) → 최종 sources는 [네이버 검색]', L => {
    const r = L.normalizeMemberAcquisitionData(
      { survey: { visitRoutes: ['간판'] } }, // visitUpdatedAt 없음 — 이 기능 이전에 저장된 레거시
      { v2: { updatedAt: '2026-08-06T10:00:00.000Z', acquisition: { firstTouch: 'naver_search' } } }
    );
    return r.sources.length === 1 && r.sources[0] === '네이버 검색' && r.selectedSource === 'onboarding';
  }),
  acqScenario('최신 선택 3: profile·onboarding timestamp가 정확히 동일하면 profile 우선', L => {
    const same = { toDate: () => new Date('2026-08-01T00:00:00Z') };
    const r = L.normalizeMemberAcquisitionData(
      { survey: { visitRoutes: ['간판'], visitUpdatedAt: same } },
      { v2: { updatedAt: '2026-08-01T00:00:00.000Z', acquisition: { firstTouch: 'walk_by' } } }
    );
    return r.selectedSource === 'profile' && r.sources[0] === '간판';
  }),
  acqScenario('최신 선택 4: 양쪽 모두 timestamp가 없으면 profile 우선', L => {
    const r = L.normalizeMemberAcquisitionData(
      { survey: { visitRoutes: ['간판'] } },
      { v2: { acquisition: { firstTouch: 'walk_by' } } } // v2.updatedAt 없음
    );
    return r.selectedSource === 'profile' && r.sources[0] === '간판';
  }),
  acqScenario('최신 선택 5: 최신 profile에서 복수 경로를 선택했으면 그 복수 경로만 그대로 집계된다', L => {
    const r = L.normalizeMemberAcquisitionData(
      { survey: { visitRoutes: ['간판', '지인 소개'], visitUpdatedAt: { toDate: () => new Date('2026-08-06') } } },
      { v2: { updatedAt: '2026-08-01T00:00:00.000Z', acquisition: { firstTouch: 'walk_by' } } }
    );
    return r.sources.length === 2 && r.sources.includes('간판') && r.sources.includes('지인 소개');
  }),
  acqScenario('최신 선택 6: 서로 다른 출처의 방문 경로는 절대 합쳐지지 않는다(선택된 출처의 채널만 반환)', L => {
    const r = L.normalizeMemberAcquisitionData(
      { survey: { visitRoutes: ['간판'], visitUpdatedAt: { toDate: () => new Date('2026-08-06') } } },
      { v2: { updatedAt: '2026-08-01T00:00:00.000Z', acquisition: { firstTouch: 'referral' } } }
    );
    return !r.sources.includes('지인 소개') && r.sources.length === 1;
  }),
  acqScenario('최신 선택 7: 온보딩 firstTouch(채널 통계)와 decisionTouch(상담 결정 상세)는 채널로 중복 집계되지 않는다', L => {
    const r = L.normalizeMemberAcquisitionData({}, { v2: {
      updatedAt: '2026-08-01T00:00:00.000Z',
      acquisition: { firstTouch: 'naver_blog', decisionTouch: 'price' },
    } });
    return r.sources.length === 1 && r.sources[0] === '네이버 블로그' && r.decisionTouch && r.decisionTouch !== '네이버 블로그';
  }),
  acqScenario('출처 우선순위 상수: profile > onboarding > consultation 순서가 유지된다', L =>
    L.acqPickNewerCandidate({ key: 'onboarding', hasTs: false }, { key: 'profile', hasTs: false }).key === 'profile' &&
    L.acqPickNewerCandidate({ key: 'consultation', hasTs: false }, { key: 'onboarding', hasTs: false }).key === 'onboarding'
  ),
  ['이희경 회원: HubScreen 사전 문진 카드와 유입 분석 목록이 같은 normalizeMemberAcquisitionData 결과(selectedSource)로 출처·날짜 캡션을 표시한다',
    app.includes('acqSourceOriginLabel(acqSummary.selectedSource)') &&
    app.includes('acqSourceOriginLabel(r.acq.selectedSource)') &&
    app.includes("const ACQ_SOURCE_ORIGIN_LABEL = { profile: \"회원정보에서 수정\", onboarding: \"온보딩 응답\", consultation: \"상담 등록 시 입력\" };")
  ],
  ['방문 경로 칩 UI: 예전 표기(예: "지나가다가")로 저장된 값도 정규화 후 비교해 현재 옵션 칩에 선택됨으로 보인다(안 보이는 채로 남아 중복 저장되는 문제 방지)',
    app.includes('? list.some(x => normalizeAcquisitionChannel(x) === label)') &&
    app.includes(': normalizeAcquisitionChannel(value) === label;') &&
    app.includes('onChange(isActive(label) ? list.filter(x => normalizeAcquisitionChannel(x) !== label) : [...list, label]);')
  ],

  // ════════════════════════════════════════════
  // 방문계기 수정 timestamp(survey.visitUpdatedAt) — 무관한 회원정보 수정으로는 갱신되지 않아야 함
  // ════════════════════════════════════════════
  visitAtScenario('방문계기 timestamp 1: 방문계기 이외 필드만 바뀌면(이름·체중 등) visitUpdatedAt이 갱신되지 않는다', L => {
    const prev = { visitRoutes: ['간판'], gender: '남', weight: '70' };
    const next = { visitRoutes: ['간판'], gender: '남', weight: '75' }; // 방문계기 필드는 동일, 체중만 변경
    const r = L.computeVisitUpdatedAt(prev, next);
    return r === undefined;
  }),
  visitAtScenario('방문계기 timestamp 2: visitRoutes가 실제로 바뀌면 serverTimestamp가 새로 찍힌다', L => {
    const prev = { visitRoutes: ['지나가다 발견'] };
    const next = { visitRoutes: ['간판'] };
    const r = L.computeVisitUpdatedAt(prev, next);
    return r === '__SERVER_TS__';
  }),
  visitAtScenario('방문계기 timestamp 3: 과거에 있던 visitUpdatedAt은 실제 변경이 없으면 그대로 이어간다(유실 없음)', L => {
    const prev = { visitRoutes: ['간판'], visitUpdatedAt: 'OLD_TS' };
    const next = { visitRoutes: ['간판'] };
    return L.computeVisitUpdatedAt(prev, next) === 'OLD_TS';
  }),
  visitAtScenario('방문계기 timestamp 4: 배열 순서만 다른 동일 경로 선택은 "변경 없음"으로 판정된다(중복 저장 방지)', L =>
    L.surveyVisitFieldsEqual({ visitRoutes: ['간판', '지인 소개'] }, { visitRoutes: ['지인 소개', '간판'] }) === true
  ),
  ['방문계기 timestamp: updateMember이 실제 변경 여부를 확인해 survey.visitUpdatedAt을 조건부로 갱신한다',
    db.includes('const vAt = computeVisitUpdatedAt(before.survey, nextSurvey);') &&
    db.includes('if (vAt !== undefined) nextSurvey.visitUpdatedAt = vAt; else delete nextSurvey.visitUpdatedAt;')
  ],
  ['방문계기 timestamp: addMember도 신규 등록 시점에 방문 경로가 있으면 최초 timestamp를 남긴다',
    db.includes('if (payload.survey && surveyHasAnyVisitData(payload.survey)) {') &&
    db.includes('payload.survey = { ...payload.survey, visitUpdatedAt: serverTimestamp() };')
  ],
  ['방문계기 timestamp: Firestore Rules는 트레이너의 survey 쓰기를 필드 제한 없이 이미 허용 중이라(회원 본인 쓰기만 memberProfileUpdateKeysAllowed로 제한) 별도 화이트리스트 추가가 필요 없다',
    (() => {
      const start = firestoreRules.indexOf('match /members/{memberId}');
      const slice = firestoreRules.slice(start, start + 1200).replace(/\s+/g, ' ');
      const trainerBranch = slice.slice(slice.indexOf('allow update:'), slice.indexOf('|| (resource.data.memberUid'));
      return trainerBranch.includes('resource.data.trainerUid == uid()') && !trainerBranch.includes('memberProfileUpdateKeysAllowed');
    })()
  ],

  // ════════════════════════════════════════════
  // 분석 리포트: 회원별 분석 카드 제거 + 방문 경로 선택지 공통화
  // ════════════════════════════════════════════
  ['분석 리포트: 회원별 분석 제목과 카드 목록(ANALYTICS_MEMBER_REPORTS)이 더 이상 없다',
    !app.includes('회원별 분석') &&
    !app.includes('ANALYTICS_MEMBER_REPORTS') &&
    !app.includes('function goMembers(')
  ],
  ['분석 리포트: 유입 분석 · 회원 입력 현황 두 카드는 그대로 노출된다',
    app.includes('{ key: "referral", icon: "📊", title: "유입 분석", sub: "방문 경로와 마케팅 성과" }') &&
    app.includes('{ key: "memberInputStatus", icon: "🗂️", title: "회원 입력 현황", sub: "회원앱 입력 참여도 한눈에 보기" }')
  ],
  ['분석 리포트: 카드 2개뿐이라도 화면 폭을 억지로 채우지 않도록 별도의 좁은 최대 너비를 쓴다',
    app.includes('const contentMaxWidth = isWide ? 720 : 820;')
  ],
  ['회원 상세 분석도구: 운동 분석·훈련 피드백·상담 리포트·대사 추정·평가 기록·운동 라이브러리·컨디셔닝·AI 루틴 추천 메뉴가 그대로 유지된다',
    app.includes('{menuBtn("🏋️","운동 분석","근력 · 훈련량 · 컨디션 · 부위 변화","exerciseAnalysis")}') &&
    app.includes('{menuBtn("📋","훈련 피드백","다음 수업을 위한 훈련 요약","feedback")}') &&
    app.includes('{menuBtn("🗣️","상담 리포트","회원의 변화를 한눈에 확인하고 다음 목표를 준비합니다","counselReport")}') &&
    app.includes('{menuBtn("🔥","대사 추정","유산소 · 체중 분석","metabolism")}') &&
    app.includes('{menuBtn("📋","평가 기록","체형 · 기능 · 인체도","assessment")}') &&
    app.includes('{menuBtn("📚","운동 라이브러리","부위별 운동 기록","library")}') &&
    app.includes('{menuBtn("🧘","컨디셔닝","매일 기능 운동","daily_conditioning")}') &&
    app.includes('{menuBtn("🤖","AI 루틴 추천",t("수업기록 기반","운동기록 기반"),"ai_routine")}')
  ],
  acqScenario('방문 경로 공통화: 엘리베이터 광고·간판이 지나가다 발견과 별도 채널로 정규화된다', L =>
    L.normalizeAcquisitionChannel('엘베 광고') === '엘리베이터 광고' &&
    L.normalizeAcquisitionChannel('아파트 엘리베이터 광고') === '엘리베이터 광고' &&
    L.normalizeAcquisitionChannel('elevator_ad') === '엘리베이터 광고' &&
    L.normalizeAcquisitionChannel('외부 간판') === '간판' &&
    L.normalizeAcquisitionChannel('signage') === '간판' &&
    L.normalizeAcquisitionChannel('지나가다가') === '지나가다 발견' &&
    L.normalizeAcquisitionChannel('엘리베이터 광고') !== L.normalizeAcquisitionChannel('지나가다 발견') &&
    L.normalizeAcquisitionChannel('간판') !== L.normalizeAcquisitionChannel('지나가다 발견')
  ),
  acqScenario('방문 경로 공통화: 엘리베이터 광고·간판이 집계에서도 서로 다른 채널로 각각 카운트된다', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: { visitRoutes: ['엘리베이터 광고'] } },
      { id: 'b', name: 'B', startDate: '2026-08-01', survey: { visitRoutes: ['간판'] } },
      { id: 'c', name: 'C', startDate: '2026-08-01', survey: { visitRoutes: ['지나가다 발견'] } },
    ]});
    const s = L.summarizeAcquisitionRows(rows);
    return (s.channels.find(c => c.name === '엘리베이터 광고') || {}).count === 1
      && (s.channels.find(c => c.name === '간판') || {}).count === 1
      && (s.channels.find(c => c.name === '지나가다 발견') || {}).count === 1;
  }),
  acqScenario('방문 경로 공통화: 지인 소개·기존 회원 소개·referral 레거시 코드가 명확한 경우에만 각각 정규화되고, 모호한 "소개"는 임의로 분류되지 않는다', L =>
    L.normalizeAcquisitionChannel('지인 추천') === '지인 소개' &&
    L.normalizeAcquisitionChannel('referral') === '지인 소개' &&
    L.normalizeAcquisitionChannel('회원 소개') === '기존 회원 소개' &&
    L.normalizeAcquisitionChannel('지인 소개') !== L.normalizeAcquisitionChannel('기존 회원 소개') &&
    L.normalizeAcquisitionChannel('소개') === '소개' // 모호한 값은 alias 매핑 없이 원문 그대로 유지(임의 분류 금지)
  ),
  acqScenario('AI 세부 출처: "모름"은 특정 AI가 아니라 세부 출처 미기재로 집계된다(기타 AI 검색과 구분)', L => {
    const rows = L.buildAcquisitionRows({ members: [
      { id: 'a', name: 'A', startDate: '2026-08-01', survey: { visitRoutes: [L.ACQ_AI_CHANNEL], visitAiTool: '모름' } },
    ]});
    const s = L.summarizeAcquisitionRows(rows);
    return (s.aiSources.find(a => a.name === L.ACQ_AI_UNSPECIFIED) || {}).count === 1
      && !s.aiSources.some(a => a.name === L.ACQ_AI_OTHER);
  }),
  ['방문 경로 공통 상수: ACQUISITION_CHANNEL_OPTIONS 하나를 상담 등록·회원 프로필 두 화면이 함께 사용한다(하드코딩 배열 중복 제거)',
    (app.match(/value={visitRoutes} onChange={setVisitRoutes}/g) || []).length >= 1 &&
    (app.match(/<AcquisitionChannelSelector value={visitRoutes} onChange={setVisitRoutes}/g) || []).length === 3 &&
    !app.includes('["네이버 검색","네이버 블로그","인스타그램","유튜브","AI 검색","지인 추천","지나가다가","당근","숨고","기타"]') &&
    !app.includes('["네이버 블로그","네이버 플레이스","인스타그램","유튜브","AI 검색","지인 소개","기존 회원 소개","지나가다 발견","카카오 지도","기타"]')
  ],
  ['방문 경로 공통 상수: 저장 형식은 기존과 동일하게 라벨 문자열을 그대로 쓴다(코드값을 Firestore에 저장하지 않음)',
    app.includes('const toggle = (label) => {') &&
    app.includes('onChange(isActive(label) ? list.filter(x => normalizeAcquisitionChannel(x) !== label) : [...list, label]);')
  ],
  ['AI 세부 출처 공통 상수: ChatGPT·Gemini·Claude·Perplexity·Copilot·네이버 AI 브리핑·기타 AI 검색·모름 8종을 상담 등록·회원 프로필이 함께 사용',
    app.includes('const ACQ_AI_TOOL_OPTIONS = ["ChatGPT", "Gemini", "Claude", "Perplexity", "Copilot", "네이버 AI 브리핑", ACQ_AI_OTHER, "모름"];') &&
    (app.match(/<AcquisitionAiToolSelector value={visitAiTool} onChange={setVisitAiTool}/g) || []).length === 3
  ],
  ['AI 세부 출처: 목록에 없는 기존 저장값(레거시 자유 입력)은 저장을 지우지 않고 캡션으로 보여준다',
    app.includes('현재 저장값 · {value} (목록에 없는 값이라 그대로 유지했습니다. 필요하면 위에서 다시 선택해주세요.)')
  ],
  ['지인 소개/기타 선택 시 부가 입력(소개자 이름, 기타 경로 메모)은 기존 필드(visitReferer/visitEtc)를 그대로 사용',
    app.includes('(visitRoutes.includes("지인 소개")||visitRoutes.includes("기존 회원 소개")) && (') &&
    app.includes('value={visitReferer} onChange={e=>setVisitReferer(e.target.value)}')
  ],

  ['회원 프로필 수정: 저장 시 members 배열 상태도 함께 갱신 — 방문계기 수정이 유입 분석에 즉시 반영된다',
    app.includes('setMembers(prev => prev.map(m => m.id === member.id ? {...m, ...publicD} : m));')
  ],
  ['방문계기 탭: 저장된 방문 계기 상세 메모가 초기값 1순위(연산자 우선순위 버그로 회원 메모에 덮어써지지 않음)',
    app.includes('sv.visitDetail || initial?.visitDetail || (initial?.memo?.includes("방문") ? initial.memo : "")') &&
    !app.includes('initial?.memo?.includes("방문") ? initial?.memo : sv.visitDetail || ""')
  ],
  ['방문계기 탭: 같은 필드(survey.visitDetail)를 쓰던 중복 입력칸("AI가 추천한 내용 메모") 제거 — 저장 필드 구성은 그대로',
    !app.includes('placeholder="AI가 어떤 내용을 추천했는지 메모"') &&
    (app.match(/value=\{visitDetail\} onChange=\{e=>setVisitDetail\(e\.target\.value\)\}/g) || []).length === 1 &&
    app.includes('visitRoutes, visitEtc, visitDetail, visitAiTool, visitKeyword, visitReferer, visitRealMemo, visitAiMemo,')
  ],
  ['유입 분석: 회원 프로필 방문계기 · 상담 문서 · 온보딩 v2 세 구조를 하나의 공용 selector로 읽되, 합치지 않고 최근 기록 1개만 선택한다',
    app.includes('function normalizeMemberAcquisitionData(entity, onboarding)') &&
    app.includes('const ac = (onboarding && onboarding.v2 && onboarding.v2.acquisition) || (e.v2 && e.v2.acquisition) || {};') &&
    app.includes('.reduce(acqPickNewerCandidate, null);') &&
    !app.includes('acqArr(sv.visitRoutes).forEach(pushSource);') // 예전 "전부 합산" 방식이 남아있지 않은지 확인
  ],
  ['유입 분석: 회원 상세(사전 문진 카드)도 같은 정규화 함수를 사용한다(표기 불일치 방지)',
    (app.match(/normalizeMemberAcquisitionData\(member, ob\)/g) || []).length === 2 &&
    !app.includes("const legacyRoutes = Array.isArray(member?.survey?.visitRoutes)")
  ],
  ['유입 분석: 온보딩 유입 응답은 기존 memberOnboarding/main을 읽기만 하고 새 컬렉션·필드를 만들지 않는다',
    db.includes('export async function getMemberAcquisitionOnboardingMap') &&
    db.includes('const acquisition = snap.data()?.v2?.acquisition;') &&
    !db.includes('collection(db, "acquisition")')
  ],
  ['유입 분석: 대표(TEO)·테스트 회원 제외 규칙(isRegularAdminMember)을 기존 그대로 유지',
    (() => {
      const start = app.indexOf('function ReferralStatsScreen(');
      const slice = app.slice(start, start + 3000);
      return slice.includes('members.filter(isRegularAdminMember)');
    })()
  ],
  ['유입 분석: 기본 기간은 최근 30일이고 7/30/90/전체 필터를 모든 카드가 공유한다',
    app.includes('const [period, setPeriod] = useState("30");') &&
    app.includes('[["7", "최근 7일"], ["30", "최근 30일"], ["90", "최근 90일"], ["all", "전체"]]') &&
    app.includes('const cur = useMemo(() => summarizeAcquisitionRows(curRows), [curRows]);') &&
    app.includes('const prev = useMemo(() => summarizeAcquisitionRows(prevRows), [prevRows]);')
  ],
  ['유입 분석: 복수 선택으로 합계가 100%를 넘을 수 있다는 안내와 중복 없는 총 인원 기준을 함께 표시',
    app.includes('복수 선택 기준으로 채널별 집계되어 합계가 100%를 초과할 수 있습니다') &&
    app.includes('복수 선택 기반 참고 지표')
  ],
  ['유입 분석: 전체 목록 필터(전체/정식 회원/미등록 상담/AI 검색/지인 소개/미기재)와 통합 검색을 제공',
    app.includes('const ACQ_LIST_FILTERS = [') &&
    app.includes('{ key: "unknown", label: "미기재" }') &&
    app.includes('placeholder="회원 이름 · 방문 경로 · 방문 이유 · 콘텐츠 메모 검색"')
  ],
  ['유입 분석: 목록에서 회원 상세·상담 상세로 이동 가능(정식 회원은 goHub, 상담 고객은 상담 상세)',
    app.includes('onOpenMember={m=>goHub(m)}') &&
    app.includes('onOpenConsultation={c=>{ setEditConsultation(c); setScreen("consultationForm"); }}')
  ],
  ['분석 리포트: 사이드바·홈 퀵메뉴의 "분석 리포트"가 준비 중(goCs)이 아니라 실제 화면(report)으로 이동',
    app.includes('{key:"report",   label:"분석 리포트",   icon:icBr, fn:()=>setScreen("report")},') &&
    app.includes('<QuickMenuTile icon={qr} label="분석 리포트" onClick={()=>setScreen("report")} />')
  ],
  ['분석 리포트: 유입 분석 카드(제목 "유입 분석" · 보조설명 "방문 경로와 마케팅 성과")를 명확히 노출',
    app.includes('{ key: "referral", icon: "📊", title: "유입 분석", sub: "방문 경로와 마케팅 성과" }') &&
    app.includes('function AnalyticsReportScreen(')
  ],
  ['분석 리포트 → 유입 분석: 화면을 복제하지 않고 회원 상세와 같은 ReferralStatsScreen 하나를 재사용',
    (app.match(/<ReferralStatsScreen/g) || []).length === 1 &&
    (app.match(/function ReferralStatsScreen\(/g) || []).length === 1
  ],
  ['분석 리포트 진입 시 뒤로가기: 유입 분석·회원 입력 현황이 진입 경로(회원 상세 / 분석 리포트)로 되돌아간다',
    app.includes('const [analyticsReturn, setAnalyticsReturn] = useState("hub");') &&
    app.includes('onOpenReport={key=>{ setAnalyticsReturn("report"); setScreen(key); }}') &&
    (app.match(/setScreen\(analyticsReturn === "report" \? "report" : "hub"\)/g) || []).length === 2 &&
    app.includes('setAnalyticsReturn("hub"); // 회원 상세로 들어왔으므로')
  ],
  // ── PT 잔여 횟수 · 재등록 관리 ──
  ptScenario('PT 잔여: 초기 설정 전 회원은 잔여 0회가 아니라 "미설정"으로 표시된다', L => {
    const b = L.getPtBalance({ id: 'mA' }, [ptSession()], [], PT_TODAY);
    return b.initialized === false && b.remaining === null && b.status.label === '미설정' && b.debits === 0;
  }),
  ptScenario('PT 잔여: 초기 잔여 8회를 설정하면 잔여는 그대로 8회다(과거 기록으로 재계산하지 않음)', L => {
    const b = L.getPtBalance(ptMember(), [], [], PT_TODAY);
    return b.initialized === true && b.remaining === 8 && b.baselineRemaining === 8;
  }),
  ptScenario('PT 잔여: 기준일 이전에 이미 완료된 수업 20건은 다시 차감되지 않는다(잔여 8 유지)', L => {
    const past = Array.from({ length: 20 }, (_, i) => ptSession({
      id: `old${i}`, date: '2026-07-20',
      createdAt: '2026-07-20T01:00:00.000Z', publishedAt: '2026-07-20T02:00:00.000Z', completedAt: '2026-07-20T02:00:00.000Z',
    }));
    const b = L.getPtBalance(ptMember(), past, [], PT_TODAY);
    return b.debits === 0 && b.remaining === 8;
  }),
  ptScenario('PT 잔여: 기준일 이후 정상 수업이 완료되면 8 → 7로 자동 차감된다', L => {
    const b = L.getPtBalance(ptMember(), [ptSession()], [], PT_TODAY);
    return b.debits === 1 && b.remaining === 7;
  }),
  ptScenario('PT 잔여: 같은 수업을 수정·재저장·공개취소·재공개해도 중복 차감되지 않는다(7 → 7)', L => {
    const base = ptSession();
    const resaved = { ...base, updatedAt: '2026-08-11T05:00:00.000Z' };          // 수정 후 재저장
    const unpublished = { ...base, isPublished: false, status: 'completed' };     // 회원 공개 취소
    const republished = { ...base, isPublished: true, status: 'published' };      // 다시 공개
    const one = L.getPtBalance(ptMember(), [base], [], PT_TODAY).remaining;
    const many = L.getPtBalance(ptMember(), [base, resaved, unpublished, republished], [], PT_TODAY);
    // 공개를 취소해도(status "completed") 완료된 수업이므로 차감은 유지되고, 몇 번을 다시 세도 1회다
    return one === 7 && many.debits === 1 && many.remaining === 7
      && L.getPtBalance(ptMember(), [unpublished], [], PT_TODAY).remaining === 7;
  }),
  ptScenario('PT 잔여: 0회차 체험수업은 차감되지 않는다', L => {
    const trials = [ptSession({ id: 't1', sessionNo: 0 }), ptSession({ id: 't2', sessionNo: '0' }), ptSession({ id: 't3', sessionNo: '0회차' })];
    const b = L.getPtBalance(ptMember(), trials, [], PT_TODAY);
    return b.debits === 0 && b.remaining === 8;
  }),
  ptScenario('PT 잔여: 미래에 잡아놓은 다음 수업·운동 내용 없는 예약은 차감되지 않는다', L => {
    const future = ptSession({ id: 'f1', date: '2026-09-20', completedAt: '2026-08-20T02:00:00.000Z' });
    const booking = ptSession({ id: 'b1', exercises: [] }); // 날짜만 잡아둔 예약(운동 기록 없음)
    const b = L.getPtBalance(ptMember(), [future, booking], [], PT_TODAY);
    return b.debits === 0 && b.remaining === 8;
  }),
  ptScenario('PT 잔여: 준비만 하고 완료(회원 공개)하지 않은 임시저장 수업은 차감되지 않는다', L => {
    const draft = ptSession({ id: 'd1', isPublished: false, status: 'draft' });
    const b = L.getPtBalance(ptMember(), [draft], [], PT_TODAY);
    return b.debits === 0 && b.remaining === 8 && L.isPtDebitableSession(draft, PT_TODAY) === false;
  }),
  ptScenario('PT 잔여: 2:1 수업은 회원별 세션 문서 기준으로 각자 1회씩만 차감된다', L => {
    // 2:1은 members/{id}/sessions에 회원마다 각자 문서가 저장되므로, 회원별 배열을 넣으면 각각 1회다
    const pairA = ptSession({ id: 'pa', sessionType: '2:1', pairMemberId: 'mB' });
    const pairB = ptSession({ id: 'pb', sessionType: '2:1', pairMemberId: 'mA' });
    const a = L.getPtBalance(ptMember({ id: 'mA' }), [pairA], [], PT_TODAY);
    const b = L.getPtBalance(ptMember({ id: 'mB', ptBalanceBaselineRemaining: 5 }), [pairB], [], PT_TODAY);
    return a.debits === 1 && a.remaining === 7 && b.debits === 1 && b.remaining === 4;
  }),
  ptScenario('PT 잔여: 잔여 3회 상태에서 20회 재등록하면 23회가 된다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 3 });
    const regs = [{ id: 'r1', type: 'renewal', delta: 20, date: '2026-08-20' }];
    const b = L.getPtBalance(m, [], regs, PT_TODAY);
    return b.remaining === 23 && b.renewalAdded === 20;
  }),
  ptScenario('PT 잔여: 재등록을 추가하면 재등록 횟수가 2 → 3으로 증가한다', L => {
    const before = L.getPtBalance(ptMember(), [], [], PT_TODAY);
    const after = L.getPtBalance(ptMember(), [], [{ id: 'r1', type: 'renewal', delta: 20, date: '2026-08-20' }], PT_TODAY);
    // 잔여 보정(adjustment)은 재등록 횟수를 올리지 않는다
    const adj = L.getPtBalance(ptMember(), [], [{ id: 'a1', type: 'adjustment', delta: 1, date: '2026-08-20' }], PT_TODAY);
    return before.renewalCount === 2 && after.renewalCount === 3 && adj.renewalCount === 2;
  }),
  ptScenario('PT 잔여: 회원별 데이터가 서로 섞이지 않는다(각자 baseline·세션·등록 이력만 사용)', L => {
    const a = L.getPtBalance(ptMember({ id: 'mA', ptBalanceBaselineRemaining: 8 }), [ptSession({ id: 'sa' })], [], PT_TODAY);
    const b = L.getPtBalance(ptMember({ id: 'mB', ptBalanceBaselineRemaining: 2, ptBalanceBaselineRenewalCount: 0 }), [], [{ id: 'r9', type: 'renewal', delta: 10, date: '2026-08-15' }], PT_TODAY);
    return a.remaining === 7 && a.renewalCount === 2 && b.remaining === 12 && b.renewalCount === 1;
  }),
  ptScenario('PT 잔여: 수동 보정 +1은 잔여를 늘리고 -1은 줄인다(사유와 함께 이력으로 남음)', L => {
    const plus = L.getPtBalance(ptMember(), [], [{ id: 'a1', type: 'adjustment', delta: 1, date: '2026-08-20', memo: '서비스 수업' }], PT_TODAY);
    const minus = L.getPtBalance(ptMember(), [], [{ id: 'a2', type: 'adjustment', delta: -1, date: '2026-08-20', memo: '누락 수업 반영' }], PT_TODAY);
    return plus.remaining === 9 && plus.adjustTotal === 1 && minus.remaining === 7 && minus.adjustTotal === -1;
  }),
  ptScenario('PT 잔여: 잔여 0회인데 수업이 완료되면 화면은 0회를 유지하고 "잔여 횟수 확인 필요"를 알린다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 0 });
    const b = L.getPtBalance(m, [ptSession()], [], PT_TODAY);
    return b.rawRemaining === -1 && b.remaining === 0 && b.overdrawn === true
      && b.status.label === '잔여 횟수 확인 필요' && L.needsPtRenewalNotice(b) === true;
  }),
  ptScenario('PT 잔여: 재등록 안내 기준(6회 이상 정상 / 5회 이하 준비 / 3회 이하 안내 / 0회 소진)', L => {
    const at = n => L.getPtBalance(ptMember({ ptBalanceBaselineRemaining: n }), [], [], PT_TODAY);
    return at(6).status.label === '정상' && at(5).status.label === '재등록 준비'
      && at(4).status.label === '재등록 준비' && at(3).status.label === '재등록 안내 필요'
      && at(1).status.label === '재등록 안내 필요' && at(0).status.label === '수업 소진'
      && L.needsPtRenewalNotice(at(6)) === false && L.needsPtRenewalNotice(at(3)) === true
      && L.needsPtRenewalNotice(L.getPtBalance({ id: 'x' }, [], [], PT_TODAY)) === false;
  }),
  ptScenario('PT 잔여: 완료 시각(completedAt·publishedAt)이 전혀 없는 레거시 수업은 판단 불가로 차감하지 않는다', L => {
    const legacy = ptSession({ id: 'lg', completedAt: undefined, publishedAt: undefined });
    return L.getPtSessionCompletedAtMs(legacy) === null
      && L.getPtBalance(ptMember(), [legacy], [], PT_TODAY).debits === 0;
  }),
  ptScenario('PT 잔여: 차감 기준 시각은 completedAt(1순위) → publishedAt(2순위)이며 createdAt·updatedAt은 쓰지 않는다', L => {
    const ms = v => new Date(v).getTime();
    // completedAt이 있으면 publishedAt이 나중이어도 completedAt을 쓴다(재공개로 publishedAt이 갱신돼도 완료 시각은 고정)
    const both = L.getPtSessionCompletedAtMs({ completedAt: '2026-08-10T02:00:00.000Z', publishedAt: '2026-08-25T02:00:00.000Z' });
    // completedAt 도입 이전 기록은 publishedAt으로 판단
    const onlyPublished = L.getPtSessionCompletedAtMs({ publishedAt: '2026-08-10T02:00:00.000Z' });
    // createdAt·updatedAt만 있는 기록은 판단 불가 → 차감하지 않는다
    const onlyCreated = L.getPtSessionCompletedAtMs({ createdAt: '2026-08-10T02:00:00.000Z', updatedAt: '2026-08-30T02:00:00.000Z' });
    return both === ms('2026-08-10T02:00:00.000Z') && onlyPublished === ms('2026-08-10T02:00:00.000Z') && onlyCreated === null;
  }),
  // ── 실제 운영 시나리오 A~D ──
  ptScenario('PT 잔여 시나리오 A: 8/6 초안 생성 → 8/7 기준 8회 설정 → 8/8 실제 완료 → 잔여 7회(초안 생성일 때문에 차감 누락되지 않음)', L => {
    const s = ptSession({
      id: 'sA', date: '2026-08-08',
      createdAt: '2026-08-06T05:00:00.000Z',    // 기준일 이전에 미리 만들어 둔 초안
      publishedAt: '2026-08-08T11:00:00.000Z',
      completedAt: '2026-08-08T11:00:00.000Z',  // 실제 완료(회원 공개)는 기준일 이후
    });
    const b = L.getPtBalance(ptMember(), [s], [], PT_TODAY);
    return b.debits === 1 && b.remaining === 7;
  }),
  ptScenario('PT 잔여 시나리오 B: 8/6 이미 완료된 과거 수업 → 8/7 기준 8회 설정 → 잔여 8회 그대로(과거 완료 수업 재차감 없음)', L => {
    const s = ptSession({
      id: 'sB', date: '2026-08-06',
      createdAt: '2026-08-06T05:00:00.000Z', publishedAt: '2026-08-06T11:00:00.000Z', completedAt: '2026-08-06T11:00:00.000Z',
    });
    const b = L.getPtBalance(ptMember(), [s], [], PT_TODAY);
    return b.debits === 0 && b.remaining === 8;
  }),
  ptScenario('PT 잔여 시나리오 B-2: 기준일 이전 날짜의 수업은 완료 시각이 기준 이후로 찍혀도 차감하지 않는다(소급 차감 안전망)', L => {
    // completedAt 도입 이전에 공개됐던 과거 수업이 나중에 재공개되며 완료 시각이 늦게 잡히는 경우
    const s = ptSession({
      id: 'sB2', date: '2026-08-06',
      createdAt: '2026-08-06T05:00:00.000Z', publishedAt: '2026-08-20T11:00:00.000Z', completedAt: '2026-08-20T11:00:00.000Z',
    });
    return L.getPtBalance(ptMember(), [s], [], PT_TODAY).debits === 0;
  }),
  ptScenario('PT 잔여 시나리오 C: 완료 -1 → 수정 변화없음 → 공개취소 변화없음 → 재공개 변화없음', L => {
    const m = ptMember();
    const done = ptSession({ id: 'sC' });
    const afterDone = L.getPtBalance(m, [done], [], PT_TODAY).remaining;
    // 수정·재저장: updatedAt만 갱신되고 completedAt은 그대로
    const edited = { ...done, updatedAt: '2026-08-12T03:00:00.000Z' };
    const afterEdit = L.getPtBalance(m, [edited], [], PT_TODAY).remaining;
    // 공개 취소: isPublished false + status "completed", publishedAt은 null이 되지만 completedAt은 보존된다
    const unpublished = { ...edited, isPublished: false, status: 'completed', publishedAt: null };
    const afterUnpublish = L.getPtBalance(m, [unpublished], [], PT_TODAY).remaining;
    // 재공개: publishedAt은 새 시각으로 갱신되지만 completedAt은 최초 완료 시각 그대로
    const republished = { ...unpublished, isPublished: true, status: 'published', publishedAt: '2026-08-15T03:00:00.000Z' };
    const afterRepublish = L.getPtBalance(m, [republished], [], PT_TODAY).remaining;
    return afterDone === 7 && afterEdit === 7 && afterUnpublish === 7 && afterRepublish === 7;
  }),
  ['PT 잔여 시나리오 C: 완료 확정 시각(completedAt)은 최초 공개 때 1회만 기록되고 공개취소·재공개로 덮어쓰지 않는다',
    // publishSession: completedAt이 이미 있으면 patch 자체를 만들지 않는다(재공개해도 최초 완료 시각 유지)
    db.includes('if (prev && !prev.completedAt) completedAtPatch = { completedAt: prev.publishedAt || serverTimestamp() };')
    // unpublishSession: publishedAt을 null로 지우기 전에 완료 시각을 completedAt으로 보존한다
    && db.includes('if (prev && !prev.completedAt && prev.publishedAt) completedAtPatch = { completedAt: prev.publishedAt };')
    && db.includes('publishedAt: null,')
  ],
  // ── 홈 회원 목록 잔여 통일 ──
  ptScenario('PT 잔여(홈): 초기 설정 전 회원은 "잔여 미설정" — 0회로 표시되지 않는다', L => {
    const s = L.getPtBalanceSummary({ id: 'm1', totalSessions: '20회' }); // 레거시 totalSessions가 있어도 무시
    return s.initialized === false && s.remaining === null && s.status.label === '미설정';
  }),
  ptScenario('PT 잔여(홈): 홈 요약과 회원 상세 계산이 같은 숫자·같은 상태를 낸다(캐시는 상세 계산 결과를 그대로 복사)', L => {
    const member = ptMember({ ptBalanceBaselineRemaining: 5 });
    const sessions = [ptSession({ id: 'sx' })];
    const regs = [{ id: 'r1', type: 'renewal', delta: 2, date: '2026-08-20' }];
    const detail = L.getPtBalance(member, sessions, regs, PT_TODAY); // 5 + 2 - 1 = 6
    const patch = L.buildPtBalanceCachePatch(detail, member);
    const home = L.getPtBalanceSummary({ ...member, ...patch });
    return detail.remaining === 6
      && home.remaining === detail.remaining
      && home.renewalCount === detail.renewalCount
      && home.status.label === detail.status.label
      && home.overdrawn === detail.overdrawn;
  }),
  ptScenario('PT 잔여(홈): 5회 이하·3회 이하·0회·확인 필요 상태 기준이 회원 상세와 동일하다', L => {
    const homeAt = n => L.getPtBalanceSummary({ ptBalanceInitialized: true, ptBalanceRemaining: n, ptBalanceRawRemaining: n }).status.label;
    const detailAt = n => L.getPtBalance(ptMember({ ptBalanceBaselineRemaining: n }), [], [], PT_TODAY).status.label;
    const over = L.getPtBalanceSummary({ ptBalanceInitialized: true, ptBalanceRemaining: 0, ptBalanceRawRemaining: -2 });
    return [0, 1, 3, 4, 5, 6, 12].every(n => homeAt(n) === detailAt(n))
      && homeAt(6) === '정상' && homeAt(5) === '재등록 준비' && homeAt(3) === '재등록 안내 필요' && homeAt(0) === '수업 소진'
      && over.remaining === 0 && over.overdrawn === true && over.status.label === '잔여 횟수 확인 필요';
  }),
  ptScenario('PT 잔여(홈): 캐시 값이 그대로면 재저장하지 않는다(불필요한 Firestore write 방지)', L => {
    const member = ptMember();
    const detail = L.getPtBalance(member, [], [], PT_TODAY); // 잔여 8
    const first = L.buildPtBalanceCachePatch(detail, member);           // 캐시 없음 → 저장 필요
    const synced = { ...member, ...first };
    const second = L.buildPtBalanceCachePatch(detail, synced);          // 값 동일 → 저장 안 함
    // 초기 설정 전 회원은 캐시를 만들지 않는다
    const notInit = L.buildPtBalanceCachePatch(L.getPtBalance({ id: 'x' }, [], [], PT_TODAY), { id: 'x' });
    return first && first.ptBalanceRemaining === 8 && second === null && notInit === null;
  }),
  ptScenario('PT 잔여(홈): 캐시가 아직 없는 회원은 대표가 입력한 기준 잔여로 보이고 상세를 열면 보정된다', L => {
    const member = ptMember(); // ptBalanceRemaining 캐시 없음, 기준 잔여 8
    const before = L.getPtBalanceSummary(member);
    const detail = L.getPtBalance(member, [ptSession()], [], PT_TODAY); // 실제로는 7
    const after = L.getPtBalanceSummary({ ...member, ...L.buildPtBalanceCachePatch(detail, member) });
    return before.initialized === true && before.remaining === 8 && after.remaining === 7;
  }),
  ['PT 잔여(홈): 홈 회원 목록에서 totalSessions 기반 레거시 잔여 계산이 제거되고 캐시 기반 공용 helper만 쓴다',
    !/const remaining\s*=\s*totalRaw > 0/.test(app)
    && !/const remaining\s*=\s*totalReg > 0/.test(app)
    && !/totalReg\s*-\s*usedCount|totalRaw\s*-\s*usedCount/.test(app)
    && app.includes('const ptBalance = getPtBalanceSummary(m);')
    && app.includes('return { lastDate, lastMuscle, ptBalance, daysSince, usedCount };')
    && app.includes('{meta.ptBalance.initialized ? `· 잔여 ${meta.ptBalance.remaining}회` : "· 잔여 미설정"}')
    // 정렬 옵션은 그대로 두고 기준만 신규 잔여로 교체
    && app.includes('{key:"remaining", label:"남은 횟수 적은순"},')
    && app.includes('const ra = metaA.ptBalance.initialized ? metaA.ptBalance.remaining : 9999;')
  ],
  ['PT 잔여(홈): 홈은 잔여 표시를 위해 추가 Firestore 조회를 하지 않는다(members 문서 캐시만 사용)',
    // getPtBalanceSummary는 member 문서 필드만 읽는다 — sessions/ptRegistrations를 인자로 받지 않는다
    /function getPtBalanceSummary\(member\)\s*\{/.test(app)
    && !/getPtBalanceSummary\([^)]*sessions/.test(app)
    // 홈 목록 로딩은 기존 최근 5세션 조회 그대로 — 회원별 전체 세션·등록 이력 조회를 추가하지 않는다
    && app.includes('try { const ss = await getRecentSessions(m.id, 5); return [m.id, ss]; }')
    && !/mbs\.map\([^)]*getPtRegistrations/.test(app)
    && (app.match(/getPtRegistrations\(/g) || []).length === 1
  ],
  ['PT 잔여(홈): 캐시는 회원 상세의 getPtBalance() 결과만 기록하고, 데이터 로딩 전에는 저장하지 않는다',
    app.includes('onSyncPtBalance?.(member.id, { balance: ptBalance, memberDoc: member })')
    && app.includes('const patch = buildPtBalanceCachePatch(nextBalance, memberDoc);')
    && app.includes('if (!member?.id || !dataLoaded) return;')
    && app.includes('setMemberDataLoaded(false); // 새 회원 데이터를 다 읽기 전에는 잔여 캐시를 쓰지 않는다')
    && app.includes('setMemberDataLoaded(true);')
  ],
  ['PT 잔여(홈): 잔여 캐시 필드도 회원이 수정할 수 없다(members 수정 화이트리스트 밖)',
    !/ptBalanceRemaining|ptBalanceRawRemaining|ptBalanceRenewalCount/.test(memberUpdateFn)
  ],
  // ── 수업 삭제 시 잔여 즉시 복구 ──
  // 삭제 처리에 별도 공식(+1 등)을 두지 않고, 남은 실제 세션으로 getPtBalance()를 다시 돌린 결과만 캐시한다.
  ptScenario('PT 잔여(삭제): 기준일 이후 정상 완료 수업을 삭제하면 잔여 3 → 4로 복구된다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 5 });
    const keep = ptSession({ id: 'k1', date: '2026-08-10' });
    const target = ptSession({ id: 'del', date: '2026-08-12', completedAt: '2026-08-12T02:00:00.000Z' });
    const before = L.getPtBalance(m, [keep, target], [], PT_TODAY);          // 5 - 2 = 3
    const after = L.getPtBalance(m, [keep], [], PT_TODAY);                   // 5 - 1 = 4
    return before.remaining === 3 && after.remaining === 4 && after.debits === 1;
  }),
  ptScenario('PT 잔여(삭제): 0회차 체험수업을 삭제해도 잔여는 그대로다(단순 +1 처리가 아님)', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 5 });
    const keep = [ptSession({ id: 'k1' }), ptSession({ id: 'k2', date: '2026-08-11', completedAt: '2026-08-11T02:00:00.000Z' })];
    const trial = ptSession({ id: 'trial', sessionNo: 0, date: '2026-08-12', completedAt: '2026-08-12T02:00:00.000Z' });
    const before = L.getPtBalance(m, [...keep, trial], [], PT_TODAY);        // 5 - 2 = 3 (0회차는 차감 안 됨)
    const after = L.getPtBalance(m, keep, [], PT_TODAY);
    return before.remaining === 3 && after.remaining === 3;
  }),
  ptScenario('PT 잔여(삭제): 임시저장(draft) 수업을 삭제해도 잔여는 그대로다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 5 });
    const keep = [ptSession({ id: 'k1' }), ptSession({ id: 'k2', date: '2026-08-11', completedAt: '2026-08-11T02:00:00.000Z' })];
    const draft = ptSession({ id: 'dr', isPublished: false, status: 'draft', completedAt: undefined, publishedAt: undefined });
    const before = L.getPtBalance(m, [...keep, draft], [], PT_TODAY);
    const after = L.getPtBalance(m, keep, [], PT_TODAY);
    return before.remaining === 3 && after.remaining === 3;
  }),
  ptScenario('PT 잔여(삭제): 기준일 이전 과거 완료 수업을 삭제해도 잔여는 그대로다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 5 });
    const keep = [ptSession({ id: 'k1' }), ptSession({ id: 'k2', date: '2026-08-11', completedAt: '2026-08-11T02:00:00.000Z' })];
    const past = ptSession({ id: 'old', date: '2026-07-20', createdAt: '2026-07-20T01:00:00.000Z', publishedAt: '2026-07-20T02:00:00.000Z', completedAt: '2026-07-20T02:00:00.000Z' });
    const before = L.getPtBalance(m, [...keep, past], [], PT_TODAY);
    const after = L.getPtBalance(m, keep, [], PT_TODAY);
    return before.remaining === 3 && after.remaining === 3;
  }),
  ptScenario('PT 잔여(삭제): 2:1 수업은 회원별 문서라 A만 삭제하면 A만 복구되고 B는 그대로다', L => {
    const mA = ptMember({ id: 'mA', ptBalanceBaselineRemaining: 5 });
    const mB = ptMember({ id: 'mB', ptBalanceBaselineRemaining: 5 });
    const aSession = ptSession({ id: 'pa', sessionType: '2:1' });
    const bSession = ptSession({ id: 'pb', sessionType: '2:1' });
    const aBefore = L.getPtBalance(mA, [aSession], [], PT_TODAY);
    const aAfter = L.getPtBalance(mA, [], [], PT_TODAY);            // A 세션만 삭제
    const bAfter = L.getPtBalance(mB, [bSession], [], PT_TODAY);    // B 세션은 그대로
    return aBefore.remaining === 4 && aAfter.remaining === 5 && bAfter.remaining === 4;
  }),
  ptScenario('PT 잔여(삭제): 삭제 후 캐시 패치가 새 잔여를 담아 홈이 회원 상세를 거치지 않고 바로 새 값을 보여준다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 5 });
    const keep = ptSession({ id: 'k1' });
    const target = ptSession({ id: 'del', date: '2026-08-12', completedAt: '2026-08-12T02:00:00.000Z' });
    // 삭제 전 캐시가 잡혀 있는 상태(홈에는 잔여 3으로 보이는 중)
    const synced = { ...m, ...L.buildPtBalanceCachePatch(L.getPtBalance(m, [keep, target], [], PT_TODAY), m) };
    if (L.getPtBalanceSummary(synced).remaining !== 3) return false;
    // 삭제 직후 남은 세션으로 재계산 → 캐시 패치 → 홈 요약이 즉시 4
    const afterBalance = L.getPtBalance(synced, [keep], [], PT_TODAY);
    const patch = L.buildPtBalanceCachePatch(afterBalance, synced);
    const home = L.getPtBalanceSummary({ ...synced, ...patch });
    return patch && patch.ptBalanceRemaining === 4 && home.remaining === 4 && home.status.label === '재등록 준비';
  }),
  ptScenario('PT 잔여(삭제): 차감 대상이 아닌 수업을 지우면 캐시 패치가 null이라 불필요한 write가 없다', L => {
    const m = ptMember({ ptBalanceBaselineRemaining: 5 });
    const keep = [ptSession({ id: 'k1' }), ptSession({ id: 'k2', date: '2026-08-11', completedAt: '2026-08-11T02:00:00.000Z' })];
    const trial = ptSession({ id: 'trial', sessionNo: 0 });
    const synced = { ...m, ...L.buildPtBalanceCachePatch(L.getPtBalance(m, [...keep, trial], [], PT_TODAY), m) };
    // 0회차를 지워도 잔여가 그대로라 두 번째 동기화는 write하지 않는다
    return L.buildPtBalanceCachePatch(L.getPtBalance(synced, keep, [], PT_TODAY), synced) === null;
  }),
  // ── 수업진행 회차: 세션 문서 개수가 아니라 0회차(체험)를 제외한 정규 회차 최댓값을 써야 한다 ──
  // 0~4회차 5개 문서가 있어도 "수업진행"은 4여야 한다(문서 개수로 세면 체험까지 포함돼 5가 되는 버그가 있었다).
  ptScenario('수업진행 회차: sessionNo가 숫자·"N"·"N회차" 어떤 형태여도 같은 숫자로 정규화된다', L => {
    return L.sessionNoToNumber(4) === 4 && L.sessionNoToNumber('4') === 4 && L.sessionNoToNumber('4회차') === 4
      && L.sessionNoToNumber(0) === 0 && L.sessionNoToNumber('0회차') === 0
      && Number.isNaN(L.sessionNoToNumber('')) && Number.isNaN(L.sessionNoToNumber(undefined));
  }),
  ptScenario('수업진행 회차: 0회차(체험)를 제외한 정규 회차 중 최댓값이며, 세션 문서 개수가 아니다', L => {
    const usedCountOf = (nos) => {
      const regular = nos.map(n => L.sessionNoToNumber(n)).filter(n => Number.isFinite(n) && n > 0);
      return regular.length ? Math.max(...regular) : 0;
    };
    return usedCountOf([0]) === 0
      && usedCountOf([0, 1]) === 1
      && usedCountOf([0, 1, 2, 3, 4]) === 4   // 문서 5개(0~4회차)인데도 4 — 개수 세기가 아님을 증명
      && usedCountOf([0, 1, 2, 4]) === 4      // 중간 3회차 기록이 없어도 최댓값 기준
      && usedCountOf(['0', '1', '2', '3', '4회차']) === 4;
  }),
  ['수업진행 회차: 회원 상세 화면은 sessions.length(문서 개수)가 아니라 정규 회차 최댓값으로 계산한다',
    !/const usedCount = sessions\.length;/.test(app)
    && app.includes('.map(s => sessionNoToNumber(s.sessionNo))')
    && app.includes('const usedCount = regularSessionNos.length ? Math.max(...regularSessionNos) : 0;')
  ],
  ['오늘 수업 회차: 상단 배지는 usedCount+1 파생값이 아니라 실제 오늘 세션의 sessionNo를 우선 사용한다(없을 때만 usedCount+1로 예측)',
    app.includes('todaySession ? todaySession.sessionNo : usedCount+1')
  ],
  ['PT 잔여(삭제): 삭제가 성공한 뒤에만 캐시를 갱신한다 — 삭제 실패 시 잔여가 변하지 않는다',
    (() => {
      const fn = app.slice(app.indexOf('async function handleDeleteSession(s)'), app.indexOf('async function handleSavePairSession'));
      const del = fn.indexOf('await deleteSession(member.id, s.id);');
      const refresh = fn.indexOf('const fresh = await refreshSessionsForMember(member.id);');
      const sync = fn.indexOf('await syncPtBalanceAfterSessionChange(member.id, fresh);');
      // 삭제 → 최신 세션 재조회 → 캐시 동기화 순서이고, 셋 다 같은 try 안에 있어 삭제 실패 시 캐시까지 도달하지 않는다
      return del > -1 && refresh > del && sync > refresh && /catch\(e\) \{ showToast\(e\.message, "err"\); \}/.test(fn);
    })()
  ],
  ['PT 잔여(삭제): 차감 대상이 바뀔 수 있는 모든 session mutation 뒤에 같은 동기화 함수가 붙어 있다',
    // 저장·수정 / 전송 / 공개취소 / 삭제 — 4곳 모두 동일 호출
    (app.match(/syncPtBalanceAfterSessionChange\(member\.id, (fresh|newSessions)\)/g) || []).length === 4
    && app.includes('await syncPtBalanceAfterSessionChange(member.id, newSessions);')
    // 공용 helper 하나만 존재하고, 잔여를 직접 증감시키는 임시 처리는 없다
    && (app.match(/const syncPtBalanceCache = useCallback/g) || []).length === 1
    && !/ptBalanceRemaining\s*[+-]=|ptBalanceRemaining:\s*[^,}]*[+-]\s*1/.test(app)
    // 삭제 경로도 별도 공식 없이 공용 getPtBalance()에 위임한다
    && app.includes('const nextBalance = balance || getPtBalance(memberDoc, ss || [], registrations || [], getKoreaDateString());')
  ],
  ['PT 잔여(삭제): 회원 상세 자동 보정과 세션 변경 직후 보정이 같은 공용 함수(syncPtBalanceCache)를 쓰고 중복 write를 막는다',
    app.includes('onSyncPtBalance={syncPtBalanceCache}')
    && app.includes('onSyncPtBalance?.(member.id, { balance: ptBalance, memberDoc: member })')
    && app.includes('const patch = buildPtBalanceCachePatch(nextBalance, memberDoc);')
    && app.includes('if (!patch) return null;')
    // 홈 목록(members)까지 같은 패치로 갱신해야 회원 상세를 거치지 않아도 즉시 보인다
    && app.includes('setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, ...patch } : m)));')
  ],
  ['PT 잔여 시나리오 D: 회원앱에서 "N회 남음"·잔여·재등록 정보가 렌더링되지 않고 배선(totalReg/remaining)도 남아있지 않다',
    (() => {
      const region = memberAppRenderRegion();
      return region.length > 10000
        && !region.includes('회 남음')
        && !region.includes('잔여')
        && !/\btotalReg\b/.test(region)
        && !/p\.remaining/.test(region)
        && !/profile\.totalSessions|profile\.remainingSessions/.test(region)
        // 진행 횟수 표시는 그대로 유지된다
        && region.includes('{doneCount}회 진행');
    })()
  ],
  ['PT 잔여: 회원앱(홈·수업·건강·분석·프로필·온보딩·개인운동·공지센터)에는 잔여 횟수 데이터가 전혀 렌더링되지 않는다',
    (() => {
      const region = memberAppRenderRegion();
      return region.length > 10000
        && !/ptBalance|ptRegistrations|getPtBalance|잔여 PT|재등록 안내 필요/.test(region);
    })()
  ],
  ['PT 잔여: 잔여·재등록·보정은 관리자 전용 — 회원은 ptRegistrations 읽기·쓰기 불가, 기준 필드도 회원 수정 화이트리스트에 없다',
    membersBlockFlat.includes('match /ptRegistrations/{registrationId} { allow read, create, update, delete: if isTrainerOfMember(memberId); }')
    && !/ptBalance/.test(memberUpdateFn)
    && !memberUpdateFn.includes('ptRegistrations')
  ],
  ['PT 잔여: 기존 "등록 구분"(기존 회원/첫 등록/재등록)과 후기 안내 공지 로직을 건드리지 않는다',
    app.includes('const patch = { registrationType: type, registrationNoticeDone: false };')
    && app.includes('{regBtn("기존 회원", ()=>saveRegistrationType("existing"), {primary:registrationType==="existing"})}')
    && app.includes('{regBtn("재등록", ()=>saveRegistrationType("renewal"), {primary:registrationType==="renewal"})}')
    // 재등록 추가(addPtRegistration) 저장 경로에서 registrationType을 함께 바꾸지 않는다
    && !/addPtRegistration\([^)]*registrationType/.test(app)
  ],
  ['PT 잔여: 회원 상세 "등록 관리" 카드 안에 PT 이용 현황이 들어가고 상단 요약과 같은 계산(getPtBalance) 하나만 쓴다',
    app.includes('{secPtBalance}')
    && app.includes('<span style={{fontSize:11,fontWeight:800,color:DB.sub}}>PT 이용 현황</span>')
    && app.includes('현재 잔여 횟수 설정')
    && app.includes('PT 등록 추가')
    && app.includes('잔여 조정')
    && (app.match(/getPtBalance\(member, sessions, ptRegistrations, ptToday\)/g) || []).length === 1
    && app.includes('잔여 PT {ptBalance.remaining}회')
  ],
  ['PT 잔여: 저장 경로는 members 문서 기준값 + members/{id}/ptRegistrations 이력 두 곳뿐이다',
    db.includes('collection(db, "members", memberId, "ptRegistrations")')
    && db.includes('export async function addPtRegistration(memberId, data)')
    && db.includes('export async function getPtRegistrations(memberId, max = 100)')
    && db.includes('export async function deletePtRegistration(memberId, registrationId)')
    && app.includes('ptBalanceInitialized: true,')
    && app.includes('ptBalanceBaselineRemaining: remaining,')
    && app.includes('ptBalanceBaselineRenewalCount: renewalCount,')
  ],

  // ── 관리자 홈 "오늘 해야 할 일 → 재등록 안내 필요" ──
  ptScenario('재등록 안내(홈): PT 잔여 초기 설정 전 회원은 대상에서 제외된다', L => {
    const m = { id: 'm1', name: '미설정', status: 'active', ptBalanceInitialized: false };
    return L.buildPtRenewalNoticeList([m], {}).length === 0;
  }),
  ptScenario('재등록 안내(홈): 잔여 6회는 대상이 아니다', L => {
    const m = { id: 'm1', name: '잔여6', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 6, ptBalanceRawRemaining: 6, ptBalanceRenewalCount: 1 };
    return L.buildPtRenewalNoticeList([m], {}).length === 0;
  }),
  ptScenario('재등록 안내(홈): 잔여 5회는 홈 카드 대상이 아니지만, 상세 상태는 "재등록 준비"로 그대로 유지된다', L => {
    const m = { id: 'm1', name: '잔여5', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 5, ptBalanceRawRemaining: 5, ptBalanceRenewalCount: 1 };
    return L.buildPtRenewalNoticeList([m], {}).length === 0 && L.getPtBalanceSummary(m).status.label === '재등록 준비';
  }),
  ptScenario('재등록 안내(홈): 잔여 3·2·1·0회는 모두 대상이고, 0회는 "수업 소진"으로 표시된다', L => {
    const at = n => ({ id: `m${n}`, name: `잔여${n}`, status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: n, ptBalanceRawRemaining: n, ptBalanceRenewalCount: 1 });
    const list = L.buildPtRenewalNoticeList([at(3), at(2), at(1), at(0)], {});
    const zero = list.find(r => r.member.id === 'm0');
    return list.length === 4 && zero.balance.status.label === '수업 소진';
  }),
  ptScenario('재등록 안내(홈): raw 잔여가 음수면(등록 누락) "확인 필요" 상태로 대상에 포함된다', L => {
    const m = { id: 'm1', name: '확인필요', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 0, ptBalanceRawRemaining: -2, ptBalanceRenewalCount: 1 };
    const list = L.buildPtRenewalNoticeList([m], {});
    return list.length === 1 && list[0].balance.overdrawn === true && list[0].balance.status.label === '잔여 횟수 확인 필요';
  }),
  ptScenario('재등록 안내(홈): 잔여 4회(대상 아님) → 수업 완료로 3회가 되면 즉시 대상에 추가된다', L => {
    const before = { id: 'm1', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 4, ptBalanceRawRemaining: 4 };
    const after = { ...before, ptBalanceRemaining: 3, ptBalanceRawRemaining: 3 };
    return L.buildPtRenewalNoticeList([before], {}).length === 0 && L.buildPtRenewalNoticeList([after], {}).length === 1;
  }),
  ptScenario('재등록 안내(홈): 잔여 3회(대상) → 재등록 20회로 23회가 되면 즉시 대상에서 빠진다', L => {
    const before = { id: 'm1', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 3, ptBalanceRawRemaining: 3 };
    const after = { ...before, ptBalanceRemaining: 23, ptBalanceRawRemaining: 23 };
    return L.buildPtRenewalNoticeList([before], {}).length === 1 && L.buildPtRenewalNoticeList([after], {}).length === 0;
  }),
  ptScenario('재등록 안내(홈): 완료 수업 삭제로 잔여 2 → 3이 되어도 여전히 대상이고 표시 숫자가 즉시 바뀐다', L => {
    const before = { id: 'm1', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 2, ptBalanceRawRemaining: 2 };
    const after = { ...before, ptBalanceRemaining: 3, ptBalanceRawRemaining: 3 };
    const b = L.buildPtRenewalNoticeList([before], {})[0];
    const a = L.buildPtRenewalNoticeList([after], {})[0];
    return b.balance.remaining === 2 && a.balance.remaining === 3;
  }),
  ptScenario('재등록 안내(홈): 회원별 잔여 캐시가 서로 섞이지 않는다', L => {
    const a = { id: 'mA', name: 'A', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 2, ptBalanceRawRemaining: 2, ptBalanceRenewalCount: 1 };
    const b = { id: 'mB', name: 'B', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 8, ptBalanceRawRemaining: 8, ptBalanceRenewalCount: 3 };
    const list = L.buildPtRenewalNoticeList([a, b], {});
    return list.length === 1 && list[0].member.id === 'mA' && list[0].balance.remaining === 2;
  }),
  ptScenario('재등록 안내(홈) "안내 완료": 처리 직후 같은 잔여 구간에서는 숨고, 잔여가 더 줄면 다시 노출된다', L => {
    const handled = { id: 'm1', status: 'active', ptBalanceInitialized: true, ptBalanceRemaining: 3, ptBalanceRawRemaining: 3, renewalReminderHandledAt: '2026-08-08T00:00:00.000Z', renewalReminderLastRawRemaining: 3 };
    const stillSame = L.buildPtRenewalNoticeList([handled], {});
    const decreased = { ...handled, ptBalanceRemaining: 2, ptBalanceRawRemaining: 2 };
    const reappeared = L.buildPtRenewalNoticeList([decreased], {});
    return stillSame.length === 0 && reappeared.length === 1 && reappeared[0].balance.remaining === 2;
  }),
  ['재등록 안내(홈): 목록 판정 함수는 members 캐시 필드만 읽고 세션·등록 이력을 추가로 조회하지 않는다(추가 Firestore read 없음)',
    (() => {
      const fn = app.slice(app.indexOf('function buildPtRenewalNoticeList'), app.indexOf('function buildUnsentSessionMembers'));
      return fn.includes('getPtBalanceSummary(lm)')
        && fn.includes('needsPtRenewalNotice(balance)')
        && !/getRecentSessions|getSessions\(|getPtRegistrations\(|await /.test(fn)
        && app.includes('buildPtRenewalNoticeList(regularHomeMembers, liveMembersById)')
        && !/buildPtRenewalNoticeList\([^)]*sessionsMap/.test(app);
    })()
  ],
  ['재등록 안내(홈): 목록에서 회원을 누르면 기존 onSelectMember로 회원 상세(PT 이용 현황)까지 스크롤 이동한다',
    app.includes('onSelectMember?.(row.member,{scrollTarget:"hub-pt-balance"})')
    && app.includes('<div id="hub-pt-balance" style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${DB.border}`}}>')
  ],
  ['재등록 안내(홈) "안내 완료" 필드는 관리자 전용이다 — 회원 프로필 수정 화이트리스트에 없고 회원앱 렌더링 영역에도 없다',
    !/renewalReminderHandledAt|renewalReminderLastRawRemaining/.test(memberUpdateFn)
    && !/renewalReminderHandledAt|renewalReminderLastRawRemaining|안내 완료/.test(memberAppRenderRegion())
  ],
  ['재등록 안내(홈): "오늘 해야 할 일" 카드 + 인라인 리스트가 기존 카드들과 같은 컴포넌트(TodayActionCard/TodayListCard)를 재사용한다',
    app.includes('title="재등록 안내 필요" desc="PT 잔여 횟수가 얼마 남지 않았어요"')
    && app.includes('onClick={scrollToSection("home-pt-renewal")}')
    && app.includes('<TodayListCard id="home-pt-renewal"')
  ],

  ['유입 분석/분석 리포트: 관리자 라이트 테마 + AdminSidebar + 반응형 grid(minmax) 사용, 고정폭 남용 없음',
    app.includes('<AdminSidebar active="report"') &&
    app.includes('gridTemplateColumns: "repeat(auto-fit,minmax(178px,1fr))"') &&
    app.includes('gridTemplateColumns: isWide ? "repeat(auto-fill,minmax(330px,1fr))" : "1fr"') &&
    app.includes('screen==="report"||screen==="referral") ? {width:"100%"}')
  ],

  // ── 회원 상태 "수업 대기"(waiting) 신설 + 삭제 확인 모달 ──
  ['회원 상태: "수업 대기"(waiting) 상태값이 상태 변경 라벨/메뉴/배지에 일관 반영됨(휴식·종료와 다른 별도 값)',
    app.includes('const MEMBER_STATUS_LABELS = { active:"진행중", paused:"휴식중", ended:"종료", waiting:"수업 대기" };')
    && app.includes('⏳ 수업 대기')
    && app.includes('const isWaiting = status === "waiting";')
    && app.includes('{isWaiting && <span')
  ],
  ['회원 상태 변경 저장 경로 단일화: 일반 회원(window.confirm)과 테스트 회원 전용 패널이 같은 applyMemberStatusChange/updateMember를 공유',
    app.includes('async function applyMemberStatusChange(id, newStatus) {')
    && app.includes('async function handleTestMemberStatusChange(id, newStatus) {')
    && app.includes('return applyMemberStatusChange(id, newStatus);')
  ],
  ['테스트 회원 전용 상태 패널: isTestMember===true + 이메일 + 이름까지 모두 일치해야 대상이 되는 방어적 판별(findTestMemberDoc), 실행 직전 재확인 포함',
    app.includes('function findTestMemberDoc(preset, memberList) {')
    && app.includes('m.isTestMember === true &&')
    && app.includes("(m.email || \"\").trim().toLowerCase() === preset.email &&")
    && app.includes('m.name === preset.name')
    && app.includes('if (!testMember || testMember.isTestMember !== true) {')
  ],
  ['테스트 회원 전용 상태 패널: 상태 변경 전 전용 확인 모달(TestMemberStatusConfirmModal) 표시 + 변경 후 onRefresh로 Firestore 재조회',
    app.includes('function TestMemberStatusConfirmModal({ memberName, targetLabel, busy, onCancel, onConfirm }) {')
    && app.includes('테스트 회원 상태를 변경할까요?')
    && app.includes("의 상태를 '{targetLabel}'로 변경합니다. 실제 회원 데이터에는 영향을 주지 않습니다.")
    && app.includes('await onTestStatusChange?.(testMember.id, targetStatus);')
    && app.includes('await onRefresh?.(); // Firestore에 실제로 저장된 값을 다시 읽어와 반영')
  ],
  ['테스트 회원 전용 상태 패널이 일반 회원 목록/집계 제외 로직(isExcludedAdminMember)을 그대로 유지 — isTestMember 회원은 여전히 일반 목록에서 제외',
    app.includes('if (m.isTestMember === true) return true;')
  ],
  ['회원 상태 필터: MORE_FILTERS/passFilter/검색 결과 라벨에 "수업 대기"(waiting) 추가 — 활성/휴식/종료와 각각 구분',
    app.includes('{key:"waiting", label:"수업 대기"},')
    && app.includes('if (filter === "waiting") return status === "waiting";')
    && app.includes('const SEARCH_STATUS_LABEL = { active:"진행중", paused:"휴식중", ended:"종료", waiting:"수업 대기" };')
  ],
  ['회원앱 접근 게이트: db.js가 "waiting" 상태를 active와 동일하게 허용해 로그인·이용을 차단하지 않음',
    db.includes('const MEMBER_WAITING_STATUS = "waiting";')
    && db.includes('const isWaitingStatus = rawStatus === MEMBER_WAITING_STATUS;')
    && db.includes('(MEMBER_ACTIVE_STATUSES.has(rawStatus) || rawStatus.includes("진행") || isWaitingStatus);')
  ],
  ['Firestore 규칙: isMemberStatusActive가 "waiting" 상태를 회원 self-access 허용 목록에 포함(휴식/종료는 계속 차단)',
    firestoreRules.includes('s == "waiting" || ms == "waiting";')
  ],
  ['휴식/종료 회원 로그인 차단 안내 문구: "접근 권한 없음"류 표현 없이 기록 보관 톤의 제목/본문을 상태별로 분리해 전달',
    db.includes('title: "잠시 쉬어가고 있어요"')
    && db.includes('회원님의 운동 기록은 안전하게 보관하고 있습니다. 다시 운동을 시작하실 때 테오짐에 문의해 주시면 앱 이용을 도와드리겠습니다.')
    && db.includes('title: "함께한 운동 기록을 보관하고 있어요"')
    && db.includes('그동안 함께해 주셔서 감사합니다. 회원님의 운동 기록은 안전하게 보관하고 있습니다. 다시 운동을 시작하고 싶으실 때 언제든 테오짐에 문의해 주세요.')
    && db.includes('err.code = isPausedStatus ? "member/paused" : isEndedStatus ? "member/ended" : "member/inactive";')
  ],
  ['회원앱 에러 화면: 휴식/종료 상태는 danger(빨강) 대신 notice 톤 + db.js가 내려준 전용 제목(details.title)을 사용',
    app.includes('const isFriendlyStatus=details?.code==="member/paused"||details?.code==="member/ended";')
    && app.includes('const title=details?.title||"회원앱을 열 수 없습니다";')
    && app.includes('<p className={isFriendlyStatus?"notice":"danger"}>{message}</p>')
  ],
  ['회원 삭제: window.confirm 대신 회원 이름을 포함한 전용 확인 모달을 사용하고, 취소가 기본 포커스 + 삭제 버튼은 danger 색상',
    !app.includes('window.confirm("이 회원의 모든 기록이 삭제됩니다. 계속할까요?")')
    && app.includes('function MemberDeleteConfirmModal({ member, busy, onCancel, onConfirm }) {')
    && app.includes('정말 회원을 삭제할까요?')
    && app.includes("' 회원과 연결된 정보가 삭제될 수 있습니다. 휴식이나 수업 대기 상태로 보관할 수 있으니, 완전히 삭제하려는 경우에만 진행해 주세요.")
    && app.includes('useEffect(() => { cancelRef.current?.focus(); }, []);')
    && app.includes('background:DB.danger,color:"#fff",borderRadius:12')
  ],

  // ── 운동 기록 단위(kg/단/맨몸) ──
  unitScenario('A. 일반 웨이트(kg): 체스트프레스머신 20kg×10회는 기존과 동일하게 볼륨 200을 계산한다', L =>
    L.exVol({ name:'체스트프레스머신', unitType:'kg', sets:[{weight:'20',reps:'10'}] }) === 200
  ),
  unitScenario('B. 단(step): 스미스머신 푸쉬업 6단×10 + 5단×10 + 5단×10 은 kg 볼륨이 0이다(6×10=60 등으로 합산되지 않음)', L =>
    L.exVol({ name:'스미스머신 푸쉬업', unitType:'step', sets:[{weight:'6',reps:'10'},{weight:'5',reps:'10'},{weight:'5',reps:'10'}] }) === 0
  ),
  unitScenario('C. 맨몸(bodyweight): 푸쉬업을 맨몸으로 명시 선택하면 반복만 기록되고 kg 볼륨은 0이다', L =>
    L.exVol({ name:'푸쉬업', unitType:'bodyweight', sets:[{weight:'',reps:'10'}] }) === 0
  ),
  unitScenario('D. 기존 데이터 호환: unitType 필드가 없는 과거 웨이트 기록은 그대로 kg로 해석돼 볼륨이 정상 계산된다', L =>
    L.exVol({ name:'벤치프레스', sets:[{weight:'40',reps:'8'}] }) === 320
    && L.getRecordUnit({ name:'벤치프레스', sets:[{weight:'40',reps:'8'}] }) === 'kg'
  ),
  unitScenario('푸쉬업 이름만으로 자동으로 단/맨몸이 고정되지 않는다 — unitType 미지정 시 기본값은 kg', L =>
    L.getRecordUnit({ name:'푸쉬업' }) === 'kg' && L.getRecordUnit({ name:'스미스머신 푸쉬업' }) === 'kg'
  ),
  unitScenario('calcVol: recordUnit이 "step"/"bodyweight"면 exType(assist/bodyweight) 분기보다 우선해 0을 반환한다', L =>
    L.calcVol('6','10', L.getExerciseType('스미스머신 푸쉬업'), '70', 'step') === 0
    && L.calcVol('6','10', L.getExerciseType('스미스머신 푸쉬업'), '70', 'bodyweight') === 0
  ),
  unitScenario('calcVol: recordUnit 인자가 없으면(레거시 호출부) 기존 kg 계산 로직이 그대로 동작한다', L =>
    L.calcVol('20','10', null, '') === 200
  ),
  unitScenario('표시 포맷: formatRecordValue는 kg는 "20kg", 단은 "6단"으로 표기하고 맨몸은 값을 표시하지 않는다(null)', L =>
    L.formatRecordValue('20','kg') === '20kg'
    && L.formatRecordValue('6','step') === '6단'
    && L.formatRecordValue('5','bodyweight') === null
  ),
  unitScenario('컬럼 라벨: kg는 "중량", 단은 "높이", 맨몸은 "맨몸"으로 라벨이 바뀐다', L =>
    L.getWeightColumnLabel('kg') === '중량' && L.getWeightColumnLabel('step') === '높이' && L.getWeightColumnLabel('bodyweight') === '맨몸'
  ),
  ['운동 카드 UI: 기록 단위 선택지(중량(kg)/단(높이)/맨몸(반복만))가 기능운동이 아닐 때만 노출된다',
    app.includes('{!isFuncEx(ex) && (') && app.includes('["kg","중량(kg)"],["step","단(높이)"],["bodyweight","맨몸(반복만)"]')
  ],
  ['수업일지 저장: totalVolume이 exVol()을 그대로 합산해 단/맨몸 기록을 제외한다(회원1 payload)',
    app.includes('totalVolume: exList.reduce((s,e)=>s+exVol(e), 0)')
  ],
  ['운동 종목 학습: 트레이너가 명시적으로 선택한 unitType만 exerciseClassifications에 저장/재사용된다(이름 키워드 자동 추정 없음)',
    app.includes('function suggestRecordUnit(name, classifications) {')
    && app.includes("if (ex.name) onLearnExercise?.(ex.name, { unitType: val });")
  ],
  ['회원앱 노출: db.js가 세션 exercises를 publicExercise로 걸러낼 때 unitType 필드를 화이트리스트에 포함해 회원 화면에도 전달된다',
    db.includes('const SESSION_PUBLIC_FIELDS = new Set(["name", "sets", "feedback", "muscleTop", "muscleSub", "equipment", "unitType",')
  ],

  // ── 회원앱 분석 탭 "체중 추이" 그래프 집계(2026-08-18) — 원본 데이터는 그대로 두고 그래프 표시용 배열만 기간별로 평균 집계 ──
  wtScenario('체중 추이 집계 단위: 1개월=일별, 3개월=기록량과 무관하게 항상 주간, 6개월=span 기준 주간→2주 자동 전환, 1년=월간', lib =>
    lib.pickWeightTrendGranularity('1m', 200) === 'day' &&
    lib.pickWeightTrendGranularity('3m', 10) === 'week' &&
    lib.pickWeightTrendGranularity('3m', 300) === 'week' &&
    lib.pickWeightTrendGranularity('6m', 60) === 'week' &&
    lib.pickWeightTrendGranularity('6m', 180) === '2week' &&
    lib.pickWeightTrendGranularity('1y', 40) === 'month' &&
    lib.pickWeightTrendGranularity('1y', 365) === 'month'
  ),
  wtScenario('체중 추이 집계 단위: "전체" 기간은 실제 기록 span(첫~최근 기록 간격) 기준으로 주→2주→월→2개월→분기 자동 확장', lib =>
    lib.pickWeightTrendGranularity('all', 30) === 'week' &&
    lib.pickWeightTrendGranularity('all', 150) === '2week' &&
    lib.pickWeightTrendGranularity('all', 400) === 'month' &&
    lib.pickWeightTrendGranularity('all', 800) === '2month' &&
    lib.pickWeightTrendGranularity('all', 2000) === 'quarter'
  ),
  wtScenario('7일 이동평균(1개월 뷰 메인 추세선): 달력 기준 최근 7일 안에 실제 존재하는 기록만 평균 — 창 밖 기록은 섞이지 않음', lib => {
    const weights = [
      { date: '2026-08-01', weight: 80 },
      { date: '2026-08-03', weight: 82 },
      { date: '2026-08-10', weight: 79 }, // 8/1·8/3과 7일 이상 떨어져 창에 혼자만 남는다
    ];
    const byDate = Object.fromEntries(lib.weightMovingAverage7(weights).map(m => [m.date, m.ma7]));
    return byDate['2026-08-01'] === 80 && byDate['2026-08-03'] === 81 && byDate['2026-08-10'] === 79;
  }),
  wtScenario('체중 추이 버킷(1개월=day): 원본 weights/kcalRows 배열을 mutate하지 않고 실측값+7일 이동평균+칼로리를 날짜별로 합친다', lib => {
    const weights = [{ date: '2026-08-01', weight: 80 }, { date: '2026-08-02', weight: 81 }];
    const kcalRows = [{ date: '2026-08-02', kcal: 1800 }, { date: '2026-08-03', kcal: 1700 }];
    const before = [JSON.stringify(weights), JSON.stringify(kcalRows)];
    const pts = lib.buildWeightTrendBuckets(weights, kcalRows, 'day');
    const byDate = Object.fromEntries(pts.map(p => [p.date, p]));
    return before[0] === JSON.stringify(weights) && before[1] === JSON.stringify(kcalRows) &&
      pts.length === 3 &&
      byDate['2026-08-01'].weight === 80 && byDate['2026-08-01'].kcal === null &&
      byDate['2026-08-02'].weight === 81 && byDate['2026-08-02'].kcal === 1800 &&
      byDate['2026-08-03'].weight === null && byDate['2026-08-03'].weightMA7 === null && byDate['2026-08-03'].kcal === 1700;
  }),
  wtScenario('체중 추이 버킷(주간 이상): 기록이 있는 날짜만 평균에 포함하고 기록 없는 날을 0으로 계산하지 않는다(NaN도 없음)', lib => {
    const weights = [
      { date: '2026-08-03', weight: 80 }, { date: '2026-08-04', weight: 82 }, { date: '2026-08-05', weight: 78 },
    ]; // 세 기록 모두 같은 주 버킷 — 3건 평균이지 7일로 나누지 않는다
    const pts = lib.buildWeightTrendBuckets(weights, [], 'week');
    return pts.length === 1 && pts[0].weight === 80 && Number.isFinite(pts[0].weight);
  }),
  wtScenario('체중 추이 버킷: 체중·칼로리 기록이 모두 없으면 빈 배열(포인트를 억지로 만들지 않음)', lib => {
    const pts = lib.buildWeightTrendBuckets([], [], 'week');
    return Array.isArray(pts) && pts.length === 0;
  }),
  wtScenario('체중 추이: "전체" 기간에 매일 500일치 기록이 있어도 자동 집계로 그래프 포인트가 과도하게 생성되지 않는다(8~20개)', lib => {
    const weights = Array.from({ length: 500 }, (_, i) => {
      const d = new Date('2025-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), weight: +(80 - i * 0.02).toFixed(1) };
    });
    const days = weights.map(w => lib.epochDay(w.date));
    const span = Math.max(...days) - Math.min(...days);
    const pts = lib.buildWeightTrendBuckets(weights, [], lib.pickWeightTrendGranularity('all', span));
    return pts.length >= 8 && pts.length <= 20 && pts.every(p => Number.isFinite(p.weight));
  }),
  wtScenario('체중 추이 라벨: 월간 버킷은 "N월", 여러 해에 걸치면 연도 prefix가 붙는다', lib =>
    lib.weightTrendBucketLabel('2026-09-05', 'month', false) === '9월' &&
    lib.weightTrendBucketLabel('2025-09-05', 'month', true) === '25.9월'
  ),
  wtScenario('최근 7일 평균 요약: 최근 7일 vs 이전 7일 평균을 비교해 하락 방향을 판단한다(오늘 기준, 선택된 기간 탭과 무관)', lib => {
    const all = [
      { date: daysAgoStr(12), weight: 82.0 }, { date: daysAgoStr(10), weight: 81.6 },
      { date: daysAgoStr(3), weight: 81.0 }, { date: daysAgoStr(1), weight: 80.4 },
    ];
    const s = lib.buildWeightRecentSummary(all);
    return s !== null && s.recentAvg === lib.round1((81.0 + 80.4) / 2) && s.prevAvg === lib.round1((82.0 + 81.6) / 2) && s.diff < 0;
  }),
  wtScenario('최근 7일 평균 요약: 이전 7일 기록이 없으면 diff 없이 최근 평균만 반환한다(0kg으로 단정하지 않음)', lib => {
    const s = lib.buildWeightRecentSummary([{ date: daysAgoStr(2), weight: 75 }]);
    return s !== null && s.recentAvg === 75 && s.prevAvg === null && s.diff === null;
  }),
  wtScenario('최근 7일 평균 요약: 최근 7일 기록이 전혀 없으면 null을 반환한다(오래된 기록을 억지로 끌어와 계산하지 않음)', lib =>
    lib.buildWeightRecentSummary([{ date: daysAgoStr(20), weight: 75 }]) === null
  ),

  // ── 회원앱 저장 안정성: 저장 성공 후 재조회(load) 실패가 전체 앱 오류 화면(다시 시도/로그아웃)으로 전파되지 않음 ──
  ['회원앱 저장 안정성: load()가 silent 옵션을 지원 — silent일 때는 setLoading(true)/setMemberError로 화면을 덮지 않는다',
    app.includes('const load=useCallback(async(opts={})=>{const silent=!!opts.silent; if(!silent){setLoading(true); setMemberError(""); setMemberErrorDetails(null);}')
  ],
  ['회원앱 저장 안정성: silent 재조회가 실패해도 setMemberError를 호출하지 않고 console.error로만 남긴다(저장 성공 화면이 오류 화면으로 바뀌지 않음)',
    app.includes('} else { console.error("[MemberApp Save Error]",{action:"member-data-refresh",memberId:auth.currentUser?.uid||null,errorCode:e?.code,message:e?.message,error:e}); } }finally{ if(!silent) setLoading(false); }')
  ],
  ['회원앱 저장 안정성: silent 재조회에서 프로필이 비어 와도(p가 falsy) 이미 화면에 있던 profile을 null로 덮어써 오류 화면으로 넘기지 않는다',
    app.includes('if(p||!silent){setProfile(p);}')
  ],
  ['회원앱 저장 안정성: 초기 로딩(useEffect)과 오류 화면의 "다시 시도" 버튼은 기존과 동일하게 non-silent(전체 로딩/오류 화면 유지)로 load()를 호출한다',
    app.includes('useEffect(()=>{load();},[load]);') && app.includes('onRetry={load}')
  ],
  ['회원앱 저장 안정성: 체중·칼로리·걸음수/컨디션/통증/건강기록삭제/근육통/수업피드백/프로필정보/유산소/목표수정 저장 후 재조회가 모두 load({silent:true})로 호출된다(전체 reload가 저장 실패로 오인되지 않음)',
    (() => {
      const count = app.split('await load({silent:true})').length - 1;
      return count >= 9;
    })() &&
    !app.includes('await saveMemberHealthInputs(profile.id,dateKey,{weight:weightValue,kcal:kcalValue,steps:stepsValue}); if(parsedWeight){setBody(prev=>({...(prev||{}),records:upsertBodyRecord(prev?.records||[],{id:`member_${dateKey}`,date:dateKey,weight:parsedWeight,note:"회원앱 직접 입력"})}));} setForm(f=>({...f,weight:"",kcal:"",steps:""})); await load(); ')
  ],
  ['회원앱 저장 안정성: 저장 함수(건강기록/컨디션/통증/건강기록삭제/유산소)는 중복 실행 방지 가드가 Promise 시작 전에 즉시 저장 상태를 잠근다',
    app.includes('const saveCheck=async()=>{if(healthSaving)return;') &&
    app.includes('const saveCondition=async()=>{if(conditionSaving)return;') &&
    app.includes('const savePain=async()=>{if(painSaving)return;') &&
    app.includes('if(cardioSaving) return;')
  ],
  ['회원앱 저장 안정성: 저장 실패 시 finally 블록에서 healthSaving/conditionSaving/painSaving/cardioSaving이 반드시 false로 해제된다(무한 "저장 중" 방지)',
    app.includes('finally{setHealthSaving(false);}') &&
    app.includes('finally{setConditionSaving(false);}') &&
    app.includes('finally{setPainSaving(false);}') &&
    app.includes('finally{ setCardioSaving(false); }')
  ],
  ['회원앱 저장 안정성: 네트워크성 오류 코드(unavailable/deadline-exceeded/network-request-failed 등)는 로그아웃이 아니라 재시도 가능한 "네트워크 상태를 확인" 안내로 처리된다',
    app.includes('const MEMBER_SAVE_NETWORK_CODES=new Set(["unavailable","deadline-exceeded","network-request-failed","cancelled","resource-exhausted"]);') &&
    app.includes('const memberSaveErrorMessage=(error,fallback)=>MEMBER_SAVE_NETWORK_CODES.has(error?.code||"")?"저장하지 못했습니다. 네트워크 상태를 확인한 후 다시 시도해주세요.":(error?.message||fallback);')
  ],
  ['회원앱 저장 안정성: 저장 오류 로그가 action/memberId/errorCode/message 구조로 남아 간헐적 실패 재발 시 원인을 추적할 수 있다(건강정보 전체 값은 남기지 않음)',
    app.includes('const logMemberSaveError=(action,error)=>{ console.error("[MemberApp Save Error]",{action,memberId:profile?.id||null,errorCode:error?.code,message:error?.message,error}); };')
  ],
  ['수업 후 상태(MemberFeedbackForm): RPE·근육통·메모 저장 실패가 카드 안 saveError로만 안내되고 입력값·펼침 상태가 유지된다(전체 앱 오류 화면으로 전파되지 않음)',
    app.includes('setSaveError({key,message:e?.message||"저장하지 못했습니다. 네트워크 상태를 확인한 후 다시 시도해주세요."});') &&
    app.includes('{saveError?.key==="rpe"&&<p className="pw-error">{saveError.message}</p>}') &&
    app.includes('{saveError?.key==="soreness"&&<p className="pw-error">{saveError.message}</p>}') &&
    app.includes('{saveError?.key==="memo"&&<p className="pw-error">{saveError.message}</p>}')
  ],

  // ── 건강 탭 "어제 기록/오늘 상태" 날짜 규칙 + 분석 탭 D-1 매칭: 실제 실행 시나리오 검증 ──
  healthDateScenario('건강 탭 날짜 규칙: 2026-08-19의 어제는 2026-08-18이다',
    lib => lib.getKoreaYesterdayDateString(new Date('2026-08-19T12:00:00+09:00')) === '2026-08-18'
  ),
  healthDateScenario('건강 탭 날짜 규칙: 2026-09-01의 어제는 2026-08-31이다(월 경계)',
    lib => lib.getKoreaYesterdayDateString(new Date('2026-09-01T12:00:00+09:00')) === '2026-08-31'
  ),
  healthDateScenario('건강 탭 날짜 규칙: 2027-01-01의 어제는 2026-12-31이다(연도 경계)',
    lib => lib.getKoreaYesterdayDateString(new Date('2027-01-01T12:00:00+09:00')) === '2026-12-31'
  ),
  prevDayScenario('분석 탭 D-1 매칭: 전날 날짜 계산은 월 경계에서도 정확하다(2026-08-31의 전날=2026-08-30)',
    lib => lib.prevCalendarDate('2026-08-31') === '2026-08-30'
  ),
  prevDayScenario('분석 탭 D-1 매칭: 전날 날짜 계산은 연도 경계에서도 정확하다(2026-01-01의 전날=2025-12-31)',
    lib => lib.prevCalendarDate('2026-01-01') === '2025-12-31'
  ),
  prevDayScenario('분석 탭 D-1 매칭: 8/19 체중과 8/18 섭취칼로리가 하나의 row로 연결된다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows([{ date: '2026-08-19', weight: 64.2 }], [{ date: '2026-08-18', kcal: 1800 }], [], [], 7);
      return rows.length === 1 && rows[0].date === '2026-08-19' && rows[0].prevDate === '2026-08-18' && rows[0].prevKcal === 1800;
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 8/19 체중과 8/18 걸음수가 하나의 row로 연결된다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows([{ date: '2026-08-19', weight: 64.2 }], [], [{ date: '2026-08-18', steps: 8200 }], [], 7);
      return rows.length === 1 && rows[0].prevSteps === 8200;
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 8/19 체중과 8/18 유산소가 하나의 row로 연결된다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows([{ date: '2026-08-19', weight: 64.2 }], [], [], [{ date: '2026-08-18', activityType: '러닝', durationMinutes: 30 }], 7);
      return rows.length === 1 && rows[0].prevCardioMinutes === 30 && rows[0].prevCardioTypes.includes('러닝');
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 같은 날짜(8/19) 칼로리는 무시되고 전날(8/18) 값만 연결된다 — 원본 날짜를 이동시키지 않는다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows([{ date: '2026-08-19', weight: 64.2 }], [{ date: '2026-08-19', kcal: 2000 }, { date: '2026-08-18', kcal: 1800 }], [], [], 7);
      return rows[0].prevKcal === 1800;
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 전날 기록이 없으면 prevKcal/prevSteps/prevCardioMinutes는 null이고 0으로 채우지 않는다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows([{ date: '2026-08-19', weight: 64.2 }], [], [], [], 7);
      return rows[0].prevKcal === null && rows[0].prevSteps === null && rows[0].prevCardioMinutes === null;
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 8/19 몸 상태(체중·컨디션·통증)와 8/18 생활(칼로리·걸음수·유산소)이 하나의 분석 단위로 연결된다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows(
        [{ date: '2026-08-19', weight: 64.2 }],
        [{ date: '2026-08-18', kcal: 1800 }],
        [
          { date: '2026-08-18', steps: 8200, condition: '보통', painPart: '없음' },
          { date: '2026-08-19', condition: '좋음', painPart: '어깨', painVas: 1 },
        ],
        [{ date: '2026-08-18', activityType: '러닝', durationMinutes: 30 }],
        7
      );
      const r = rows[0];
      return rows.length === 1 && r.date === '2026-08-19' && r.prevDate === '2026-08-18' &&
        r.weight === 64.2 && r.condition === '좋음' && r.painLabel === '어깨 · VAS 1' && r.hasActualPain === true &&
        r.prevKcal === 1800 && r.prevSteps === 8200 && r.prevCardioMinutes === 30;
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 전날(8/18) 컨디션·통증은 당일(8/19) 상태로 끌어오지 않는다 — 상태는 그 날짜 기록만 사용',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows(
        [{ date: '2026-08-19', weight: 64.2 }],
        [],
        [{ date: '2026-08-18', condition: '매우 피곤', painPart: '무릎', painVas: 5 }],
        [],
        7
      );
      return rows[0].condition === null && rows[0].painLabel === null && rows[0].hasActualPain === false;
    }
  ),
  prevDayScenario('분석 탭 D-1 매칭: 통증 "없음"으로 기록한 날은 미입력(null)과 구분해서 표시한다',
    lib => {
      const rows = lib.buildPrevDayLifestyleRows(
        [{ date: '2026-08-19', weight: 64.2 }],
        [], [{ date: '2026-08-19', painPart: '없음' }], [], 7
      );
      return rows[0].painLabel === '없음' && rows[0].hasActualPain === false;
    }
  ),
  kcalLogsScenario('섭취 칼로리 집계 보존: 같은 날짜에 로그가 여러 건이어도 그 날짜의 총섭취량 1건으로 정규화된다',
    lib => {
      const rows = lib.getKcalLogs({ logs: [{ date: '2026-08-18', kcal: 700 }, { date: '2026-08-18', kcal: 1800 }, { date: '2026-08-19', kcal: 2000 }] });
      return rows.length === 2 && rows[0].date === '2026-08-18' && rows[0].kcal === 1800 && rows[1].kcal === 2000;
    }
  ),
  kcalLogsScenario('섭취 칼로리 집계 보존: nutrition.dates의 총섭취량(totalKcal)도 같은 날짜 기준으로 통합된다',
    lib => {
      const rows = lib.getKcalLogs({ logs: [{ date: '2026-08-18', kcal: 700 }], dates: { '2026-08-18': { totalKcal: 1800 } } });
      return rows.length === 1 && rows[0].kcal === 1800;
    }
  ),

  // ── 분석 탭 "전날 생활 ↔ 오늘 상태" 카드 UI + 반응형(기존 breakpoint 재사용) ──
  ['분석 탭: 전날 생활(칼로리·걸음수·유산소)과 오늘 몸 상태(체중·컨디션·통증)를 한 행에서 좌우로 비교하는 카드로 렌더한다',
    app.includes('<MCard title="전날 생활 ↔ 오늘 상태">') &&
    app.includes('<div className="apr-col prev">') &&
    app.includes('<div className="apr-col today">') &&
    app.includes('<span className="apr-chip main">체중 {r.weight}kg</span>') &&
    app.includes('{r.condition && <span className="apr-chip">컨디션 {r.condition}</span>}') &&
    app.includes('전날 {formatKoreanDateLabel(r.prevDate)} 생활')
  ],
  ['분석 탭: 전날 생활 비교는 인과를 단정하지 않고 참고용 비교로만 안내한다',
    app.includes('인과가 아닌 참고용 비교예요')
  ],
  ['분석 탭 반응형: 전날↔오늘 비교 카드는 새 breakpoint 없이 기존 700px 기준만 사용하고, 모바일은 세로(↓)·와이드는 좌우(→) 배치로 레이아웃만 바뀐다',
    app.includes('.anx-prevday-row .apr-arrow::before{content:"↓"}') &&
    app.includes('@media(min-width:700px){.anx-prevday-row{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:14px;padding:14px 16px}.anx-prevday-row .apr-arrow::before{content:"→"}}')
  ],
  ['건강 탭 반응형: 어제/오늘 그룹 레이아웃도 새 breakpoint를 만들지 않고 기존 700px(회원앱 공용 max-width 전환 기준)만 재사용한다',
    app.includes('@media(min-width:700px){.member-page{max-width:760px}') &&
    (() => {
      // 건강 그룹(.health-daygroup*) 규칙이 들어 있는 media query 조건을 전부 모아, 기존 700px 기준 외에는 없는지 확인한다.
      const conditions = [];
      let i = app.indexOf('@media(');
      while (i !== -1) {
        const cond = app.slice(i + 7, app.indexOf(')', i));
        const open = app.indexOf('{', i);
        let depth = 0, j = open;
        for (; j < app.length; j++) { if (app[j] === '{') depth++; else if (app[j] === '}') { depth--; if (depth === 0) break; } }
        if (app.slice(open, j + 1).includes('.health-daygroup')) conditions.push(cond);
        i = app.indexOf('@media(', j);
      }
      return app.includes('.health-daygroups{display:grid') && conditions.length > 0 && conditions.every(c => c === 'min-width:700px');
    })()
  ],
  ['건강 탭 반응형: 넓은 화면에서는 그룹 패널 안 카드를 가로형 1열로 배치한다(패널 폭 350px 안팎에서 3열로 나누면 라벨·값이 잘림)',
    app.includes('.health-daygroup-grid{grid-template-columns:minmax(0,1fr);gap:9px}') &&
    app.includes('.health-daygroup-grid .mv2-today-tile{flex-direction:row;align-items:center;gap:12px;min-height:68px;padding:13px 16px}') &&
    app.includes('.mv2-today-tile b{display:block;font-size:min(19px,4.8vw)')
  ],
  ['건강 탭: 어제/오늘 데이터 모델은 viewport와 무관하게 하나 — 화면 폭으로 날짜·데이터를 분기하지 않는다(레이아웃만 CSS로 변경)',
    (() => {
      const block = app.slice(app.indexOf('function MemberHealth(p){'), app.indexOf('function CardioEntryForm'));
      return !block.includes('innerWidth') && !block.includes('matchMedia') && !block.includes('isTablet') &&
        block.includes('const yesterdayTiles=buildYesterdayHealthTiles(p,yesterday,open);') &&
        block.includes('const todayTiles=buildTodayStatusTiles(p,today,open);');
    })()
  ],
  ['건강 탭: 카드 저장 후 무거운 MemberApp 전체 재조회(reloadMemberApp)를 새로 호출하지 않는다(기존 저장 함수의 silent 재조회만 사용)',
    (() => {
      const block = app.slice(app.indexOf('function MemberHealth(p){'), app.indexOf('function CardioEntryForm'));
      return !block.includes('reloadMemberApp');
    })()
  ],

  // ── 공통 판단 로직(목표 방향 × 최근 체중 변화 × 데이터 충분성) ──
  goalStateScenario('공통 판단: 목표별 체중 방향 — 다이어트=down, 벌크업=up, 건강관리/유지=stable, 체형교정·체력향상은 체중으로 판단하지 않음(null)',
    lib => lib.getGoalWeightDirection('diet') === 'down' && lib.getGoalWeightDirection('bulk') === 'up' &&
      lib.getGoalWeightDirection('general') === 'stable' && lib.getGoalWeightDirection('correction') === null && lib.getGoalWeightDirection('fitness') === null
  ),
  goalStateScenario('공통 판단: 다이어트 회원이 최근 30일 +4kg이면 tone=warn(목표와 반대 방향) — 칭찬 문구가 나가면 안 되는 상태',
    lib => {
      const st = lib.buildGoalWeightState('diet', [{ date: '2026-07-20', weight: 60.0 }, { date: '2026-08-19', weight: 64.0 }]);
      return st.tone === 'warn' && st.move === 'gain' && st.delta === 4 && st.enough === true && st.aligned === false;
    }
  ),
  goalStateScenario('공통 판단: 다이어트 회원이 감량 중이면 tone=good',
    lib => {
      const st = lib.buildGoalWeightState('diet', [{ date: '2026-07-20', weight: 64.0 }, { date: '2026-08-19', weight: 62.8 }]);
      return st.tone === 'good' && st.move === 'loss' && st.aligned === true;
    }
  ),
  goalStateScenario('공통 판단: 벌크업 회원은 증가가 good, 감소가 warn (다이어트와 반대로 판정)',
    lib => {
      const up = lib.buildGoalWeightState('bulk', [{ date: '2026-07-20', weight: 62.0 }, { date: '2026-08-19', weight: 63.5 }]);
      const down = lib.buildGoalWeightState('bulk', [{ date: '2026-07-20', weight: 63.5 }, { date: '2026-08-19', weight: 62.0 }]);
      return up.tone === 'good' && down.tone === 'warn';
    }
  ),
  goalStateScenario('공통 판단: 체중 유지 목표는 변동이 작으면 good, 크게 움직이면 warn',
    lib => {
      const flat = lib.buildGoalWeightState('general', [{ date: '2026-07-20', weight: 63.0 }, { date: '2026-08-19', weight: 63.2 }]);
      const moved = lib.buildGoalWeightState('general', [{ date: '2026-07-20', weight: 63.0 }, { date: '2026-08-19', weight: 65.0 }]);
      return flat.tone === 'good' && flat.move === 'flat' && moved.tone === 'warn';
    }
  ),
  goalStateScenario('공통 판단: 체형교정·체력향상은 체중 변화에 좋다/나쁘다를 붙이지 않는다(tone=neutral)',
    lib => {
      const st = lib.buildGoalWeightState('correction', [{ date: '2026-07-20', weight: 63.0 }, { date: '2026-08-19', weight: 65.0 }]);
      return st.goalDirection === null && st.tone === 'neutral' && st.aligned === false;
    }
  ),
  goalStateScenario('공통 판단: 데이터 부족(기록 1건 / 기간 7일 미만)이면 tone=unknown — 긍정·부정 어느 쪽도 단정하지 않는다',
    lib => {
      const one = lib.buildGoalWeightState('diet', [{ date: '2026-08-19', weight: 64.0 }]);
      const tooShort = lib.buildGoalWeightState('diet', [{ date: '2026-08-17', weight: 66.0 }, { date: '2026-08-19', weight: 64.0 }]);
      return one.tone === 'unknown' && one.enough === false && one.move === null &&
        tooShort.tone === 'unknown' && tooShort.enough === false && tooShort.aligned === null;
    }
  ),
  goalStateScenario('공통 판단: 데이터가 부족하면 한 줄 요약도 평가 대신 기록을 더 쌓자는 안내만 한다',
    lib => {
      const line = lib.goalWeightHeadline(lib.buildGoalWeightState('diet', [{ date: '2026-08-19', weight: 64.0 }]));
      return line.includes('기록이 조금 더 쌓이면') && !line.includes('잘 맞습니다') && !line.includes('다르게 움직이고');
    }
  ),
  goalStateScenario('공통 판단: 같은 +1.0kg도 목표에 따라 색 판정이 달라진다(다이어트=warn, 벌크업=good, 교정=neutral)',
    lib => lib.goalDeltaTone('down', 1.0) === 'warn' && lib.goalDeltaTone('up', 1.0) === 'good' &&
      lib.goalDeltaTone(null, 1.0) === 'neutral' && lib.goalDeltaTone('stable', 0.2) === 'good' && lib.goalDeltaTone('down', null) === 'neutral'
  ),
  goalStateScenario('공통 판단: 색상도 데이터 충분성을 먼저 본다 — 기록이 부족하면(enough=false) 좋음/주의 색이 아니라 중립(unknown) 색을 쓴다',
    lib => {
      const st = lib.buildGoalWeightState('diet', [{ date: '2026-08-17', weight: 66.0 }, { date: '2026-08-19', weight: 64.0 }]);
      const tone = st.enough ? lib.goalDeltaTone(st.goalDirection, st.delta) : 'unknown';
      return st.enough === false && tone === 'unknown' && lib.goalToneColor(tone) === '#94A3B8';
    }
  ),

  // ── 이번 기간 리포트 인트로: 목표 방향과 반대일 때 칭찬 문구 금지 ──
  periodReportScenario('기간 리포트: 다이어트 회원이 +4kg인데 운동 기록이 있어도 칭찬 인트로가 나오지 않는다(기존 문제 재발 방지)',
    lib => {
      const report = lib.buildPeriodReport('diet', { wDiff: 4, workoutCount: 3, kcalCount: 6, cardioCount: 2, weightState: { tone: 'warn', goalDirection: 'down', enough: true } });
      return report && report.goods.length > 0 && report.intro !== '이번 기간도 잘하고 있어요.' && report.intro.includes('목표와 다른 방향');
    }
  ),
  periodReportScenario('기간 리포트: 감량이 실제로 진행 중이면 기존처럼 칭찬 인트로를 유지한다',
    lib => {
      const report = lib.buildPeriodReport('diet', { wDiff: -1.2, workoutCount: 3, kcalCount: 6, cardioCount: 2, weightState: { tone: 'good', goalDirection: 'down', enough: true } });
      return report.intro === '이번 기간도 잘하고 있어요.';
    }
  ),
  periodReportScenario('기간 리포트: 판단할 체중 기록이 부족하면 칭찬도 지적도 하지 않고 사실만 안내한다',
    lib => {
      const report = lib.buildPeriodReport('diet', { wDiff: null, workoutCount: 2, weightState: { tone: 'unknown', goalDirection: 'down', enough: false } });
      return report.intro === '이번 기간 기록을 정리했어요.';
    }
  ),
  ['기간 리포트 카드: 인트로 문구를 하드코딩하지 않고 공통 판단 결과(report.intro)만 렌더한다',
    app.includes('{report.intro && <p className="anx-report-intro">{report.intro}</p>}') &&
    !app.includes('anx-report-intro">이번 기간도 잘하고 있어요.')
  ],
  ['목표 전략: 분석 탭에서 계산한 공통 판단 결과(weightState)를 전달받아 사용한다(카드가 자체 기준을 새로 만들지 않음)',
    app.includes('const weightState = buildGoalWeightState(persona, weights);') &&
    app.includes('<WeightGoalStrategyCard {...p} persona={persona} weightState={weightState}') &&
    app.includes('weightState=null,...p}){') &&
    app.includes('const st=weightState||buildGoalWeightState(persona,getBodyWeightRecords(p.body));')
  ],
  ['목표 전략: 최근 흐름이 목표와 반대이거나 기록이 부족하면 낙관적인 예상 기간(약 N주)을 만들지 않는다',
    app.includes('흐름 확인 필요') && app.includes('기록 더 필요') &&
    !app.includes('{label:"예상 기간",value:f.remain>0&&f.weeks>0?')
  ],
  ['건강 탭 기록 분석: 현재 흐름 문구가 분석 탭과 같은 공통 판단 로직으로 생성된다',
    (() => {
      const block = app.slice(app.indexOf('function buildHealthInsightSummary(p){'), app.indexOf('const CONDITION_EMOJI='));
      return block.includes('buildGoalWeightState(persona,weights.filter(w=>String(w.date)>=dateStrDaysAgo(29)))') &&
        block.includes('const flow=goalWeightHeadline(weightState);') &&
        !block.includes('좋은 흐름을 유지하고');
    })()
  ],
  ['건강 탭 기록 분석: 칼로리 안내가 어제 기록 규칙과 맞고, 오늘 할 행동은 최근 3일 이내 기록만 근거로 삼는다',
    app.includes('const HEALTH_ACTION_RECENT_DAYS=3;') &&
    app.includes('어제 먹은 칼로리를 기록해두면') &&
    app.includes('const lastCheck=(p.checkins||[]).find(c=>String(c.date||c.id||"")>=actionSince)||{};') &&
    !app.includes('오늘 먹은 칼로리를 한 끼만이라도')
  ],
  ['건강 탭 상세(동기부여): 목표와 반대로 움직인 체중 변화에 좋은 흐름이라는 문구를 붙이지 않는다',
    app.includes('const motivationState=buildGoalWeightState(getAnalysisPersona(') &&
    app.includes('goalWeightHeadline(motivationState)') &&
    !app.includes('하며 좋은 흐름을 보이고 있어요.')
  ],
  ['건강 전문 분석·섭취와 체중 변화: 체중/체지방/BMI 색상이 회원 목표 방향(공통 판단)을 따른다',
    app.includes('const fatMassTone = persona === "bulk" ? "neutral" : goalDeltaTone("down", fatMassDiff, 0.1);') &&
    app.includes('goalToneColor(weightState.enough ? goalDeltaTone(weightState.goalDirection, wDiff) : "unknown")') &&
    app.includes('goalToneColor(fatMassTone)') &&
    app.includes('persona === "bulk" ? "#66717C"') &&
    !app.includes('color: wDiff <= 0 ? "#16A34A" : "#F97316"')
  ],
  ['분석 탭: 분석 화면에 새로 들어오면 기간은 항상 "전체"에서 시작한다(이전 선택을 기억하지 않음)',
    app.includes('const [period, setPeriod] = useState("all");') &&
    !app.includes('localStorage.getItem("teogym_analysis_period")')
  ],
  ['섭취와 체중 변화 그래프: 회원앱 kcal Y축 라벨이 잘리지 않도록 축 폭을 명시하고 왼쪽 여백을 음수로 당기지 않는다(관리자앱 값 유지)',
    app.includes('left:admin?-18:0,bottom:0') &&
    app.includes('<YAxis width={admin?60:64} tick={axisTick}') &&
    !app.includes('left:admin?-18:-14')
  ],

  // ── 시작 체중 단일 기준 ──
  startWeightScenario('시작 체중: 실제 측정 기록이 있으면 등록 당시 값(profile.startWeight)이 달라도 가장 오래된 측정 기록을 쓴다',
    lib => lib.getMemberStartWeight({
      records: [{ date: '2026-06-01', weight: 70.0 }, { date: '2026-08-19', weight: 64.0 }],
      profile: { startWeight: 75 }, onboarding: { startingWeightKg: 73 }, currentWeight: 64,
    }) === 70
  ),
  startWeightScenario('시작 체중: 측정 기록이 없을 때만 등록 당시 값(profile.startWeight → onboarding.startingWeightKg) 순으로 보조 사용',
    lib => lib.getMemberStartWeight({ records: [], profile: { startWeight: 75 }, onboarding: { startingWeightKg: 73 }, currentWeight: 64 }) === 75 &&
      lib.getMemberStartWeight({ records: [], profile: {}, onboarding: { startingWeightKg: 73 }, currentWeight: 64 }) === 73 &&
      lib.getMemberStartWeight({ records: [], profile: {}, onboarding: {}, currentWeight: 64 }) === 64 &&
      lib.getMemberStartWeight({ records: [], profile: {}, onboarding: {} }) === null
  ),
  startWeightScenario('시작 체중: body 객체를 넘겨도 records를 넘긴 것과 같은 값을 돌려준다(화면마다 다른 경로로 불러도 결과 동일)',
    lib => lib.getMemberStartWeight({ body: { records: [{ date: '2026-08-19', weight: 64.0 }, { date: '2026-06-01', weight: 70.0 }] }, profile: { startWeight: 75 } }) === 70
  ),
  ['시작 체중: 회원앱 startW·getWeightForecast가 각자 우선순위를 두지 않고 공통 helper(getMemberStartWeight) 하나만 사용한다',
    app.includes('startW=getMemberStartWeight({records:weights,profile,onboarding:effectiveOnboarding,currentWeight:curW})||curW;') &&
    app.includes('const start=getMemberStartWeight({records:weights,profile:p.profile||{},onboarding:p.onboarding||{}})||toPositiveNumber(p.startW)||cur;') &&
    !app.includes('startW=toPositiveNumber(profile.startWeight)||toPositiveNumber(effectiveOnboarding.startingWeightKg)') &&
    !app.includes('const start=weights[0]?.weight||toPositiveNumber(p.startW)||cur;')
  ],
  ['시작 체중: 프로필의 "시작 체중" 입력칸은 저장된 값(profile.startWeight)을 그대로 보여준다(계산 기준 통일이 저장값 표시를 덮어쓰지 않음)',
    app.includes('startWeight:(p.profile.startWeight||(p.startW&&p.startW!=="-"?p.startW:""))||""')
  ],

  // ── 목표 유형별 페이스·라벨(감량 전제 제거) ──
  startWeightScenario('목표 페이스: 다이어트는 필요 감량량(현재-목표), 벌크업은 필요 증량량(목표-현재)으로 계산된다',
    lib => {
      const diet = lib.getGoalPace(70, 64, '2026-12-31', lib.getGoalWeightDirection(lib.getAnalysisPersona('다이어트')));
      const bulk = lib.getGoalPace(64, 70, '2026-12-31', lib.getGoalWeightDirection(lib.getAnalysisPersona('벌크업')));
      return diet.mode === 'loss' && diet.need === 6 && bulk.mode === 'gain' && bulk.need === 6;
    }
  ),
  startWeightScenario('목표 페이스: 체중 유지 목표는 감량/증량 필요량 대신 목표 유지 범위(±1kg)와 유지 여부를 돌려준다',
    lib => {
      const keep = lib.getGoalPace(63.4, 63, '2026-12-31', lib.getGoalWeightDirection(lib.getAnalysisPersona('건강관리')));
      const off = lib.getGoalPace(66, 63, '2026-12-31', lib.getGoalWeightDirection(lib.getAnalysisPersona('건강관리')));
      return keep.mode === 'stable' && keep.withinRange === true && keep.rangeLow === 62 && keep.rangeHigh === 64 &&
        off.mode === 'stable' && off.withinRange === false && off.gap === 3;
    }
  ),
  startWeightScenario('목표 페이스: 체형교정·체력향상처럼 체중이 핵심 목표가 아니면 감량/증량 페이스를 아예 만들지 않는다(라벨 미노출)',
    lib => lib.getGoalPace(70, 64, '2026-12-31', lib.getGoalWeightDirection(lib.getAnalysisPersona('체형교정'))) === null &&
      lib.getGoalPace(70, 64, '2026-12-31', lib.getGoalWeightDirection(lib.getAnalysisPersona('체력향상'))) === null
  ),
  startWeightScenario('목표까지 남은 체중: 감량은 현재-목표, 증량은 목표-현재, 유지·체중 무관 목표는 null(남은 양 개념 없음)',
    lib => lib.getWeightRemaining('down', 70, 64) === 6 && lib.getWeightRemaining('up', 64, 70) === 6 &&
      lib.getWeightRemaining('down', 62, 64) === 0 && lib.getWeightRemaining('stable', 70, 64) === null && lib.getWeightRemaining(null, 70, 64) === null
  ),
  startWeightScenario('목표 라벨: 감량/증량 문구를 화면마다 새로 쓰지 않고 GOAL_PACE_LABELS 한 곳에서 가져온다',
    lib => lib.GOAL_PACE_LABELS.down.need === '필요 감량량' && lib.GOAL_PACE_LABELS.down.weekly === '주당 감량 필요량' &&
      lib.GOAL_PACE_LABELS.up.need === '필요 증량량' && lib.GOAL_PACE_LABELS.up.weekly === '주당 증량 필요량' &&
      lib.GOAL_PACE_LABELS.stable === undefined
  ),
  ['목표 기간 안내(GoalPeriodInfo): 목표 유형을 받아 라벨을 고르고, 감량 전제 문구를 하드코딩하지 않는다',
    app.includes('function GoalPeriodInfo({currentWeight,targetWeight,period,customDate,goal=""}){') &&
    app.includes('const goalDirection=getGoalWeightDirection(getAnalysisPersona(goal));') &&
    app.includes('const labels=pace?GOAL_PACE_LABELS[goalDirection]:null;') &&
    app.includes('goal={base.goal}') &&
    !app.includes('`필요 감량량 ${pace.need.toFixed(1)}kg · 주당 감량 필요량 약 ${pace.weekly.toFixed(1)}kg`')
  ],
  ['홈 목표 카드: 목표까지 남은 체중·도달 예상이 목표 방향을 따른다(증량 목표 회원이 "목표 도달!"로 잘못 표시되지 않음)',
    app.includes('const goalDirection=getGoalWeightDirection(getAnalysisPersona(p.onboarding?.goal||p.profile?.goal));') &&
    app.includes('return {cur,start,target,goalDirection,remain:neededLoss,') &&
    app.includes('f.goalDirection==="down"||f.goalDirection==="up"') &&
    app.includes('{f.goalDirection==="stable"?"목표 범위 안에서 유지 중이에요":"목표 체중에 도달했어요"}')
  ],
  ['분석 탭·목표 전략: "목표까지"/"남은 증량"도 공통 helper 결과만 쓰고 카드마다 다시 계산하지 않는다',
    app.includes('const remainW = getWeightRemaining(getGoalWeightDirection(persona), curW, targetW);') &&
    app.includes('const gain=f.remain;') &&
    !app.includes('Math.max(0, +(Number(curW) - targetW).toFixed(1))') &&
    !app.includes('const gain=Number.isFinite(f.cur)&&Number.isFinite(f.target)?Math.max(0,f.target-f.cur):0;')
  ],

  // ── 한국어 단어 중간 줄바꿈 방지 ──
  ['회원앱 줄바꿈: 화면 전체에 word-break:keep-all을 적용해 "보세요"가 "보세/요"로 갈라지지 않게 하고, 띄어쓰기 없는 긴 문자열만 넘칠 때 끊는다',
    app.includes('animation:memberFadeIn .22s ease;word-break:keep-all;overflow-wrap:break-word}') &&
    app.includes('.calorie-metric-block b{display:block;font-size:15px;font-weight:900;color:#20242A;word-break:keep-all;overflow-wrap:anywhere}') &&
    !app.includes('.calorie-metric-block b{display:block;font-size:15px;font-weight:900;color:#20242A;word-break:break-all}')
  ],
  ['회원앱 줄바꿈: 설명 문구에 <br>을 하드코딩하지 않는다(폭에 따라 자연스럽게 여러 줄이 되도록 CSS로만 처리)',
    app.includes('<b>건강 기록</b><span>어제의 생활과 오늘의 몸 상태를 함께 기록해 보세요.</span>') &&
    !app.includes('함께 기록해<br')
  ],

  // ── 분석 탭 기간: 항상 전체로 시작 ──
  ['분석 탭: 기간 기본값이 항상 "전체"이고, 이전 선택을 저장/복원하는 localStorage 로직이 남아 있지 않다',
    app.includes('const [period, setPeriod] = useState("all");') &&
    app.includes('const handleSetPeriod = k => setPeriod(k);') &&
    !app.includes('teogym_analysis_period')
  ],
  ['분석 탭: 탭을 나갔다 다시 들어오면 컴포넌트가 새로 마운트되어 기간이 전체로 돌아온다(탭 전환 시 key 변경 + 조건부 렌더 유지)',
    app.includes('<div key={tab} className="member-tab-fade">') &&
    app.includes('tab==="analysis"&&<MemberAnalysis {...common}/>')
  ],

  // ── 목표 대비 섭취(구 "목표 달성률") ──
  calorieIntakeScenario('목표 대비 섭취: 최근 7일 평균 3,000kcal / 목표 2,125kcal면 141%로 계산되고, 목표보다 41% 높다고 설명한다',
    lib => {
      const r = lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 2125, goalDirection: 'down', recentCount: 5 });
      return r.pct === 141 && r.display === '141%' && r.diff === 875 && r.note.includes('약 41% 높아요') && r.note.includes('참고');
    }
  ),
  calorieIntakeScenario('목표 대비 섭취: 다이어트 회원이 목표보다 많이 먹은 상태를 초록색 성공으로 표시하지 않는다(주의색)',
    lib => {
      const r = lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 2125, goalDirection: 'down', recentCount: 5 });
      return r.tone === 'warn' && lib.goalToneColor(r.tone) !== '#16A34A';
    }
  ),
  calorieIntakeScenario('목표 대비 섭취: 같은 141%라도 증량 목표 회원에게는 목표 방향과 맞는 상태로 판정한다(공통 목표 방향 재사용)',
    lib => lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 2125, goalDirection: 'up', recentCount: 5 }).tone === 'good' &&
      lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 2125, goalDirection: null, recentCount: 5 }).tone === 'neutral'
  ),
  calorieIntakeScenario('목표 대비 섭취: 목표 ±150kcal 안이면 목표 범위 안내로 표시한다',
    lib => {
      const r = lib.buildCalorieIntakeSummary({ avg7: 2200, targetKcal: 2125, goalDirection: 'down', recentCount: 5 });
      return r.tone === 'good' && r.note.includes('목표 범위 안');
    }
  ),
  calorieIntakeScenario('목표 대비 섭취: 목표 칼로리가 없거나 비정상이면 비율을 만들지 않고 중립 상태로 안내한다',
    lib => {
      const none = lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: null, goalDirection: 'down', recentCount: 5 });
      const zero = lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 0, goalDirection: 'down', recentCount: 5 });
      return none.pct === null && none.tone === 'unknown' && none.display === '목표 미설정' && zero.pct === null && zero.tone === 'unknown';
    }
  ),
  calorieIntakeScenario('목표 대비 섭취: 최근 7일 기록이 없거나 1건뿐이면 0%·100% 같은 값을 만들지 않고 "기록 부족"으로 둔다',
    lib => {
      const empty = lib.buildCalorieIntakeSummary({ avg7: null, targetKcal: 2125, goalDirection: 'down', recentCount: 0 });
      const one = lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 2125, goalDirection: 'down', recentCount: 1 });
      return empty.pct === null && empty.display === '기록 부족' && empty.tone === 'unknown' &&
        one.pct === null && one.display === '기록 부족' && one.tone === 'unknown';
    }
  ),
  ['섭취와 체중 변화 카드: "목표 달성률" 라벨을 쓰지 않고 "목표 대비 섭취"와 설명 문구를 함께 보여준다',
    app.includes('<span>목표 대비 섭취</span>') &&
    app.includes('<p className="calorie-intake-note">{calorieIntake.note}</p>') &&
    !app.includes('<span>목표 달성률</span>')
  ],
  ['섭취와 체중 변화 카드: 최근 7일 평균·목표 대비 섭취 색이 같은 판정(goalDeltaTone 기반 tone)을 공유해 카드 안에서 결론이 엇갈리지 않는다',
    app.includes('const calorieIntake = buildCalorieIntakeSummary({ avg7, targetKcal: target.value, goalDirection: weightState.goalDirection, recentCount: getRecentKcalLogsByDays(p.nutrition, 7).length });') &&
    app.includes('<div className="calorie-metric-block"><span>최근 7일 평균</span><b style={{ color: goalToneColor(calorieIntake.tone) }}>') &&
    !app.includes('color: calorieDiff !== null && Math.abs(calorieDiff) <= 150 ? "#16A34A" : "#F97316"')
  ],
  calorieIntakeScenario('결론 일관성: 다이어트 회원(체중 +4kg / 섭취 목표 초과)이면 체중 판정과 섭취 판정이 모두 warn으로 같은 방향을 가리킨다',
    lib => {
      const direction = lib.getGoalWeightDirection(lib.getAnalysisPersona('다이어트'));
      const intake = lib.buildCalorieIntakeSummary({ avg7: 3000, targetKcal: 2125, goalDirection: direction, recentCount: 5 });
      return direction === 'down' && intake.tone === 'warn';
    }
  ),

  // ── 관리자앱 "목표 달성률" 2곳(체중 목표 진행률) ──
  startWeightScenario('관리자 목표 달성률: 시작→목표 구간의 진행률(진짜 progress ratio)이며, 목표와 같은 방향으로 간 만큼만 올라간다',
    lib => {
      const p = lib.getWeightGoalProgress({ startWeight: 81, currentWeight: 78, targetWeight: 75 });
      return p.pct === 50 && p.offTrack === false && p.tone === 'good' && p.moved === -3 && p.needed === -6;
    }
  ),
  startWeightScenario('관리자 목표 달성률: 다이어트 회원이 81→85kg로 늘면 "67% 달성"이 아니라 진행률 0% + 목표와 반대 방향(warn)으로 판정된다',
    lib => {
      const p = lib.getWeightGoalProgress({ startWeight: 81, currentWeight: 85, targetWeight: 75 });
      return p.pct === 0 && p.rawPct < 0 && p.offTrack === true && p.tone === 'warn' && p.moved === 4;
    }
  ),
  startWeightScenario('관리자 목표 달성률: 증량 목표(81→87)에서 늘어나면 정상 진행으로 판정한다(목표 방향을 부호로 인식)',
    lib => {
      const p = lib.getWeightGoalProgress({ startWeight: 81, currentWeight: 83, targetWeight: 87 });
      return p.offTrack === false && p.tone === 'good' && Math.round(p.pct) === 33;
    }
  ),
  startWeightScenario('관리자 목표 달성률: 목표/시작/현재 체중이 없거나 시작=목표면 진행률을 만들지 않는다(0% 표시 금지)',
    lib => lib.getWeightGoalProgress({ startWeight: 0, currentWeight: 85, targetWeight: 75 }) === null &&
      lib.getWeightGoalProgress({ startWeight: 81, currentWeight: 85, targetWeight: null }) === null &&
      lib.getWeightGoalProgress({ startWeight: 81, currentWeight: 85, targetWeight: 81 }) === null
  ),
  startWeightScenario('관리자 색상: 판정(tone)은 회원앱과 같은 값을 쓰고 색만 관리자 다크 팔레트로 매핑한다',
    lib => lib.goalToneColor('warn', { admin: true }) === '#ffd166' && lib.goalToneColor('good', { admin: true }) === '#5EEAD4' &&
      lib.goalToneColor('warn') === '#F97316' && lib.goalToneColor('good') === '#16A34A'
  ),
  ['관리자앱 체형/목표 화면: 목표 달성률이 절대값 계산을 쓰지 않고 방향 인식 공용 helper 하나만 사용한다',
    app.includes('const goalProgress = getWeightGoalProgress({ startWeight: cw, currentWeight: latestWeight, targetWeight: tw });') &&
    app.includes('const progressPct = goalProgress ? Math.round(goalProgress.pct) : null;') &&
    !app.includes('Math.min(100,Math.round((Math.abs(cw-curW)/Math.abs(cw-tw))*100))') &&
    !app.includes('Math.min(100, Math.max(0, ((cw - latestWeight) / (cw - tw)) * 100))')
  ],
  ['관리자앱: 목표와 반대로 움직인 회원에게는 진행률 옆에 방향을 함께 표시하고 색도 주의색으로 바꾼다(회원앱 warn과 결론 일치)',
    app.includes('{goalProgress?.offTrack?"목표 달성률 · 목표와 반대 방향":"목표 달성률"}') &&
    app.includes('목표 달성률{goalProgress.offTrack?" · 목표와 반대 방향":""}') &&
    app.includes('goalToneColor(goalProgress.tone,{admin:true})')
  ],
  ['관리자앱: 목표 체중이 없으면 0%를 만들지 않고 "목표 미설정"으로 표시한다',
    app.includes('{!goalProgress?"목표 미설정":')
  ],
  ['관리자앱: 목표 달성률은 체중 목표 진행률이므로 "달성률" 표현을 유지하고, 칼로리 섭취 비율에는 이 표현을 쓰지 않는다',
    app.includes('<span>목표 대비 섭취</span>') &&
    !app.includes('<span>목표 달성률</span>') &&
    app.includes('function getWeightGoalProgress(')
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed += 1; }
}

if (failed) {
  console.error(`\n${failed} regression check(s) failed.`);
  process.exit(1);
}
console.log('\nAll regression source checks passed.');
