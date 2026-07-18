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
  const factory = new Function(`${sliceNum}\n${sliceFunc}\n${sliceEquip}\n${sliceLib}\n${sliceA}\n${sliceB}\n${sliceC}\nreturn { getRecommendedPart, getLatestSessionType, getRecentPartSequence, partComboLabel, MALE_SPLIT, FEMALE_SPLIT_2WAY, FEMALE_SPLIT_3WAY, FEMALE_SPLIT_COMBO_2WAY, PAIR_SPLIT_DEFAULT, normalizeExerciseName, recommendExerciseDose, buildReviewRoutine, getPartRecoveryHours, DOSE_REP_SCHEME, BARBELL_PLATE_WEIGHTS, BARBELL_WEIGHT_STEP, DEFAULT_BARBELL_BASE_WEIGHT, DUMBBELL_WEIGHTS, DUMBBELL_JUMP_PCT_THRESHOLD, nextWorkingWeight, nextDumbbellWeight, resolveEquipmentKind, estimateWeightIncrement, isBarbellWeightPlausible, hasStableRecentPerformance, resolveBarbellKind, detectBarbellKindFromText, BARBELL_BASE_WEIGHT_BY_KIND };`);
  workoutGuideLib = factory();
} catch (e) {
  console.error('[regression] 오늘의 운동 가이드 로직 추출 실패:', e.message);
}
const daysAgoStr = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysFromNowStr = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
function wgScenario(name, fn) {
  if (!workoutGuideLib) return [name, false];
  try { return [name, !!fn(workoutGuideLib)]; }
  catch (e) { console.error(`[regression] 시나리오 "${name}" 실행 오류:`, e.message); return [name, false]; }
}
const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

