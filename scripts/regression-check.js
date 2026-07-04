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
  ['운동 자동 분류: 덤벨 벤치프레스 → 가슴/가운데 가슴',
    app.includes('"덤벨 벤치프레스"') && app.includes('sub:"가운데 가슴"')
  ],
  ['운동 자동 분류: 업라이트 로우 → 어깨/전면·측면',
    app.includes('"업라이트 로우"') && (app.includes('sub:"전면·측면"') || app.includes("sub:'전면·측면'"))
  ],
  ['운동 자동 분류: 사이드 래터럴 레이즈 추가',
    app.includes('"사이드 래터럴 레이즈"')
  ],
  ['근육 부위 자동 학습: MUSCLE_LEARN_KEY + threshold 3',
    app.includes('MUSCLE_LEARN_KEY') &&
    app.includes('recordMuscleLearn') &&
    app.includes('getLearnedMuscle') &&
    app.includes('c >= 3')
  ],
  ['근육 부위 자동 학습: suggestMuscle이 학습값 우선 사용',
    app.includes('const learned = getLearnedMuscle(name)') &&
    app.includes('if (learned) return learned;')
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
  // ── 회원 목록 "오늘 활동" 필터 ──
  ['오늘 활동 필터: 전체/메모/체중/칼로리/유산소/근육통/RPE/입력없음 8종 정의',
    ["all","memo","weight","kcal","cardio","soreness","rpe","none"].every(k => app.includes(`key: "${k}"`))
  ],
  ['오늘 활동 필터: 한국시간(getKoreaDateString) 기준으로 오늘 판정',
    app.includes('const todayKST = getKoreaDateString();') &&
    app.includes('liveMember.todayInputTypes?.date === todayKST')
  ],
  ['오늘 활동 필터: passActivityFilter가 filtered 목록 계산에 반영됨',
    app.includes('function passActivityFilter(m)') &&
    (app.match(/&& passActivityFilter\(m\)/g) || []).length >= 2
  ],
  ['오늘 활동 필터: "오늘 입력 없음"은 오늘 입력 타입이 하나도 없는 회원만 표시',
    app.includes('if (activityFilter === "none") return types.length === 0;')
  ],
  ['NEW 배지: hasNewMemberInput + ADMIN_INPUT_READ_KEY',
    app.includes('ADMIN_INPUT_READ_KEY') &&
    app.includes('function hasNewMemberInput(m)') &&
    app.includes('markAdminInputRead')
  ],
  ['NEW 배지: 회원 카드에 🔴 NEW 입력 배지 표시',
    app.includes('isNewInput = hasNewMemberInput(liveMember)') &&
    app.includes('🔴 NEW 입력')
  ],
  ['NEW 배지: 카드 클릭 시 읽음 처리',
    app.includes('markAdminInputRead(m.id);onSelect(m)')
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
  ['운동 체크: 긍정 피드백 문구 존재',
    app.includes('꾸준히 기록이 쌓이고 있어요') &&
    app.includes('좋은 습관이 만들어지고 있어요')
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
  ['회원앱 건강 탭: 유산소 기록/유산소 분석 메뉴(Zone2는 별도 탭 대신 분석 안 보조 지표로 통합, 줄바꿈 방지)',
    app.includes('function CardioSection(p)') &&
    app.includes('["record","유산소 기록"]') &&
    app.includes('["analysis","유산소 분석"]') &&
    !app.includes('["zone2","Zone2 심박수"]') &&
    app.includes('function MemberHealth(p)') &&
    app.includes('<CardioSection {...p}/>') &&
    app.includes('const zone2Section=<CardioZone2Tab {...p}/>;')
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
  ['2:1 운동 종목 자동 매칭: 1:1과 동일한 매핑 함수(suggestMuscle/suggestEquipment)를 공용 스코프로 재사용',
    app.includes('function suggestMuscle(name) {') &&
    app.includes('function suggestEquipment(name) {') &&
    (app.match(/function suggestMuscle\(name\) \{/g) || []).length === 1 &&
    (app.match(/function suggestEquipment\(name\) \{/g) || []).length === 1
  ],
  ['2:1 자동 매칭: 이름 입력 시 부위/기구 자동 채움 + 수동 수정값은 이후 덮어쓰지 않음(_muscleManual/_equipManual)',
    app.includes('if (!e._muscleManual) {') &&
    app.includes('const sug = suggestMuscle(val);') &&
    app.includes('if (sug?.top) u.muscleTop = sug.top;') &&
    app.includes('if (!e._equipManual) {') &&
    app.includes('const sugEq = suggestEquipment(val);') &&
    app.includes('} else if (field==="muscleTop") {') &&
    app.includes('} else if (field==="equipment") {')
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

  // ── 회원앱 홈 "오늘 운동 완료" 버튼 리디자인 ──
  ['홈 오늘 운동 완료 버튼: nowrap + 아이콘 정렬 + 44~48px 높이의 pill 버튼(.attendance-check-btn)',
    app.includes('className="attendance-check-btn"') &&
    app.includes('className="attendance-check-icon"') &&
    app.includes('.attendance-check-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;flex-shrink:0;white-space:nowrap;height:46px;padding:0 20px;border-radius:999px;') &&
    app.includes('.attendance-check-btn:active{transform:scale(.95)')
  ],

  // ── 수업 후 상태 메모 placeholder 제거 ──
  ['수업 후 상태 메모: placeholder 제거(빈 입력창으로 표시)',
    !app.includes('대표님께 전달할 내용을 입력해주세요.') &&
    app.includes('<textarea value={memo} onChange={e=>setMemo(e.target.value)}/>')
  ],

  // ── 근육통/RPE/메모 독립 저장 (3개 섹션 + 저장 버튼 각각 분리) ──
  ['수업 후 상태: 근육통/RPE/메모가 독립된 3개 섹션으로 분리되어 각각 저장',
    app.includes('saveSection("soreness",{sorenessLevel:soreness.level,sorenessBodyParts:soreness.parts})') &&
    app.includes('saveSection("rpe",{rpe})') &&
    app.includes('saveSection("memo",{memo})')
  ],
  ['수업 후 상태: 저장 중 중복 클릭 방지 (savingSection)',
    app.includes('if(savingSection)return;') &&
    app.includes('disabled={!!savingSection}')
  ],
  ['Firestore 저장: saveSessionMemberFeedback이 건드린 필드만 setDoc(merge:true)로 반영, 나머지는 기존값 유지',
    db.includes('if (feedback.sorenessLevel !== undefined || feedback.sorenessBodyParts !== undefined || feedback.sorenessBodyPart !== undefined) {') &&
    db.includes('if (feedback.rpe !== undefined) payload.rpe = Number(feedback.rpe);') &&
    db.includes('if (feedback.memo !== undefined) payload.memo = feedback.memo || "";') &&
    db.includes('await setDoc(ref, clean(payload), { merge: true });')
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

  // ── 회원앱 건강 탭: 최근 건강 기록 하단 이동 + 기본 닫힘 ──
  ['건강 탭 순서: 유산소 섹션(CardioSection)이 최근 건강 기록보다 먼저 렌더링됨',
    (() => {
      const memberHealthFn = app.slice(app.indexOf('function MemberHealth(p){'), app.indexOf('function MemberHealth(p){') + 6000);
      const iCardio = memberHealthFn.indexOf('<CardioSection {...p}/>');
      const iRecent = memberHealthFn.indexOf('<RecentHealthRecords');
      return iCardio !== -1 && iRecent !== -1 && iCardio < iRecent;
    })()
  ],
  ['최근 건강 기록: CollapsibleSection으로 감싸 기본 닫힘(defaultOpen 미지정 시 false) + 펼치기 토글 재사용',
    app.includes('function RecentHealthRecords({checkins,body,nutrition,onDelete}){const rows=buildRecentHealthRecords({checkins,body,nutrition}); return <CollapsibleSection label="최근 건강 기록" defaultOpen={false}><section className="mcard">') &&
    app.includes('function CollapsibleSection({ label, defaultOpen = false, children })')
  ],
  ['최근 건강 기록: 삭제 기능(onDelete)과 데이터 조회(buildRecentHealthRecords)는 그대로 유지',
    app.includes('onClick={()=>onDelete?.(r.date)}') &&
    app.includes('function buildRecentHealthRecords({checkins=[],body,nutrition})')
  ],

  // ── 건강 탭 프리미엄 리디자인(동기부여 대시보드) ──
  ['건강 탭: 오늘 건강 기록 + 유산소 운동이 하나의 health-hub 카드로 통합됨',
    (() => {
      const iHub = app.indexOf('<div className="health-hub">');
      const iDivider = app.indexOf('<div className="health-hub-divider"/>');
      const iCardio = app.indexOf('<CardioSection {...p}/>');
      return iHub !== -1 && iDivider !== -1 && iCardio !== -1 && iHub < iDivider && iDivider < iCardio;
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
    app.includes('이번 주 목표까지 ${remain}회 남았습니다') &&
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
    app.includes('await p.saveCardioEntry(d);')
  ],

  // ── 변화분석 탭: 회원 목표(다이어트/벌크업/체형교정)에 따른 자동 재구성 ──
  ['변화분석: 목표(다이어트/벌크업/체형교정/일반) 4종 페르소나 판별 함수 존재',
    app.includes('function getAnalysisPersona(goal=""){') &&
    app.includes('if(g.includes("체형교정")||g.includes("교정")) return "correction";') &&
    app.includes('if(g.includes("벌크업")||g.includes("증량")||g.includes("근육 키우기")) return "bulk";') &&
    app.includes('if(g.includes("다이어트")||g.includes("감량")) return "diet";')
  ],
  ['변화분석: 다이어트 회원 - 체중 그래프 + 체중·칼로리 결합 그래프 + 변화 해석이 최상단',
    app.includes('{persona === "diet" && (') &&
    app.includes('<MCard title="체중과 섭취 칼로리">') &&
    app.includes('function buildDietInterpretation({weights=[],kcalRows=[],wDiff}){')
  ],
  ['변화분석: 벌크업 회원 - 부위별 운동량 그래프가 최상단, 그다음 대표 운동(빈도 기준 자동 선정) 수행능력 변화, 그다음 변화 요약',
    (() => {
      const i = app.indexOf('{persona === "bulk" && (');
      if (i === -1) return false;
      const partVolumeIdx = app.indexOf('<PartVolumeCard sessions={periodSessions} />', i);
      const strengthIdx = app.indexOf('운동 수행능력 변화', i);
      const summaryIdx = app.indexOf('변화 요약', i);
      const weightIdx = app.indexOf('{weightChart}', i);
      return partVolumeIdx !== -1 && strengthIdx !== -1 && summaryIdx !== -1 && weightIdx !== -1 &&
        partVolumeIdx < strengthIdx && strengthIdx < summaryIdx && summaryIdx < weightIdx;
    })() &&
    app.includes('function buildTopExercisesByFrequency(sessions=[],limit=5){') &&
    app.includes('function buildRepEnduranceChanges(sessions=[],exerciseNames=[]){') &&
    app.includes('function buildBulkGrowthSummary({partVolumeData=[],topExercises=[],repEndurance=[],periodLabel="최근"}){')
  ],
  ['변화분석: 부위별 운동량 - 누적이 아닌 최근 세션별 볼륨을 부위 탭 선택 방식으로 최근 5회까지 표시',
    app.includes('.filter(r=>r.value>0).slice(-5);') &&
    app.includes('<div className="part-volume-tabs">') &&
    app.includes('최근 {current.part} 운동 {current.values.length}회')
  ],
  ['변화분석: 벌크업 회원 - 체중·골격근량·체지방은 운동 수행능력보다 뒤(보조 지표)에 배치',
    (() => {
      const i = app.indexOf('{persona === "bulk" && (');
      const weightIdx = app.indexOf('{weightChart}', i);
      const mmIdx = app.indexOf('title="골격근량 변화"', i);
      const fatIdx = app.indexOf('title="체지방 변화"', i);
      return weightIdx !== -1 && mmIdx !== -1 && fatIdx !== -1 && weightIdx < mmIdx && mmIdx < fatIdx;
    })()
  ],
  ['변화분석: 체형교정 회원 - 통증(VAS)이 최상단, 교정 결과는 correctionSummaries 실데이터로 표시(없으면 정직한 안내)',
    app.includes('{persona === "correction" && (() => {') &&
    app.includes('const latestSummary = [...(p.correctionSummaries||[])].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))[0];') &&
    app.includes('아직 등록된 교정 평가 결과가 없습니다. 다음 방문 시 대표님께 평가를 요청해보세요.')
  ],
  ['변화분석: 공통 섹션(목표까지 남은 변화/운동 지속 현황)은 모든 페르소나에 동일하게 표시',
    app.includes('<WeightGoalStrategyCard {...p} />') &&
    app.includes('function WorkoutConsistencyCard({sessions=[],totalReg,remaining,attendance=[]}){') &&
    app.includes('<WorkoutConsistencyCard sessions={p.sessions} totalReg={p.totalReg} remaining={p.remaining} attendance={p.attendance} />')
  ],
  ['변화분석: 위상각/신체나이 등 전문 데이터는 "건강 전문 분석"로 통합, 기본 접힘',
    app.includes('<CollapsibleSection label="건강 전문 분석" defaultOpen={false}>') &&
    !app.includes('<CollapsibleSection label="신체나이 변화" defaultOpen={false}>')
  ],
  ['변화분석: 목표별 우선 표시 항목은 "추가 데이터"에서 중복 노출하지 않음(primaryUses로 제외)',
    app.includes('const primaryUses = {') &&
    app.includes('<CollapsibleSection label="추가 데이터" defaultOpen={false}>')
  ],

  // ── 체형평가 리뉴얼 Phase 1: 빠른 평가 / 유형별 평가 / 교차 평가 ──
  ['체형평가: 빠른 평가 체크리스트 8개 항목 정의(통증/가동범위 제한/근력 저하/자세 문제/보행 문제/저림/운동 시 통증/일상생활 통증)',
    app.includes('const QUICK_CHECK_ITEMS = [') &&
    ['pain','romLimit','weakness','posture','gait','tingling','painDuringExercise','painDailyLife'].every(k=>app.includes(`key:"${k}"`))
  ],
  ['체형평가: 유형별 평가 카테고리 9개(목/어깨/팔꿈치/손목/허리/골반/무릎/발목/발바닥), 카테고리당 필수 테스트 5개',
    app.includes('const ASSESS_CATEGORIES = ["목","어깨","팔꿈치","손목","허리","골반","무릎","발목","발바닥"];') &&
    (() => {
      const start = app.indexOf('const CATEGORY_TESTS = {');
      const end = app.indexOf('const TEST_RESULT_OPTS');
      const block = app.slice(start, end);
      const cats = ["목","어깨","팔꿈치","손목","허리","골반","무릎","발목","발바닥"];
      return cats.every((cat,i) => {
        const catIdx = block.indexOf(`"${cat}": [`);
        if (catIdx === -1) return false;
        const nextCat = cats[i+1];
        const nextCatIdx = nextCat ? block.indexOf(`"${nextCat}": [`, catIdx) : -1;
        const section = block.slice(catIdx, nextCatIdx === -1 ? undefined : nextCatIdx);
        return (section.match(/key:/g)||[]).length === 5 && (section.match(/desc:/g)||[]).length === 5;
      });
    })()
  ],
  ['체형평가: 테스트마다 정상/제한/통증 버튼 + 통증 시 좌우 VAS 입력',
    app.includes('const TEST_RESULT_OPTS = ["정상","제한","통증"];') &&
    app.includes('row.result==="통증" && (') &&
    app.includes('{["좌","우"].map(side=>(')
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
  ['체형평가: 재평가는 유형별 평가에서 제한/통증이었던 테스트만 대상으로 하고, before/after를 좋아짐/유지/악화로 자동 비교',
    app.includes('function buildRetestTargets(categoryResults={}) {') &&
    app.includes('if (t.result && t.result!=="정상") targets.push(') &&
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
  ['체형평가 저장: 유형별 평가/재평가 데이터가 있을 때만 회원용 교정 결과 요약을 별도 컬렉션에 추가 저장(전문용어 없는 문장만)',
    app.includes('function buildMemberCorrectionFeedback(rec){') &&
    app.includes('if (hasCategoryResults || rec.retest) {') &&
    app.includes('await saveCorrectionSummary(member.id, { id: savedRec.id, date: assDate, ...feedback, visibleToMember: true });')
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
  ['오늘의 운동 가이드: 성별 기본 분할 상수(남자 5분할/여자 3분할) 정의',
    app.includes('const MALE_SPLIT = ["하체","등","가슴","어깨","팔"];') &&
    app.includes('const FEMALE_SPLIT = ["하체","등","가슴 · 어깨"];')
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
  ['오늘의 운동 가이드: exerciseMatchesPart가 배열(콤보 부위)도 하위호환으로 지원',
    app.includes('const parts=Array.isArray(part)?part:[part]; return vals.some(v=>parts.includes(v))||parts.some(p=>String(e.name||"").includes(p));')
  ],
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
