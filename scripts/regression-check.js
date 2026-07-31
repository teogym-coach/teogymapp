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
  unsentSessionLib = new Function(`${sliceKoreaDate}\n${sliceDaysAgo}\n${sliceMonthDayKo}\n${sliceFuncEx}\n${sliceOwner}\n${sliceExcluded}\n${sliceOnboardingStatus}\n${sliceSessionRead}\n${sliceUnsent}\nreturn { isTrialSessionNo, buildUnsentSessionMembers, UNSENT_SESSION_START_DATE, getSessionReadStatus, formatSessionReadTime, summarizeSessionReadStatus, buildUnreadSessionMembers, UNREAD_SESSION_WINDOW_DAYS, hasRealFeedbackInput, getRecentFeedbackInputStats, formatRelativeActiveTime, getMemberLastActiveStatus, getInactiveAppMembers, getNoFeedbackActivityMembers, APP_USAGE_INACTIVE_GRACE_DAYS, getOnboardingStatusFromMember };`)();
} catch (e) {
  console.error('[regression] 수업일지 미전송 헬퍼 추출 실패:', e.message);
}
function usScenario(name, fn) {
  if (!unsentSessionLib) return [name, false];
  try { return [name, !!fn(unsentSessionLib)]; }
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
  const sliceFuncEx = app.slice(app.indexOf('function isFuncEx'), app.indexOf('function funcSetLabel'));
  const sliceFuncVol = app.slice(app.indexOf('function funcExVol'), app.indexOf('function funcExStats'));
  const sliceExVol = app.slice(app.indexOf('const ASSIST_MACHINE_KEYWORDS'), app.indexOf('const CSS = `'));
  const sliceBadge = app.slice(app.indexOf('const MUSCLE_TOP_BADGE_LABEL'), app.indexOf('const GROWTH_METRIC_DEFS'));
  const sliceDateLabel = app.slice(app.indexOf('const KOREAN_DAY_NAMES'), app.indexOf('function rpeDescription'));
  const sliceWeightFmt = app.slice(app.indexOf('function formatWeightValue'), app.indexOf('function ChangeReportMetric'));
  const sliceSuggestConst = app.slice(app.indexOf('const EX_MUSCLE_SUGGEST'), app.indexOf('const EXERCISE_LIBRARY'));
  const sliceLib = app.slice(app.indexOf('const EXERCISE_LIBRARY'), app.indexOf('function getInitialSessionParts'));
  // 비교 헬퍼(개인운동 2차 1단계)는 방향 라벨에 formatMonthDayKo를 쓰므로 그 원본 구간도 같은 스코프에 함께 넣는다.
  const sliceMonthDayKo = app.slice(app.indexOf('function formatMonthDayKo'), app.indexOf('function formatWhenLabel'));
  // 슬라이스 끝 경계는 첫 JSX 컴포넌트 직전(MemberExerciseComparison)까지다 — JSX가 섞이면 new Function 파싱이 깨진다.
  const slicePersonal = app.slice(app.indexOf('const PERSONAL_WORKOUT_PART_OPTIONS'), app.indexOf('function MemberExerciseComparison'));
  personalWorkoutLib = new Function(
    `${sliceLimits}\n${sliceMuscleConst}\n${sliceFuncEx}\n${sliceFuncVol}\n${sliceExVol}\n${sliceBadge}\n${sliceDateLabel}\n${sliceWeightFmt}\n${sliceMonthDayKo}\n${sliceSuggestConst}\n${sliceLib}\n${slicePersonal}\n` +
    'return { PERSONAL_WORKOUT_LIMITS, PERSONAL_WORKOUT_PART_OPTIONS, getPersonalWorkoutPartChipOptions, canonicalExerciseKey, normalizePersonalWorkout, normalizePersonalWorkoutSet, normalizePersonalWorkoutExercise, calculatePersonalExerciseVolume, calculatePersonalWorkoutTotals, collectPersonalWorkoutExerciseKeys, summarizePersonalWorkoutExercise, formatPersonalWorkoutPartsLabel, buildPersonalWorkoutCardSummary, getPersonalWorkoutDurationMinutes, formatPersonalWorkoutDuration, getPersonalWorkoutValidSets, getLastCompletedPersonalExerciseRecord, buildPersonalExerciseCandidates, validatePersonalWorkoutForComplete, ' +
    'normalizeComparableExercise, buildExercisePerformanceSnapshot, compareExercisePerformance, formatExerciseComparisonSummary, buildMemberExerciseComparisonIndex, formatExerciseSnapshotLine, getExerciseRecordDateKey, ' +
    'buildSessionPrepSummary, buildNextStartWeightRecommendation, getDayDiffFromDateKeys, formatElapsedDayLabel };'
  )();
} catch (e) {
  console.error('[regression] 개인운동 헬퍼 추출 실패:', e.message);
}
function pwScenario(name, fn) {
  if (!personalWorkoutLib) return [name, false];
  try { return [name, !!fn(personalWorkoutLib)]; }
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

const unsentMockMember = (id) => ({ id, name: id, status: 'active' });
const unsentMockDate = daysAgoStr(1);
const unsentToday = daysAgoStr(0);
const checks = [
  ['수업일지 저장', app.includes('async function handleSaveSession') && app.includes('await addSession(member.id') && app.includes('await updateSession(member.id')],
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
    ['수업일지 미확인(홈): 공개+최근 14일 이내+미확인 → 목록에 포함', lib => {
      const members = [unsentMockMember('unread1')];
      const sessionsMap = { unread1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 1;
    }],
    ['수업일지 미확인(홈): 이미 확인한 기록은 목록에서 제외', lib => {
      const members = [unsentMockMember('read1')];
      const sessionsMap = { read1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true }] };
      const readsByMember = { read1: { s1: { firstReadAt: unsentMockDate } } };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, readsByMember, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈): 비공개 기록은 미확인 통계 대상이 아님(미전송 영역)', lib => {
      const members = [unsentMockMember('unpub1')];
      const sessionsMap = { unpub1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: false }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈): 14일보다 오래된 공개·미확인 기록은 홈 알림 대상에서 제외', lib => {
      const members = [unsentMockMember('old1')];
      const sessionsMap = { old1: [{ id: 's1', sessionNo: 3, date: daysAgoStr(20), isPublished: true }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
    }],
    ['수업일지 미확인(홈): 테스트 회원/대표(TEO) 개인 기록은 제외', lib => {
      const members = [{ id: 'test1', name: 'test1', status: 'active', isTestMember: true }];
      const sessionsMap = { test1: [{ id: 's1', sessionNo: 3, date: unsentMockDate, isPublished: true }] };
      return lib.buildUnreadSessionMembers(members, {}, sessionsMap, {}, unsentToday).length === 0;
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
  ].map(([name, fn]) => usScenario(name, fn)),
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
    app.includes('function SessionReadBadge({ session, readMap, compact=false })') &&
    app.includes('<SessionReadBadge session={s} readMap={sessionReadsMap} compact={isMobile} />') &&
    app.includes('const readSummary = summarizeSessionReadStatus(sessions, sessionReadsMap, 5);') &&
    app.includes('function buildUnreadSessionMembers(members, liveMembersById, sessionsMap, sessionReadsMapByMember, todayKST)')
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
  ['회원 앱 이용 현황: 회원앱은 home/workout/health/analysis/profile 탭 진입 시에만 기록하고 세션당 최소 10분 간격(sessionStorage)으로 스로틀 — 온보딩 중·TEO·테스트 회원은 제외',
    app.includes('const APP_USAGE_MIN_INTERVAL_MS=10*60*1000;') &&
    app.includes('if(!profile?.id||profile.memberUid!==auth.currentUser?.uid||!onboardingDone||isExcludedAdminMember(profile))return;') &&
    app.includes('recordMemberAppUsage(profile.id,tab).catch(()=>{});')
  ],
  ['회원 앱 이용 현황: 관리자앱 회원 상세 카드가 최근 이용/최근 30일 이용/수업일지 확인/몸 상태 입력을 모두 기존 계산 함수 재사용으로 표시(회원앱에는 노출 안 함)',
    app.includes('const secAppUsage = isOwner(member) ? null : (() => {') &&
    app.includes('const lastActive = getMemberLastActiveStatus(memberAppUsage);') &&
    app.includes('const feedbackStats = getRecentFeedbackInputStats(sessions, 4);')
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
    app.includes('<CardioEntryForm key={todayCardio?.id||"new"} p={p} initialDate={today} initialLog={todayCardio} onSaved={()=>setSheet(null)}/>')
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
    app.includes('await onSplit(editData ? {...editData, exercises, trainerCommentA, trainerCommentB,') &&
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
      const start = app.indexOf('const load=useCallback(async()=>{');
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
  ['수업일지: 세트 표가 운동 유형별 열 자동 구성(중량/반복/시간, 값 있는 열만 표시)',
    app.includes('sets.some(x=>toPositiveNumber(x.weight))&&{key:"weight",label:"중량"') &&
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
  ['건강 탭 카드 순서: 체중·칼로리·걸음수·컨디션·통증·유산소 6개 카드가 이 순서로 배치(카드 하나 = 입력 항목 하나)',
    (() => {
      const i = app.indexOf('function buildTodayHealthTiles(p,today,open){');
      const block = app.slice(i, i + 2200);
      const order = ['key:"weight"', 'key:"kcal"', 'key:"steps"', 'key:"condition"', 'key:"pain"', 'key:"cardio"'];
      let pos = -1;
      return order.every(tok => { const idx = block.indexOf(tok); if (idx === -1 || idx <= pos) return false; pos = idx; return true; });
    })()
  ],
  ['최근 건강 기록 카드 제거: 건강 탭 입력 카드 영역에는 조회 전용 최근 기록 카드가 없음(RecentHealthRecords/buildRecentHealthRecords 삭제)',
    !app.includes('function RecentHealthRecords(') &&
    !app.includes('<RecentHealthRecords') &&
    !app.includes('function buildRecentHealthRecords(')
  ],

  // ── 건강 탭 프리미엄 리디자인(동기부여 대시보드) ──
  ['건강 탭: 오늘 건강 기록 카드 6종이 하나의 health-hub 카드로 표시(하위 유산소 탭/최근 기록 등 별도 섹션 없이 개별 시트로 대체)',
    (() => {
      const iHub = app.indexOf('<div className="health-hub">');
      const iGrid = app.indexOf('className="mv2-today-grid"');
      return iHub !== -1 && iGrid !== -1 && iHub < iGrid && !app.includes('<div className="health-hub-divider"/>');
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
    app.includes('function WeightGoalStrategyCard({persona="diet",painLast=null,periodCardioMinutes=0,periodWorkoutCount=0,...p}){') &&
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
    app.includes('"memo","pain","soreness","rpe","condition","weight","cardio","kcal","steps"')
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
    app.includes('const start=weights[0]?.weight||toPositiveNumber(p.startW)||cur;')
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
    app.includes('.filter(c => !c.convertedMemberId)') &&
    app.includes('const pool = [...realMembers, ...leadRows];')
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
      const openFn = app.slice(app.indexOf('const openSummary=()=>{'), app.indexOf('const saveCompleted=async()=>{'));
      const saveFn = app.slice(app.indexOf('const saveCompleted=async()=>{'), app.indexOf('const summaryPreview='));
      return openFn.includes('validatePersonalWorkoutForComplete(') && !openFn.includes('onComplete') && !openFn.includes('onSaveProgress') &&
        saveFn.includes('await onComplete(workout.id,{') && saveFn.includes('pendingRef.current=false;');
    })()
  ],
  ['관리자 회원 상세: "최근 개인운동" 카드가 최근 수업 카드 아래에 배치되고 조회 전용(수정·삭제 없음)',
    app.includes('const secPersonalWorkout = isOwner(member) ? null : (() => {') &&
    app.includes('<span style={cardTitle}>최근 개인운동</span>') &&
    app.includes('{secBrief}{secAnalysis}{secManage}{secRecent}{secPersonalWorkout}{secAppUsage}') &&
    app.includes('{secToday}{secBrief}{secRecent}{secPersonalWorkout}{secAppUsage}{secPrep}') &&
    (() => {
      const sec = app.slice(app.indexOf('const secPersonalWorkout = isOwner(member)'), app.indexOf('// ⑤-2 회원 앱 이용 현황'));
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
      const sec = app.slice(app.indexOf('const secPersonalWorkout = isOwner(member)'), app.indexOf('// ⑤-2 회원 앱 이용 현황'));
      return !sec.includes('recordMemberAppUsage') && !sec.includes('markSessionDetailRead') && !sec.includes('markSessionsRead');
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
  ['수업 준비 시나리오: 추천 시작 중량은 PT·개인운동 최고 중량 중 높은 값이고 출처를 함께 표시',
    pwScenario('추천 중량', lib => {
      const key = lib.canonicalExerciseKey('바벨 벤치프레스');
      const make = (ptW, pwW) => lib.buildSessionPrepSummary({
        sessions: [{ id: 's1', date: '2026-07-20', isPublished: true, exercises: [{ name: '바벨 벤치프레스', sets: [{ weight: ptW, reps: 10 }] }] }],
        personalWorkouts: [{ id: 'p1', workoutDate: '2026-07-29', status: 'completed', exercises: [{ exerciseKey: key, name: '바벨 벤치프레스', sets: [{ weight: pwW, reps: 10 }] }] }],
        todayKey: '2026-07-31',
      }).recommendation;
      const a = make(20, 22.5);   // 요청 예시 ① PT 20 / 개인 22.5 → 22.5
      const b = make(25, 20);     // 요청 예시 ② PT 25 / 개인 20 → 25
      return a.weightLabel === '22.5kg' && a.sourceKind === 'personal' && a.sourceLabel === '7월 29일 개인운동 최고 중량 기준' &&
        b.weightLabel === '25kg' && b.sourceKind === 'pt' && b.sourceLabel === '7월 20일 PT 수업 최고 중량 기준' &&
        // 두 기록의 값과 날짜를 함께 노출해 트레이너가 근거를 그대로 확인할 수 있다
        b.ptWeightLabel === '25kg' && b.personalWeightLabel === '20kg' && b.ptDateLabel === '7월 20일';
    })[1]
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
      const prep = app.indexOf('<SessionPrepCard prep={sessionPrep} />');
      const parts = app.indexOf('<label>오늘의 운동 부위');
      const exList = app.indexOf('<Card title="운동 목록"');
      return prep !== -1 && parts !== -1 && exList !== -1 && parts < prep && prep < exList;
    })()
  ],
  ['수업 준비 UI: 카드는 조회 전용 — 값 변경·저장 콜백을 받지 않고 자동 입력 경로가 없음',
    (() => {
      const i = app.indexOf('function SessionPrepCard');
      const j = app.indexOf('function SessionScreen({ member, sessions, editData');
      const body = app.slice(i, j);
      return i !== -1 && j > i &&
        // prep 하나만 받는다(onChange/onSave/setExercises 계열 prop 없음)
        /function SessionPrepCard\(\{ prep \}\)/.test(body) &&
        !/setExercises|setSelectedTypes|onSave|onChange|onApply|addDoc|updateDoc|setDoc/.test(body) &&
        // "자동 적용되지 않습니다" 안내를 항상 함께 노출한다
        body.includes('자동 적용되지 않습니다');
    })()
  ],
  ['수업 준비 UI: Firestore 추가 조회 없이 이미 로드된 personalWorkouts prop만 사용(N+1 금지)',
    app.includes('personalWorkouts={memberPersonalWorkouts} />}') &&
    app.includes('buildSessionPrepSummary({ sessions, personalWorkouts, todayKey: getKoreaDateString() })') &&
    (() => {
      const i = app.indexOf('function SessionPrepCard');
      const j = app.indexOf('const [sessionType, setSessionType]');
      // SessionPrepCard 정의 ~ SessionScreen 초반(카드 데이터 계산 구간)에 Firestore 조회 호출이 없다
      return !/getPersonalWorkouts\(|getSessions\(|getDocs\(/.test(app.slice(i, j));
    })()
  ],
  ['수업 준비: PT 저장 구조·저장 로직에 영향 없음(기존 handleSaveSession 경로 그대로)',
    app.includes('async function handleSaveSession') && app.includes('await addSession(member.id') && app.includes('await updateSession(member.id') &&
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
