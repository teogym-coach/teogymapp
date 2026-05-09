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
  query, where, orderBy, serverTimestamp, getDoc, setDoc, writeBatch,
} from "firebase/firestore";
import { db, auth } from "./firebase-config";

// ── 현재 트레이너 uid (없으면 throw) ─────────────────
function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return uid;
}

// ── undefined 제거 + Firestore 특수 객체 보존 ──────
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
    ...clean(data),
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
  if (snap.data().trainerUid !== uid) throw new Error("권한이 없습니다.");
  await updateDoc(doc(db, "members", id), {
    ...clean(data),
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
  const [sessSnap, nutSnap, bcSnap] = await Promise.all([
    getDocs(collection(db, "members", id, "sessions")),
    getDocs(collection(db, "members", id, "nutrition")),
    getDocs(collection(db, "members", id, "bodyCheck")),
  ]);
  await Promise.all([
    ...sessSnap.docs.map(d => deleteDoc(d.ref)),
    ...nutSnap.docs.map(d => deleteDoc(d.ref)),
    ...bcSnap.docs.map(d => deleteDoc(d.ref)),
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
export async function getSessions(memberId) {
  requireUid();
  dbLog("getSessions", `memberId=${memberId}`);
  const q    = query(
    collection(db, "members", memberId, "sessions"),
    orderBy("sessionNo", "asc")
  );
  const snap = await getDocs(q);
  dbLog("getSessions", `결과: ${snap.docs.length}개`);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addSession(memberId, data) {
  await verifyMemberOwnership(memberId);
  dbLog("addSession", `memberId=${memberId} sessionNo=${data.sessionNo}`);
  const ref = await addDoc(
    collection(db, "members", memberId, "sessions"),
    { ...clean(data), createdAt: serverTimestamp() }
  );
  dbLog("addSession", `완료: ${ref.id}`);
  return { id: ref.id, ...data };
}

export async function updateSession(memberId, sessionId, data) {
  await verifyMemberOwnership(memberId);
  dbLog("updateSession", `memberId=${memberId} sessionId=${sessionId}`);
  await updateDoc(
    doc(db, "members", memberId, "sessions", sessionId),
    { ...clean(data), updatedAt: serverTimestamp() }
  );
  dbLog("updateSession", "완료");
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
    console.error("[DB] getBodyCheck error:", e.message, `memberId=${memberId}`);
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
    dbLog("getNutrition", `완료: dates=${Object.keys(dates).length}일`);
    return { goal: meta.goal || "체중 감량", favFoods: meta.favFoods || [], dates };
  } catch(e) {
    console.error("[DB] getNutrition error:", e.message, `memberId=${memberId}`);
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
    dbLog("saveNutrition", `완료: dates=${Object.keys(dates).length}일`);
  } catch(e) {
    console.error("[DB] saveNutrition error:", e.message, `memberId=${memberId}`);
    throw new Error("영양 관리 저장 실패: " + e.message);
  }
}

// ════════════════════════════════════════════════════
// 마이그레이션 — 기존 회원에 trainerUid 추가 (1회만 실행)
// ════════════════════════════════════════════════════
export async function migrateAddTrainerUid() {
  const uid = requireUid();
  console.log("[MIGRATION] trainerUid 추가 시작, uid:", uid);
  const snap = await getDocs(collection(db, "members"));
  let count = 0;
  for (const d of snap.docs) {
    if (!d.data().trainerUid) {
      await updateDoc(d.ref, { trainerUid: uid });
      console.log(`[MIGRATION] ${d.id} (${d.data().name}) → trainerUid 추가`);
      count++;
    }
  }
  console.log(`[MIGRATION] 완료: ${count}개 문서 업데이트`);
  return count;
}
