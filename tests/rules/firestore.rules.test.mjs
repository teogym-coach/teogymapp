/**
 * TEO GYM — Firestore Security Rules Unit Tests
 * 대상: firestore.rules v8
 * 실행: npm run test:rules
 *
 * 테스트 커버리지:
 *   - members 컬렉션 (get/list/create/update/delete)
 *   - sessions / memberFeedback
 *   - memberCheckins / memberMessages
 *   - attendance / readSessions / noticeReads
 *   - bodyCheck / nutrition / memberOnboarding
 *   - pairSessions / notices / dailyConditioning
 *   - 진행중/휴식중/종료/상태없음 접근 분리
 *   - 다른 회원 데이터 접근 차단
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 설정 ──────────────────────────────────────────────
const PROJECT_ID = "teocoach-a7fa0";
const RULES_PATH = resolve(__dirname, "../../firestore.rules");

const TRAINER_UID  = "trainer_uid_abc";
const MEMBER_A_UID = "member_a_uid_xyz";
const MEMBER_B_UID = "member_b_uid_xyz";
const STRANGER_UID = "stranger_uid_xyz";

// 테스트용 회원 문서 템플릿
const memberActive  = { name: "회원A", trainerUid: TRAINER_UID, memberUid: MEMBER_A_UID, email: "a@test.com", status: "active" };
const memberPaused  = { name: "회원P", trainerUid: TRAINER_UID, memberUid: "paused_uid", email: "p@test.com", status: "paused" };
const memberEnded   = { name: "회원E", trainerUid: TRAINER_UID, memberUid: "ended_uid",  email: "e@test.com", status: "ended"  };
const memberNoStatus= { name: "회원N", trainerUid: TRAINER_UID, memberUid: "nostatus_uid", email: "n@test.com" };
const memberB       = { name: "회원B", trainerUid: TRAINER_UID, memberUid: MEMBER_B_UID, email: "b@test.com", status: "active" };
const memberOther   = { name: "타헬스장회원", trainerUid: "other_trainer", memberUid: "other_member_uid", email: "other@test.com", status: "active" };

// ── 헬퍼 ──────────────────────────────────────────────
function asUser(env, uid) {
  return env.authenticatedContext(uid).firestore();
}
function asAnon(env) {
  return env.unauthenticatedContext().firestore();
}

// ── 메인 ──────────────────────────────────────────────
describe("TEO GYM Firestore Rules v8", function () {
  this.timeout(30000);
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(RULES_PATH, "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  // ── 테스트 데이터 시드 헬퍼 ───────────────────────────
  async function seedMembers(docs) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const [id, data] of Object.entries(docs)) {
        await db.collection("members").doc(id).set(data);
      }
    });
  }

  async function seedSubcollection(memberId, col, docId, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .collection("members").doc(memberId)
        .collection(col).doc(docId)
        .set(data);
    });
  }

  async function seedGlobal(col, docId, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection(col).doc(docId).set(data);
    });
  }

  // ════════════════════════════════════════════════════
  // 1. members 컬렉션 — 기본 접근 제어
  // ════════════════════════════════════════════════════
  describe("1. members 컬렉션", () => {
    beforeEach(async () => {
      await seedMembers({
        "member_a": memberActive,
        "member_b": memberB,
        "member_paused": memberPaused,
        "member_ended": memberEnded,
        "member_nostatus": memberNoStatus,
        "member_other": memberOther,
      });
    });

    // ── 비로그인 ──
    it("[비로그인] members 읽기 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("members").doc("member_a").get());
    });

    // ── 관리자(trainerUid 일치) ──
    it("[관리자] 본인 회원 get 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").get());
    });

    it("[관리자] 본인 회원 list 허용 (trainerUid 쿼리)", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("members").where("trainerUid", "==", TRAINER_UID).get()
      );
    });

    it("[관리자] 타 트레이너 회원 get 차단", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertFails(db.collection("members").doc("member_other").get());
    });

    it("[관리자] 회원 생성 허용 (trainerUid == 본인)", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("members").doc("new_member").set({
          name: "신규회원", trainerUid: TRAINER_UID, status: "active",
        })
      );
    });

    it("[관리자] 회원 생성 시 타인 trainerUid 사용 차단", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertFails(
        db.collection("members").doc("fake_member").set({
          name: "위조회원", trainerUid: "other_trainer", status: "active",
        })
      );
    });

    it("[관리자] 본인 회원 update 허용 (trainerUid 보존)", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").update({
          name: "수정됨", trainerUid: TRAINER_UID,
        })
      );
    });

    it("[관리자] update 시 trainerUid 변경 차단", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertFails(
        db.collection("members").doc("member_a").update({
          trainerUid: "other_trainer",
        })
      );
    });

    it("[관리자] 본인 회원 delete 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").delete());
    });

    it("[관리자] 타 트레이너 회원 delete 차단", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertFails(db.collection("members").doc("member_other").delete());
    });

    // ── 진행중(active) 회원 본인 ──
    it("[진행중 회원] 본인 문서 get 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").get());
    });

    it("[진행중 회원] memberUid 쿼리로 본인 list 허용 (canReadMemberData)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      // Rules v8: canReadMemberData = isTrainerData || (isMemberUidData && isMemberStatusActive)
      // 진행중 회원은 자신의 memberUid 쿼리로 본인 문서 list 허용
      await assertSucceeds(
        db.collection("members").where("memberUid", "==", MEMBER_A_UID).where("status", "==", "active").get()
      );
    });

    it("[진행중 회원] 다른 회원 문서 get 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").get());
    });

    it("[진행중 회원] 본인 프로필 필드 update 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").update({
          currentWeight: 70, updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] 금지 필드(trainerUid) update 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").update({
          trainerUid: MEMBER_A_UID,
        })
      );
    });

    it("[진행중 회원] 금지 필드(memberUid) update 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").update({
          memberUid: "hacked_uid",
        })
      );
    });

    it("[진행중 회원] 금지 필드(isOwner) update 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").update({
          isOwner: true,
        })
      );
    });

    // ── 비활성 회원 self-access ──
    it("[휴식중 회원] 본인 문서 get 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await assertFails(db.collection("members").doc("member_paused").get());
    });

    it("[종료 회원] 본인 문서 get 차단", async () => {
      const db = asUser(testEnv, "ended_uid");
      await assertFails(db.collection("members").doc("member_ended").get());
    });

    it("[상태없는 회원] 본인 문서 get 허용 (status 없으면 active 간주)", async () => {
      const db = asUser(testEnv, "nostatus_uid");
      await assertSucceeds(db.collection("members").doc("member_nostatus").get());
    });

    // ── 임의 사용자 ──
    it("[임의 사용자] trainerUid/memberUid 불일치 → 차단", async () => {
      const db = asUser(testEnv, STRANGER_UID);
      await assertFails(db.collection("members").doc("member_a").get());
    });
  });

  // ════════════════════════════════════════════════════
  // 2. sessions 컬렉션
  // ════════════════════════════════════════════════════
  describe("2. members/{id}/sessions", () => {
    beforeEach(async () => {
      await seedMembers({
        "member_a": memberActive,
        "member_b": memberB,
        "member_paused": memberPaused,
        "member_ended": memberEnded,
      });
      await seedSubcollection("member_a", "sessions", "sess_pub", {
        date: "2026-07-01", isPublished: true, exercises: [],
      });
      await seedSubcollection("member_a", "sessions", "sess_draft", {
        date: "2026-07-01", isPublished: false, exercises: [],
      });
    });

    it("[관리자] 공개/비공개 세션 모두 read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("sessions").doc("sess_pub").get());
      await assertSucceeds(db.collection("members").doc("member_a").collection("sessions").doc("sess_draft").get());
    });

    it("[관리자] 세션 create 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("sessions").add({
          date: "2026-07-02", isPublished: false,
        })
      );
    });

    it("[관리자] 세션 delete 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("sessions").doc("sess_pub").delete());
    });

    it("[진행중 회원] 공개 세션 read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("sessions").doc("sess_pub").get());
    });

    it("[진행중 회원] 비공개(isPublished=false) 세션 read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("sessions").doc("sess_draft").get());
    });

    it("[진행중 회원] 세션 create 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("sessions").add({
          date: "2026-07-02", isPublished: true,
        })
      );
    });

    it("[진행중 회원] 다른 회원 세션 read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("sessions").doc("sess_pub").get());
    });

    it("[휴식중 회원] 공개 세션도 read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      // member_paused 문서의 sessions
      await seedSubcollection("member_paused", "sessions", "sess_paused_pub", {
        date: "2026-07-01", isPublished: true,
      });
      await assertFails(db.collection("members").doc("member_paused").collection("sessions").doc("sess_paused_pub").get());
    });

    it("[종료 회원] 공개 세션도 read 차단", async () => {
      const db = asUser(testEnv, "ended_uid");
      await seedSubcollection("member_ended", "sessions", "sess_ended_pub", {
        date: "2026-07-01", isPublished: true,
      });
      await assertFails(db.collection("members").doc("member_ended").collection("sessions").doc("sess_ended_pub").get());
    });

    it("[비로그인] 세션 read 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("members").doc("member_a").collection("sessions").doc("sess_pub").get());
    });

    it("[진행중 회원] sorenessReport만 update 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("sessions").doc("sess_pub").update({
          sorenessReport: "어깨 약간 통증", sorenessUpdatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] 금지 필드(isPublished) update 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("sessions").doc("sess_pub").update({
          isPublished: false,
        })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 3. sessions/memberFeedback
  // ════════════════════════════════════════════════════
  describe("3. sessions/{id}/memberFeedback", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_paused": memberPaused });
      await seedSubcollection("member_a", "sessions", "sess_pub", {
        date: "2026-07-01", isPublished: true,
      });
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore()
          .collection("members").doc("member_a")
          .collection("sessions").doc("sess_pub")
          .collection("memberFeedback").doc(MEMBER_A_UID)
          .set({ sorenessLevel: "약함", rpe: 7, source: "memberApp" });
      });
    });

    it("[관리자] memberFeedback read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a")
          .collection("sessions").doc("sess_pub")
          .collection("memberFeedback").doc(MEMBER_A_UID).get()
      );
    });

    it("[진행중 회원] 본인 feedbackUid == uid 문서 read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a")
          .collection("sessions").doc("sess_pub")
          .collection("memberFeedback").doc(MEMBER_A_UID).get()
      );
    });

    it("[진행중 회원] 본인 피드백 create 허용 (memberApp source, 허용 필드)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a")
          .collection("sessions").doc("sess_pub")
          .collection("memberFeedback").doc(MEMBER_A_UID).set({
            sorenessLevel: "보통", sorenessBodyParts: ["가슴"],
            rpe: 8, memo: "잘 됐습니다", source: "memberApp",
            createdAt: new Date(), updatedAt: new Date(),
          })
      );
    });

    it("[진행중 회원] source 없이 피드백 create 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a")
          .collection("sessions").doc("sess_pub")
          .collection("memberFeedback").doc(MEMBER_A_UID).set({
            sorenessLevel: "보통", rpe: 8,
          })
      );
    });

    it("[진행중 회원] 다른 uid feedbackDoc create 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a")
          .collection("sessions").doc("sess_pub")
          .collection("memberFeedback").doc("other_uid").set({
            sorenessLevel: "보통", source: "memberApp",
          })
      );
    });

    it("[휴식중 회원] 피드백 read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "sessions", "sess_p", { isPublished: true });
      await assertFails(
        db.collection("members").doc("member_paused")
          .collection("sessions").doc("sess_p")
          .collection("memberFeedback").doc("paused_uid").get()
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 4. bodyCheck 컬렉션
  // ════════════════════════════════════════════════════
  describe("4. bodyCheck", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_paused": memberPaused });
      await seedSubcollection("member_a", "bodyCheck", "main", {
        records: [{ date: "2026-07-01", weight: 75 }], updatedAt: new Date(),
      });
    });

    it("[관리자] bodyCheck read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("bodyCheck").doc("main").get());
    });

    it("[진행중 회원] 본인 bodyCheck read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("bodyCheck").doc("main").get());
    });

    it("[진행중 회원] 본인 bodyCheck update 허용 (records 필드)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("bodyCheck").doc("main").update({
          records: [{ date: "2026-07-01", weight: 74 }], updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] 다른 회원 bodyCheck read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("bodyCheck").doc("main").get());
    });

    it("[휴식중 회원] bodyCheck read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "bodyCheck", "main", { records: [] });
      await assertFails(db.collection("members").doc("member_paused").collection("bodyCheck").doc("main").get());
    });

    it("[종료 회원] bodyCheck read 차단", async () => {
      await seedMembers({ "member_ended": memberEnded });
      await seedSubcollection("member_ended", "bodyCheck", "main", { records: [] });
      const db = asUser(testEnv, "ended_uid");
      await assertFails(db.collection("members").doc("member_ended").collection("bodyCheck").doc("main").get());
    });
  });

  // ════════════════════════════════════════════════════
  // 5. nutrition 컬렉션
  // ════════════════════════════════════════════════════
  describe("5. nutrition", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_paused": memberPaused });
      await seedSubcollection("member_a", "nutrition", "2026-07-01", {
        kcal: 2000, date: "2026-07-01",
      });
    });

    it("[관리자] nutrition read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("nutrition").doc("2026-07-01").get());
    });

    it("[진행중 회원] 본인 nutrition read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("nutrition").doc("2026-07-01").get());
    });

    it("[진행중 회원] 본인 nutrition write 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("nutrition").doc("2026-07-01").set({
          kcal: 2200, date: "2026-07-01",
        })
      );
    });

    it("[진행중 회원] 다른 회원 nutrition read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("nutrition").doc("2026-07-01").get());
    });

    it("[휴식중 회원] nutrition read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "nutrition", "2026-07-01", { kcal: 1800 });
      await assertFails(db.collection("members").doc("member_paused").collection("nutrition").doc("2026-07-01").get());
    });

    it("[휴식중 회원] nutrition write 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "nutrition", "2026-07-01", { kcal: 1800 });
      await assertFails(
        db.collection("members").doc("member_paused").collection("nutrition").doc("2026-07-01").set({ kcal: 2000 })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 6. memberCheckins 컬렉션
  // ════════════════════════════════════════════════════
  describe("6. memberCheckins", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_paused": memberPaused });
      await seedSubcollection("member_a", "memberCheckins", "2026-07-01", {
        date: "2026-07-01", condition: "좋음", steps: "8000",
      });
    });

    it("[관리자] memberCheckins read/write 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("memberCheckins").doc("2026-07-01").get());
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("memberCheckins").doc("2026-07-01").set({ date: "2026-07-01", condition: "보통" })
      );
    });

    it("[진행중 회원] 본인 memberCheckins read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("memberCheckins").doc("2026-07-01").get());
    });

    it("[진행중 회원] 본인 memberCheckins write 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("memberCheckins").doc("2026-07-01").set({
          date: "2026-07-01", steps: "9000",
        })
      );
    });

    it("[휴식중 회원] memberCheckins read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "memberCheckins", "2026-07-01", { date: "2026-07-01" });
      await assertFails(db.collection("members").doc("member_paused").collection("memberCheckins").doc("2026-07-01").get());
    });
  });

  // ════════════════════════════════════════════════════
  // 6-1. cardioLogs 컬렉션 (유산소 기록)
  // ════════════════════════════════════════════════════
  describe("6-1. cardioLogs", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_paused": memberPaused });
      await seedSubcollection("member_a", "cardioLogs", "log1", {
        date: "2026-07-01", activityType: "러닝", durationMinutes: 30, caloriesBurned: 300,
      });
    });

    it("[관리자] cardioLogs read/write 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("cardioLogs").doc("log1").get());
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("cardioLogs").doc("log1").set({ date: "2026-07-01", activityType: "걷기" })
      );
    });

    it("[진행중 회원] 본인 cardioLogs read/write 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("cardioLogs").doc("log1").get());
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("cardioLogs").add({
          date: "2026-07-02", activityType: "빠른 걷기", durationMinutes: 40,
        })
      );
    });

    it("[진행중 회원] 본인 cardioLogs delete 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("cardioLogs").doc("log1").delete());
    });

    it("[휴식중 회원] cardioLogs read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "cardioLogs", "log1", { date: "2026-07-01", activityType: "러닝" });
      await assertFails(db.collection("members").doc("member_paused").collection("cardioLogs").doc("log1").get());
    });

    it("[회원 A] 회원 B cardioLogs read 차단", async () => {
      await seedMembers({ "member_b": memberB });
      await seedSubcollection("member_b", "cardioLogs", "log1", { date: "2026-07-01", activityType: "러닝" });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("cardioLogs").doc("log1").get());
    });
  });

  // ════════════════════════════════════════════════════
  // 6-1-1. ptRegistrations (PT 재등록·잔여 보정 이력) — 관리자 전용
  // cardioLogs와 달리 회원 본인에게도 read 권한이 없다: 잔여 횟수·재등록 이력은
  // 현재 단계에서 회원앱에 전혀 노출하지 않는 관리자 운영 데이터다.
  // ════════════════════════════════════════════════════
  describe("6-1-1. ptRegistrations (PT 잔여·재등록 이력, 관리자 전용)", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB });
      await seedSubcollection("member_a", "ptRegistrations", "reg1", {
        type: "renewal", delta: 20, date: "2026-08-07", memo: "20회 재등록",
      });
    });

    it("[관리자] ptRegistrations read/create/update/delete 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("ptRegistrations").doc("reg1").get());
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("ptRegistrations").add({
          type: "adjustment", delta: -1, date: "2026-08-08", memo: "누락 수업 반영",
        })
      );
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("ptRegistrations").doc("reg1").delete()
      );
    });

    it("[진행중 회원] 본인 ptRegistrations read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("ptRegistrations").doc("reg1").get());
    });

    it("[진행중 회원] 본인 ptRegistrations 생성으로 잔여 횟수 부풀리기 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("ptRegistrations").add({
          type: "renewal", delta: 100, date: "2026-08-07",
        })
      );
    });

    it("[회원 A] 회원 B ptRegistrations read 차단", async () => {
      await seedSubcollection("member_b", "ptRegistrations", "reg1", { type: "renewal", delta: 20, date: "2026-08-07" });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("ptRegistrations").doc("reg1").get());
    });

    it("[진행중 회원] members 문서의 PT 잔여 기준 필드 직접 수정 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").update({
        ptBalanceInitialized: true, ptBalanceBaselineRemaining: 999, ptBalanceBaselineRenewalCount: 0,
      }));
      // 잔여 횟수만 단독으로 바꾸는 것도 차단돼야 한다(화이트리스트 밖 필드)
      await assertFails(db.collection("members").doc("member_a").update({ ptBalanceBaselineRemaining: 50 }));
    });

    it("[진행중 회원] 홈 목록 표시용 잔여 캐시 필드 직접 수정 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").update({
        ptBalanceRemaining: 99, ptBalanceRawRemaining: 99, ptBalanceRenewalCount: 99,
      }));
      await assertFails(db.collection("members").doc("member_a").update({ ptBalanceRemaining: 99 }));
    });

    it("[관리자] 잔여 캐시 필드 저장 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").update({
        ptBalanceRemaining: 7, ptBalanceRawRemaining: 7, ptBalanceRenewalCount: 2,
      }));
    });
  });

  describe("6-2. correctionSummaries (체형평가 회원 노출용, 회원은 읽기만 가능)", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_paused": memberPaused });
      await seedSubcollection("member_a", "correctionSummaries", "cs1", {
        date: "2026-07-01", good: ["어깨 움직임이 좋아졌습니다."], caution: [], homeExercise: ["Wall Slide"], nextGoal: "유지",
      });
    });

    it("[관리자] correctionSummaries read/write 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("correctionSummaries").doc("cs1").get());
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("correctionSummaries").doc("cs1").set({ date: "2026-07-01", good: ["갱신됨"] })
      );
    });

    it("[진행중 회원] 본인 correctionSummaries read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("correctionSummaries").doc("cs1").get());
    });

    it("[진행중 회원] 본인 correctionSummaries write 차단(트레이너만 쓰기 가능)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("correctionSummaries").doc("cs1").set({ date: "2026-07-02" })
      );
    });

    it("[휴식중 회원] correctionSummaries read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "correctionSummaries", "cs1", { date: "2026-07-01", good: [] });
      await assertFails(db.collection("members").doc("member_paused").collection("correctionSummaries").doc("cs1").get());
    });

    it("[회원 A] 회원 B correctionSummaries read 차단", async () => {
      await seedMembers({ "member_b": memberB });
      await seedSubcollection("member_b", "correctionSummaries", "cs1", { date: "2026-07-01", good: [] });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("correctionSummaries").doc("cs1").get());
    });
  });

  describe("6-3. personalWorkouts (개인운동 — 회원이 쓰고 트레이너는 읽기만)", () => {
    const inProgressDoc = (memberId = "member_a") => ({
      memberId, workoutDate: "2026-07-30", workoutParts: ["가슴"], exercises: [], exerciseKeys: [],
      memo: "", totalExercises: 0, totalSets: 0, totalVolume: 0, status: "in_progress", source: "memberApp",
      startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });

    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_paused": memberPaused });
      await seedSubcollection("member_a", "personalWorkouts", "pw1", inProgressDoc());
    });

    it("[관리자] 회원 개인운동 read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").get());
    });

    it("[진행중 회원] 본인 개인운동 read + in_progress 생성 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").get());
      await assertSucceeds(db.collection("members").doc("member_a").collection("personalWorkouts").add(inProgressDoc()));
    });

    it("[진행중 회원] 진행 중 기록의 세트·메모 갱신 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").update({
          exercises: [{ name: "바벨 벤치프레스", exerciseKey: "바벨벤치프레스", sets: [{ setNumber: 1, weight: 20, reps: 15, volume: 300 }] }],
          exerciseKeys: ["바벨벤치프레스"],
          memo: "가슴 자극 좋았음", totalExercises: 1, totalSets: 1, totalVolume: 300, updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] 진행 중 → 완료 전환 허용(시작시각 불변) + 완료된 기록 화이트리스트 재수정 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1");
      // 완료 전환 자체는 기존 경로 그대로 — 이 전환 한 번만은 startedAt이 여전히 불변이다(재수정은 그 다음 write부터).
      await assertSucceeds(ref.update({
        status: "completed", endedAt: new Date(), completedAt: new Date(), durationMinutes: 52,
        exercises: [{ name: "바벨 벤치프레스", sets: [{ setNumber: 1, weight: 20, reps: 15, volume: 300 }] }],
        totalExercises: 1, totalSets: 1, totalVolume: 300, updatedAt: new Date(),
      }));
      // 완료 후 내용 수정 — 화이트리스트 필드(메모/집계 등)는 허용
      await assertSucceeds(ref.update({ memo: "완료 후 수정", totalExercises: 1, totalSets: 1, totalVolume: 300, updatedAt: new Date() }));
      // 완료 후에는 별도 write로 날짜·시작/종료시각도 재수정 가능(신규 완료-수정 경로)
      await assertSucceeds(ref.update({
        workoutDate: "2026-07-29",
        startedAt: new Date("2026-07-29T10:00:00Z"), endedAt: new Date("2026-07-29T11:00:00Z"),
        updatedAt: new Date(),
      }));
    });

    it("[진행중 회원] RPE 없이도 종료 가능 + 완료 시 집계 필드(endedAt/completedAt/totals/status)가 실제로 저장됨(readback 확인)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1");
      // completePersonalWorkout()과 동일하게 rpe 필드 자체를 보내지 않는 "나중에 입력" 종료 — 권한 오류 없이 완료돼야 한다.
      await assertSucceeds(ref.update({
        status: "completed", endedAt: new Date(), completedAt: new Date(), durationMinutes: 40,
        exercises: [{ name: "스쿼트", sets: [{ setNumber: 1, weight: 40, reps: 20, volume: 800 }] }],
        exerciseKeys: ["스쿼트"], totalExercises: 1, totalSets: 1, totalVolume: 800, updatedAt: new Date(),
      }));
      const snap = await ref.get();
      const saved = snap.data();
      assert.equal(saved.status, "completed");
      assert.equal(saved.totalExercises, 1);
      assert.equal(saved.totalSets, 1);
      assert.equal(saved.totalVolume, 800);
      assert.equal(saved.durationMinutes, 40);
      assert.ok(saved.endedAt);
      assert.ok(saved.completedAt);
      assert.equal("rpe" in saved, false); // RPE를 나중에 입력하는 경우, 완료 시점엔 rpe 필드 자체가 없어야 한다
      // 종료 후 RPE 추가 — 완료된 기록 재수정 브랜치에서 정상 허용돼야 한다.
      await assertSucceeds(ref.update({ rpe: 6, rpeUpdatedAt: new Date(), updatedAt: new Date() }));
      const snap2 = await ref.get();
      assert.equal(snap2.data().rpe, 6);
    });

    it("[진행중 회원] 완료 전환과 같은 write에서 RPE 함께 저장 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1");
      await assertSucceeds(ref.update({
        status: "completed", endedAt: new Date(), completedAt: new Date(), durationMinutes: 40,
        rpe: 7, rpeUpdatedAt: new Date(), updatedAt: new Date(),
      }));
      // 완료 전환과 같은 write에서도 rpeUpdatedAt만 단독으로 보내면 차단
      await seedSubcollection("member_a", "personalWorkouts", "pw2", inProgressDoc());
      const ref2 = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw2");
      await assertFails(ref2.update({
        status: "completed", endedAt: new Date(), completedAt: new Date(),
        rpeUpdatedAt: new Date(), updatedAt: new Date(),
      }));
    });

    it("[진행중 회원] 완료된 기록에서 RPE 입력·수정 허용 + rpeUpdatedAt 단독 조작 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1");
      await ref.update({ status: "completed", endedAt: new Date(), completedAt: new Date(), updatedAt: new Date() });
      const trainerDb = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(trainerDb.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").get());
      await assertSucceeds(ref.update({ rpe: 8, rpeUpdatedAt: new Date(), updatedAt: new Date() }));
      await assertSucceeds(ref.update({ rpe: null, rpeUpdatedAt: new Date(), updatedAt: new Date() })); // 미입력으로 되돌리기
      await assertFails(ref.update({ rpe: 11, rpeUpdatedAt: new Date(), updatedAt: new Date() })); // 범위 초과
      await assertFails(ref.update({ rpe: "8", rpeUpdatedAt: new Date(), updatedAt: new Date() })); // 타입 오류
      // rpe는 그대로 두고 rpeUpdatedAt만 바꾸는 것은 차단(입력 시각 위조 방지)
      await assertFails(ref.update({ rpeUpdatedAt: new Date(), updatedAt: new Date() }));
      // 일반 내용 수정만 했을 때는 rpe/rpeUpdatedAt에 손대지 않아도 통과해야 한다
      await assertSucceeds(ref.update({ memo: "내용만 수정", updatedAt: new Date() }));
    });

    it("[진행중 회원] 완료된 기록 수정 시 시작<종료 위반·화이트리스트 밖 필드·역행 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1");
      await ref.update({ status: "completed", endedAt: new Date("2026-07-30T11:00:00Z"), completedAt: new Date(), updatedAt: new Date() });
      // 종료 시각(2026-07-30T11:00Z)보다 늦은 시작 시각으로 바꾸면 차단(운동 시간 음수 방지)
      await assertFails(ref.update({ startedAt: new Date("2026-07-30T12:00:00Z"), updatedAt: new Date() }));
      // 화이트리스트 밖 필드(memberId/createdAt/completedAt 재조작) 차단
      await assertFails(ref.update({ memberId: "member_b", updatedAt: new Date() }));
      await assertFails(ref.update({ createdAt: new Date("2020-01-01"), updatedAt: new Date() }));
      await assertFails(ref.update({ completedAt: new Date("2020-01-01"), updatedAt: new Date() }));
      // completed → in_progress 역행 차단
      await assertFails(ref.update({ status: "in_progress", updatedAt: new Date() }));
    });

    it("[진행중 회원] completed 상태로 바로 생성 차단(관리자 화면 우회 기록 방지)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkouts").add({ ...inProgressDoc(), status: "completed" })
      );
    });

    it("[진행중 회원] memberId 위조 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkouts").add({ ...inProgressDoc("member_b") })
      );
    });

    it("[진행중 회원] 허용되지 않은 필드 저장 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkouts").add({ ...inProgressDoc(), trainerUid: MEMBER_A_UID })
      );
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").update({ isPublished: true })
      );
    });

    it("[진행중 회원] startedAt/createdAt/workoutDate 변조 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1");
      await assertFails(ref.update({ startedAt: new Date("2020-01-01"), updatedAt: new Date() }));
      await assertFails(ref.update({ createdAt: new Date("2020-01-01"), updatedAt: new Date() }));
      await assertFails(ref.update({ workoutDate: "2020-01-01", updatedAt: new Date() }));
    });

    it("[진행중 회원] 과도한 종목·세트·부위·메모 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const col = db.collection("members").doc("member_a").collection("personalWorkouts");
      await assertFails(col.add({ ...inProgressDoc(), exercises: Array.from({ length: 21 }, (_, i) => ({ name: `운동${i}`, sets: [] })), totalExercises: 21 }));
      await assertFails(col.add({ ...inProgressDoc(), workoutParts: ["가슴", "등", "하체", "어깨", "팔"] }));
      await assertFails(col.add({ ...inProgressDoc(), memo: "가".repeat(1001) }));
      // 파생 합계 상한 초과(비정상 중량·횟수로만 만들 수 있는 값)
      await assertFails(col.add({ ...inProgressDoc(), totalSets: 401 }));
      await assertFails(col.add({ ...inProgressDoc(), totalVolume: 4000001 }));
    });

    it("[진행중 회원] 잘못된 타입(문자 합계·문자 배열 아님) 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const col = db.collection("members").doc("member_a").collection("personalWorkouts");
      await assertFails(col.add({ ...inProgressDoc(), totalSets: "10" }));
      await assertFails(col.add({ ...inProgressDoc(), totalVolume: "300" }));
      await assertFails(col.add({ ...inProgressDoc(), exercises: "not-a-list" }));
      await assertFails(col.add({ ...inProgressDoc(), workoutParts: "가슴" }));
      await assertFails(col.add({ ...inProgressDoc(), memo: 123 }));
      await assertFails(col.add({ ...inProgressDoc(), durationMinutes: "52" }));
    });

    it("[회원 A] 회원 B 개인운동 read 차단", async () => {
      await seedSubcollection("member_b", "personalWorkouts", "pwB", inProgressDoc("member_b"));
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkouts").doc("pwB").get());
    });

    it("[회원 A] 회원 B 경로에 개인운동 write 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkouts").add(inProgressDoc("member_b")));
      await seedSubcollection("member_b", "personalWorkouts", "pwB", inProgressDoc("member_b"));
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkouts").doc("pwB").update({ memo: "침입" }));
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkouts").doc("pwB").delete());
    });

    it("[진행중 회원] 본인 개인운동 delete 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").delete());
    });

    it("[휴식중 회원] 개인운동 read/write 차단", async () => {
      await seedSubcollection("member_paused", "personalWorkouts", "pwP", inProgressDoc("member_paused"));
      const db = asUser(testEnv, "paused_uid");
      await assertFails(db.collection("members").doc("member_paused").collection("personalWorkouts").doc("pwP").get());
      await assertFails(db.collection("members").doc("member_paused").collection("personalWorkouts").add(inProgressDoc("member_paused")));
    });

    it("[비로그인] 개인운동 read/write 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("members").doc("member_a").collection("personalWorkouts").doc("pw1").get());
      await assertFails(db.collection("members").doc("member_a").collection("personalWorkouts").add(inProgressDoc()));
    });
  });

  describe("6-4. personalWorkoutSoreness (개인운동 후 근육통 — 문서ID=workoutId 고정, PT soreness와 분리)", () => {
    const completedDoc = (memberId = "member_a") => ({
      memberId, workoutDate: "2026-07-30", workoutParts: ["가슴"], exercises: [], exerciseKeys: [],
      memo: "", totalExercises: 0, totalSets: 0, totalVolume: 0, status: "completed", source: "memberApp",
      startedAt: new Date(), endedAt: new Date(), completedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });
    const sorenessDoc = (overrides = {}) => ({
      memberId: "member_a", workoutId: "pw1", workoutDate: "2026-07-30",
      timing: "next_day", daysAfterWorkout: 1, overallLevel: 3,
      bodyParts: [{ part: "가슴", level: 4 }], memo: "", source: "personalWorkout",
      recordedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    });

    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_paused": memberPaused });
      await seedSubcollection("member_a", "personalWorkouts", "pw1", completedDoc());
    });

    it("[진행중 회원] 완료된 본인 개인운동에 근육통 생성(다음날) 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1").set(sorenessDoc())
      );
    });

    it("[진행중 회원] 다다음날 근육통(daysAfterWorkout=2) 생성 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1")
          .set(sorenessDoc({ timing: "two_days_later", daysAfterWorkout: 2 }))
      );
    });

    it("[진행중 회원] timing·daysAfterWorkout 불일치 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1");
      await assertFails(ref.set(sorenessDoc({ timing: "next_day", daysAfterWorkout: 2 })));
      await assertFails(ref.set(sorenessDoc({ timing: "two_days_later", daysAfterWorkout: 1 })));
    });

    it("[진행중 회원] 허용되지 않은 timing 값(당일·3일후 등) 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1");
      await assertFails(ref.set(sorenessDoc({ timing: "same_day", daysAfterWorkout: 0 })));
      await assertFails(ref.set(sorenessDoc({ timing: "three_days_later", daysAfterWorkout: 3 })));
    });

    it("[진행중 회원] 근육통 레벨 범위·타입 위반 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1");
      await assertFails(ref.set(sorenessDoc({ overallLevel: 6 })));
      await assertFails(ref.set(sorenessDoc({ overallLevel: -1 })));
      await assertFails(ref.set(sorenessDoc({ overallLevel: 3.5 })));
      await assertFails(ref.set(sorenessDoc({ overallLevel: "3" })));
    });

    it("[진행중 회원] source 위조 차단(personalWorkout 고정)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1")
          .set(sorenessDoc({ source: "session" }))
      );
    });

    it("[진행중 회원] workoutId 위조(문서ID와 불일치) 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1")
          .set(sorenessDoc({ workoutId: "pw-other" }))
      );
    });

    it("[진행중 회원] 존재하지 않거나 진행 중인 개인운동을 참조하면 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      // 존재하지 않는 workoutId
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw-none")
          .set(sorenessDoc({ workoutId: "pw-none" }))
      );
      // 아직 진행 중(completed 아님)인 개인운동
      await seedSubcollection("member_a", "personalWorkouts", "pw-inprogress", { ...completedDoc(), status: "in_progress" });
      await assertFails(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw-inprogress")
          .set(sorenessDoc({ workoutId: "pw-inprogress" }))
      );
    });

    it("[진행중 회원] 근육통 없음(0) 저장 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1")
          .set(sorenessDoc({ overallLevel: 0, bodyParts: [{ part: "가슴", level: 0 }] }))
      );
    });

    it("[관리자] 근육통 read 허용, [진행중 회원] 본인 근육통 read 허용", async () => {
      await seedSubcollection("member_a", "personalWorkoutSoreness", "pw1", sorenessDoc());
      const trainerDb = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(trainerDb.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1").get());
      const memberDb = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(memberDb.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1").get());
    });

    it("[진행중 회원] 본인 근육통 수정 허용(다음날→다다음날 재입력 아님, 값만 갱신) + createdAt/workoutId/source 위조 차단", async () => {
      await seedSubcollection("member_a", "personalWorkoutSoreness", "pw1", sorenessDoc());
      const db = asUser(testEnv, MEMBER_A_UID);
      const ref = db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1");
      await assertSucceeds(ref.update({ overallLevel: 5, bodyParts: [{ part: "가슴", level: 5 }], memo: "더 아파요", updatedAt: new Date() }));
      await assertFails(ref.update({ createdAt: new Date("2020-01-01"), updatedAt: new Date() }));
      await assertFails(ref.update({ workoutId: "pw-other", updatedAt: new Date() }));
      await assertFails(ref.update({ source: "session", updatedAt: new Date() }));
      await assertFails(ref.update({ memberId: "member_b", updatedAt: new Date() }));
    });

    it("[회원 A] 회원 B의 근육통 read/write 차단", async () => {
      await seedSubcollection("member_b", "personalWorkouts", "pwB", completedDoc("member_b"));
      await seedSubcollection("member_b", "personalWorkoutSoreness", "pwB", sorenessDoc({ memberId: "member_b", workoutId: "pwB" }));
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkoutSoreness").doc("pwB").get());
      await assertFails(
        db.collection("members").doc("member_b").collection("personalWorkoutSoreness").doc("pwB")
          .set(sorenessDoc({ memberId: "member_b", workoutId: "pwB" }))
      );
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkoutSoreness").doc("pwB").update({ overallLevel: 5 }));
      await assertFails(db.collection("members").doc("member_b").collection("personalWorkoutSoreness").doc("pwB").delete());
    });

    it("[진행중 회원] 본인 근육통 delete 허용", async () => {
      await seedSubcollection("member_a", "personalWorkoutSoreness", "pw1", sorenessDoc());
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1").delete());
    });

    it("[휴식중/비로그인] 근육통 read/write 차단", async () => {
      await seedSubcollection("member_paused", "personalWorkouts", "pwP", completedDoc("member_paused"));
      const pausedDb = asUser(testEnv, "paused_uid");
      await assertFails(
        pausedDb.collection("members").doc("member_paused").collection("personalWorkoutSoreness").doc("pwP")
          .set(sorenessDoc({ memberId: "member_paused", workoutId: "pwP" }))
      );
      const anonDb = asAnon(testEnv);
      await assertFails(anonDb.collection("members").doc("member_a").collection("personalWorkoutSoreness").doc("pw1").get());
    });
  });

  // ════════════════════════════════════════════════════
  // 7. attendance 컬렉션
  // ════════════════════════════════════════════════════
  describe("7. attendance", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_paused": memberPaused });
      await seedSubcollection("member_a", "attendance", "2026-07-01", {
        date: "2026-07-01", source: "memberApp",
      });
      await seedSubcollection("member_b", "attendance", "2026-07-01", {
        date: "2026-07-01", source: "memberApp",
      });
      await seedSubcollection("member_paused", "attendance", "2026-07-01", {
        date: "2026-07-01", source: "memberApp",
      });
      await seedSubcollection("member_a", "sessions", "sess_pub_att", {
        date: "2026-07-01", isPublished: true,
      });
    });

    it("[관리자] attendance read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("attendance").doc("2026-07-01").get());
    });

    it("[진행중 회원] 본인 attendance read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("attendance").doc("2026-07-01").get());
    });

    it("[진행중 회원] 본인 attendance create 허용 (허용 필드)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("attendance").doc("2026-07-02").set({
          date: "2026-07-02", source: "memberApp", createdAt: new Date(), updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] attendance create 시 date != docId 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("attendance").doc("2026-07-03").set({
          date: "2026-07-99", source: "memberApp", createdAt: new Date(), updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] attendance update 차단 (allow update: if false)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("attendance").doc("2026-07-01").update({
          source: "modified",
        })
      );
    });

    it("[휴식중 회원] attendance create 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await assertFails(
        db.collection("members").doc("member_paused").collection("attendance").doc("2026-07-02").set({
          date: "2026-07-02", source: "memberApp", createdAt: new Date(), updatedAt: new Date(),
        })
      );
    });

    // ── 운동 완료 취소(회원 본인 delete 허용) — 2026-07-11 최소 변경 검증 ──
    it("[진행중 회원] 본인 attendance delete 허용 (운동 완료 취소)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("attendance").doc("2026-07-01").delete());
    });

    it("[진행중 회원] 다른 회원 attendance create 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_b").collection("attendance").doc("2026-07-02").set({
          date: "2026-07-02", source: "memberApp", createdAt: new Date(), updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] 다른 회원 attendance delete 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("attendance").doc("2026-07-01").delete());
    });

    it("[비로그인] attendance create 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(
        db.collection("members").doc("member_a").collection("attendance").doc("2026-07-02").set({
          date: "2026-07-02", source: "memberApp", createdAt: new Date(), updatedAt: new Date(),
        })
      );
    });

    it("[비로그인] attendance delete 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("members").doc("member_a").collection("attendance").doc("2026-07-01").delete());
    });

    it("[진행중 회원] 본인 PT 수업일지(sessions) delete 차단 — 취소 허용이 다른 컬렉션으로 번지지 않음", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("sessions").doc("sess_pub_att").delete());
    });

    it("[휴식중 회원] 본인 attendance delete 차단 (진행중 상태에서만 취소 가능)", async () => {
      const db = asUser(testEnv, "paused_uid");
      await assertFails(db.collection("members").doc("member_paused").collection("attendance").doc("2026-07-01").delete());
    });

    it("[관리자] attendance delete 유지 (trainer 권한 변화 없음)", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("attendance").doc("2026-07-01").delete());
    });
  });

  // ════════════════════════════════════════════════════
  // 8. readSessions 컬렉션
  // ════════════════════════════════════════════════════
  describe("8. readSessions", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_paused": memberPaused });
    });

    it("[진행중 회원] readSessions create 허용 (readAt만 포함)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("readSessions").doc("sess_001").set({
          readAt: new Date(),
        })
      );
    });

    it("[진행중 회원] readSessions create 시 추가 필드 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("readSessions").doc("sess_001").set({
          readAt: new Date(), extraField: "hack",
        })
      );
    });

    it("[휴식중 회원] readSessions create 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await assertFails(
        db.collection("members").doc("member_paused").collection("readSessions").doc("sess_001").set({
          readAt: new Date(),
        })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 9. memberOnboarding 컬렉션
  // ════════════════════════════════════════════════════
  describe("9. memberOnboarding", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_paused": memberPaused });
      await seedSubcollection("member_a", "memberOnboarding", "main", {
        completed: true, gender: "남성",
      });
    });

    it("[관리자] memberOnboarding read/write 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("memberOnboarding").doc("main").get());
    });

    it("[진행중 회원] 본인 memberOnboarding read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("memberOnboarding").doc("main").get());
    });

    it("[진행중 회원] 본인 memberOnboarding update 허용 (허용 필드)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("memberOnboarding").doc("main").update({
          goal: "체지방 감소", updatedAt: new Date(),
        })
      );
    });

    it("[휴식중 회원] memberOnboarding read 차단", async () => {
      const db = asUser(testEnv, "paused_uid");
      await seedSubcollection("member_paused", "memberOnboarding", "main", { completed: true });
      await assertFails(db.collection("members").doc("member_paused").collection("memberOnboarding").doc("main").get());
    });

    it("[진행중 회원] 목표 관리 — goalHistory 필드 update 허용 (완료 상태는 그대로 유지)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("memberOnboarding").doc("main").update({
          goalHistory: [{ at: 1, field: "goal", fieldLabel: "운동 목적", oldValue: "다이어트", newValue: "벌크업", source: "member_goal_update", changedBy: MEMBER_A_UID }],
          updatedAt: new Date(),
        })
      );
    });

    it("[진행중 회원] 화이트리스트에 없는 필드 update 차단 (예: memberUid 위조 시도)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("memberOnboarding").doc("main").update({
          memberUid: "hacked_uid",
        })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 10. pairSessions 컬렉션 — 관리자 전용
  // ════════════════════════════════════════════════════
  describe("10. pairSessions (2:1 수업) — 관리자 전용", () => {
    beforeEach(async () => {
      // isTrainerOfMember() 검증에 필요한 회원 문서 시드
      await seedMembers({ "member_a": memberActive });
      await seedGlobal("pairSessions", "pair_001", {
        trainerUid: TRAINER_UID, memberAId: "member_a", memberBId: "member_b",
      });
    });

    it("[관리자] pairSessions read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("pairSessions").doc("pair_001").get());
    });

    it("[관리자] pairSessions create 허용 (isTrainerOfMember 통과)", async () => {
      // TRAINER_UID == members/member_a.trainerUid → isTrainerOfMember 통과
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("pairSessions").doc("pair_002").set({
          trainerUid: TRAINER_UID, memberAId: "member_a", memberBId: "member_b",
        })
      );
    });

    it("[관리자] pairSessions update 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("pairSessions").doc("pair_001").update({ status: "recorded" })
      );
    });

    it("[관리자] pairSessions delete 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("pairSessions").doc("pair_001").delete());
    });

    it("[진행중 회원] pairSessions read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("pairSessions").doc("pair_001").get());
    });

    it("[진행중 회원] pairSessions create 차단 (isTrainerOfMember 불통과)", async () => {
      // MEMBER_A_UID를 trainerUid로 설정해도 members/member_a.trainerUid == TRAINER_UID 이므로 차단
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("pairSessions").doc("pair_fake").set({
          trainerUid: MEMBER_A_UID, memberAId: "member_a", memberBId: "member_b",
        })
      );
    });

    it("[진행중 회원] pairSessions update 차단", async () => {
      // pair_001.trainerUid == TRAINER_UID ≠ MEMBER_A_UID → 첫 번째 조건에서 차단
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("pairSessions").doc("pair_001").update({ status: "fake" })
      );
    });

    it("[진행중 회원] pairSessions delete 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("pairSessions").doc("pair_001").delete());
    });

    it("[비로그인] pairSessions read 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("pairSessions").doc("pair_001").get());
    });

    it("[타 트레이너] 본인 것이 아닌 pairSession read 차단", async () => {
      const db = asUser(testEnv, "other_trainer");
      await assertFails(db.collection("pairSessions").doc("pair_001").get());
    });
  });

  // ════════════════════════════════════════════════════
  // 11. assessments — 관리자 전용
  // ════════════════════════════════════════════════════
  describe("11. assessments — 관리자 전용", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive });
      await seedSubcollection("member_a", "assessments", "assess_001", {
        date: "2026-07-01", type: "inbody",
      });
    });

    it("[관리자] assessments read/write 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("assessments").doc("assess_001").get());
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("assessments").doc("assess_002").set({ type: "body" })
      );
    });

    it("[진행중 회원] assessments read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("assessments").doc("assess_001").get());
    });

    it("[진행중 회원] assessments write 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("assessments").doc("new").set({ type: "fake" })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 12. catch-all 서브컬렉션 — 관리자 전용
  // ════════════════════════════════════════════════════
  describe("12. catch-all 서브컬렉션 — 관리자만 write", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive });
      await seedSubcollection("member_a", "privateNotes", "note_001", { content: "비공개 메모" });
    });

    it("[관리자] private 서브컬렉션 read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_a").collection("privateNotes").doc("note_001").get());
    });

    it("[진행중 회원] private 서브컬렉션 read 차단 (catch-all)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("privateNotes").doc("note_001").get());
    });

    it("[진행중 회원] private 서브컬렉션 write 차단 (catch-all)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("privateNotes").doc("new_note").set({ content: "해킹 시도" })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 12-1. 고객 페르소나(TEO GYM PERSONA) — 관리자 전용
  // 저장 위치: members/{id}/private/admin.persona (catch-all 규칙으로 회원 접근 차단)
  // "UI에서 안 보인다"가 아니라 "회원 권한으로는 존재 자체에 접근할 수 없다"를 검증한다.
  // ════════════════════════════════════════════════════
  describe("12-1. 고객 페르소나 — 회원은 읽기·쓰기 모두 불가", () => {
    const personaDoc = {
      persona: {
        ptTrigger: { category: "solo_fail", rawText: "헬스장을 세 번 등록했는데 뭘 해야 할지 몰랐어요.", source: "admin_interview" },
        selectionReason: { category: "owner_class", rawText: "대표님이 직접 봐주셔서요.", source: "admin_interview" },
      },
      memo: "관리자 메모",
    };
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB, "member_p": memberPaused, "member_e": memberEnded });
      await seedSubcollection("member_a", "private", "admin", personaDoc);
      await seedSubcollection("member_b", "private", "admin", personaDoc);
    });

    it("[관리자] 본인 회원의 persona read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      const snap = await assertSucceeds(db.collection("members").doc("member_a").collection("private").doc("admin").get());
      assert.equal(snap.data().persona.ptTrigger.category, "solo_fail");
    });

    it("[관리자] persona write(생성·수정) 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("members").doc("member_a").collection("private").doc("admin")
          .set({ persona: { ptTrigger: { category: "pain", rawText: "허리가 아파서요" } } }, { merge: true })
      );
    });

    it("[진행중 회원] 자기 자신의 persona read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("private").doc("admin").get());
    });

    it("[진행중 회원] 자기 자신의 persona write 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").collection("private").doc("admin")
          .set({ persona: { ptTrigger: { category: "other", rawText: "직접 넣기" } } }, { merge: true })
      );
    });

    it("[진행중 회원] 다른 회원의 persona read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("private").doc("admin").get());
    });

    it("[휴식중·종료 회원] persona read 차단", async () => {
      await assertFails(asUser(testEnv, "paused_uid").collection("members").doc("member_a").collection("private").doc("admin").get());
      await assertFails(asUser(testEnv, "ended_uid").collection("members").doc("member_a").collection("private").doc("admin").get());
    });

    it("[다른 헬스장 트레이너·비로그인] persona read 차단", async () => {
      await assertFails(asUser(testEnv, STRANGER_UID).collection("members").doc("member_a").collection("private").doc("admin").get());
      await assertFails(asAnon(testEnv).collection("members").doc("member_a").collection("private").doc("admin").get());
    });

    it("[종단 확인] 관리자가 persona를 저장한 뒤 회원이 자기 문서를 읽어도 persona가 존재하지 않는다", async () => {
      const admin = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        admin.collection("members").doc("member_a").collection("private").doc("admin")
          .set({ persona: { ptTrigger: { category: "pain", rawText: "허리가 아파서요" } } }, { merge: true })
      );
      const memberDb = asUser(testEnv, MEMBER_A_UID);
      const own = await assertSucceeds(memberDb.collection("members").doc("member_a").get());
      assert.equal(own.data().persona, undefined);  // 회원 클라이언트로 원문이 내려가지 않는다
    });

    it("[진행중 회원] private 컬렉션 전체 list로도 우회 불가", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_a").collection("private").get());
    });

    it("[진행중 회원] members 문서에는 persona를 직접 써넣을 수 없다(화이트리스트 밖)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_a").update({ persona: { ptTrigger: { category: "other", rawText: "우회 시도" } } })
      );
    });

    it("[관리자] members 문서에 남아있던 레거시 persona 필드를 정리(update)할 수 있다 — 마이그레이션 경로", async () => {
      await seedMembers({ "member_legacy": { ...memberActive, memberUid: "legacy_uid", persona: { ptTrigger: { category: "pain", rawText: "레거시" } } } });
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("members").doc("member_legacy").update({ persona: {} }));
    });

    it("[진행중 회원] members 문서에 레거시 persona가 남아 있으면 본인 문서 read로 함께 내려온다 — 그래서 private으로 옮겨야 한다(회귀 방지용 문서화)", async () => {
      await seedMembers({ "member_legacy2": { ...memberActive, memberUid: "legacy2_uid", persona: { ptTrigger: { category: "pain", rawText: "레거시 원문" } } } });
      const db = asUser(testEnv, "legacy2_uid");
      const snap = await assertSucceeds(db.collection("members").doc("member_legacy2").get());
      // Firestore 규칙은 문서 단위라 필드 단위 숨김이 불가능하다는 사실 자체를 고정한다.
      assert.equal(snap.data().persona.ptTrigger.rawText, "레거시 원문");
    });
  });

  // ════════════════════════════════════════════════════
  // 13. notices — 전체/개인 공지 접근
  // ════════════════════════════════════════════════════
  describe("13. notices", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive });
      // isVerifiedTrainer() 검증을 위한 settings/trainers 문서 시드
      await seedGlobal("settings", "trainers", { uids: [TRAINER_UID] });
      await seedGlobal("notices", "notice_all", {
        trainerUid: TRAINER_UID, createdBy: TRAINER_UID,
        isPublished: true, targetType: "all", title: "전체 공지",
      });
      await seedGlobal("notices", "notice_member", {
        trainerUid: TRAINER_UID, createdBy: TRAINER_UID,
        isPublished: true, targetType: "member", targetMemberId: "member_a", title: "개인 공지",
      });
      await seedGlobal("notices", "notice_unpub", {
        trainerUid: TRAINER_UID, createdBy: TRAINER_UID,
        isPublished: false, targetType: "all", title: "미발행 공지",
      });
    });

    it("[관리자] 전체 공지 read 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("notices").doc("notice_all").get());
    });

    it("[진행중 회원] 전체 공지 read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("notices").doc("notice_all").get());
    });

    it("[진행중 회원] 본인 대상 개인 공지 read 허용", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("notices").doc("notice_member").get());
    });

    it("[진행중 회원] 미발행 공지 read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("notices").doc("notice_unpub").get());
    });

    it("[관리자] 공지 create 허용 (settings/trainers 목록 검증 통과)", async () => {
      // TRAINER_UID가 settings/trainers.uids 목록에 있으므로 isVerifiedTrainer() 통과
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("notices").doc("new_notice").set({
          trainerUid: TRAINER_UID, createdBy: TRAINER_UID,
          isPublished: true, targetType: "all", title: "신규 공지",
        })
      );
    });

    it("[관리자] 공지 update 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("notices").doc("notice_all").update({
          trainerUid: TRAINER_UID, title: "수정된 공지",
        })
      );
    });

    it("[관리자] 공지 delete 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("notices").doc("notice_all").delete());
    });

    it("[진행중 회원] 공지 create 차단 (isVerifiedTrainer 불통과)", async () => {
      // MEMBER_A_UID는 settings/trainers.uids 목록에 없으므로 차단
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("notices").doc("fake_notice").set({
          trainerUid: MEMBER_A_UID, createdBy: MEMBER_A_UID,
          isPublished: true, targetType: "all", title: "가짜 공지",
        })
      );
    });

    it("[진행중 회원] 공지 update 차단", async () => {
      // notice_all.trainerUid == TRAINER_UID ≠ MEMBER_A_UID → 첫 번째 조건에서 차단
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("notices").doc("notice_all").update({ title: "해킹된 공지" })
      );
    });

    it("[진행중 회원] 공지 delete 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("notices").doc("notice_all").delete());
    });
  });

  // ════════════════════════════════════════════════════
  // 13b. notices/{noticeId}/reads — 공지 읽음 통계(관리자 조회용, §공지센터 2026-08)
  //   members/{memberId}/noticeReads(회원앱 미확인 배지)와는 방향이 반대인 신규 서브컬렉션.
  // ════════════════════════════════════════════════════
  describe("13b. notices/{noticeId}/reads (공지 읽음 통계)", () => {
    async function seedNoticeRead(noticeId, memberId, data) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore()
          .collection("notices").doc(noticeId)
          .collection("reads").doc(memberId)
          .set(data);
      });
    }

    beforeEach(async () => {
      await seedMembers({ member_a: memberActive, member_b: memberB });
      await seedGlobal("settings", "trainers", { uids: [TRAINER_UID] });
      await seedGlobal("notices", "notice_all", {
        trainerUid: TRAINER_UID, createdBy: TRAINER_UID,
        isPublished: true, targetType: "all", title: "전체 공지",
      });
    });

    it("[회원 A] 자신의 읽음 기록 최초 생성 성공(memberId·authUid 일치, readCount=1)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("notices").doc("notice_all").collection("reads").doc("member_a").set({
          memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
          firstReadAt: new Date(), lastReadAt: new Date(), readCount: 1,
        })
      );
    });

    it("[회원 A] 다른 회원(member_b) 몫으로 읽음 기록 생성 시도 차단(위조 방지)", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("notices").doc("notice_all").collection("reads").doc("member_b").set({
          memberId: "member_b", authUid: MEMBER_A_UID, memberNameSnapshot: "가짜",
          firstReadAt: new Date(), lastReadAt: new Date(), readCount: 1,
        })
      );
    });

    it("[회원 B] 회원 A의 읽음 기록 read 시도 차단(다른 회원 읽음 현황 조회 불가)", async () => {
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt: new Date(), lastReadAt: new Date(), readCount: 1,
      });
      const db = asUser(testEnv, MEMBER_B_UID);
      await assertFails(db.collection("notices").doc("notice_all").collection("reads").doc("member_a").get());
    });

    it("[관리자] 공지 소유 트레이너는 회원 A의 읽음 기록 read 허용(통계 조회)", async () => {
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt: new Date(), lastReadAt: new Date(), readCount: 1,
      });
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("notices").doc("notice_all").collection("reads").doc("member_a").get());
    });

    it("[회원 A] 재확인 시 firstReadAt은 불변, readCount는 정확히 1만 증가하는 update만 허용", async () => {
      const firstReadAt = new Date("2026-08-01T00:00:00Z");
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt, lastReadAt: firstReadAt, readCount: 1,
      });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(
        db.collection("notices").doc("notice_all").collection("reads").doc("member_a").update({
          lastReadAt: new Date(), readCount: 2,
        })
      );
    });

    it("[회원 A] firstReadAt을 바꿔서 재확인하려는 시도는 차단(최초 확인 시각 위조 방지)", async () => {
      const firstReadAt = new Date("2026-08-01T00:00:00Z");
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt, lastReadAt: firstReadAt, readCount: 1,
      });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("notices").doc("notice_all").collection("reads").doc("member_a").update({
          firstReadAt: new Date(), lastReadAt: new Date(), readCount: 2,
        })
      );
    });

    it("[회원 A] readCount를 1보다 크게 건너뛰며 갱신 시도 차단(중복 증가 방지)", async () => {
      const firstReadAt = new Date("2026-08-01T00:00:00Z");
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt, lastReadAt: firstReadAt, readCount: 1,
      });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("notices").doc("notice_all").collection("reads").doc("member_a").update({
          lastReadAt: new Date(), readCount: 5,
        })
      );
    });

    it("[관리자] 재공지 시 읽음 기록 삭제(초기화) 허용", async () => {
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt: new Date(), lastReadAt: new Date(), readCount: 1,
      });
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("notices").doc("notice_all").collection("reads").doc("member_a").delete());
    });

    it("[회원 A] 자신의 읽음 기록 delete 시도 차단(관리자만 초기화 가능)", async () => {
      await seedNoticeRead("notice_all", "member_a", {
        memberId: "member_a", authUid: MEMBER_A_UID, memberNameSnapshot: "회원A",
        firstReadAt: new Date(), lastReadAt: new Date(), readCount: 1,
      });
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("notices").doc("notice_all").collection("reads").doc("member_a").delete());
    });
  });

  // ════════════════════════════════════════════════════
  // 14. globalDailyConditioning
  // ════════════════════════════════════════════════════
  describe("14. 글로벌 dailyConditioning", () => {
    beforeEach(async () => {
      await seedGlobal("dailyConditioning", "cond_pub", {
        trainerUid: TRAINER_UID, status: "published", isPublished: true,
        visible: true, visibility: "visible",
        date: "2026-07-01", title: "오늘의 컨디셔닝",
      });
      await seedGlobal("dailyConditioning", "cond_draft", {
        trainerUid: TRAINER_UID, status: "draft", isPublished: false,
        visible: true, visibility: "visible",
        date: "2026-07-01", title: "초안",
      });
    });

    it("[진행중 회원] 발행된 글로벌 conditioning read 허용", async () => {
      // isPublishedData 가 status/published/isPublished 중 하나라도 충족하면 허용
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertSucceeds(db.collection("dailyConditioning").doc("cond_pub").get());
    });

    it("[진행중 회원] 미발행 글로벌 conditioning read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("dailyConditioning").doc("cond_draft").get());
    });

    it("[관리자] 글로벌 conditioning create 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("dailyConditioning").doc("2026-07-02").set({
          trainerUid: TRAINER_UID, status: "published", isPublished: true, visible: true,
          date: "2026-07-02", title: "컨디셔닝 2일차",
        })
      );
    });
  });

  // ════════════════════════════════════════════════════
  // 14-1. trainerNotificationReads — "오늘 회원 입력 피드" 읽음 상태 (트레이너 본인 전용)
  // ════════════════════════════════════════════════════
  describe("14-1. trainerNotificationReads", () => {
    it("[본인] 자기 uid 문서 read 허용", async () => {
      await seedGlobal("trainerNotificationReads", TRAINER_UID, { date: "2026-07-06", readEventIds: ["a__1__weight"] });
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("trainerNotificationReads").doc(TRAINER_UID).get());
    });

    it("[본인] 자기 uid 문서 write(set) 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("trainerNotificationReads").doc(TRAINER_UID)
          .set({ date: "2026-07-06", readEventIds: ["a__1__weight"] })
      );
    });

    it("[다른 트레이너] 남의 uid 문서 read 차단", async () => {
      await seedGlobal("trainerNotificationReads", TRAINER_UID, { date: "2026-07-06", readEventIds: [] });
      const db = asUser(testEnv, STRANGER_UID);
      await assertFails(db.collection("trainerNotificationReads").doc(TRAINER_UID).get());
    });

    it("[다른 트레이너] 남의 uid 문서 write 차단", async () => {
      const db = asUser(testEnv, STRANGER_UID);
      await assertFails(
        db.collection("trainerNotificationReads").doc(TRAINER_UID)
          .set({ date: "2026-07-06", readEventIds: ["hacked"] })
      );
    });

    it("[회원] 트레이너의 읽음 상태 문서 read/write 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("trainerNotificationReads").doc(TRAINER_UID).get());
      await assertFails(
        db.collection("trainerNotificationReads").doc(TRAINER_UID)
          .set({ date: "2026-07-06", readEventIds: [] })
      );
    });

    it("[비로그인] read/write 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("trainerNotificationReads").doc(TRAINER_UID).get());
    });
  });

  // ════════════════════════════════════════════════════
  // 14-2. exerciseClassifications — 운동 종목 자동 분류 "전체 회원 공통" 학습 데이터 (트레이너 본인 전용)
  // ════════════════════════════════════════════════════
  describe("14-2. exerciseClassifications", () => {
    it("[본인] 자기 uid 문서 read 허용", async () => {
      await seedGlobal("exerciseClassifications", TRAINER_UID, { items: { "스모데드리프트": { equipment: "바벨", muscleTop: "하체", muscleSub: "전체" } } });
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(db.collection("exerciseClassifications").doc(TRAINER_UID).get());
    });

    it("[본인] 자기 uid 문서에 항목 merge write 허용", async () => {
      const db = asUser(testEnv, TRAINER_UID);
      await assertSucceeds(
        db.collection("exerciseClassifications").doc(TRAINER_UID)
          .set({ items: { "벤치프레스": { equipment: "바벨", muscleTop: "가슴", muscleSub: "가운데가슴" } } }, { merge: true })
      );
    });

    it("[다른 트레이너] 남의 uid 문서 read/write 차단", async () => {
      await seedGlobal("exerciseClassifications", TRAINER_UID, { items: {} });
      const db = asUser(testEnv, STRANGER_UID);
      await assertFails(db.collection("exerciseClassifications").doc(TRAINER_UID).get());
      await assertFails(
        db.collection("exerciseClassifications").doc(TRAINER_UID)
          .set({ items: { "해킹": { equipment: "바벨" } } }, { merge: true })
      );
    });

    it("[회원] exerciseClassifications read/write 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("exerciseClassifications").doc(TRAINER_UID).get());
    });

    it("[비로그인] read/write 차단", async () => {
      const db = asAnon(testEnv);
      await assertFails(db.collection("exerciseClassifications").doc(TRAINER_UID).get());
    });
  });

  // ════════════════════════════════════════════════════
  // 15. 회원 간 데이터 꼬임 방지 — 교차 접근 차단
  // ════════════════════════════════════════════════════
  describe("15. 회원 간 데이터 꼬임 방지", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_b": memberB });
      await seedSubcollection("member_a", "sessions", "sess_a", { isPublished: true });
      await seedSubcollection("member_b", "sessions", "sess_b", { isPublished: true });
      await seedSubcollection("member_a", "bodyCheck", "main", { records: [] });
      await seedSubcollection("member_a", "nutrition", "2026-07-01", { kcal: 2000 });
      await seedSubcollection("member_a", "memberCheckins", "2026-07-01", { condition: "좋음" });
    });

    it("[회원 A] 회원 B sessions read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("sessions").doc("sess_b").get());
    });

    it("[회원 A] 회원 B bodyCheck read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("bodyCheck").doc("main").get());
    });

    it("[회원 A] 회원 B nutrition read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("nutrition").doc("2026-07-01").get());
    });

    it("[회원 A] 회원 B checkins read 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(db.collection("members").doc("member_b").collection("memberCheckins").doc("2026-07-01").get());
    });

    it("[회원 A] 회원 B sessions write 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_b").collection("sessions").add({ isPublished: true })
      );
    });

    it("[회원 A] 회원 B members 문서 update 차단", async () => {
      const db = asUser(testEnv, MEMBER_A_UID);
      await assertFails(
        db.collection("members").doc("member_b").update({ currentWeight: 65 })
      );
    });
  });
});
