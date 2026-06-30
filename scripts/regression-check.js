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
  ['Firestore Rules members 본인 list 허용', firestoreRules.includes('allow get, list: if canReadMemberData(resource.data)') && firestoreRules.includes('return isTrainerData(data) || isMemberUidData(data)')],
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
  ['관리자 URL 회원 자동 리디렉션',
    app.includes('getMemberAppProfile().then(profile') &&
    app.includes('app=member') &&
    app.includes('isOwner !== true')
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
    firestoreRules.includes('isMemberSelf(memberId) && resource.data.isPublished == true') &&
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
  ['manifest.json start_url 경로 정확성 (/?app=member)',
    (() => {
      try {
        const m = require('fs').readFileSync(require('path').join(require('path').resolve(__dirname,'..'), 'public', 'manifest.json'), 'utf8');
        return m.includes('"start_url": "/?app=member"') && !m.includes('/member?app=member');
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
      const pairIdx  = app.indexOf('2:1 전용 메뉴');
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
  ['NEW 배지: hasNewMemberInput + ADMIN_INPUT_READ_KEY',
    app.includes('ADMIN_INPUT_READ_KEY') &&
    app.includes('function hasNewMemberInput(m)') &&
    app.includes('markAdminInputRead')
  ],
  ['NEW 배지: 회원 카드에 🔴 NEW 입력 배지 표시',
    app.includes('isNewInput = hasNewMemberInput(m)') &&
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
    firestoreRules.includes('allow create: if isMemberSelf(memberId)') &&
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
    firestoreRules.includes('allow create: if isMemberSelf(memberId)') &&
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
