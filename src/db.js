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
  query, where, orderBy, serverTimestamp, getDoc, setDoc, writeBatch, limit,
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

// ── 디버그 로그 ──────────────────────────────────────
function dbLog(fn, ...args) {
  const uid = auth.currentUser?.uid || "none";
  console.log(`[DB:${fn}] uid=${uid}`, ...args);
}

function dbWarn(fn, ...args) {
  const uid = auth.currentUser?.uid || "none";
  console.warn(`[DB:${fn}] uid=${uid}`, ...args);
}

function describeFirestoreError(e) {
  return {
    code: e?.code || "unknown",
    message: e?.message || String(e),
    name: e?.name || "Error",
  };
}

function logMemberRulesEvaluation(fn, memberId, memberData) {
  const user = auth.currentUser;
  const uid = user?.uid || null;
  const authEmail = (user?.email || "").trim().toLowerCase();
  const memberEmail = (memberData?.email || "").trim().toLowerCase();
  const result = {
    path: `members/${memberId}`,
    authUid: uid,
    authEmail,
    trainerUid: memberData?.trainerUid || null,
    memberUid: memberData?.memberUid || null,
    memberEmail,
    trainerMatch: !!uid && memberData?.trainerUid === uid,
    memberUidMatch: !!uid && memberData?.memberUid === uid,
    emailMatch: !!authEmail && !!memberEmail && authEmail === memberEmail,
  };
  result.canAccessMember = result.trainerMatch || result.memberUidMatch || result.emailMatch;
  result.publishedSessionsRule = "trainerMatch OR (memberUidMatch/emailMatch AND sessions.isPublished == true)";
  result.bodyCheckRule = "trainerMatch OR memberUidMatch OR emailMatch";
  result.memberCheckinsRule = "trainerMatch OR memberUidMatch OR emailMatch";
  result.memberMessagesRule = "trainerMatch OR memberUidMatch OR emailMatch";
  result.memberOnboardingRule = "현재 firestore.rules의 wildcard 때문에 trainerMatch만 허용";
  dbLog(fn, "Firestore Rules 평가(클라이언트 추정):", result);
  return result;
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
  dbLog("getMembers", `결과: ${snap.docs.length}명`);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addMember(data) {
  const uid = requireUid();
  dbLog("addMember", data.name);
  const payload = {
    ...clean(normalizeMemberData(data)),
    trainerUid: uid,
    createdAt:  serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "members"), payload);
  dbLog("addMember", `생성 완료: ${ref.id}`);
  return { id: ref.id, ...data, trainerUid: uid };
}

export async function updateMember(id, data) {
  const uid = requireUid();
  dbLog("updateMember", id);
  const snap = await getDoc(doc(db, "members", id));
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  const before = snap.data();
  if (before.trainerUid !== uid) throw new Error("권한이 없습니다.");
  const normalized = clean(normalizeMemberData(data));
  const beforeEmail = (before.email || "").trim().toLowerCase();
  const nextEmail = typeof normalized.email === "string" ? normalized.email : beforeEmail;
  if (before.memberUid && nextEmail && beforeEmail && nextEmail !== beforeEmail && normalized.memberUid === undefined) {
    normalized.memberUid = "";
    normalized.memberUidUnlinkedAt = new Date().toISOString();
    normalized.memberUidUnlinkReason = "member-email-changed";
  }
  await updateDoc(doc(db, "members", id), {
    ...normalized,
    trainerUid: uid,
    updatedAt:  serverTimestamp(),
  });
  dbLog("updateMember", "완료");
}

export async function deleteMember(id) {
  const uid = requireUid();
  dbLog("deleteMember", id);
  const snap = await getDoc(doc(db, "members", id));
  if (!snap.exists()) throw new Error("회원을 찾을 수 없습니다.");
  if (snap.data().trainerUid !== uid) throw new Error("권한이 없습니다.");
  const [sessSnap, nutSnap, bcSnap, assSnap] = await Promise.all([
    getDocs(collection(db, "members", id, "sessions")),
    getDocs(collection(db, "members", id, "nutrition")),
    getDocs(collection(db, "members", id, "bodyCheck")),
    getDocs(collection(db, "members", id, "assessments")),
  ]);
  await Promise.all([
    ...sessSnap.docs.map(d => deleteDoc(d.ref)),
    ...nutSnap.docs.map(d => deleteDoc(d.ref)),
    ...bcSnap.docs.map(d => deleteDoc(d.ref)),
    ...assSnap.docs.map(d => deleteDoc(d.ref)),
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
    console.error(`[DB] 권한 위반: memberId=${memberId} trainerUid=${snap.data().trainerUid} myUid=${uid}`);
    throw new Error("이 회원에 대한 권한이 없습니다.");
  }
  return uid;
}

// ════════════════════════════════════════════════════
// 수업 일지 (sessions)
// ════════════════════════════════════════════════════
const SESSION_PUBLIC_FIELDS = new Set(["name", "sets", "feedback", "muscleTop", "muscleSub", "equipment", "movementPurpose", "funcCategory", "funcBodyPart", "funcTool"]);

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
    isPublished: true,
    status: "published",
    publishedAt: data.publishedAt || null,
  };
}

