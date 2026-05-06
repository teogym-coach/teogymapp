// ═══════════════════════════════════════════════════
//  데이터 레이어 — Firebase Firestore
//
//  컬렉션 구조:
//    /members/{id}                   ← 회원
//    /members/{id}/sessions/{id}     ← 수업 일지 (서브컬렉션)
// ═══════════════════════════════════════════════════
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, getDoc, setDoc,
} from "firebase/firestore";
import { db, auth } from "./firebase-config";

// ── 회원 ─────────────────────────────────────────
export async function getMembers() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q   = query(collection(db, "members"), where("trainerUid","==",uid), orderBy("createdAt","desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addMember(data) {
  const uid = auth.currentUser?.uid;
  const ref = await addDoc(collection(db, "members"), {
    ...data,
    trainerUid: uid,
    createdAt:  serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateMember(id, data) {
  await updateDoc(doc(db, "members", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMember(id) {
  // 서브컬렉션(sessions) 먼저 삭제
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
    ...data,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateSession(memberId, sessionId, data) {
  await updateDoc(doc(db, "members", memberId, "sessions", sessionId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSession(memberId, sessionId) {
  await deleteDoc(doc(db, "members", memberId, "sessions", sessionId));
}

// ── 바디 체크 ─────────────────────────────────
export async function getBodyCheck(memberId) {
  try {
    const ref  = doc(db, "members", memberId, "bodyCheck", "main");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function saveBodyCheck(memberId, data) {
  const ref = doc(db, "members", memberId, "bodyCheck", "main");
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

// ── 영양 관리 ─────────────────────────────────
export async function getNutrition(memberId) {
  try {
    const ref  = doc(db, "members", memberId, "nutrition", "main");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function saveNutrition(memberId, data) {
  const ref = doc(db, "members", memberId, "nutrition", "main");
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
}
