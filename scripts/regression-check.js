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
  ['2:1 수업 수정 시 pairSessionId 기반 동기화',
    app.includes('["sent","recorded"].includes(editSess.pairStatus)') &&
    app.includes('editSess.pairSessionId') &&
    app.includes('editSess.memberBId')
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
  ['A→B 동기화 (recorded/sent 상태 모두 지원)',
    app.includes('["sent","recorded"].includes(editSess.pairStatus)') &&
    app.includes('memberBExercises') &&
    app.includes('memberBComment')
  ],
  ['B→A 역방향 동기화 (pairMemberId 기반)',
    app.includes('editSess.pairMemberId') &&
    app.includes('memberBExercises: d.exercises') &&
    app.includes('memberBComment: d.trainerComment')
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
  ['pairStatus draft인 2:1 수업 이어쓰기 표시',
    app.includes('resumeDraft2_1') &&
    app.includes('draftPair2_1') &&
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
