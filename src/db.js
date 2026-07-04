// ═══════════════════════════════════════════════════
//  데이터 레이어 — Firebase Firestore
//
//  컬렉션 구조:
//    /members/{id}                        ← 회원 (trainerUid 포함)
//    /members/{id}/sessions/{id}          ← 수업 일지
//    /members/{id}/bodyCheck/main         ← 바디체크
//    /members/{id}/nutrition/meta         ← 영양 메타 (목표, 즐겨찾기)
//    /members/{id}/nutrition/{YYYY-MM-DD} ← 날짜별 식단
//
//  보안:
//    - 모든 읽기/쓰기는 auth.currentUser.uid 검증
//    - 회원 생성 시 trainerUid 자동 포함
//    - Firestore Rules 와 이중 검증
// ═══════════════════════════════════════════════════
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, getDoc, setDoc, writeBatch, limit, deleteField,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase-config";

// ── 현재 트레이너 uid (없으면 throw) ─────────────────
function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return uid;
}

// ── undefined 제거 + Firestore 특수 객체 보존 ──────
function normalizeMemberData(data) {
  const normalized = { ...data };
  if (typeof normalized.email === "string") {
    normalized.email = normalized.email.trim().toLowerCase();
  }
  return normalized;
}

function clean(obj) {
  if (obj === undefined) return undefined;
  if (obj === null)      return undefined;

  if (typeof obj === "object" && (
    typeof obj.toDate    === "function" ||
    typeof obj.isEqual   === "function" ||
    typeof obj.toMillis  === "function"
  )) return obj;

  if (Array.isArray(obj)) {
    return obj.map(clean).filter(v => v !== undefined);
  }

  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }

  return obj;
}

// ── 디버그 로그 (개발 환경 전용) ─────────────────────
function dbLog(fn, ...args) {
  if (process.env.NODE_ENV === "production") return;
  const uid = auth.currentUser?.uid || "none";
  console.log(`[DB:${fn}] uid=${uid}`, ...args);
}

function dbWarn(fn, ...args) {
  if (process.env.NODE_ENV === "production") return;
  const uid = auth.currentUser?.uid || "none";
  console.warn(`[DB:${fn}] uid=${uid}`, ...args);
}

// ── 회원앱 접근 허용 상태값 ───────────────────────────
const MEMBER_ACTIVE_STATUSES = new Set([
  "active", "pt", "pt_active", "in_progress",
  "진행중", "진행", "pt진행", "pt 진행중",
]);

function describeFirestoreError(e) {
  return {
    code: e?.code || "unknown",
    message: e?.message || String(e),
    name: e?.name || "Error",
  };
}

function logMemberRulesEvaluation(fn, memberId, memberData) {
  if (process.env.NODE_ENV === "production") return {};
  const user = auth.currentUser;
  const uid = user?.uid || null;
  const authEmail = (user?.email || "").trim().toLowerCase();
  const memberEmail = (memberData?.email || "").trim().toLowerCase();
  const result = {
    path: `members/${memberId}`,
    authUid: uid,
    authEmail,
    memberUid: memberData?.memberUid || null,
    memberEmail,
    memberUidMatch: !!uid && memberData?.memberUid === uid,
    emailMatchesForDisplayOnly: !!authEmail && !!memberEmail && authEmail === memberEmail,
  };
  result.canAccessMember = result.memberUidMatch;
  result.publishedSessionsRule = "memberUidMatch AND sessions.isPublished == true";
  dbLog(fn, "Firestore Rules 평가(클라이언트 추정):", result);
  return result;
}


// ════════════════════════════════════════════════════
// 공지사항 (notices)
// ════════════════════════════════════════════════════
function sortNotices(rows){
  return [...rows].sort((a,b)=>{
    const at=v=>v?.toDate?.()?.getTime?.()||Date.parse(v)||0;
    return at(b.createdAt)-at(a.createdAt);
  });
}

export async function getNotices(){
  const uid=requireUid();
  const q=query(collection(db,"notices"),where("trainerUid","==",uid));
  const snap=await getDocs(q);
  return sortNotices(snap.docs.map(d=>({id:d.id,...d.data()})));
}

export async function saveNotice(data,id=null){
  const uid=requireUid();
  const targetType=data.targetType==="member"?"member":"all";
  const rawIds=targetType==="member"?(Array.isArray(data.targetMemberIds)&&data.targetMemberIds.length?data.targetMemberIds:data.targetMemberId?[String(data.targetMemberId).trim()]:[]):[];
  const targetMemberIds=rawIds.map(x=>String(x).trim()).filter(Boolean);
  const rawNames=targetType==="member"?(Array.isArray(data.targetMemberNames)?data.targetMemberNames.map(x=>String(x).trim()).filter(Boolean):[]):[];
  const targetMemberNames=rawNames;
  const targetMemberId=targetType==="member"?String(targetMemberIds[0]||"").trim():"";
  const targetMemberName=targetType==="member"?String(targetMemberNames[0]||data.targetMemberName||"").trim():"";
  const payload=clean({
    title:String(data.title||"").trim(),
    content:String(data.content||"").trim(),
    targetType,
    targetMemberId,
    targetMemberName,
    targetMemberIds,
    targetMemberNames,
    isImportant:!!data.isImportant,
    isPublished:data.isPublished!==false,
    createdBy:uid,
    trainerUid:uid,
    updatedAt:serverTimestamp(),
  });
  if(!payload.title) throw new Error("공지 제목을 입력해주세요.");
  if(!payload.content) throw new Error("공지 내용을 입력해주세요.");
  if(payload.targetType==="member"&&!payload.targetMemberId) throw new Error("특정 회원 공지는 회원을 1명 이상 선택해야 합니다.");
  if(id){
    const ref=doc(db,"notices",id);
    const snap=await getDoc(ref);
    if(!snap.exists()) throw new Error("공지를 찾을 수 없습니다.");
    if(snap.data().trainerUid!==uid) throw new Error("권한이 없습니다.");
    await updateDoc(ref,payload);
    return {id,...snap.data(),...payload};
  }
  const ref=await addDoc(collection(db,"notices"),{...payload,createdAt:serverTimestamp()});
  return {id:ref.id,...payload};
}

export async function deleteNotice(id){
  const uid=requireUid();
  const ref=doc(db,"notices",id);
  const snap=await getDoc(ref);
  if(!snap.exists()) return;
  if(snap.data().trainerUid!==uid) throw new Error("권한이 없습니다.");
  await deleteDoc(ref);
}

export async function getMemberNotices(memberId){
  requireUid();
  const memberSnapForTrainer=await getDoc(doc(db,"members",memberId));
  const trainerUid=memberSnapForTrainer.exists()?memberSnapForTrainer.data().trainerUid:"";
  if(!trainerUid) { console.warn("[DB:getMemberNotices] trainerUid 없음 — 공지 조회 중단:", memberId); return []; }
  const base=collection(db,"notices");
  const allQ=trainerUid
    ? query(base,where("trainerUid","==",trainerUid),where("isPublished","==",true),where("targetType","==","all"),limit(50))
    : query(base,where("isPublished","==",true),where("targetType","==","all"),limit(50));
  const memberQ=trainerUid
    ? query(base,where("trainerUid","==",trainerUid),where("isPublished","==",true),where("targetType","==","member"),where("targetMemberId","==",memberId),limit(50))
    : query(base,where("isPublished","==",true),where("targetType","==","member"),where("targetMemberId","==",memberId),limit(50));
  const [allSnap,memberSnap]=await Promise.all([getDocs(allQ),getDocs(memberQ)]);
  const map=new Map();
  [...allSnap.docs,...memberSnap.docs].forEach(d=>map.set(d.id,{id:d.id,...d.data()}));
  // 다중 회원 공지 조회 (targetMemberIds array-contains)
  try {
    const multiQ=trainerUid
      ? query(base,where("trainerUid","==",trainerUid),where("isPublished","==",true),where("targetMemberIds","array-contains",memberId),limit(50))
      : query(base,where("isPublished","==",true),where("targetMemberIds","array-contains",memberId),limit(50));
    const multiSnap=await getDocs(multiQ);
    multiSnap.docs.forEach(d=>map.set(d.id,{id:d.id,...d.data()}));
  } catch(e) {
    console.warn("[DB:getMemberNotices] targetMemberIds query failed (index may not exist)", { memberId, code:e?.code, message:e?.message });
  }
  const rows=sortNotices([...map.values()]).slice(0,30);
  let readIds=new Set();
  try {
    const readsSnap=await getDocs(collection(db,"members",memberId,"noticeReads"));
    readIds=new Set(readsSnap.docs.map(d=>d.id));
  } catch(e) {
    console.warn("[DB:getMemberNotices] noticeReads read failed", { memberId, code:e?.code, message:e?.message });
  }
  return rows.map(n=>({...n,isRead:readIds.has(n.id)}));
}

export async function markNoticeRead(memberId,noticeId){
  requireUid();
  await setDoc(doc(db,"members",memberId,"noticeReads",noticeId),{noticeId,readAt:serverTimestamp()},{merge:true});
}

// ════════════════════════════════════════════════════
// 회원 (members)
// ════════════════════════════════════════════════════
export async function getMembers() {
  const uid = requireUid();
  dbLog("getMembers", `trainerUid=${uid}`);
  const q    = query(
    collection(db, "members"),
    where("trainerUid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  dbLog("getMembers", `결과: ${rows.length}명 (trainerUid 일치)`);
  return rows.map(m => ({
    ...m,
    isActive: m.isActive !== false,
    memberStatus: m.memberStatus || m.status || (m.isActive === false ? "inactive" : "active"),
    trainerUid: m.trainerUid || uid,
  }));
}

// 회원 카드 실시간 배지/최근활동용 — getMembers()와 동일한 범위를 실시간 구독.
// 기존 getMembers()/loadMembers 1회성 흐름은 그대로 두고, 이 구독은 별도 라이브 오버레이로만 사용한다.
export function subscribeToMembers(onChange) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  const q = query(collection(db, "members"), where("trainerUid", "==", uid));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, e => console.warn("[DB:subscribeToMembers]", e?.code || e?.message || e));
}

// ── 관리자 전용 private 서브컬렉션 (회원이 읽을 수 없음) ──────────────────
// Firestore catch-all 규칙: members/{id}/* → isTrainerOfMember 만 허용
// 따라서 members/{id}/private/admin 은 회원 Firebase SDK 직접 접근 차단됨

export async function getMemberPrivate(memberId) {
  const snap = await getDoc(doc(db, "members", memberId, "private", "admin"));
  if (!snap.exists()) return {};
  return snap.data();
}

async function saveMemberPrivateFields(memberId, privatePayload) {
  if (Object.keys(privatePayload).length === 0) return;
  const privateRef = doc(db, "members", memberId, "private", "admin");
  await setDoc(privateRef, { ...privatePayload, updatedAt: serverTimestamp() }, { merge: true });
}

export async function addMember(data) {
  const uid = requireUid();
  dbLog("addMember", data.name);
  // memo/ticketInfo → private 서브컬렉션으로 분리 (회원이 members 주문서에서 읽지 못하게)
  const { memo, ticketInfo, ...publicData } = data;
  const payload = {
    ...clean(normalizeMemberData(publicData)),
    trainerUid: uid,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "members"), payload);
  if (memo || ticketInfo) {
    await saveMemberPrivateFields(ref.id, clean({ memo, ticketInfo }));
  }
  dbLog("addMember", `생성 완료: ${ref.id} (회원앱은 members.memberUid 직접 조회)`);
  return { id: ref.id, ...data, trainerUid: uid };
}

