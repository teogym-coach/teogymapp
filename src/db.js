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

// ── undefined 제거 + Firestore 특수 객체 보존 ──────
// serverTimestamp() / Timestamp / FieldValue 는 그대로 통과
function clean(obj) {
  if (obj === undefined) return undefined;
  if (obj === null)      return undefined; // null도 제거

  // Firestore 특수 객체 (Timestamp, FieldValue, GeoPoint 등) → 그대로 반환
  if (typeof obj === "object" && (
    typeof obj.toDate    === "function" || // Timestamp
    typeof obj.isEqual   === "function" || // FieldValue / GeoPoint
    typeof obj.toMillis  === "function"    // Timestamp (v9)
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

  return obj; // string, number, boolean
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
    // Timestamp 등 Firestore 특수 객체 제거 후 순수 JS 객체로 반환
    return {
      goal:    d.goal    || {},
      records: (d.records || []).map(r => ({ ...r })),
      inbody:  (d.inbody  || []).map(r => ({ ...r })),
    };
  } catch(e) {
    console.error("getBodyCheck error:", e.message);
    return null;
  }
}

export async function saveBodyCheck(memberId, data) {
  try {
    const ref     = doc(db, "members", memberId, "bodyCheck", "main");
    const payload = {
      goal:      clean(data.goal)    || {},
      records:   clean(data.records) || [],
      inbody:    clean(data.inbody)  || [],
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    // 저장 후 다시 읽어서 깨끗한 데이터 반환
    const saved = await getDoc(ref);
    const d = saved.data();
    return {
      goal:    d.goal    || {},
      records: (d.records || []).map(r => ({ ...r })),
      inbody:  (d.inbody  || []).map(r => ({ ...r })),
    };
  } catch(e) {
    console.error("saveBodyCheck error:", e.message);
    throw new Error("바디체크 저장 실패: " + e.message);
  }
}

// ── 영양 관리 ──────────────────────────────────────
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
  } catch(e) {
    console.error("saveNutrition error:", e.message);
    throw new Error("영양 관리 저장 실패: " + e.message);
  }
}