const checks = [
  ['수업일지 저장', app.includes('async function handleSaveSession') && app.includes('await addSession(member.id') && app.includes('await updateSession(member.id')],
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
  ['2:1 수업 목록 및 이어쓰기 (PairSessionListScreen)',
    app.includes('PairSessionListScreen') &&
    app.includes('onPair21') &&
    app.includes('이어쓰기')
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
    app.includes('<b>오늘 어땠나요?</b>') &&
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
  ['수업 후 상태: 저장 중 중복 클릭 방지 (savingSection)',
    app.includes('if(savingSection)return;') &&
    app.includes('setSavingSection(key)')
  ],
  ['수업 후 상태: "오늘 어땠나요?" 카드는 기본 접힘(헤더 한 줄만) + 펼치기/접기 토글로 언제든 입력·수정 가능, 접힘 상태 미리보기(sj-fb-quick) 없음',
    app.includes('const [open,setOpen]=useState(false);') &&
    app.includes('펼치기 <SjIcon paths={SJ_PATHS.chevronDown}') &&
    app.includes('접기 <SjIcon paths={SJ_PATHS.chevronUp}') &&
    !app.includes('sj-fb-quick')
  ],
  ['수업 후 상태: 위험 신호(움직일 때 불편함/날카로운 통증) 선택 시 대표에게 알리라는 안내 표시',
    app.includes('const SORENESS_RISK_NATURES=') &&
    app.includes('다음 수업 전 대표님께 꼭 알려주세요.')
  ],
  ['수업일지 카드 순서: 운동종목(SessionMini)이 피드백 카드(MemberFeedbackForm)보다 먼저 표시',
    (() => {
      const i = app.indexOf('<SessionMini s={s} exFilter={lq||null} openKeys={openKeys} toggleOpen={toggleOpen}/>');
      const j = app.indexOf('<MemberFeedbackForm s={s} onSave={saveFeedback}/>');
      return i !== -1 && j !== -1 && i < j;
    })()
  ],
  ['수업일지: 최근 수업 대표 카드 + 이전 수업 프리뷰 카드(날짜·부위·대표 운동·RPE 여부) + 전체 수업 기록 보기',
    app.includes('className="sj-badge latest">최근 수업') &&
    app.includes('function formatKoreanDateLabel(') &&
    app.includes('이전 수업') &&
    app.includes('전체 수업 기록 보기')
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
    app.includes('cardioSaving,correctionSummaries};')
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
  ['오늘의 운동 가이드: 성별 기본 분할 상수(남자 5분할/여자 2~3분할) + 2:1 공통 기본값 정의',
    app.includes('const MALE_SPLIT         = ["하체","어깨","등","가슴","팔"];') &&
    app.includes('const FEMALE_SPLIT_2WAY  = ["하체","가슴 · 등 · 어깨 · 팔"];') &&
    app.includes('const FEMALE_SPLIT_3WAY  = ["하체","가슴 · 어깨 · 삼두","등 · 이두"];') &&
    app.includes('const FEMALE_SPLIT_COMBO_2WAY = ["하체 · 가슴 · 삼두","등 · 어깨 · 이두"];') &&
    app.includes('const PAIR_SPLIT_DEFAULT = FEMALE_SPLIT_3WAY;')
  ],
  ['오늘의 운동 가이드: MALE_SPLIT 순환 순서 자체가 상극 조합(하체↔등, 가슴↔어깨)을 순환 인접 위치에 배치하지 않음(가슴→팔→하체→어깨→등→(순환)가슴 — 5개 인접쌍 어디에도 금지 조합 없음)',
    (() => {
      const CONFLICT = { "하체":"등", "등":"하체", "가슴":"어깨", "어깨":"가슴" };
      const order = ["하체","어깨","등","가슴","팔"];
      return order.every((p, i) => CONFLICT[p] !== order[(i + 1) % order.length]);
    })()
  ],
  ['오늘의 운동 가이드: 여성 기본 분할 선택(pickFemaleBaseCycle)이 실제 기록에서 방식 B(조합형) 사용 흔적을 최우선 확인하고, 없으면 빈도로 방식 A/3분할을 가름',
    app.includes('function pickFemaleBaseCycle(sequence,freq){') &&
    app.includes('if(sequence.some(s=>FEMALE_SPLIT_COMBO_2WAY.includes(s)))return FEMALE_SPLIT_COMBO_2WAY;') &&
    app.includes('return freq>=3?FEMALE_SPLIT_3WAY:FEMALE_SPLIT_2WAY;')
  ],
  ['오늘의 운동 가이드: 원본 selectedTypes 기반 콤보 라벨(partComboLabel)로 이두/삼두를 뭉개지 않고 미는/당기는 조합을 그대로 인식',
    app.includes('const PART_COMBO_ORDER = ["하체","가슴","등","어깨","이두","삼두","팔"];') &&
    app.includes('function partComboLabel(rawTypes){')
  ],
  ['오늘의 운동 가이드: 2:1 여부 판별(getLatestSessionType)이 회원 본인 sessions의 최근 sessionType만으로 이뤄짐(별도 조회 없음) — 최근 수업이 1:1로 바뀌면 자동 복귀',
    app.includes('function getLatestSessionType(sessions=[]){') &&
    app.includes('return sorted[0]?.sessionType==="2:1" ? "2:1" : "1:1";')
  ],
  ['오늘의 운동 가이드: getRecommendedPart 1순위가 성별보다 2:1 여부(isPaired)를 먼저 반영해 기본 사이클을 선택',
    app.includes('const isPaired=getLatestSessionType(sessions)==="2:1";') &&
    app.includes('const baseCycle=isPaired?PAIR_SPLIT_DEFAULT:gender==="여성"?pickFemaleBaseCycle(sequence,freq):MALE_SPLIT;')
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
    app.includes('const rawVals=[e.muscleTop,e.type]; const parts=Array.isArray(part)?part:[part]; return vals.some(v=>parts.includes(v))||rawVals.some(v=>parts.includes(v))||parts.some(p=>String(e.name||"").includes(p));')
  ],
  wgScenario('오늘의 운동 가이드 시나리오1: 남성 5분할에서 가슴 다음 어깨가 추천되지 않음', lib => {
    const r = lib.getRecommendedPart({}, [{ date: daysAgoStr(1), selectedTypes: ['가슴'], exercises: [] }], { gender: '남성' });
    return r.part !== '어깨';
  }),
  wgScenario('오늘의 운동 가이드 시나리오2: 남성 5분할에서 하체 다음 등이 추천되지 않음', lib => {
    const r = lib.getRecommendedPart({}, [{ date: daysAgoStr(1), selectedTypes: ['하체'], exercises: [] }], { gender: '남성' });
    return r.part !== '등';
  }),
  wgScenario('오늘의 운동 가이드 시나리오3: 여성 기록 부족 회원에게 상체·하체 2분할이 적용될 수 있음', lib => {
    const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 2회' }, [], { gender: '여성' });
    return arrEq(r.cycle, lib.FEMALE_SPLIT_2WAY);
  }),
  wgScenario('오늘의 운동 가이드 시나리오4: 하체·가슴·삼두 / 등·어깨·이두 패턴이 반복되면 해당 2분할을 유지',
    lib => {
      const sessions = [
        { date: daysAgoStr(8), selectedTypes: ['하체', '가슴', '삼두'], exercises: [] },
        { date: daysAgoStr(6), selectedTypes: ['등', '어깨', '이두'], exercises: [] },
        { date: daysAgoStr(4), selectedTypes: ['하체', '가슴', '삼두'], exercises: [] },
        { date: daysAgoStr(2), selectedTypes: ['등', '어깨', '이두'], exercises: [] },
      ];
      const r = lib.getRecommendedPart({}, sessions, { gender: '여성' });
      return arrEq(r.cycle, lib.FEMALE_SPLIT_COMBO_2WAY) && r.part === '하체 · 가슴 · 삼두';
    }
  ),
  wgScenario('오늘의 운동 가이드 시나리오5: 3분할 회원에게 하체·미는 운동·당기는 운동이 순환(당기는 다음 미는 추천, 하체·반복 회피)',
    lib => {
      const sessions = [
        { date: daysAgoStr(6), selectedTypes: ['하체'], exercises: [] },
        { date: daysAgoStr(4), selectedTypes: ['가슴', '어깨', '삼두'], exercises: [] },
        { date: daysAgoStr(2), selectedTypes: ['등', '이두'], exercises: [] },
      ];
      const r = lib.getRecommendedPart({ weeklyWorkoutCount: '주 4회' }, sessions, { gender: '여성' });
      return arrEq(r.cycle, lib.FEMALE_SPLIT_3WAY) && r.part === '가슴 · 어깨 · 삼두';
    }
  ),
  wgScenario('오늘의 운동 가이드 시나리오6: 2:1 진행 중(성별보다 우선) + 다음 수업 부위(하체)와 겹치면 3분할 순서를 조정',
    lib => {
      const profile = { weeklyWorkoutCount: '주 1회', nextWorkoutPart: '하체', nextWorkoutDate: daysFromNowStr(1) };
      const sessions = [{ date: daysAgoStr(40), sessionType: '2:1', selectedTypes: ['삼두'], exercises: [] }];
      const r = lib.getRecommendedPart(profile, sessions, { gender: '남성' });
      return r.isPaired === true && arrEq(r.cycle, lib.PAIR_SPLIT_DEFAULT) && r.part === '가슴 · 어깨 · 삼두';
    }
  ),

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

  ['오늘의 운동 가이드: 코어는 별도 buildReviewRoutine 호출로 "보조 운동" 한 줄로만 표시(단독 추천 아님)',
    app.includes('const coreRec=buildReviewRoutine(sessions,onboarding,checkins,"코어");') &&
    app.includes('🧩 보조 운동')
  ],
  ['오늘의 운동 가이드: 팔 추천 시 전체 상위 4개가 아니라 이두 2개 + 삼두 2개로 균형있게 구성',
    app.includes('const armBalanced=wantsArm?[...sorted.filter(isBicep).slice(0,2),...sorted.filter(isTricep).slice(0,2)]:[];') &&
    app.includes('const routineList=armBalanced.length?armBalanced:sorted.slice(0,4);')
  ],

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