export async function updateMember(id, data) {
  const uid = requireUid();
  dbLog("updateMember", id);
  const memberRef = doc(db, "members", id);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  const before = snap.data();
  if (before.trainerUid !== uid) throw new Error("권한이 없습니다.");

  // memo/ticketInfo → private 서브컬렉션으로 분리
  const { memo, ticketInfo, ...publicData } = data;
  const normalized = clean(normalizeMemberData(publicData));
  const hasPrivate = 'memo' in data || 'ticketInfo' in data;

  // Spark 회원앱 로그인은 email이 아니라 members.memberUid == auth.uid를 기준으로 한다.
  // 따라서 표시용 이메일이 바뀌어도 이미 연결된 memberUid를 자동 해제하지 않는다.
  const mainUpdate = { ...normalized, trainerUid: uid, updatedAt: serverTimestamp() };

  // 기존에 주문서에 남아있는 민감 필드 제거 (1회성 마이그레이션)
  if ('memo' in before) mainUpdate.memo = deleteField();
  if ('ticketInfo' in before) mainUpdate.ticketInfo = deleteField();

  await updateDoc(memberRef, mainUpdate);

  // private 서브컬렉션 저장
  if (hasPrivate) {
    const privatePayload = {};
    if ('memo' in data) privatePayload.memo = memo ?? "";
    if ('ticketInfo' in data) privatePayload.ticketInfo = ticketInfo ?? "";
    await saveMemberPrivateFields(id, privatePayload);
  }
  dbLog("updateMember", "완료");
}

export async function cleanupMemberAppEmailIdentity(memberId, canonicalEmail = "teogym12@gmail.com") {
  const uid = requireUid();
  const email = canonicalEmail.trim().toLowerCase();
  if (!email) throw new Error("기준 이메일이 필요합니다.");
  const memberRef = doc(db, "members", memberId);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  const data = snap.data();
  if (data.trainerUid !== uid) throw new Error("권한이 없습니다.");

  const patch = {
    email,
    memberAppAccountEmail: email,
    memberAppInviteEmail: email,
    previousEmail: deleteField(),
    memberUidUnlinkReason: deleteField(),
    memberUidUnlinkedAt: deleteField(),
    updatedAt: serverTimestamp(),
  };

  const lastInvite = data.memberAppLastInviteLog;
  if (lastInvite && typeof lastInvite === "object") {
    patch.memberAppLastInviteLog = { ...lastInvite, email };
  }

  await updateDoc(memberRef, patch);
  dbLog("cleanupMemberAppEmailIdentity", `members/${memberId} email=${email} memberUid=${data.memberUid || ""}`);
  return { id: memberId, ...patch, previousEmail: undefined, memberUidUnlinkReason: undefined, memberUidUnlinkedAt: undefined };
}

export async function prepareMemberAppEmailRelink(memberId, nextEmail) {
  const uid = requireUid();
  const email = (nextEmail || "").trim().toLowerCase();
  if (!email) throw new Error("새 회원앱 이메일이 필요합니다.");
  const memberRef = doc(db, "members", memberId);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  const data = snap.data();
  if (data.trainerUid !== uid) throw new Error("권한이 없습니다.");

  const previousMemberUid = data.memberUid || "";
  const patch = {
    email,
    memberAppAccountEmail: email,
    memberAppInviteEmail: email,
    previousEmail: data.email || "",
    memberUidPrevious: previousMemberUid,
    memberUid: deleteField(),
    memberUidUnlinkReason: "admin-member-email-relink",
    memberUidUnlinkedAt: serverTimestamp(),
    memberAppAccountStatus: "email-changed-reinvite-required",
    memberAppLastInviteLog: {
      ok: false,
      code: "EMAIL_CHANGED_REINVITE_REQUIRED",
      previousUid: previousMemberUid || null,
      email,
      at: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  };
  await updateDoc(memberRef, patch);
  dbLog("prepareMemberAppEmailRelink", `members/${memberId} email=${email} previousUid=${previousMemberUid}`);
  return { id: memberId, email, memberAppAccountEmail: email, memberAppInviteEmail: email, previousEmail: data.email || "", memberUid: "", memberUidPrevious: previousMemberUid, memberAppAccountStatus: "email-changed-reinvite-required", memberAppLastInviteLog: patch.memberAppLastInviteLog };
}

export function buildMemberIdentityDiagnostics(members = [], currentMember = null, authUid = auth.currentUser?.uid || null) {
  const normalize = value => (value || "").trim().toLowerCase();
  const summarize = m => ({ id: m.id, name: m.name || "", email: normalize(m.email), memberUid: m.memberUid || "" });
  const groupBy = (field, normalizer = value => (value || "").trim()) => {
    const map = new Map();
    for (const member of members) {
      const key = normalizer(member[field]);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(summarize(member));
    }
    return [...map.entries()].filter(([, list]) => list.length > 1).map(([value, list]) => ({ value, members: list }));
  };
  const currentEmail = normalize(currentMember?.email);
  return {
    duplicateEmails: groupBy("email", normalize),
    duplicateMemberUids: groupBy("memberUid"),
    current: currentMember ? {
      id: currentMember.id,
      name: currentMember.name || "",
      email: currentEmail,
      memberUid: currentMember.memberUid || "",
      authUid: authUid || "",
      emailDuplicateMembers: members.filter(m => m.id !== currentMember.id && normalize(m.email) && normalize(m.email) === currentEmail).map(summarize),
      memberUidDuplicateMembers: members.filter(m => m.id !== currentMember.id && m.memberUid && m.memberUid === currentMember.memberUid).map(summarize),
      memberUidMatchesAuthUid: !!authUid && !!currentMember.memberUid && currentMember.memberUid === authUid,
    } : null,
  };
}

export async function deleteMember(id) {
  const uid = requireUid();
  dbLog("deleteMember", id);
  const snap = await getDoc(doc(db, "members", id));
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  if (snap.data().trainerUid !== uid) throw new Error("권한이 없습니다.");
  const [sessSnap, nutSnap, bcSnap, assSnap, obSnap, ciSnap, msgSnap, rrSnap, dcSnap, nrSnap, privSnap] = await Promise.all([
    getDocs(collection(db, "members", id, "sessions")),
    getDocs(collection(db, "members", id, "nutrition")),
    getDocs(collection(db, "members", id, "bodyCheck")),
    getDocs(collection(db, "members", id, "assessments")),
    getDocs(collection(db, "members", id, "memberOnboarding")),
    getDocs(collection(db, "members", id, "memberCheckins")),
    getDocs(collection(db, "members", id, "memberMessages")),
    getDocs(collection(db, "members", id, "routineRecommendations")),
    getDocs(collection(db, "members", id, "dailyConditioning")),
    getDocs(collection(db, "members", id, "noticeReads")),
    getDocs(collection(db, "members", id, "private")),
  ]);
  await Promise.all([
    ...sessSnap.docs.map(d => deleteDoc(d.ref)),
    ...nutSnap.docs.map(d => deleteDoc(d.ref)),
    ...bcSnap.docs.map(d => deleteDoc(d.ref)),
    ...assSnap.docs.map(d => deleteDoc(d.ref)),
    ...obSnap.docs.map(d => deleteDoc(d.ref)),
    ...ciSnap.docs.map(d => deleteDoc(d.ref)),
    ...msgSnap.docs.map(d => deleteDoc(d.ref)),
    ...rrSnap.docs.map(d => deleteDoc(d.ref)),
    ...dcSnap.docs.map(d => deleteDoc(d.ref)),
    ...nrSnap.docs.map(d => deleteDoc(d.ref)),
    ...privSnap.docs.map(d => deleteDoc(d.ref)),
    deleteDoc(doc(db, "members", id)),
  ]);
  dbLog("deleteMember", "완료");
}

// ── 회원 소유권 검증 헬퍼 ─────────────────────────────
async function verifyMemberOwnership(memberId) {
  const uid = requireUid();
  const snap = await getDoc(doc(db, "members", memberId));
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  if (snap.data().trainerUid !== uid) {
    throw new Error("이 회원에 대한 권한이 없습니다.");
  }
  return uid;
}

async function verifyMemberProfileAccess(memberId) {
  const uid = requireUid();
  const snap = await getDoc(doc(db, "members", memberId));
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  const data = snap.data() || {};
  if (data.trainerUid !== uid && data.memberUid !== uid) {
    throw new Error("이 회원에 대한 권한이 없습니다.");
  }
  return uid;
}

// ════════════════════════════════════════════════════
// 수업 일지 (sessions)
// ════════════════════════════════════════════════════
const SESSION_PUBLIC_FIELDS = new Set(["name", "sets", "feedback", "muscleTop", "muscleSub", "equipment", "movementPurpose", "funcCategory", "funcBodyPart", "funcTool", "isFavorite", "favorite", "isRecommended", "recommended", "memberAppRecommended", "stimRating", "stimMemo"]);

function normalizeSessionForRead(data = {}) {
  const isPublished = data.isPublished === true;
  return {
    ...data,
    status: data.status || (isPublished ? "published" : "draft"),
    isPublished,
    publishedAt: data.publishedAt || null,
  };
}

function withSessionDefaults(data = {}) {
  const isPublished = data.isPublished === true;
  return {
    ...data,
    status: data.status || (isPublished ? "published" : "draft"),
    isPublished,
    publishedAt: data.publishedAt || null,
  };
}

function publicSet(set = {}) {
  return {
    weight: set.weight || "",
    reps: set.reps || "",
    durationSec: set.durationSec || "",
    volume: set.volume || 0,
    recordType: set.recordType || "weightReps",
  };
}

function publicExercise(ex = {}) {
  const out = {};
  for (const [key, value] of Object.entries(ex)) {
    if (key === "sets") out.sets = (value || []).map(publicSet);
    else if (SESSION_PUBLIC_FIELDS.has(key)) out[key] = value;
  }
  return out;
}

function publicSession(data = {}) {
  return {
    id: data.id,
    memberName: data.memberName || "",
    memberId: data.memberId || "",
    trainerName: data.trainerName || "",
    gymName: data.gymName || "",
    date: data.date || "",
    sessionNo: data.sessionNo || "",
    type: data.type || "",
    selectedTypes: data.selectedTypes || [],
    intensity: data.intensity || "",
    condition: data.condition || "",
    totalVolume: data.totalVolume || 0,
    exercises: (data.exercises || []).map(publicExercise),
    trainerComment: data.trainerComment || "",
    stretchingNotes: data.stretchingNotes || "",
    cardio: data.cardio || null,
    sorenessReport: data.sorenessReport || null,
    sorenessUpdatedAt: data.sorenessUpdatedAt || null,
    memberFeedback: data.memberFeedback || null,
    isPublished: true,
    status: "published",
    publishedAt: data.publishedAt || null,
  };
}

async function attachSessionMemberFeedback(memberId, sessions = []) {
  const uid = auth.currentUser?.uid || null;
  return Promise.all((sessions || []).map(async session => {
    if (!uid) return session;
    const path = `members/${memberId}/sessions/${session.id}/memberFeedback/${uid}`;
    try {
      // 회원앱 Rules는 본인 feedback 문서만 읽을 수 있으므로 컬렉션 list 대신
      // 저장 경로와 동일한 문서 경로를 직접 읽습니다.
      const feedbackRef = doc(db, "members", memberId, "sessions", session.id, "memberFeedback", uid);
      const feedbackSnap = await getDoc(feedbackRef);
      const memberFeedback = feedbackSnap.exists() ? { id: feedbackSnap.id, ...feedbackSnap.data() } : null;
      return { ...session, memberFeedback, memberFeedbackList: memberFeedback ? [memberFeedback] : [] };
    } catch (e) {
      console.warn("[DB:attachSessionMemberFeedback] read failed", { path, memberId, sessionId: session.id, code: e?.code, message: e?.message });
      return session;
    }
  }));
}

export async function getSessions(memberId) {
  requireUid();
  dbLog("getSessions", `memberId=${memberId}`);
  const q    = query(
    collection(db, "members", memberId, "sessions"),
    orderBy("sessionNo", "asc"),
    limit(500)
  );
  const snap = await getDocs(q);
  dbLog("getSessions", `결과: ${snap.docs.length}개`);
  const sessions = snap.docs.map(d => ({ id: d.id, ...normalizeSessionForRead(d.data()) }));
  return attachSessionMemberFeedback(memberId, sessions);
}

// 회원 목록 카드 표시용 — 최근 n개만 읽어 Firestore read 절약
// getSessions(전량)과 달리 memberFeedback 없이 기본 정보만 반환
export async function getRecentSessions(memberId, n = 5) {
  requireUid();
  const q = query(
    collection(db, "members", memberId, "sessions"),
    orderBy("sessionNo", "desc"),
    limit(n)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...normalizeSessionForRead(d.data()) }));
}