export async function getSessions(memberId) {
  requireUid();
  dbLog("getSessions", `memberId=${memberId}`);
  const q    = query(
    collection(db, "members", memberId, "sessions"),
    orderBy("sessionNo", "asc")
  );
  const snap = await getDocs(q);
  dbLog("getSessions", `결과: ${snap.docs.length}개`);
  return snap.docs.map(d => ({ id: d.id, ...normalizeSessionForRead(d.data()) }));
}

export async function getPublishedSessions(memberId) {
  requireUid();
  const path = `members/${memberId}/sessions`;
  dbLog("getPublishedSessions", "읽기 시작:", path, "where isPublished == true");
  try {
    const q = query(
      collection(db, "members", memberId, "sessions"),
      where("isPublished", "==", true),
      orderBy("sessionNo", "asc")
    );
    const snap = await getDocs(q);
    dbLog("getPublishedSessions", `결과: ${snap.docs.length}개`);
    return snap.docs.map(d => publicSession({ id: d.id, ...normalizeSessionForRead(d.data()) }));
  } catch(e) {
    console.error("[DB:getPublishedSessions] read failed:", { path, collection: "sessions", ...describeFirestoreError(e), memberId });
    throw e;
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

export async function publishSession(memberId, sessionId) {
  await verifyMemberOwnership(memberId);
  dbLog("publishSession", `memberId=${memberId} sessionId=${sessionId}`);
  await updateDoc(doc(db, "members", memberId, "sessions", sessionId), {
    status: "published",
    isPublished: true,
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  dbLog("publishSession", "완료");
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
    await verifyMemberOwnership(memberId);
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
        updatedAt:   serverTimestamp(),
      });
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
  await updateDoc(doc(db, "members", memberId), {
    memberUid: uid,
    memberUidLinkedAt: serverTimestamp(),
    memberUidLinkedBy: uid,
    memberUidPrevious: previousMemberUid || "",
  });
  dbLog("linkMemberUidToCurrentUser", `members/${memberId} -> ${uid}`);
}

export async function getMemberAppProfile() {
  const uid = requireUid();
  const authEmail = (auth.currentUser?.email || "").trim().toLowerCase();
  dbLog("getMemberAppProfile", "1) Firebase Auth UID:", uid, "email:", authEmail);

  const toMember = (docSnap) => ({ id: docSnap.id, ...docSnap.data() });
  const diagnostics = {
    authUid: uid,
    authEmail,
    memberUidMatches: [],
    emailMatches: [],
    queryErrors: {},
    matchedMemberId: null,
    matchedBy: "none",
  };

  const readAll = async (q, key, label) => {
    dbLog("getMemberAppProfile", `읽기 시작: ${label}`);
    try {
      const snap = await getDocs(q);
      const rows = snap.docs.map(toMember);
      diagnostics[key] = rows;
      dbLog("getMemberAppProfile", `${label} 성공: ${rows.length}건`);
      return rows;
    } catch (e) {
      const details = { path: label, ...describeFirestoreError(e), authUid: uid, authEmail };
      diagnostics.queryErrors[key] = details;
      console.error("[DB:getMemberAppProfile] diagnostic query failed:", details);
      return [];
    }
  };

  const memberUidMatches = await readAll(
    query(collection(db, "members"), where("memberUid", "==", uid)),
    "memberUidMatches",
    "members where memberUid == auth.uid"
  );
  const emailMatches = authEmail ? await readAll(
    query(collection(db, "members"), where("email", "==", authEmail)),
    "emailMatches",
    "members where email == auth.email"
  ) : [];

  let profile = memberUidMatches[0] || emailMatches[0] || null;
  diagnostics.matchedMemberId = profile?.id || null;
  diagnostics.matchedBy = memberUidMatches[0] ? "memberUid" : (emailMatches[0] ? "email" : "none");

  if (profile) {
    profile = { ...profile, _matchedBy: diagnostics.matchedBy, _diagnostics: diagnostics };
    dbLog("getMemberAppProfile", "2) 최종 매칭 기준:", diagnostics.matchedBy);
    dbLog("getMemberAppProfile", "3) 최종 members.memberUid:", profile.memberUid || null);
    logMemberRulesEvaluation("getMemberAppProfile", profile.id, profile);
    return profile;
  }

  dbWarn("getMemberAppProfile", "현재 Auth UID 또는 이메일과 일치하는 회원 문서를 찾지 못했습니다.", { authUid: uid, authEmail, diagnostics });
  const err = new Error("현재 로그인 UID 또는 이메일과 일치하는 회원 문서를 찾을 수 없습니다.");
  err.code = Object.keys(diagnostics.queryErrors).length ? "member/query-failed" : "member/not-found";
  err.memberAppDetails = { code: err.code, path: "members diagnostic queries", ...diagnostics };
  throw err;
}


export async function saveMemberCheckin(memberId, dateKey, data) {
  requireUid();
  const ref = doc(db, "members", memberId, "memberCheckins", dateKey);
  await setDoc(ref, { ...clean(data), date: dateKey, updatedAt: serverTimestamp(), createdBy: auth.currentUser.uid }, { merge: true });
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

export async function saveMemberOnboarding(memberId, data) {
  requireUid();
  const ref = doc(db, "members", memberId, "memberOnboarding", "main");
  await setDoc(ref, { ...clean(data), updatedAt: serverTimestamp() }, { merge: true });
  return { id: "main", ...data };
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
