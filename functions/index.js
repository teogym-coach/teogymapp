const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const FIREBASE_PROJECT_ID = "teocoach-a7fa0";
const DEPLOYMENT_REVISION =
  process.env.K_REVISION ||
  process.env.FUNCTION_TARGET ||
  process.env.GCLOUD_PROJECT ||
  "local";

admin.initializeApp({
  projectId: FIREBASE_PROJECT_ID,
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildMemberAppIndexPayload(memberId, memberData, memberUid, actorUid) {
  const email = normalizeEmail(memberData.email || memberData.memberAppAccountEmail);
  const payload = {
    memberId,
    memberUid,
    trainerUid: memberData.trainerUid || actorUid || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
    linkedBy: actorUid || "",
  };
  if (email) payload.email = email;
  return payload;
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
    console.error("[reconnectMemberUidByEmail] admin.auth().getUserByEmail failed", {
      code: error?.code || "unknown",
      message: error?.message || String(error),
      stack: error?.stack || null,
      email,
      memberId,
      projectId: FIREBASE_PROJECT_ID,
    });
    const details = {
      code: error?.code || "unknown",
      message: error?.message || String(error),
      email,
      memberId,
      projectId: FIREBASE_PROJECT_ID,
      authUidLookupSucceeded: false,
      membersMemberUidSaved: false,
    };
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Firebase Authentication 사용자를 찾을 수 없습니다.", details);
    }
    throw new HttpsError("internal", "Firebase Authentication UID 조회에 실패했습니다.", details);
  }

  const previousMemberUid = data.memberUid || "";
  const uid = userRecord.uid;
  try {
    const batch = admin.firestore().batch();

    // 1) members 문서 업데이트
    batch.update(ref, {
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

    // 2) memberAppIndex/{uid} 인덱스 문서 저장
    const indexRef = admin.firestore().collection("memberAppIndex").doc(uid);
    batch.set(indexRef, {
      memberId,
      email,
      memberUid: uid,
      trainerUid: data.trainerUid || request.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      linkedBy: request.auth.uid,
    }, { merge: true });

    await batch.commit();
    console.log("[reconnectMemberUidByEmail] members + memberAppIndex 저장 완료", { memberId, uid, email });
  } catch (error) {
    console.error("[reconnectMemberUidByEmail] members.memberUid update failed", {
      code: error?.code || "unknown",
      message: error?.message || String(error),
      stack: error?.stack || null,
      email,
      memberId,
      uid,
      projectId: FIREBASE_PROJECT_ID,
    });
    throw new HttpsError("internal", "members.memberUid 저장에 실패했습니다.", {
      code: error?.code || "unknown",
      message: error?.message || String(error),
      email,
      memberId,
      projectId: FIREBASE_PROJECT_ID,
      authUidLookupSucceeded: true,
      authUid: uid,
      memberUid: uid,
      membersMemberUidSaved: false,
    });
  }

  return { ok: true, authUid: uid, memberUid: uid, previousMemberUid, email, memberId, projectId: FIREBASE_PROJECT_ID, authUidLookupSucceeded: true, membersMemberUidSaved: true };
});


function describeFunctionError(error) {
  return {
    code: error?.code || "unknown",
    message: error?.message || String(error),
    stack: error?.stack || null,
    name: error?.name || null,
  };
}

exports.createMemberAppIndexForMember = onCall({ region: "us-central1" }, async (request) => {
  const functionName = "createMemberAppIndexForMember";
  let memberId = null;
  let actorUid = null;
  let memberUid = null;
  let memberData = null;
  let writePath = "memberAppIndex/(not-resolved)";

  try {
    memberId = String(request.data?.memberId || "").trim();
    const requestedMemberUid = String(request.data?.memberUid || "").trim();
    actorUid = request.auth?.uid || null;
    console.log(`[${functionName}] 시작`, {
      functionName,
      authUid: actorUid,
      memberId,
      requestedMemberUid,
      projectId: FIREBASE_PROJECT_ID,
      region: "us-central1",
      deploymentRevision: DEPLOYMENT_REVISION,
    });

    if (!memberId) throw new HttpsError("invalid-argument", "memberId가 필요합니다.");

    const { ref, data } = await assertTrainerOwnsMember(memberId, actorUid);
    memberData = data || {};
    memberUid = String(memberData.memberUid || "").trim();
    writePath = memberUid ? `memberAppIndex/${memberUid}` : "memberAppIndex/(missing-memberUid)";

    console.log("[createMemberAppIndexForMember] memberId", memberId);
    console.log("[createMemberAppIndexForMember] memberUid", memberUid);
    console.log("[createMemberAppIndexForMember] memberData", memberData);
    console.log("[createMemberAppIndexForMember] 요청", {
      functionName,
      authUid: actorUid,
      memberId,
      memberUid,
      writePath,
      trainerUid: memberData.trainerUid || null,
      projectId: FIREBASE_PROJECT_ID,
      region: "us-central1",
      deploymentRevision: DEPLOYMENT_REVISION,
    });

    if (!memberUid) {
      throw new HttpsError("failed-precondition", "memberUid가 있는 회원만 memberAppIndex를 생성할 수 있습니다.", {
        functionName,
        memberId,
        memberUid,
        memberData,
        writePath,
        projectId: FIREBASE_PROJECT_ID,
        region: "us-central1",
        deploymentRevision: DEPLOYMENT_REVISION,
      });
    }

    if (requestedMemberUid && requestedMemberUid !== memberUid) {
      throw new HttpsError("failed-precondition", "요청 UID와 members.memberUid가 일치하지 않습니다. 최신 회원 정보를 새로고침한 뒤 다시 시도해주세요.", {
        functionName,
        memberId,
        requestedMemberUid,
        memberUid,
        writePath,
        projectId: FIREBASE_PROJECT_ID,
        region: "us-central1",
        deploymentRevision: DEPLOYMENT_REVISION,
      });
    }

    const payload = buildMemberAppIndexPayload(memberId, memberData, memberUid, actorUid);
    console.log("[createMemberAppIndexForMember] memberAppIndex set 직전", {
      functionName,
      path: writePath,
      memberId,
      memberUid,
      payload,
      projectId: FIREBASE_PROJECT_ID,
      region: "us-central1",
      deploymentRevision: DEPLOYMENT_REVISION,
    });

    const batch = admin.firestore().batch();
    batch.set(admin.firestore().collection("memberAppIndex").doc(memberUid), payload, { merge: true });
    batch.set(ref, {
      memberAppAccountStatus: "available",
      memberAppIndexPath: writePath,
      memberAppIndexUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      memberAppLastInviteLog: {
        ok: true,
        code: "MEMBER_APP_INDEX_CREATED",
        uid: memberUid,
        path: writePath,
        at: new Date().toISOString(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    console.log("[createMemberAppIndexForMember] 저장 완료", { functionName, authUid: actorUid, memberId, memberUid, writePath, projectId: FIREBASE_PROJECT_ID, region: "us-central1", deploymentRevision: DEPLOYMENT_REVISION });
    return { ok: true, memberId, memberUid, writePath, functionName, projectId: FIREBASE_PROJECT_ID, region: "us-central1", deploymentRevision: DEPLOYMENT_REVISION };
  } catch (error) {
    const original = describeFunctionError(error);
    console.error(error);
    console.error(error?.stack);
    console.error("[createMemberAppIndexForMember] 실패", {
      functionName,
      ...original,
      authUid: actorUid,
      memberId,
      memberUid,
      memberData,
      writePath,
      projectId: FIREBASE_PROJECT_ID,
      region: "us-central1",
      deploymentRevision: DEPLOYMENT_REVISION,
    });

    const details = {
      functionName,
      originalCode: original.code,
      originalMessage: original.message,
      originalStack: original.stack,
      errorName: original.name,
      memberId,
      memberUid,
      memberData,
      writePath,
      projectId: FIREBASE_PROJECT_ID,
      region: "us-central1",
      deploymentRevision: DEPLOYMENT_REVISION,
    };

    if (error instanceof HttpsError) {
      throw new HttpsError(error.code, error.message, { ...(error.details || {}), ...details });
    }

    throw new HttpsError("internal", original.message || "memberAppIndex 저장에 실패했습니다.", details);
  }
});