export async function getPublishedSessions(memberId) {
  requireUid();
  const path = `members/${memberId}/sessions`;
  dbLog("getPublishedSessions", "읽기 시작:", path, "where isPublished == true");
  try {
    // Spark 플랜/기본 인덱스에서도 동작하도록 단일 where만 사용합니다.
    // where + orderBy 조합은 composite index가 없어 failed-precondition을 만들 수 있어
    // 정렬은 클라이언트에서 수행합니다.
    const q = query(
      collection(db, "members", memberId, "sessions"),
      where("isPublished", "==", true)
    );
    const snap = await getDocs(q);
    const sessions = snap.docs
      .map(d => publicSession({ id: d.id, ...normalizeSessionForRead(d.data()) }))
      .sort((a, b) => {
        const sessionNoDiff = (Number(a.sessionNo) || 0) - (Number(b.sessionNo) || 0);
        if (sessionNoDiff) return sessionNoDiff;
        return String(a.date || "").localeCompare(String(b.date || ""));
      });
    const withFeedback = await attachSessionMemberFeedback(memberId, sessions);
    dbLog("getPublishedSessions", `결과: ${withFeedback.length}개`);
    return withFeedback;
  } catch(e) {
    console.warn("[DB:getPublishedSessions] read failed; returning [] so member app can continue:", { path, collection: "sessions", ...describeFirestoreError(e), memberId });
    return [];
  }
}

export async function addSession(memberId, data) {
  await verifyMemberOwnership(memberId);
  dbLog("addSession", `memberId=${memberId} sessionNo=${data.sessionNo}`);
  const ref = await addDoc(
    collection(db, "members", memberId, "sessions"),
    { ...clean(withSessionDefaults(data)), createdAt: serverTimestamp() }
  );
  dbLog("addSession", `완료: ${ref.id}`);
  return { id: ref.id, ...data };
}

export async function updateSession(memberId, sessionId, data) {
  await verifyMemberOwnership(memberId);
  dbLog("updateSession", `memberId=${memberId} sessionId=${sessionId}`);
  await updateDoc(
    doc(db, "members", memberId, "sessions", sessionId),
    { ...clean(withSessionDefaults(data)), updatedAt: serverTimestamp() }
  );
  dbLog("updateSession", "완료");
}

export async function saveSessionSoreness(memberId, sessionId, sorenessReport) {
  requireUid();
  dbLog("saveSessionSoreness", `memberId=${memberId} sessionId=${sessionId}`);
  await updateDoc(doc(db, "members", memberId, "sessions", sessionId), {
    sorenessReport: clean(sorenessReport),
    sorenessUpdatedAt: serverTimestamp(),
  });
  dbLog("saveSessionSoreness", "완료");
}

