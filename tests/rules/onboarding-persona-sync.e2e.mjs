/**
 * TEO GYM — 사전문진 ↔ 페르소나 동기화 운영 흐름 검증 (Firestore 에뮬레이터)
 * 실행: npm run test:persona-sync
 *
 * 실제 firestore.rules를 그대로 로드하고, 회원 계정 / 트레이너 계정으로 각각 접속해
 * 운영에서 일어나는 순서 그대로 문서를 쓰고 읽는다. 판정 로직은 App.jsx 원본을 슬라이스해 쓰므로
 * 화면이 실제로 계산하는 값과 동일하다.
 *
 * 검증 흐름:
 *   ① 회원이 신규 2문항(등록 결정 이유·PT 시작 계기)을 포함해 사전 문진 제출
 *   ② 회원은 페르소나 원본(private/admin)을 읽지도 쓰지도 못한다
 *   ③ 관리자 화면에 "사전문진 · 확인 필요" 초안으로 뜬다 + 홈 목록에 남는다
 *   ④ 트레이너가 확인 완료 → 실제 persona로 확정 저장된다
 *   ⑤ 확정 후 홈 "페르소나 확인 필요" 목록에서 빠진다
 *   ⑥ 회원이 문진을 다시 수정해도 관리자 확정값이 덮어써지지 않는다
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "teocoach-a7fa0";
const RULES_PATH = resolve(__dirname, "../../firestore.rules");
const APP_PATH = resolve(__dirname, "../../src/App.jsx");

const TRAINER_UID = "trainer_uid_abc";
const MEMBER_UID = "member_sync_uid";
const MEMBER_ID = "m_sync";

// ── App.jsx 원본 판정 로직 로드 ────────────────────────────────
// 화면이 쓰는 함수를 그대로 실행한다(테스트가 판정 규칙을 따로 구현하면 화면과 어긋난다).
const APP = readFileSync(APP_PATH, "utf8");
function slice(start, end) {
  const si = APP.indexOf(start);
  const ei = APP.indexOf(end, si);
  assert.ok(si >= 0 && ei > si, `slice 실패: ${start}`);
  assert.equal(APP.indexOf(start, si + 1), -1, `시작 마커가 2회 이상 등장: ${start}`);
  return APP.slice(si, ei);
}
const personaSrc = [
  slice("const OWNER_LEGACY_NAME", '// 회원 상세(HubScreen)·수업일지 작성 화면의 "회원 연동 기능"'),
  slice("function getMemberNextSessionInfo", "// 오늘 완료 회원 카드에서"),
  slice("const ONBOARDING_STATUS_LABEL = {", "const DEFAULT_ADMIN_EMAIL"),
  slice("const PERSONA_TRIGGER_OPTIONS = [", '// 홈 "수업일지 미전송" — 예약'),
].join("\n");
// eslint-disable-next-line no-new-func
const P = new Function(`${personaSrc}\nreturn { buildOnboardingPersonaSeed, getPersonaEntry, getPersonaProgress, personaMissingLabel, buildPersonaPendingList, selectMembersNeedingPersonaSeed, PERSONA_CORE_QUESTIONS };`)();

// ── 회원앱이 실제로 저장하는 문진 payload ──────────────────────
// App.jsx completeOnboarding이 만드는 형태 그대로(렌더 테스트에서 캡처한 구조와 동일).
function onboardingPayload({ joinReasons, ptCause, primary, detail, at }) {
  return {
    gender: "남성", birthYear: "1995", birthMonth: "03", birthDay: "10", birthYearMonth: "1995-03",
    heightCm: "175", currentWeightKg: "72", startingWeightKg: "72", targetWeightKg: "66",
    targetPeriod: "3개월", goalPeriod: "3개월", goalPeriodType: "3개월", goalDeadline: "2026-12-17", targetDate: "2026-12-17",
    goal: "다이어트", focusAreas: ["다이어트 초집중"], weeklyWorkoutCount: "주 3회",
    completed: true, completedAt: at, onboardingVersion: 3, startedAt: at,
    agreedTermsAt: at, agreedPrivacyAt: at,
    weightHistoryMode: "fresh", calorieHistoryMode: "fresh",
    weightHistoryModeStartedAt: at, calorieHistoryModeStartedAt: at,
    v2Draft: {},
    v2: {
      version: 3, updatedAt: at, criticalUpdatedAt: at,
      goals: { list: [primary], primary, detail, shootDate: "", rehabNote: "", ptCause },
      experience: { level: "홈트 경험", duration: "3~6개월", prevPT: "없음", prevPTSatisfaction: "" },
      lifestyle: { meals: "3회", lateSnack: "주 1~2회", alcohol: "거의 없음", water: "1.5~2L", delivery: "주 1~2회", sleep: "6~7시간", stress: "보통" },
      pain: { parts: ["없음"], worst: "", situation: "", onset: "", trigger: "" },
      health: { conditions: [], conditionEtc: "", hasSurgery: "없음", surgery: "", hasMedication: "없음", medication: "", caution: "" },
      schedule: { preferTime: ["저녁 (17~21시)"], weekCount: "주 3회", targetPeriod: "3개월", note: "" },
      preferences: { weakParts: ["하체"], styles: ["머신 위주"], intensity: "적당한 강도 선호" },
      acquisition: {
        firstTouch: "naver_search", firstTouchOther: "",
        decisionTouch: "naver_place_review", decisionTouchOther: "",
        joinReasons, joinReasonOther: "",
      },
    },
  };
}
// 회원 목록 배지 미러 — 온보딩 완료 직후 회원 앱이 members에 함께 쓰는 값.
const statusMirror = (at) => ({ onboardingStatus: "completed", onboardingCompletedAt: at, onboardingUpdatedAt: at, onboardingHasCaution: false });

describe("사전문진 → 페르소나 동기화 운영 흐름", function () {
  this.timeout(40000);
  let env, memberDb, trainerDb;

  before(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
    });
    await env.clearFirestore();
    // 사전 준비: 트레이너가 회원을 등록하고 회원 계정을 연결한 상태(운영과 동일)
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "settings", "trainers"), { uids: [TRAINER_UID] });
      await setDoc(doc(db, "members", MEMBER_ID), {
        name: "동기화테스트", trainerUid: TRAINER_UID, memberUid: MEMBER_UID,
        email: "sync@test.com", status: "active",
      });
    });
    memberDb = env.authenticatedContext(MEMBER_UID).firestore();
    trainerDb = env.authenticatedContext(TRAINER_UID).firestore();
  });
  after(async () => { await env?.cleanup(); });

  // 화면이 보는 것과 같은 회원 객체를 만든다(확정값 + 문진 초안).
  async function readAdminView() {
    const obSnap = await getDoc(doc(trainerDb, "members", MEMBER_ID, "memberOnboarding", "main"));
    const privSnap = await getDoc(doc(trainerDb, "members", MEMBER_ID, "private", "admin"));
    const memberSnap = await getDoc(doc(trainerDb, "members", MEMBER_ID));
    const ob = obSnap.exists() ? obSnap.data() : null;
    return {
      ...memberSnap.data(), id: MEMBER_ID,
      persona: privSnap.exists() ? (privSnap.data().persona || null) : null,
      personaSeed: P.buildOnboardingPersonaSeed(ob ? { v2: ob.v2, onboardingUpdatedAt: ob.v2?.updatedAt } : null),
    };
  }

  const FIRST_AT = "2026-09-17T01:00:00.000Z";
  const SECOND_AT = "2026-09-17T05:00:00.000Z";

  it("① 회원이 신규 2문항을 포함해 사전 문진을 제출할 수 있다(rules 통과)", async () => {
    const payload = onboardingPayload({
      joinReasons: ["review", "owner_class"], ptCause: "solo_fail",
      primary: "체지방 감량", detail: "3개월 안에 5kg 빼고 싶어요", at: FIRST_AT,
    });
    await assertSucceeds(setDoc(doc(memberDb, "members", MEMBER_ID, "memberOnboarding", "main"), payload));
    await assertSucceeds(updateDoc(doc(memberDb, "members", MEMBER_ID), statusMirror(FIRST_AT)));

    const saved = (await getDoc(doc(trainerDb, "members", MEMBER_ID, "memberOnboarding", "main"))).data();
    assert.deepEqual(saved.v2.acquisition.joinReasons, ["review", "owner_class"], "등록 결정 이유가 저장되지 않았다");
    assert.equal(saved.v2.goals.ptCause, "solo_fail", "PT 시작 계기가 저장되지 않았다");
    // 기존 필드도 그대로 저장돼야 한다
    assert.equal(saved.v2.acquisition.firstTouch, "naver_search");
    assert.equal(saved.v2.acquisition.decisionTouch, "naver_place_review");
  });

  it("② 회원은 페르소나 원본(private/admin)을 읽지도 쓰지도 못한다", async () => {
    await assertFails(getDoc(doc(memberDb, "members", MEMBER_ID, "private", "admin")));
    await assertFails(setDoc(doc(memberDb, "members", MEMBER_ID, "private", "admin"), {
      persona: { ptTrigger: { category: "solo_fail", rawText: "내가 직접 쓴 값" } },
    }));
  });

  it("③ 관리자 화면에 '사전문진 · 확인 필요' 초안으로 뜨고 홈 목록에도 남는다", async () => {
    const m = await readAdminView();
    const trigger = P.getPersonaEntry(m, "ptTrigger");
    const selection = P.getPersonaEntry(m, "selectionReason");

    assert.equal(trigger.category, "solo_fail", "PT 계기가 초안으로 변환되지 않았다");
    assert.equal(trigger.secondaryCategory, "weight_gain", "운동 목표가 보조 이유로 변환되지 않았다");
    assert.equal(trigger.rawText, "3개월 안에 5kg 빼고 싶어요", "회원이 쓴 원문이 보존되지 않았다");
    assert.equal(selection.category, "review");
    assert.equal(selection.secondaryCategory, "owner_class");
    assert.equal(trigger.confirmed, false, "확인 전인데 확인 완료로 표시됐다");
    assert.equal(selection.source, "onboarding", "출처가 사전문진으로 남지 않았다");

    const progress = P.getPersonaProgress(m);
    assert.equal(progress.done, false, "대표 확인 전인데 완료로 처리됐다");
    assert.equal(progress.hasDraft, true);
    assert.equal(P.personaMissingLabel(progress.missing, progress.draft), "문진 자동반영 · 확인 필요");

    const pending = P.buildPersonaPendingList([m], {}, new Set(), "2026-09-17");
    assert.equal(pending.length, 1, "홈 '페르소나 확인 필요' 목록에서 빠졌다(확인 전에는 남아야 한다)");
    assert.equal(pending[0].progress.hasDraft, true);
  });

  it("③-2 초안이 있는 회원은 다음 홈 로드에서 다시 조회 대상에 들어간다(확인 전)", async () => {
    const m = await readAdminView();
    assert.deepEqual(P.selectMembersNeedingPersonaSeed([m], { [MEMBER_ID]: m.persona }), [MEMBER_ID]);
  });

  it("④ 트레이너가 확인 완료하면 실제 persona로 확정 저장된다", async () => {
    const m = await readAdminView();
    const now = "2026-09-17T03:00:00.000Z";
    // 회원 상세의 "확인 완료" 버튼이 하는 일 그대로 — 초안 값을 바꾸지 않고 확정 저장한다.
    const entryFrom = (seed) => ({
      category: seed.category || "", secondaryCategory: seed.secondaryCategory || "", rawText: seed.rawText || "",
      extraCategories: seed.extraCategories || [], source: "onboarding",
      createdAt: seed.createdAt || now, updatedAt: now, updatedBy: TRAINER_UID, confirmedAt: now,
    });
    const persona = {
      ptTrigger: entryFrom(m.personaSeed.ptTrigger),
      selectionReason: entryFrom(m.personaSeed.selectionReason),
      updatedAt: now,
    };
    // db.js saveMemberPrivateFields와 같은 경로(문서 생성 후 persona 맵 통째 교체)
    await assertSucceeds(setDoc(doc(trainerDb, "members", MEMBER_ID, "private", "admin"), { updatedAt: now }, { merge: true }));
    await assertSucceeds(updateDoc(doc(trainerDb, "members", MEMBER_ID, "private", "admin"), { persona, updatedAt: now }));

    const after = await readAdminView();
    const trigger = P.getPersonaEntry(after, "ptTrigger");
    assert.equal(trigger.confirmed, true, "확인 완료로 확정되지 않았다");
    assert.equal(trigger.category, "solo_fail", "확정 저장에서 값이 바뀌었다");
    assert.equal(trigger.rawText, "3개월 안에 5kg 빼고 싶어요", "확정 저장에서 원문이 사라졌다");
    assert.equal(trigger.source, "onboarding", "문진에서 왔다는 출처가 사라졌다");
  });

  it("⑤ 확정 후 홈 '페르소나 확인 필요' 목록에서 빠지고 다시 조회하지 않는다", async () => {
    const m = await readAdminView();
    const progress = P.getPersonaProgress(m);
    assert.equal(progress.done, true, "확인 완료인데 미완료로 남았다");
    assert.equal(progress.hasDraft, false);
    assert.equal(P.buildPersonaPendingList([m], {}, new Set(), "2026-09-17").length, 0, "확인 완료인데 홈 목록에 남았다");
    // 성능: 확정된 회원은 다음 홈 로드에서 온보딩 문서를 다시 읽지 않는다
    assert.deepEqual(P.selectMembersNeedingPersonaSeed([m], { [MEMBER_ID]: m.persona }), []);
  });

  it("⑥ 회원이 문진을 다시 수정해도 관리자 확정값이 덮어써지지 않는다", async () => {
    // 회원이 답을 완전히 다르게 바꿔 재제출한다
    const payload = onboardingPayload({
      joinReasons: ["price", "parking"], ptCause: "how_to",
      primary: "근육 증가", detail: "생각이 바뀌었어요", at: SECOND_AT,
    });
    await assertSucceeds(setDoc(doc(memberDb, "members", MEMBER_ID, "memberOnboarding", "main"), payload, { merge: true }));

    const after = await readAdminView();
    // 원본(문진)은 바뀌고
    assert.deepEqual(after.personaSeed.selectionReason.category, "price", "문진 초안이 갱신되지 않았다");
    assert.equal(after.personaSeed.ptTrigger.category, "how_to");
    // 확정값은 그대로여야 한다
    const trigger = P.getPersonaEntry(after, "ptTrigger");
    const selection = P.getPersonaEntry(after, "selectionReason");
    assert.equal(trigger.category, "solo_fail", "회원 재수정이 관리자 확정값을 덮어썼다");
    assert.equal(selection.category, "review", "회원 재수정이 관리자 확정값을 덮어썼다");
    assert.equal(trigger.rawText, "3개월 안에 5kg 빼고 싶어요", "확정된 원문이 회원 재수정으로 바뀌었다");
    // 홈 목록에도 다시 나타나지 않아야 한다
    assert.equal(P.getPersonaProgress(after).done, true, "회원 재수정 때문에 확인 필요 상태로 되돌아갔다");
    assert.equal(P.buildPersonaPendingList([after], {}, new Set(), "2026-09-17").length, 0, "회원 재수정 때문에 홈 목록에 다시 나타났다");
  });

  it("⑦ 관리자가 확정값을 지우면 문진 초안으로 자동 복귀한다(데이터가 사라지지 않는다)", async () => {
    await assertSucceeds(updateDoc(doc(trainerDb, "members", MEMBER_ID, "private", "admin"), { persona: {} }));
    const after = await readAdminView();
    const trigger = P.getPersonaEntry(after, "ptTrigger");
    assert.equal(trigger.category, "how_to", "확정값 삭제 후 최신 문진 초안으로 돌아가지 않았다");
    assert.equal(trigger.confirmed, false);
    assert.equal(P.buildPersonaPendingList([after], {}, new Set(), "2026-09-17").length, 1, "다시 확인 대상이 되어야 한다");
  });
});
