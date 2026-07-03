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
  // 7. attendance 컬렉션
  // ════════════════════════════════════════════════════
  describe("7. attendance", () => {
    beforeEach(async () => {
      await seedMembers({ "member_a": memberActive, "member_paused": memberPaused });
      await seedSubcollection("member_a", "attendance", "2026-07-01", {
        date: "2026-07-01", source: "memberApp",
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
