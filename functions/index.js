const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function assertTrainerOwnsMember(memberId, trainerUid) {
  if (!trainerUid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const ref = admin.firestore().collection("members").doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "회원 문서를 찾을 수 없습니다.");
  const data = snap.data() || {};
  if (data.trainerUid !== trainerUid) throw new HttpsError("permission-denied", "회원 문서를 수정할 권한이 없습니다.");
  return { ref, data };
}

exports.reconnectMemberUidByEmail = onCall({ region: "us-central1" }, async (request) => {
  const memberId = String(request.data?.memberId || "").trim();
  const requestedEmail = normalizeEmail(request.data?.email);
  if (!memberId) throw new HttpsError("invalid-argument", "memberId가 필요합니다.");
  const { ref, data } = await assertTrainerOwnsMember(memberId, request.auth?.uid);
  const memberEmail = normalizeEmail(data.email);
  const email = requestedEmail || memberEmail;
  if (!email) throw new HttpsError("invalid-argument", "회원 이메일이 필요합니다.");
  if (memberEmail && email !== memberEmail) throw new HttpsError("invalid-argument", "요청 이메일이 회원 문서 이메일과 일치하지 않습니다.");

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Firebase Authentication 사용자를 찾을 수 없습니다.", { email });
    }
    throw new HttpsError("internal", "Firebase Authentication UID 조회에 실패했습니다.", { code: error?.code || "unknown" });
  }

  const previousMemberUid = data.memberUid || "";
  const uid = userRecord.uid;
  await ref.update({
    memberUid: uid,
    memberUidLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
    memberUidLinkedBy: request.auth.uid,
    memberUidPrevious: previousMemberUid,
    memberAppAccountEmail: email,
    memberAppAccountStatus: "available",
    memberAppUidReconnectRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    memberAppLastInviteLog: { ok: true, code: "ADMIN_AUTH_UID_LINKED", uid, email, at: new Date().toISOString() },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, authUid: uid, memberUid: uid, previousMemberUid, email, memberId };
});
