// ═══════════════════════════════════════════════════
//  데이터 레이어 — Firebase Firestore
//
//  컬렉션 구조:
//    /members/{id}                        ← 회원
//    /members/{id}/sessions/{id}          ← 수업 일지
//    /members/{id}/bodyCheck/main         ← 바디체크
//    /members/{id}/nutrition/meta         ← 영양 메타 (목표, 즐겨찾기)
//    /members/{id}/nutrition/{YYYY-MM-DD} ← 날짜별 식단 (크기 분산)
// ═══════════════════════════════════════════════════
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, getDoc, setDoc, writeBatch,
} from "firebase/firestore";
import { db, auth } from "./firebase-config";

// ── undefined/null 제거 — Firestore 저장 전 반드시 실행 ──
function clean(obj) {
  if (Array.isArray(obj)) {
    return obj.map(clean).filter(v => v !== undefined && v !== null);
  }
  if (obj !== null && typeof obj === "object" && typeof obj.toDate !== "function") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const c = clean(v);
      if (c !== undefined && c !== null) out[k] = c;
    }
    return out;
  }
  return obj;
}

// ── 회원 ─────────────────────────────────────────
export async function getMembers() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q    = query(collection(db, "members"), where("trainerUid","==",uid), orderBy("createdAt","desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addMember(data) {
  const uid = auth.currentUser?.uid;
  const ref = await addDoc(collection(db, "members"), {
    ...clean(data), trainerUid: uid, createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateMember(id, data) {
  await updateDoc(doc(db, "members", id), { ...clean(data), updatedAt: serverTimestamp() });
}

export async function deleteMember(id) {
  const snap = await getDocs(collection(db, "members", id, "sessions"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "members", id));
}

// ── 수업 일지 ─────────────────────────────────────
export async function getSessions(memberId) {
  const q    = query(collection(db, "members", memberId, "sessions"), orderBy("sessionNo","asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addSession(memberId, data) {
  const ref = await addDoc(collection(db, "members", memberId, "sessions"), {
    ...clean(data), createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateSession(memberId, sessionId, data) {
  await updateDoc(doc(db, "members", memberId, "sessions", sessionId), {
    ...clean(data), updatedAt: serverTimestamp(),
  });
}

export async function deleteSession(memberId, sessionId) {
  await deleteDoc(doc(db, "members", memberId, "sessions", sessionId));
}

// ── 바디 체크 ──────────────────────────────────────
export async function getBodyCheck(memberId) {
  try {
    const ref  = doc(db, "members", memberId, "bodyCheck", "main");
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    return { goal: d.goal || {}, records: d.records || [], inbody: d.inbody || [] };
  } catch(e) {
    console.error("getBodyCheck error:", e.message);
    return null;
  }
}

export async function saveBodyCheck(memberId, data) {
  try {
    const ref = doc(db, "members", memberId, "bodyCheck", "main");
    await setDoc(ref, clean({
      goal:      data.goal    || {},
      records:   data.records || [],
      inbody:    data.inbody  || [],
      updatedAt: serverTimestamp(),
    }));
  } catch(e) {
    console.error("saveBodyCheck error:", e.message);
    throw new Error("바디체크 저장 실패: " + e.message);
  }
}

// ── 영양 관리 ──────────────────────────────────────
// meta 문서 = goal + favFoods
// 날짜 문서 = /nutrition/YYYY-MM-DD → meals + supplements
// 날짜별로 분리하여 문서 크기 한계(1MB) 문제 방지

export async function getNutrition(memberId) {
  try {
    const metaRef  = doc(db, "members", memberId, "nutrition", "meta");
    const metaSnap = await getDoc(metaRef);
    const meta     = metaSnap.exists() ? metaSnap.data() : {};

    const nutSnap  = await getDocs(collection(db, "members", memberId, "nutrition"));
    const dates    = {};
    nutSnap.docs.forEach(d => {
      if (d.id !== "meta") dates[d.id] = d.data();
    });

    return { goal: meta.goal || "체중 감량", favFoods: meta.favFoods || [], dates };
  } catch(e) {
    console.error("getNutrition error:", e.message);
    return null;
  }
}

export async function saveNutrition(memberId, data) {
  try {
    const batch   = writeBatch(db);
    const metaRef = doc(db, "members", memberId, "nutrition", "meta");
    batch.set(metaRef, clean({
      goal: data.goal || "체중 감량", favFoods: data.favFoods || [], updatedAt: serverTimestamp(),
    }));
    const dates = data.dates || {};
    Object.entries(dates).forEach(([dateKey, dayData]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
      const dateRef = doc(db, "members", memberId, "nutrition", dateKey);
      batch.set(dateRef, clean({
        meals: dayData.meals || {}, supplements: dayData.supplements || [], updatedAt: serverTimestamp(),
      }));
    });
    await batch.commit();
  } catch(e) {
    console.error("saveNutrition error:", e.message);
    throw new Error("영양 관리 저장 실패: " + e.message);
  }
}