// 근육통(sorenessLevel/sorenessBodyParts)·RPE·메모는 서로 독립적으로 저장된다.
// feedback 객체에 실제로 들어있는 필드만 payload에 담아 setDoc(..., {merge:true})로 쓰기 때문에,
// 이번에 건드리지 않은 필드는 payload에 아예 없어 기존 저장값이 그대로 유지된다(덮어쓰기 방지).
export async function saveSessionMemberFeedback(memberId, sessionId, feedback) {
  const uid = requireUid();
  const ref = doc(db, "members", memberId, "sessions", sessionId, "memberFeedback", uid);
  const snap = await getDoc(ref);
  const payload = {
    source: "memberApp",
    updatedAt: serverTimestamp(),
    ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  if (feedback.sorenessLevel !== undefined || feedback.sorenessBodyParts !== undefined || feedback.sorenessBodyPart !== undefined) {
    const rawParts = Array.isArray(feedback.sorenessBodyParts)
      ? feedback.sorenessBodyParts
      : (feedback.sorenessBodyPart ? [feedback.sorenessBodyPart] : []);
    const sorenessBodyParts = [...new Set(rawParts.map(v => String(v || "").trim()).filter(Boolean))];
    payload.sorenessLevel = feedback.sorenessLevel || "없음";
    payload.sorenessBodyParts = sorenessBodyParts;
    // 하위 호환: 기존 관리자/리포트가 단일 필드를 읽어도 첫 번째 선택 부위를 표시합니다.
    payload.sorenessBodyPart = sorenessBodyParts[0] || "";
  }
  if (feedback.rpe !== undefined) payload.rpe = Number(feedback.rpe);
  if (feedback.memo !== undefined) payload.memo = feedback.memo || "";
  await setDoc(ref, clean(payload), { merge: true });

  const activities = [];
  if (payload.sorenessLevel !== undefined) {
    activities.push({ type: "soreness", label: "근육통", value: `${payload.sorenessBodyParts.join("/") || "-"} · ${payload.sorenessLevel}` });
  }
  if (payload.rpe !== undefined) {
    activities.push({ type: "rpe", label: "RPE", value: `${payload.rpe}` });
  }
  if (payload.memo !== undefined && payload.memo) {
    activities.push({ type: "memo", label: "메모", value: "입력됨" });
  }
  await touchMemberActivities(memberId, activities);
  return { id: uid, ...feedback, source: "memberApp" };
}

// ════════════════════════════════════════════════════
// 회원 알림 배지 데이터 구조 (memberNotifications)
// type: workout_log | feedback | notice | nutrition
// 현재는 배지 카운트 소스로 아직 연결하지 않음(회원앱 배지는 기존
// sessions.isPublished/readSessionIds, notices.isRead 기반 unreadCount 사용 — 중복 집계 방지).
// publishSession()에서 workout_log 알림을 생성하는 것을 시작으로,
// 대표 피드백/식단 피드백 저장 시에도 동일하게 createMemberNotification()을 호출해 확장하면 된다.
// ════════════════════════════════════════════════════
export async function createMemberNotification(memberId, { type, title, body }) {
  if (!memberId || !type) return;
  const uid = requireUid();
  await addDoc(collection(db, "members", memberId, "memberNotifications"), {
    memberId,
    type,
    title: title || "",
    body: body || "",
    isRead: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
    readAt: null,
  });
}

export async function getMemberNotifications(memberId, max = 30) {
  requireUid();
  const q = query(collection(db, "members", memberId, "memberNotifications"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function markMemberNotificationRead(memberId, notificationId) {
  requireUid();
  await updateDoc(doc(db, "members", memberId, "memberNotifications", notificationId), {
    isRead: true,
    readAt: serverTimestamp(),
  });
}

export async function publishSession(memberId, sessionId) {
  await verifyMemberOwnership(memberId);
  dbLog("publishSession", `memberId=${memberId} sessionId=${sessionId}`);
  await updateDoc(doc(db, "members", memberId, "sessions", sessionId), {
    status: "published",
    isPublished: true,
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  createMemberNotification(memberId, { type: "workout_log", title: "새 수업일지가 도착했어요", body: "오늘 수업 기록이 회원앱에 공개됐어요." }).catch(() => {});
  dbLog("publishSession", "완료");
}

export async function sendPairSession(aMemberId, aSessionId, bMemberId, bSessionData) {
  await verifyMemberOwnership(aMemberId);
  await verifyMemberOwnership(bMemberId);
  dbLog("sendPairSession", `A=${aMemberId}/${aSessionId} → B=${bMemberId}`);
  const bRef = await addDoc(
    collection(db, "members", bMemberId, "sessions"),
    { ...clean(withSessionDefaults(bSessionData)), isPublished: false, status: "draft", createdAt: serverTimestamp() }
  );
  await updateDoc(doc(db, "members", aMemberId, "sessions", aSessionId), {
    pairStatus: "recorded",
    pairSessionId: bRef.id,
    pairRecordedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  dbLog("sendPairSession", `완료 bSessionId=${bRef.id}`);
  return { bSessionId: bRef.id };
}

export async function unpublishSession(memberId, sessionId, nextStatus = "completed") {
  await verifyMemberOwnership(memberId);
  dbLog("unpublishSession", `memberId=${memberId} sessionId=${sessionId}`);
  await updateDoc(doc(db, "members", memberId, "sessions", sessionId), {
    status: nextStatus === "draft" ? "draft" : "completed",
    isPublished: false,
    publishedAt: null,
    updatedAt: serverTimestamp(),
  });
  dbLog("unpublishSession", "완료");
}

export async function deleteSession(memberId, sessionId) {
  await verifyMemberOwnership(memberId);
  dbLog("deleteSession", `memberId=${memberId} sessionId=${sessionId}`);
  await deleteDoc(doc(db, "members", memberId, "sessions", sessionId));
  dbLog("deleteSession", "완료");
}

// ════════════════════════════════════════════════════
// 바디 체크 (bodyCheck)
// ════════════════════════════════════════════════════
export async function getBodyCheck(memberId) {
  try {
    requireUid();
    dbLog("getBodyCheck", `memberId=${memberId}`);
    const ref  = doc(db, "members", memberId, "bodyCheck", "main");
    const snap = await getDoc(ref);
    if (!snap.exists()) { dbLog("getBodyCheck", "문서 없음"); return null; }
    const d = snap.data();
    const result = {
      goal:    d.goal    || {},
      records: (d.records || []).map(r => ({ ...r })),
      inbody:  (d.inbody  || []).map(r => ({ ...r })),
    };
    dbLog("getBodyCheck", `완료: records=${result.records.length}`);
    return result;
  } catch(e) {
    console.error("[DB] getBodyCheck error:", { path: `members/${memberId}/bodyCheck/main`, collection: "bodyCheck", ...describeFirestoreError(e), memberId });
    return null;
  }
}

export async function saveBodyCheck(memberId, data) {
  try {
    await verifyMemberProfileAccess(memberId);
    dbLog("saveBodyCheck", `memberId=${memberId}`);
    const ref     = doc(db, "members", memberId, "bodyCheck", "main");
    const payload = {
      goal:      clean(data.goal)    || {},
      records:   clean(data.records) || [],
      inbody:    clean(data.inbody)  || [],
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    const saved = await getDoc(ref);
    const d = saved.data();
    const result = {
      goal:    d.goal    || {},
      records: (d.records || []).map(r => ({ ...r })),
      inbody:  (d.inbody  || []).map(r => ({ ...r })),
    };
    dbLog("saveBodyCheck", `완료: records=${result.records.length}`);
    return result;
  } catch(e) {
    console.error("[DB] saveBodyCheck error:", e.message, `memberId=${memberId}`);
    throw new Error("바디체크 저장 실패: " + e.message);
  }
}

export async function saveMemberProfileFields(memberId, data = {}) {
  requireUid();
  const today = new Date().toISOString().slice(0, 10);
  const now = serverTimestamp();
  const hasInput = (key) => Object.prototype.hasOwnProperty.call(data, key);
  const stringValue = (value) => value === undefined || value === null ? "" : String(value).trim();
  const optionalNumber = (value, label) => {
    if (value === undefined || value === null || String(value).trim() === "") return null;
    const valueNumber = Number(String(value).trim());
    if (!Number.isFinite(valueNumber) || valueNumber <= 0) throw new Error(`${label} 0보다 큰 숫자로 입력해주세요.`);
    return valueNumber;
  };
  const copyString = (target, key) => {
    const next = stringValue(data[key]);
    if (next) target[key] = next;
  };

  const height = hasInput("height") ? optionalNumber(data.height, "키는") : null;
  const startWeight = hasInput("startWeight") ? optionalNumber(data.startWeight, "시작 체중은") : null;
  const currentWeight = hasInput("currentWeight") ? optionalNumber(data.currentWeight, "현재 체중은") : null;
  const targetWeightKg = hasInput("targetWeightKg") ? optionalNumber(data.targetWeightKg, "목표 체중은") : null;
  const workoutFrequency = hasInput("workoutFrequency") ? stringValue(data.workoutFrequency) : "";
  const weeklyWorkoutCount = hasInput("weeklyWorkoutCount") ? stringValue(data.weeklyWorkoutCount) : "";
  const birthYear = hasInput("birthYear") ? stringValue(data.birthYear) : "";
  const birthMonth = hasInput("birthMonth") ? stringValue(data.birthMonth) : "";
  const birthDay = hasInput("birthDay") ? stringValue(data.birthDay) : "";
  const birthYearMonth = hasInput("birthYearMonth") ? stringValue(data.birthYearMonth) : (birthYear && birthMonth ? `${birthYear}-${String(birthMonth).padStart(2, "0")}` : "");

  const results = [];
  const failures = [];
  const memberRef = doc(db, "members", memberId);
  const onboardingRef = doc(db, "members", memberId, "memberOnboarding", "main");

  try {
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) throw new Error("회원 문서를 찾을 수 없습니다.");

    const currentMember = memberSnap.data() || {};
    const memberPayload = {};
    if (height !== null && currentMember.height !== height) memberPayload.height = height;
    if (startWeight !== null && currentMember.startWeight !== startWeight) memberPayload.startWeight = startWeight;
    if (currentWeight !== null && currentMember.currentWeight !== currentWeight) memberPayload.currentWeight = currentWeight;
    if (targetWeightKg !== null) {
      if (currentMember.targetWeightKg !== targetWeightKg) memberPayload.targetWeightKg = targetWeightKg;
      if (currentMember.targetWeight !== targetWeightKg) memberPayload.targetWeight = targetWeightKg;
    }
    if (birthYear && currentMember.birthYear !== birthYear) memberPayload.birthYear = birthYear;
    if (birthMonth && currentMember.birthMonth !== birthMonth) memberPayload.birthMonth = birthMonth;
    if (birthDay && currentMember.birthDay !== birthDay) memberPayload.birthDay = birthDay;
    if (birthYearMonth && currentMember.birthYearMonth !== birthYearMonth) memberPayload.birthYearMonth = birthYearMonth;
    if (birthYearMonth) memberPayload.birthSource = "memberProfile";
    if (workoutFrequency && currentMember.workoutFrequency !== workoutFrequency) memberPayload.workoutFrequency = workoutFrequency;
    const effectiveWeeklyWorkoutCount = weeklyWorkoutCount || workoutFrequency;
    if (effectiveWeeklyWorkoutCount && currentMember.weeklyWorkoutCount !== effectiveWeeklyWorkoutCount) memberPayload.weeklyWorkoutCount = effectiveWeeklyWorkoutCount;
    ["goal", "goalPeriod", "goalPeriodType", "goalDeadline", "targetDate", "customGoalDate"].forEach((key) => {
      if (hasInput(key) && currentMember[key] !== stringValue(data[key])) copyString(memberPayload, key);
    });

    if (Object.keys(memberPayload).length) {
      memberPayload.updatedAt = now;
      await updateDoc(memberRef, clean(memberPayload));
      results.push("프로필 기본정보 저장 성공");
    } else {
      results.push("프로필 기본정보 변경 없음");
    }
  } catch (e) {
    console.error("[DB:saveMemberProfileFields] members write failed", { path: `members/${memberId}`, code: e?.code, message: e?.message, memberId });
    failures.push(`프로필 기본정보 저장 실패: members 권한 오류 (${e?.message || String(e)})`);
  }

  const onboardingPayload = {};
  if (height !== null) onboardingPayload.heightCm = height;
  if (startWeight !== null) onboardingPayload.startingWeightKg = startWeight;
  if (currentWeight !== null) onboardingPayload.currentWeightKg = currentWeight;
  if (targetWeightKg !== null) { onboardingPayload.targetWeightKg = targetWeightKg; onboardingPayload.targetWeight = targetWeightKg; }
  if (birthYear) onboardingPayload.birthYear = birthYear;
  if (birthMonth) onboardingPayload.birthMonth = birthMonth;
  if (birthDay) onboardingPayload.birthDay = birthDay;
  if (birthYearMonth) onboardingPayload.birthYearMonth = birthYearMonth;
  if (workoutFrequency) onboardingPayload.weeklyWorkoutCount = workoutFrequency;
  if (weeklyWorkoutCount) onboardingPayload.weeklyWorkoutCount = weeklyWorkoutCount;
  ["targetPeriod", "targetPeriodCustom", "goal", "goalPeriod", "goalPeriodType", "goalDeadline", "targetDate", "customGoalDate"].forEach((key) => {
    if (hasInput(key)) copyString(onboardingPayload, key);
  });

  if (Object.keys(onboardingPayload).length) {
    try {
      onboardingPayload.updatedAt = now;
      await setDoc(onboardingRef, clean(onboardingPayload), { merge: true });
      results.push("온보딩 정보 저장 성공");
    } catch (e) {
      console.error("[DB:saveMemberProfileFields] memberOnboarding write failed", { path: `members/${memberId}/memberOnboarding/main`, code: e?.code, message: e?.message, memberId });
      failures.push(`온보딩 정보 저장 실패: memberOnboarding/main 권한 오류 (${e?.message || String(e)})`);
    }
  }

  const bodyCheckPayload = {};
  if (currentWeight !== null) { bodyCheckPayload.currentWeight = currentWeight; bodyCheckPayload.weight = currentWeight; }
  if (targetWeightKg !== null) { bodyCheckPayload.targetWeightKg = targetWeightKg; bodyCheckPayload.targetWeight = targetWeightKg; }
  if (Object.keys(bodyCheckPayload).length) {
    try {
      const bodyRef = doc(db, "members", memberId, "bodyCheck", "main");
      const snap = await getDoc(bodyRef);
      const current = snap.exists() ? snap.data() : {};
      if (currentWeight !== null) {
        bodyCheckPayload.records = clean(upsertRecordByDate(current.records || [], {
          id: `member_${today}`,
          date: today,
          weight: currentWeight,
          source: "memberProfile",
        }));
      }
      bodyCheckPayload.updatedAt = serverTimestamp();
      await setDoc(bodyRef, clean(bodyCheckPayload), { merge: true });
      results.push("체중 기록 저장 성공");
    } catch (e) {
      console.error("[DB:saveMemberProfileFields] bodyCheck write failed", { path: `members/${memberId}/bodyCheck/main`, code: e?.code, message: e?.message, memberId });
      failures.push(`체중 기록 저장 실패: bodyCheck/main 권한 오류 (${e?.message || String(e)})`);
    }
  }

  if (failures.length) {
    const err = new Error([...results, ...failures].join("\n"));
    err.profileSaveResults = results;
    err.profileSaveFailures = failures;
    throw err;
  }
  return { height, startWeight, currentWeight, targetWeightKg, workoutFrequency, weeklyWorkoutCount, messages: results };
}

// ════════════════════════════════════════════════════
// 온보딩 → 관리자앱 회원 프로필 동기화
//
// 관리자앱 "회원 프로필 수정" 화면(MemberForm)은 아래 두 경로에서 값을 읽는다.
//   - 기본 탭 이름/이메일/시작일 등 = members/{id} 최상위 필드
//   - 성별/나이/키/체중 및 목표·목적/통증·건강/운동경험/방문계기/생활습관/스케줄 탭 = members/{id}.survey.*
// 회원앱 온보딩(memberOnboarding/main)은 이 중 성별/생년월일/키/체중/목표/목표기간/주당 운동횟수만 수집하고,
// 통증·건강/운동경험/방문계기/생활습관/스케줄/메모는 전혀 수집하지 않는다 — 그 탭들은 동기화 대상이 아니다.
// 옵션 값 어휘가 서로 다른 필드(온보딩 목표 5종 vs 관리자 목적 10종, 온보딩 집중부위 vs 관리자 약점부위 등)는
// 잘못된 값이 들어가는 것을 막기 위해 의도적으로 동기화하지 않는다.
//
// 대상(회원 본인이 항상 최신값으로 갱신 — Rules memberProfileUpdateKeysAllowed에 survey 포함,
// memberSurveySyncKeysAllowed로 survey 내부는 gender/height/weight/age만 쓰기 허용):
//   members.survey.gender/height/weight/age  (관리자 수정화면 기본 탭이 직접 읽는 값)
//   members.height/startWeight/currentWeight/targetWeight/targetWeightKg (기존 saveMemberProfileFields와 동일 경로)
//   members.birthYear/birthMonth/birthDay/birthYearMonth/birthSource
//   members.goal (관리자 수정화면에 직접 편집 UI가 없는 표시용 필드라 안전하게 덮어씀)
//   members.goalPeriod/goalPeriodType/customGoalDate, members.weeklyWorkoutCount/workoutFrequency
export async function syncOnboardingToMemberProfile(memberId, onboarding = {}) {
  if (!memberId) return;
  requireUid();
  const payload = {};
  const surveyPayload = {};

  if (onboarding.gender) surveyPayload.gender = onboarding.gender;
  const heightNum = Number(onboarding.heightCm);
  if (Number.isFinite(heightNum) && heightNum > 0) {
    payload.height = heightNum;
    surveyPayload.height = heightNum;
  }
  const startWeightNum = Number(onboarding.startingWeightKg);
  if (Number.isFinite(startWeightNum) && startWeightNum > 0) payload.startWeight = startWeightNum;
  const currentWeightNum = Number(onboarding.currentWeightKg);
  if (Number.isFinite(currentWeightNum) && currentWeightNum > 0) {
    payload.currentWeight = currentWeightNum;
    surveyPayload.weight = currentWeightNum;
  }
  const targetWeightNum = Number(onboarding.targetWeightKg);
  if (Number.isFinite(targetWeightNum) && targetWeightNum > 0) {
    payload.targetWeight = targetWeightNum;
    payload.targetWeightKg = targetWeightNum;
  }

  const birthYear = String(onboarding.birthYear || "").trim();
  const birthMonth = String(onboarding.birthMonth || "").trim();
  const birthDay = String(onboarding.birthDay || "").trim();
  if (birthYear) {
    payload.birthYear = birthYear;
    payload.birthSource = "onboarding";
    // 관리자 상담 설문의 "나이"는 한국식 나이로 기재하는 관행과 동일하게 맞춘다(HubScreen 표시 계산과 동일 공식).
    const koreanAge = new Date().getFullYear() - Number(birthYear) + 1;
    if (Number.isFinite(koreanAge) && koreanAge > 0 && koreanAge < 130) surveyPayload.age = koreanAge;
  }
  if (birthMonth) payload.birthMonth = birthMonth;
  if (birthDay) payload.birthDay = birthDay;
  if (birthYear && birthMonth) payload.birthYearMonth = `${birthYear}-${String(birthMonth).padStart(2, "0")}`;

  if (onboarding.goal) payload.goal = onboarding.goal;
  if (onboarding.targetPeriod) {
    payload.goalPeriod = onboarding.targetPeriod;
    payload.goalPeriodType = onboarding.targetPeriod;
    if (onboarding.targetPeriod === "직접 입력" && onboarding.targetPeriodCustom) {
      payload.customGoalDate = onboarding.targetPeriodCustom;
    }
  }
  if (onboarding.weeklyWorkoutCount) {
    payload.weeklyWorkoutCount = onboarding.weeklyWorkoutCount;
    payload.workoutFrequency = onboarding.weeklyWorkoutCount;
  }

  if (Object.keys(surveyPayload).length) {
    Object.entries(surveyPayload).forEach(([k, v]) => { payload[`survey.${k}`] = v; });
  }
  if (!Object.keys(payload).length) return;
  payload.updatedAt = serverTimestamp();

  try {
    await updateDoc(doc(db, "members", memberId), clean(payload));
    dbLog("syncOnboardingToMemberProfile", `members/${memberId} 동기화 완료: ${Object.keys(payload).join(",")}`);
  } catch (e) {
    console.error("[DB:syncOnboardingToMemberProfile] 동기화 실패", { path: `members/${memberId}`, code: e?.code, message: e?.message, memberId });
    // 온보딩 자체는 이미 저장 성공했으므로 여기서 던지지 않고 콘솔에만 남긴다.
  }
}

export async function saveFcmToken(memberId, token) {
  if (!memberId || !token) return;
  requireUid();
  await updateDoc(doc(db, "members", memberId), {
    fcmToken: token,
    fcmTokenUpdatedAt: serverTimestamp(),
  });
}

// 수업일지 읽음 처리 기준일 — 이 날짜 이전 isPublished 세션은 자동 read 처리
export const SESSION_UNREAD_CUTOFF = "2026-06-30";

export async function getReadSessionIds(memberId) {
  if (!memberId) return new Set();
  try {
    const snap = await getDocs(collection(db, "members", memberId, "readSessions"));
    return new Set(snap.docs.map(d => d.id));
  } catch (e) {
    console.warn("[DB:getReadSessionIds]", e?.code || e?.message || e);
    return new Set();
  }
}

export async function markSessionsRead(memberId, sessionIds) {
  if (!memberId || !sessionIds?.length) return;
  try {
    const toMark = sessionIds.filter(Boolean);
    if (!toMark.length) return;
    const batch = writeBatch(db);
    const now = serverTimestamp();
    toMark.forEach(id => {
      batch.set(doc(db, "members", memberId, "readSessions", id), { readAt: now }, { merge: true });
    });
    await batch.commit();
  } catch (e) {
    console.warn("[DB:markSessionsRead]", e?.code || e?.message || e);
  }
}

// ════════════════════════════════════════════════════
// 회원 활동 요약 (관리자앱 회원 카드/히스토리 실시간 표시용)
// members/{id}.todayInputTypes / recentActivityLog 필드만 추가 — 기존 저장 경로는 그대로 둔다.
// ════════════════════════════════════════════════════
// 한국 시간 기준 오늘 날짜 — dateKey 미전달 시 폴백으로만 사용 (UTC 기준으로 계산하면 KST 00~09시에 하루 밀림)
function koreaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function touchMemberActivities(memberId, activities = []) {
  if (!memberId || !activities.length) return;
  try {
    const ref = doc(db, "members", memberId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const todayKey = activities[0].dateKey || koreaDateKey();
    const prevTypes = data.todayInputTypes?.date === todayKey ? (data.todayInputTypes.types || []) : [];
    const types = [...new Set([...prevTypes, ...activities.map(a => a.type)])];
    const prevLog = Array.isArray(data.recentActivityLog) ? data.recentActivityLog : [];
    const now = Date.now();
    const newEntries = activities.map(a => ({
      type: a.type, label: a.label, value: a.value,
      dateKey: a.dateKey || todayKey, at: now,
    }));
    const recentActivityLog = [...newEntries, ...prevLog].slice(0, 15);
    await updateDoc(ref, {
      todayInputTypes: { date: todayKey, types },
      recentActivityLog,
      memberLastInputAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("[DB:touchMemberActivities]", e?.code || e?.message || e);
  }
}

export async function saveMemberHealthInputs(memberId, dateKey, data = {}) {
  requireUid();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const weight = data.weight === undefined || data.weight === null || String(data.weight).trim() === ""
    ? null
    : Number(String(data.weight).trim());

  if (weight !== null && Number.isFinite(weight) && weight > 0) {
    const bodyRef = doc(db, "members", memberId, "bodyCheck", "main");
    const snap = await getDoc(bodyRef);
    const current = snap.exists() ? snap.data() : {};
    batch.set(bodyRef, {
      goal: current.goal || {},
      inbody: current.inbody || [],
      records: clean(upsertRecordByDate(current.records || [], {
        id: `member_${dateKey}`,
        date: dateKey,
        weight,
        note: "회원앱 직접 입력",
      })),
      updatedAt: now,
    }, { merge: true });
  }

  if (data.kcal !== undefined && String(data.kcal).trim() !== "") {
    const metaRef = doc(db, "members", memberId, "nutrition", "meta");
    const dateRef = doc(db, "members", memberId, "nutrition", dateKey);
    const metaSnap = await getDoc(metaRef);
    const meta = metaSnap.exists() ? metaSnap.data() : {};
    batch.set(metaRef, {
      goal: meta.goal || "체중 감량",
      favFoods: clean(meta.favFoods) || [],
      logs: clean(upsertRecordByDate(meta.logs || [], { id: dateKey, date: dateKey, kcal: data.kcal, source: "member-app" })),
      updatedAt: now,
    });
    batch.set(dateRef, {
      totalKcal: Number(data.kcal) || data.kcal,
      memberInputKcal: Number(data.kcal) || data.kcal,
      source: "member-app",
      updatedAt: now,
    }, { merge: true });
  }

  if (data.steps !== undefined && String(data.steps).trim() !== "") {
    const checkRef = doc(db, "members", memberId, "memberCheckins", dateKey);
    batch.set(checkRef, { steps: data.steps, date: dateKey, updatedAt: now, createdBy: auth.currentUser.uid }, { merge: true });
  }

  await batch.commit();

  const activities = [];
  if (weight !== null && Number.isFinite(weight) && weight > 0) {
    activities.push({ type: "weight", label: "체중 입력", value: `${weight}kg`, dateKey });
  }
  if (data.kcal !== undefined && String(data.kcal).trim() !== "") {
    activities.push({ type: "kcal", label: "칼로리 입력", value: `${Number(data.kcal).toLocaleString()}kcal`, dateKey });
  }
  if (data.steps !== undefined && String(data.steps).trim() !== "") {
    activities.push({ type: "steps", label: "걸음수", value: `${Number(data.steps).toLocaleString()}보`, dateKey });
  }
  await touchMemberActivities(memberId, activities);
}

function upsertRecordByDate(records = [], rec = {}) {
  const date = rec.date;
  if (!date) return records;
  const next = [...records];
  const idx = next.findIndex(r => r.date === date || r.id === rec.id);
  const merged = { ...(idx >= 0 ? next[idx] : {}), ...rec };
  if (idx >= 0) next[idx] = merged;
  else next.push(merged);
  return next.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}


// ════════════════════════════════════════════════════
// 체형평가 (assessments)
// ════════════════════════════════════════════════════
export async function getAssessments(memberId) {
  try {
    requireUid();
    dbLog("getAssessments", `memberId=${memberId}`);
    const q = query(
      collection(db, "members", memberId, "assessments"),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);
    const result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    dbLog("getAssessments", `완료: ${result.length}개`);
    return result;
  } catch(e) {
    console.error("[DB] getAssessments error:", e.message, `memberId=${memberId}`);
    return [];
  }
}

export async function saveAssessment(memberId, data) {
  try {
    await verifyMemberOwnership(memberId);
    const assessmentId = data.id || `a${Date.now()}`;
    dbLog("saveAssessment", `memberId=${memberId} assessmentId=${assessmentId}`);
    const ref = doc(db, "members", memberId, "assessments", assessmentId);
    const payload = {
      ...clean(data),
      id: assessmentId,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload, { merge: true });
    const saved = await getDoc(ref);
    return { id: saved.id, ...saved.data() };
  } catch(e) {
    console.error("[DB] saveAssessment error:", e.message, `memberId=${memberId}`);
    throw new Error("체형평가 저장 실패: " + e.message);
  }
}

export async function saveAssessments(memberId, records = []) {
  try {
    await verifyMemberOwnership(memberId);
    dbLog("saveAssessments", `memberId=${memberId} count=${records.length}`);
    const batch = writeBatch(db);
    records.forEach((record, idx) => {
      const assessmentId = record.id || `a${Date.now()}_${idx}`;
      const ref = doc(db, "members", memberId, "assessments", assessmentId);
      batch.set(ref, {
        ...clean(record),
        id: assessmentId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  } catch(e) {
    console.error("[DB] saveAssessments error:", e.message, `memberId=${memberId}`);
    throw new Error("체형평가 마이그레이션 실패: " + e.message);
  }
}

// ════════════════════════════════════════════════════
// 교정 결과 요약 (correctionSummaries) — assessments의 전문 임상 데이터와 별개로,
// 회원에게 보여줄 "전문용어 없는 결과만" 저장하는 컬렉션. 회원은 읽기만 가능.
// ════════════════════════════════════════════════════
export async function getCorrectionSummaries(memberId) {
  try {
    requireUid();
    dbLog("getCorrectionSummaries", `memberId=${memberId}`);
    const q = query(
      collection(db, "members", memberId, "correctionSummaries"),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);
    const result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    dbLog("getCorrectionSummaries", `완료: ${result.length}개`);
    return result;
  } catch(e) {
    console.error("[DB] getCorrectionSummaries error:", e.message, `memberId=${memberId}`);
    return [];
  }
}

export async function saveCorrectionSummary(memberId, data) {
  try {
    await verifyMemberOwnership(memberId);
    const summaryId = data.id || `cs${Date.now()}`;
    dbLog("saveCorrectionSummary", `memberId=${memberId} summaryId=${summaryId}`);
    const ref = doc(db, "members", memberId, "correctionSummaries", summaryId);
    const payload = {
      ...clean(data),
      id: summaryId,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload, { merge: true });
    const saved = await getDoc(ref);
    return { id: saved.id, ...saved.data() };
  } catch(e) {
    console.error("[DB] saveCorrectionSummary error:", e.message, `memberId=${memberId}`);
    throw new Error("교정 결과 저장 실패: " + e.message);
  }
}

// ════════════════════════════════════════════════════
// 영양 관리 (nutrition)
// ════════════════════════════════════════════════════
export async function getNutrition(memberId) {
  try {
    requireUid();
    dbLog("getNutrition", `memberId=${memberId}`);
    const metaRef  = doc(db, "members", memberId, "nutrition", "meta");
    const metaSnap = await getDoc(metaRef);
    const meta     = metaSnap.exists() ? metaSnap.data() : {};
    const nutSnap  = await getDocs(collection(db, "members", memberId, "nutrition"));
    const dates    = {};
    nutSnap.docs.forEach(d => { if (d.id !== "meta") dates[d.id] = d.data(); });
    const logs     = (meta.logs || []).map(l => ({ ...l }));
    dbLog("getNutrition", `완료: dates=${Object.keys(dates).length}일 logs=${logs.length}개`);
    return { goal: meta.goal || "체중 감량", favFoods: meta.favFoods || [], logs, dates };
  } catch(e) {
    console.error("[DB] getNutrition error:", { path: `members/${memberId}/nutrition`, collection: "nutrition", ...describeFirestoreError(e), memberId });
    return null;
  }
}

export async function saveNutrition(memberId, data) {
  try {
    await verifyMemberOwnership(memberId);
    dbLog("saveNutrition", `memberId=${memberId}`);
    const batch   = writeBatch(db);
    const metaRef = doc(db, "members", memberId, "nutrition", "meta");
    batch.set(metaRef, {
      goal:      data.goal      || "체중 감량",
      favFoods:  clean(data.favFoods) || [],
      logs:      clean(data.logs) || [],
      updatedAt: serverTimestamp(),
    });
    const dates = data.dates || {};
    Object.entries(dates).forEach(([dateKey, dayData]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
      const dateRef = doc(db, "members", memberId, "nutrition", dateKey);
      batch.set(dateRef, {
        meals:       clean(dayData.meals)       || {},
        supplements: clean(dayData.supplements) || [],
        totalKcal:   clean(dayData.totalKcal),
        memberInputKcal: clean(dayData.memberInputKcal),
        kcal:        clean(dayData.kcal),
        cal:         clean(dayData.cal),
        source:      clean(dayData.source),
        updatedAt:   serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
    dbLog("saveNutrition", `완료: dates=${Object.keys(dates).length}일 logs=${(data.logs || []).length}개`);
  } catch(e) {
    console.error("[DB] saveNutrition error:", e.message, `memberId=${memberId}`);
    throw new Error("영양 관리 저장 실패: " + e.message);
  }
}

// ════════════════════════════════════════════════════
// 회원앱 MVP (memberCheckins / memberMessages)
// ════════════════════════════════════════════════════
export async function linkMemberUidToCurrentUser(memberId, previousMemberUid = null) {
  const uid = requireUid();
  const authEmail = (auth.currentUser?.email || "").trim().toLowerCase();
  if (!authEmail) throw new Error("Firebase Auth 이메일이 없어 회원 문서 연결을 진행할 수 없습니다.");
  const memberRef = doc(db, "members", memberId);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  const batch = writeBatch(db);
  batch.update(memberRef, {
    memberUid: uid,
    memberUidLinkedAt: serverTimestamp(),
    memberUidLinkedBy: uid,
    memberUidPrevious: previousMemberUid || "",
    memberAppAccountEmail: authEmail,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  dbLog("linkMemberUidToCurrentUser", `members/${memberId} -> ${uid}`);
}

export async function touchMemberAppLastLogin(memberId) {
  requireUid();
  await updateDoc(doc(db, "members", memberId), {
    memberAppLastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ── 임시 진단 로그 (production에서도 출력, dbLog는 production에서 no-op이라 별도 사용) ──
function debugMemberProfile(step, ...args) {
  console.warn(`[MemberProfileDebug] ${step}`, ...args);
}

export async function getMemberAppProfile() {
  const uid = requireUid();
  const authEmail = (auth.currentUser?.email || "").trim().toLowerCase();
  dbLog("getMemberAppProfile", "1) Firebase Auth UID:", uid, "email:", authEmail);
  debugMemberProfile("1) Firebase Auth 로그인 UID:", uid, "email:", authEmail);

  const diagnostics = {
    authUid: uid,
    authEmail,
    membersQueryRead: false,
    membersRead: false,
    failedFirestorePath: null,
    queryErrors: {},
    matchedMemberId: null,
    matchedBy: "none",
  };

  // 1) Firestore 쿼리 자체의 성공/실패만 여기서 구분한다 (permission-denied 등)
  //    — 이 try/catch 밖에서 던지는 에러(member/inactive 등)는 그대로 호출자에게 전파되어야 하므로
  //      status 판정 로직은 이 블록 밖으로 분리한다.
  let snap;
  try {
    const membersQuery = query(collection(db, "members"), where("memberUid", "==", uid), limit(1));
    snap = await getDocs(membersQuery);
    diagnostics.membersQueryRead = true;
  } catch (e) {
    const isPermissionDenied = e?.code === "permission-denied";
    const details = { path: "members?where(memberUid==auth.uid)", ...describeFirestoreError(e), authUid: uid, authEmail };
    diagnostics.failedFirestorePath = details.path;
    diagnostics.queryErrors.members = details;
    console.error("[DB:getMemberAppProfile] members.memberUid query 실패:", details);
    debugMemberProfile("6) Rules PERMISSION_DENIED 여부:", isPermissionDenied ? "YES — Firestore Rules에서 차단(permission-denied)" : `NO — 다른 오류 (code=${e?.code || "unknown"})`);
    debugMemberProfile("7) 실패 지점: db.js getMemberAppProfile query 자체 실패 (Firestore 오류) —", details);
    dbWarn("getMemberAppProfile", "members 쿼리 실패.", { authUid: uid, authEmail, diagnostics });
    const err = new Error(isPermissionDenied
      ? "회원 정보에 접근할 권한이 없습니다. 대표에게 문의해주세요."
      : "회원 정보를 불러오는 중 오류가 발생했습니다. 대표에게 문의해주세요.");
    err.code = isPermissionDenied ? "permission-denied" : "member/query-failed";
    err.memberAppDetails = { code: err.code, path: "members?where(memberUid==auth.uid)", ...diagnostics };
    throw err;
  }

  debugMemberProfile("2) memberUid query 결과:", snap.empty ? `문서 못 찾음 (0건, uid=${uid})` : `문서 ${snap.size}건 찾음`);

  if (snap.empty) {
    dbLog("getMemberAppProfile", "2) members query 결과 없음 uid:", uid);
    debugMemberProfile("6) Rules PERMISSION_DENIED 여부: 아님 — 쿼리 자체는 정상 실행되어 0건 반환됨 (권한 문제가 아니라 memberUid 불일치)");
    debugMemberProfile("7) 실패 지점: db.js getMemberAppProfile query-empty 분기 (member/not-found) — members 컬렉션에 memberUid ==", uid, "인 문서가 없음");
    dbWarn("getMemberAppProfile", "회원 문서를 찾지 못했습니다.", { authUid: uid, authEmail, diagnostics });
    const err = new Error("회원 정보를 불러오지 못했습니다. 대표에게 문의해주세요.");
    err.code = "member/not-found";
    err.memberAppDetails = { code: err.code, path: "members?where(memberUid==auth.uid)", ...diagnostics };
    throw err;
  }

  const memberDoc = snap.docs[0];
  const data = memberDoc.data();
  debugMemberProfile("3) 찾은 문서 id:", memberDoc.id);
  debugMemberProfile("4) status/memberStatus 값:", { status: data.status ?? null, memberStatus: data.memberStatus ?? null, isActive: data.isActive ?? null });
  debugMemberProfile("5) isOwner/role 값:", { isOwner: data.isOwner ?? null, role: data.role ?? null });

  // memberStatus 검사 — "active" 계열 진행중 회원만 허용
  // status/memberStatus 필드 없으면 active 간주 (관리자앱 기본값과 동일)
  const rawStatus = String(data.status || data.memberStatus || "").trim().toLowerCase();
  const statusIsActive = !rawStatus
    ? true
    : (MEMBER_ACTIVE_STATUSES.has(rawStatus) || rawStatus.includes("진행"));
  if (!statusIsActive || data.isActive === false) {
    debugMemberProfile("7) 실패 지점: db.js getMemberAppProfile status 차단 분기 (member/inactive) — rawStatus:", rawStatus, "statusIsActive:", statusIsActive, "isActive:", data.isActive);
    const err = new Error("현재 회원앱 이용이 제한된 상태입니다. 이용이 필요하시면 대표에게 문의해주세요.");
    err.code = "member/inactive";
    err.memberAppDetails = { code: "member/inactive", matchedMemberId: memberDoc.id };
    throw err;
  }

  diagnostics.membersRead = true;
  diagnostics.matchedMemberId = memberDoc.id;
  diagnostics.matchedBy = "members.memberUid";
  const profile = {
    id: memberDoc.id,
    ...data,
    _matchedBy: "members.memberUid",
    _diagnostics: diagnostics,
  };
  dbLog("getMemberAppProfile", "2) members query 성공 memberId:", memberDoc.id, "memberUid:", data.memberUid || null);
  debugMemberProfile("7) 성공: 프로필 반환 — memberId:", memberDoc.id);
  logMemberRulesEvaluation("getMemberAppProfile", memberDoc.id, data);
  return profile;
}


export async function saveMemberCheckin(memberId, dateKey, data) {
  requireUid();
  const payload = clean(data);
  if (!Object.keys(payload).length) return { skipped: true };
  const ref = doc(db, "members", memberId, "memberCheckins", dateKey);
  await setDoc(ref, { ...payload, date: dateKey, updatedAt: serverTimestamp(), createdBy: auth.currentUser.uid }, { merge: true });
  // 걸음수 활동 기록은 saveMemberHealthInputs에서 처리한다 — 회원앱 저장 흐름상 항상 함께 호출되므로
  // 여기서도 기록하면 최근 활동 피드에 같은 입력이 중복으로 쌓인다.
  const activities = [];
  if (data.condition) {
    activities.push({ type: "condition", label: "컨디션", value: data.condition, dateKey });
  }
  if (data.painPart !== undefined) {
    const noPain = data.painPart === "없음";
    const value = noPain ? "통증 없음" : `${data.painPart}${data.painSide && data.painSide !== "해당 없음" ? " · " + data.painSide : ""} · VAS ${data.painVas ?? 0}`;
    activities.push({ type: "pain", label: "통증", value, dateKey });
  }
  await touchMemberActivities(memberId, activities);
  return { skipped: false };
}

export async function deleteMemberHealthRecord(memberId, dateKey) {
  requireUid();
  const batch = writeBatch(db);
  const checkRef = doc(db, "members", memberId, "memberCheckins", dateKey);
  batch.delete(checkRef);

  const bodyRef = doc(db, "members", memberId, "bodyCheck", "main");
  const bodySnap = await getDoc(bodyRef);
  if (bodySnap.exists()) {
    const current = bodySnap.data() || {};
    batch.set(bodyRef, {
      records: clean((current.records || []).filter(r => r.date !== dateKey && r.id !== `member_${dateKey}`)),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  const metaRef = doc(db, "members", memberId, "nutrition", "meta");
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists()) {
    const meta = metaSnap.data() || {};
    batch.set(metaRef, {
      logs: clean((meta.logs || []).filter(r => r.date !== dateKey && r.id !== dateKey)),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  batch.delete(doc(db, "members", memberId, "nutrition", dateKey));
  await batch.commit();
}

export async function getMemberCheckins(memberId, max = 30) {
  requireUid();
  const path = `members/${memberId}/memberCheckins`;
  dbLog("getMemberCheckins", "읽기 시작:", path);
  try {
    const snap = await getDocs(query(collection(db, "members", memberId, "memberCheckins"), orderBy("date", "desc"), limit(max)));
    dbLog("getMemberCheckins", `성공: ${snap.docs.length}건`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error("[DB:getMemberCheckins] read failed:", { path, collection: "memberCheckins", ...describeFirestoreError(e), memberId });
    throw e;
  }
}

export async function addMemberMessage(memberId, data) {
  requireUid();
  const ref = await addDoc(collection(db, "members", memberId, "memberMessages"), {
    ...clean(data), status: "new", createdAt: serverTimestamp(), createdBy: auth.currentUser.uid,
  });
  return { id: ref.id, ...data };
}

export async function getMemberMessages(memberId, max = 30) {
  requireUid();
  const path = `members/${memberId}/memberMessages`;
  dbLog("getMemberMessages", "읽기 시작:", path);
  try {
    const snap = await getDocs(query(collection(db, "members", memberId, "memberMessages"), orderBy("createdAt", "desc"), limit(max)));
    dbLog("getMemberMessages", `성공: ${snap.docs.length}건`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.error("[DB:getMemberMessages] read failed:", { path, collection: "memberMessages", ...describeFirestoreError(e), memberId });
    throw e;
  }
}


export async function getMemberOnboarding(memberId) {
  requireUid();
  const path = `members/${memberId}/memberOnboarding/main`;
  dbLog("getMemberOnboarding", "읽기 시작:", path);
  try {
    const snap = await getDoc(doc(db, "members", memberId, "memberOnboarding", "main"));
    dbLog("getMemberOnboarding", snap.exists() ? "성공: 문서 있음" : "성공: 문서 없음");
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch(e) {
    console.error("[DB:getMemberOnboarding] read failed:", { path, collection: "memberOnboarding", ...describeFirestoreError(e), memberId });
    throw e;
  }
}

const MEMBER_ONBOARDING_WRITABLE_FIELDS = new Set([
  "gender", "birthYear", "birthMonth", "birthDay", "birthYearMonth", "jobType", "averageWorkoutTime", "averageSteps", "focusAreas",
  "completed", "completedAt", "weightHistoryMode", "calorieHistoryMode",
  "weightHistoryModeStartedAt", "calorieHistoryModeStartedAt",
  "weightHistoryModeTransferredAt", "calorieHistoryModeTransferredAt",
  "weeklyWorkoutCount", "workoutFrequency", "goal", "heightCm", "height",
  "startingWeightKg", "startWeight", "currentWeightKg", "currentWeight", "weight",
  "targetWeight", "targetWeightKg", "targetPeriod", "targetPeriodCustom",
  "goalPeriod", "goalPeriodType", "goalDeadline", "targetDate", "customGoalDate",
  "agreedTermsAt", "agreedPrivacyAt", "restingHeartRate",
]);

function sanitizeMemberOnboardingPayload(data = {}) {
  const payload = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (!MEMBER_ONBOARDING_WRITABLE_FIELDS.has(key) || value === undefined) return;
    if (key === "focusAreas") {
      payload.focusAreas = Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : [];
      return;
    }
    payload[key] = value;
  });
  return clean(payload) || {};
}

export async function saveMemberOnboarding(memberId, data) {
  requireUid();
  const ref = doc(db, "members", memberId, "memberOnboarding", "main");
  const payload = sanitizeMemberOnboardingPayload(data);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  return { id: "main", ...payload };
}

// 온보딩 재진행 시 회원앱이 다시 채워 넣는 "온보딩 답변 미러" 필드만 초기화한다.
// 체중/식단/공지/수업일지/피드백 등 실제 기록(bodyCheck.records, nutrition, sessions, notices 등)은
// 별도 컬렉션·서브문서라 이 목록과 무관하며 절대 건드리지 않는다.
const ONBOARDING_PROFILE_ECHO_FIELDS = [
  "gender", "birthYear", "birthMonth", "birthDay", "birthYearMonth", "birthSource", "birth",
  "height", "weight", "startWeight", "currentWeight",
  "targetWeightKg", "targetWeight", "goalWeight",
  "targetPeriod", "targetPeriodCustom", "goalPeriod", "goalPeriodType", "goalDeadline", "targetDate", "customGoalDate",
  "workoutFrequency", "goal",
];

export async function resetMemberOnboarding(memberId) {
  requireUid();
  // 1) 온보딩 답변 문서 자체를 완전히 삭제 — completed/진행 단계/입력값이 merge로 남지 않도록 한다.
  //    (이전엔 {completed:false}만 merge해서 gender·height·체중·목표 등 기존 답변이 그대로 남아있었음)
  const onboardingRef = doc(db, "members", memberId, "memberOnboarding", "main");
  await deleteDoc(onboardingRef);

  // 2) 회원이 온보딩 이후 "내 정보" 화면에서 저장한 값이 members 문서에도 미러링돼 있어
  //    온보딩 답변을 지워도 이 값들이 다음 단계 기본값으로 자동 재입력되는 문제가 있었다.
  //    해당 온보딩 미러 필드만 지운다 — bodyCheck.records(체중 이력) 등 실제 기록은 그대로 유지된다.
  const memberRef = doc(db, "members", memberId);
  const patch = { updatedAt: serverTimestamp() };
  ONBOARDING_PROFILE_ECHO_FIELDS.forEach(f => { patch[f] = deleteField(); });
  await updateDoc(memberRef, patch);

  return { id: "main", completed: false, reset: true };
}

// ════════════════════════════════════════════════════
// 마이그레이션 — 기존 회원 이메일 정규화 (1회 실행용)
// ════════════════════════════════════════════════════
export async function migrateNormalizeMemberEmails() {
  const uid = requireUid();
  console.log("[EMAIL MIGRATION] 시작 — uid:", uid);

  let count = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const q = query(collection(db, "members"), where("trainerUid", "==", uid));
    const snap = await getDocs(q);
    console.log("[EMAIL MIGRATION] 조회된 문서 수:", snap.docs.length);

    const updates = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (typeof data.email !== "string" || !data.email) {
        skipped++;
        continue;
      }

      const normalizedEmail = data.email.trim().toLowerCase();
      if (normalizedEmail && normalizedEmail !== data.email) {
        updates.push({ ref: d.ref, email: normalizedEmail, name: data.name || d.id });
      } else {
        skipped++;
      }
    }

    if (updates.length > 0) {
      const batch = writeBatch(db);
      for (const u of updates) {
        batch.update(u.ref, { email: u.email, updatedAt: serverTimestamp() });
        console.log(`[EMAIL MIGRATION] 정규화 예정: ${u.name}`);
      }
      await batch.commit();
      count = updates.length;
      console.log(`[EMAIL MIGRATION] 완료: ${count}명 업데이트, ${skipped}명 스킵, 회원 인덱스 사용 안 함`);
    } else {
      console.log(`[EMAIL MIGRATION] 업데이트 없음. ${skipped}명 스킵`);
    }
  } catch(e) {
    console.error("[EMAIL MIGRATION] 오류:", e.message);
    errors++;
    throw new Error("이메일 정규화 오류: " + e.message);
  }

  return { count, skipped, errors };
}

// ════════════════════════════════════════════════════
// 마이그레이션 — 기존 회원에 trainerUid 추가 (1회만 실행)
// ════════════════════════════════════════════════════
export async function migrateAddTrainerUid() {
  const uid = requireUid();
  console.log("[MIGRATION] 시작 — uid:", uid);

  // 1. trainerUid 없는 문서 조회 (규칙에서 허용)
  // 2. trainerUid가 이미 내 uid인 문서 조회
  // 두 쿼리를 합쳐서 처리
  let count = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // 전체 members 컬렉션 조회 (규칙: trainerUid 없거나 내 uid인 것만 반환)
    const snap = await getDocs(collection(db, "members"));
    console.log("[MIGRATION] 조회된 문서 수:", snap.docs.length);

    const updates = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (!data.trainerUid) {
        // trainerUid 없음 → 내 uid 추가
        updates.push({ ref: d.ref, name: data.name || d.id });
      } else if (data.trainerUid === uid) {
        skipped++;
      }
    }

    // 배치로 업데이트
    if (updates.length > 0) {
      const batch = writeBatch(db);
      for (const u of updates) {
        batch.update(u.ref, { trainerUid: uid });
        console.log(`[MIGRATION] 추가 예정: ${u.name}`);
      }
      await batch.commit();
      count = updates.length;
      console.log(`[MIGRATION] 완료: ${count}명 업데이트, ${skipped}명 스킵`);
    } else {
      console.log(`[MIGRATION] 업데이트 없음. ${skipped}명 이미 정상`);
    }
  } catch(e) {
    console.error("[MIGRATION] 오류:", e.message);
    errors++;
    throw new Error("마이그레이션 오류: " + e.message);
  }

  return { count, skipped, errors };
}


// ════════════════════════════════════════════════════
// 대표 루틴 추천 / 오늘의 컨디셔닝
// ════════════════════════════════════════════════════
function getKoreaDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function isPublishedData(data = {}) {
  const sent = data.status === "published" || data.published === true || data.isPublished === true;
  return sent && data.visible !== false && data.visibility !== "hidden";
}

function normalizeRecommendation(data = {}) {
  const sent = data.status === "published" || data.published === true || data.isPublished === true;
  const visible = data.visible !== false && data.visibility !== "hidden";
  return { ...data, status: sent ? "published" : "draft", visibility: visible ? "visible" : "hidden", visible, published: sent, isPublished: sent, publishedAt: data.publishedAt || null };
}

export async function getRoutineRecommendations(memberId, { publishedOnly = false } = {}) {
  requireUid();
  const path = `members/${memberId}/routineRecommendations`;
  const baseRef = collection(db, "members", memberId, "routineRecommendations");
  const snap = await getDocs(publishedOnly ? query(baseRef, where("status", "==", "published")) : baseRef);
  const result = snap.docs.map(d => ({ id: d.id, ...normalizeRecommendation(d.data()) }))
    .filter(r => !publishedOnly || isPublishedData(r));
  return result
    .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")) || String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));
}

export async function saveRoutineRecommendation(memberId, recommendationId, data, publish = false) {
  await verifyMemberOwnership(memberId);
  const ref = recommendationId ? doc(db, "members", memberId, "routineRecommendations", recommendationId) : doc(collection(db, "members", memberId, "routineRecommendations"));
  const snap = recommendationId ? await getDoc(ref) : null;
  const status = publish ? "published" : (data.status === "published" ? "published" : "draft");
  const payload = clean({
    date: data.date || getKoreaDateString(),
    memberId,
    trainerUid: auth.currentUser?.uid || "",
    targetPart: data.targetPart || (Array.isArray(data.targetParts) ? data.targetParts.join(" + ") : ""),
    targetParts: Array.isArray(data.targetParts) ? data.targetParts : (data.targetPart ? [data.targetPart] : []),
    nextSessionPart: data.nextSessionPart || "",
    nextSessionDate: data.nextSessionDate || "",
    visibility: data.visibility === "hidden" || data.visible === false ? "hidden" : "visible",
    visible: !(data.visibility === "hidden" || data.visible === false),
    exercises: Array.isArray(data.exercises) ? data.exercises : [],
    coachComment: data.coachComment || "",
    status,
    published: status === "published",
    isPublished: status === "published",
    publishedAt: publish ? serverTimestamp() : (data.publishedAt || null),
    updatedAt: serverTimestamp(),
    ...(snap?.exists?.() ? {} : { createdAt: serverTimestamp() }),
  });
  const path = `members/${memberId}/routineRecommendations/${ref.id}`;
  await setDoc(ref, payload, { merge: true });
  const saved = await getDoc(ref);
  const savedData = normalizeRecommendation(saved.data() || {});
  if (publish && !isPublishedData(savedData)) throw new Error("전송 실패: 저장 경로 또는 권한을 확인해주세요.");
  return { id: ref.id, path, ...data, ...savedData };
}

export async function deleteRoutineRecommendation(memberId, recommendationId) {
  await verifyMemberOwnership(memberId);
  if (!recommendationId) throw new Error("삭제할 루틴 추천을 찾을 수 없습니다.");
  const ref = doc(db, "members", memberId, "routineRecommendations", recommendationId);
  await deleteDoc(ref);
  return { id: recommendationId, path: `members/${memberId}/routineRecommendations/${recommendationId}` };
}

export async function getDailyConditioning({ memberId = null, publishedOnly = false } = {}) {
  requireUid();
  const read = async (colPath, scope) => {
    try { const baseRef = collection(db, ...colPath); const snap = await getDocs(publishedOnly ? query(baseRef, where("status", "==", "published")) : baseRef); return snap.docs.map(d=>({ id:d.id, scope, ...normalizeRecommendation(d.data()) })); }
    catch(e){ if (process.env.NODE_ENV !== "production") console.warn("[DB:getDailyConditioning] read failed", scope, e?.code, e?.message); return []; }
  };
  const rows = [ ...(await read(["dailyConditioning"], "global")) ];
  if (memberId) rows.push(...(await read(["members", memberId, "dailyConditioning"], "member")));
  return rows.filter(r => !publishedOnly || isPublishedData(r)).sort((a,b)=>String(b.date||b.id||"").localeCompare(String(a.date||a.id||"")));
}

export async function saveDailyConditioning(data, { memberId = null, publish = false } = {}) {
  if (memberId) await verifyMemberOwnership(memberId); else requireUid();
  const date = data.date || getKoreaDateString();
  const ref = memberId ? doc(db, "members", memberId, "dailyConditioning", date) : doc(db, "dailyConditioning", date);
  const status = publish ? "published" : (data.status === "published" ? "published" : "draft");
  const payload = clean({
    date, memberId: memberId || null, trainerUid: auth.currentUser?.uid || "", scope: memberId ? "member" : "global",
    title: data.title || data.exerciseName || "오늘의 컨디셔닝", exerciseName: data.exerciseName || data.title || "",
    description: data.description || "", sets: data.sets || "", reps: data.reps || "", duration: data.duration || "", caution: data.caution || "",
    visibility: data.visibility === "hidden" || data.visible === false ? "hidden" : "visible", visible: !(data.visibility === "hidden" || data.visible === false),
    status, published: status === "published", isPublished: status === "published", publishedAt: publish ? serverTimestamp() : (data.publishedAt || null), updatedAt: serverTimestamp(), createdAt: data.createdAt || serverTimestamp(),
  });
  const path = memberId ? `members/${memberId}/dailyConditioning/${date}` : `dailyConditioning/${date}`;
  await setDoc(ref, payload, { merge: true });
  const saved = await getDoc(ref);
  const savedData = normalizeRecommendation(saved.data() || {});
  if (publish && !isPublishedData(savedData)) throw new Error("전송 실패: 저장 경로 또는 권한을 확인해주세요.");
  return { id: date, path, ...data, ...savedData };
}

export async function deleteDailyConditioning(item, { memberId = null } = {}) {
  requireUid();
  const id = item?.id || item?.date;
  if (!id) throw new Error("삭제할 컨디셔닝을 찾을 수 없습니다.");
  const isMemberScoped = item?.scope === "member" || !!item?.memberId;
  const targetMemberId = item?.memberId || memberId;
  if (isMemberScoped) {
    if (!targetMemberId) throw new Error("회원별 컨디셔닝 삭제에 필요한 회원 정보를 찾을 수 없습니다.");
    await verifyMemberOwnership(targetMemberId);
    await deleteDoc(doc(db, "members", targetMemberId, "dailyConditioning", id));
    return { id, path: `members/${targetMemberId}/dailyConditioning/${id}` };
  }
  await deleteDoc(doc(db, "dailyConditioning", id));
  return { id, path: `dailyConditioning/${id}` };
}

// ════════════════════════════════════════════════════
// private 마이그레이션 점검 (읽기 전용, 콘솔 출력)
// ════════════════════════════════════════════════════
export async function checkPrivateMigrationStatus() {
  const uid = requireUid();
  const STALE_FIELDS = ["memo", "ticketInfo", "trainerOnlyNote"];
  const q = query(collection(db, "members"), where("trainerUid", "==", uid));
  const snap = await getDocs(q);
  const stale = [];
  for (const d of snap.docs) {
    const data = d.data();
    const found = STALE_FIELDS.filter(f => f in data && data[f] !== undefined && data[f] !== null && data[f] !== "");
    if (found.length > 0) stale.push({ id: d.id, name: data.name || "(이름없음)", fields: found });
  }
  console.group("[TEO GYM] Private 마이그레이션 점검");
  if (stale.length === 0) {
    console.log(`✅ 전체 ${snap.docs.length}명 회원 — 민감 필드 마이그레이션 완료`);
  } else {
    console.warn(`⚠️  ${stale.length}/${snap.docs.length}명 회원 문서에 민감 필드 잔류:`);
    stale.forEach(m => console.warn(`  · ${m.name} (${m.id}): ${m.fields.join(", ")}`));
    console.warn("→ 관리자앱에서 해당 회원 [수정 → 저장]하면 자동 마이그레이션됩니다.");
  }
  console.groupEnd();
  return { total: snap.docs.length, staleCount: stale.length, stale };
}

// ════════════════════════════════════════════════════
// 2:1 수업 원본 (pairSessions)
// ════════════════════════════════════════════════════
export async function getPairSessions() {
  const uid = requireUid();
  // orderBy 제거: (trainerUid + updatedAt) 복합 인덱스 불필요, 클라이언트 정렬
  const q = query(
    collection(db, "pairSessions"),
    where("trainerUid", "==", uid),
    limit(200)
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function savePairSession(data, id = null) {
  const uid = requireUid();
  const payload = clean({
    trainerUid: uid,
    memberAId: data.memberAId || "",
    memberAName: data.memberAName || "",
    memberBId: data.memberBId || "",
    memberBName: data.memberBName || "",
    date: data.date || new Date().toISOString().slice(0, 10),
    status: data.status || "draft",
    // 업데이트 시 teamStatus 미제공이면 undefined → clean()이 제거 → Firestore 기존값 유지
    // 신규 생성 시 기본값 "active"는 addDoc 블록에서 별도 설정
    teamStatus: data.teamStatus || undefined,
    splitDone: data.splitDone || false,
    splitAt: data.splitAt || null,
    exercises: data.exercises || [],
    trainerCommentA: data.trainerCommentA || "",
    trainerCommentB: data.trainerCommentB || "",
    intensity: data.intensity || "중강도",
    updatedAt: serverTimestamp(),
  });
  if (id) {
    const ref = doc(db, "pairSessions", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("2:1 수업을 찾을 수 없습니다.");
    if (snap.data().trainerUid !== uid) throw new Error("권한이 없습니다.");
    await updateDoc(ref, payload);
    return { id, ...snap.data(), ...payload };
  }
  const newPayload = { ...payload, teamStatus: data.teamStatus || "active" };
  const ref = await addDoc(collection(db, "pairSessions"), {
    ...newPayload,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...newPayload };
}

export async function deletePairSession(id) {
  const uid = requireUid();
  const ref = doc(db, "pairSessions", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.data().trainerUid !== uid) throw new Error("권한이 없습니다.");
  await deleteDoc(ref);
}

export async function updatePairSessionStatus(id, teamStatus) {
  const uid = requireUid();
  const ref = doc(db, "pairSessions", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("2:1 수업을 찾을 수 없습니다.");
  if (snap.data().trainerUid !== uid) throw new Error("권한이 없습니다.");
  await updateDoc(ref, { teamStatus, updatedAt: serverTimestamp() });
}

export async function splitPairSession(pairSessionId, memberASessionData, memberBSessionData) {
  const uid = requireUid();
  const pairRef = doc(db, "pairSessions", pairSessionId);
  const pairSnap = await getDoc(pairRef);
  if (!pairSnap.exists()) throw new Error("2:1 수업을 찾을 수 없습니다.");
  const pairData = pairSnap.data();
  if (pairData.trainerUid !== uid) throw new Error("권한이 없습니다.");

  const aRef = await addDoc(
    collection(db, "members", memberASessionData.memberId, "sessions"),
    { ...clean(withSessionDefaults(memberASessionData)), createdAt: serverTimestamp() }
  );
  const bRef = await addDoc(
    collection(db, "members", memberBSessionData.memberId, "sessions"),
    { ...clean(withSessionDefaults(memberBSessionData)), createdAt: serverTimestamp() }
  );
  await updateDoc(pairRef, {
    splitDone: true,
    splitAt: serverTimestamp(),
    status: "completed",
    aSessionId: aRef.id,
    bSessionId: bRef.id,
    updatedAt: serverTimestamp(),
  });
  return { aSessionId: aRef.id, bSessionId: bRef.id };
}

// ════════════════════════════════════════════
// 출석 — members/{id}/attendance/{YYYY-MM-DD}
// ════════════════════════════════════════════
export async function saveAttendance(memberId, dateKey) {
  requireUid();
  const ref = doc(db, "members", memberId, "attendance", dateKey);
  const snap = await getDoc(ref);
  if (snap.exists()) return { duplicate: true };
  await setDoc(ref, {
    date: dateKey,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "memberApp",
  });
  return { duplicate: false };
}

export async function getAttendanceMonth(memberId, year, month) {
  requireUid();
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const snap = await getDocs(
    query(collection(db, "members", memberId, "attendance"),
      where("date", ">=", `${ym}-01`),
      where("date", "<=", `${ym}-31`),
    )
  );
  return snap.docs.map(d => d.data());
}

export async function getAttendanceRecent(memberId, days = 90) {
  requireUid();
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const snap = await getDocs(
    query(collection(db, "members", memberId, "attendance"),
      where("date", ">=", since),
      orderBy("date", "desc"),
      limit(100),
    )
  );
  return snap.docs.map(d => d.data());
}

// ════════════════════════════════════════════
// 유산소 기록 — members/{id}/cardioLogs/{logId}
// ════════════════════════════════════════════
export async function getCardioLogs(memberId, max = 60) {
  requireUid();
  const path = `members/${memberId}/cardioLogs`;
  dbLog("getCardioLogs", "읽기 시작:", path);
  try {
    const snap = await getDocs(query(collection(db, "members", memberId, "cardioLogs"), orderBy("date", "desc"), limit(max)));
    dbLog("getCardioLogs", `성공: ${snap.docs.length}건`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("[DB:getCardioLogs] read failed:", { path, collection: "cardioLogs", ...describeFirestoreError(e), memberId });
    throw e;
  }
}

export async function saveCardioLog(memberId, data, logId = null) {
  requireUid();
  const payload = clean(data);
  if (logId) {
    const ref = doc(db, "members", memberId, "cardioLogs", logId);
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return { id: logId, ...payload };
  }
  const ref = await addDoc(collection(db, "members", memberId, "cardioLogs"), {
    ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await touchMemberActivities(memberId, [{
    type: "cardio", label: "유산소",
    value: payload.durationMinutes ? `${payload.durationMinutes}분` : "기록됨",
    dateKey: payload.date,
  }]);
  return { id: ref.id, ...payload };
}

export async function deleteCardioLog(memberId, logId) {
  requireUid();
  await deleteDoc(doc(db, "members", memberId, "cardioLogs", logId));
}
