import { describe, expect, test } from "bun:test";
import {
  isTechnicalImplementationQuestion,
  isSolvableTechnicalFailure,
  formatAdvisorAutoRemediation,
  interceptAskCall,
  shouldAppendAdvisorRemediation,
} from "../src/anti-blocking-guards";
import { createTodoLifecycleAuthority } from "../src/todo-lifecycle-authority";
import { createTaskVerificationRuntime } from "../src/task-verification-runtime";
import { createSemanticApprovalPolicy } from "../src/semantic-approval-policy";
import { canonicalDigest } from "../src/task-contract-source";
import { readonlyVerificationFixture } from "./task-verification-fixture";
import { AdvisorHostFixture } from "./advisor-host-fixture";
import type { HostHistoryEntry } from "../src/host-history";
import type { ContractHistoryProjection, NativeIncarnationReference } from "../src/types/verification";

/** Live todo-block authority fixture (the path interceptTodoCall used to duplicate). */
function lifecycleFixture() {
  const entries: HostHistoryEntry[] = [{ id: "e1", parentId: null, type: "message", message: { role: "user", content: "Task A" } }];
  const target: NativeIncarnationReference = {
    incarnationId: canonicalDigest("inc-A"),
    creation: { sessionId: "sess-1", branchId: "e1", entryId: "e1", callId: "init-1" },
    target: { phase: "Phase 1", phaseOrdinal: 0, content: "Migrate staging schema", ordinal: 0 },
    creationKnown: true,
  };
  const projection: ContractHistoryProjection = {
    sessionId: "sess-1", branchId: "e1", nativeStateReliable: true,
    nativePhases: [{ name: "Phase 1", tasks: [{ content: "Migrate staging schema", status: "in_progress" }] }],
    incarnations: [target], contracts: [], contractRevisions: [], debt: [], nativeSuccesses: [], nativeFailures: [], issues: [],
  };
  const ctx = { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => true }, sessionManager: { getSessionId: () => "sess-1", getBranch: () => entries } };
  const authority = createTodoLifecycleAuthority({
    appendEntry(customType, data) { entries.push({ id: `e-${entries.length + 1}`, parentId: entries.at(-1)!.id, type: "custom", customType, data }); },
    project: () => projection, hasDebt: () => false,
  });
  return { ctx, authority };
}
const handoff = { owner: "platform-team", nextAction: "Provision credentials", unblockCondition: "Credentials issued", resumeCommand: "todo unblock task=\"Migrate staging schema\"" };

describe("Anti-Blocking & Anti-Spam Middleware Guards", () => {
  describe("isTechnicalImplementationQuestion", () => {
    test("detects technical debugging, test failures, and implementation questions", () => {
      expect(isTechnicalImplementationQuestion("Tests are failing with exit code 1. How should I fix this?")).toBe(true);
      expect(isTechnicalImplementationQuestion("How should I implement the database connector?")).toBe(true);
      expect(isTechnicalImplementationQuestion("Which function should I modify to repair this syntax error?")).toBe(true);
      expect(isTechnicalImplementationQuestion("bun test failed on 3 assertions. What code should I write?")).toBe(true);
      expect(isTechnicalImplementationQuestion("Lỗi kiểm thử thất bại, tôi cần sửa code thế nào?")).toBe(true);
      expect(isTechnicalImplementationQuestion("Làm sao để sửa type error trong typesafe-planner.ts?")).toBe(true);
    });

    test("permits genuine business requirements and high-level human scope decisions", () => {
      expect(isTechnicalImplementationQuestion("Do you prefer dark mode or light mode as the default theme?")).toBe(false);
      expect(isTechnicalImplementationQuestion("Should we bill customers monthly or annually?")).toBe(false);
      expect(isTechnicalImplementationQuestion("Which third-party provider do you want to integrate: Stripe or PayPal?")).toBe(false);
      expect(isTechnicalImplementationQuestion("Bạn muốn sử dụng tên miền nào cho sản phẩm?")).toBe(false);
    });
  });

  describe("isSolvableTechnicalFailure", () => {
    test("identifies solvable technical failures in blocking reasons", () => {
      expect(isSolvableTechnicalFailure("bun test failed with exit code 1")).toBe(true);
      expect(isSolvableTechnicalFailure("Missing implementation of auth handler")).toBe(true);
      expect(isSolvableTechnicalFailure("EVIDENCE_REQUIRED: test suite not passing")).toBe(true);
      expect(isSolvableTechnicalFailure("Syntax error in handler.ts")).toBe(true);
      expect(isSolvableTechnicalFailure("Kiểm thử hỏng chưa giải quyết được")).toBe(true);
    });

    test("allows legitimate external blockers or human authorization requirements", () => {
      expect(isSolvableTechnicalFailure("Waiting for Stripe production API credentials from client")).toBe(false);
      expect(isSolvableTechnicalFailure("Third-party server is down (HTTP 503 Service Unavailable)")).toBe(false);
      expect(isSolvableTechnicalFailure("Chờ phê duyệt pháp lý từ bộ phận tuân thủ")).toBe(false);
    });
  });

  describe("interceptAskCall", () => {
    test("blocks technical questions from reaching the user", () => {
      const result = interceptAskCall({
        questions: [{ question: "Tests are failing in auth.ts. How should I fix this?" }],
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("BLOCKED: Câu hỏi liên quan đến lỗi kỹ thuật");
    });

    test("allows non-technical domain questions to proceed", () => {
      const result = interceptAskCall({
        questions: [{ question: "Which logo design do you prefer: Option A or Option B?" }],
      });
      expect(result.blocked).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    test("every question is checked: harmless first + technical second is blocked", () => {
      const result = interceptAskCall({
        questions: [{ question: "Which logo design do you prefer?" }, { question: "Tests are failing in auth.ts. How should I fix this?" }],
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("BLOCKED");
    });

    test("multiple harmless questions pass; humanOwned exempts a technical later question", () => {
      expect(interceptAskCall({ questions: [{ question: "Logo A or B?" }, { question: "Which brand colour?" }] }).blocked).toBe(false);
      const mixed = { questions: [{ question: "Logo A or B?" }, { question: "Tests are failing, how to fix this?" }] };
      expect(interceptAskCall(mixed, { humanOwned: true }).blocked).toBe(false);
    });
  });

  // Live todo-block behavior (moved from the deleted dead-code interceptTodoCall): TodoLifecycleAuthority.prepare.
  describe("live todo block authority (todo-lifecycle-authority)", () => {
    test("refuses to park a task on a solvable test failure and points at the Advisor remediation loop", async () => {
      const { ctx, authority } = lifecycleFixture();
      const result = await authority.prepare(ctx, {
        input: { op: "block", task: "Migrate staging schema", reason: "bun test failed with exit code 1: 2 assertions failed" }, handoff,
      });
      expect(result.status).toBe("EVIDENCE_REQUIRED");
      const reasons = "reasons" in result ? result.reasons.join("\n") : "";
      expect(reasons).toContain("CẤM đóng băng todo vì lỗi kiểm thử");
      expect(reasons).toContain("typesafe_prepare_advisor");
    });

    test("allows preparing a block for a genuine external blocker", async () => {
      const { ctx, authority } = lifecycleFixture();
      const result = await authority.prepare(ctx, {
        input: { op: "block", task: "Migrate staging schema", reason: "Chờ khách hàng bàn giao production API key" }, handoff,
      });
      expect(result.status).toBe("PREPARED");
    });
  });

  describe("interceptAskCall human-owned exemption", () => {
    const technical = { questions: [{ question: "Tests are failing in auth.ts. How should I fix this?" }] };
    test("ask about a HUMAN_REQUIRED (human-owned) task is not blocked as technical", () => {
      expect(interceptAskCall(technical, { humanOwned: true })).toEqual({ blocked: false });
    });
    test("humanOwned must be an explicit true; absent or false keeps the block", () => {
      expect(interceptAskCall(technical).blocked).toBe(true);
      expect(interceptAskCall(technical, {}).blocked).toBe(true);
      expect(interceptAskCall(technical, { humanOwned: false }).blocked).toBe(true);
    });
  });

  describe("formatAdvisorAutoRemediation", () => {
    test("formats valid typesafe_prepare_advisor invocation string", () => {
      const formatted = formatAdvisorAutoRemediation("Xây dựng module xác thực", "Pha 1", ["Thiếu hàm hash"]);
      expect(formatted).toContain("typesafe_prepare_advisor");
      expect(formatted).toContain("Xây dựng module xác thực");
      expect(formatted).toContain("decision\":\"stuck\"");
    });

    function emittedParams(): Record<string, unknown> {
      const formatted = formatAdvisorAutoRemediation("Task A", "Phase 1", ["x"]);
      const line = formatted.split("\n").find(entry => entry.startsWith("typesafe_prepare_advisor "))!;
      return JSON.parse(line.slice("typesafe_prepare_advisor ".length)) as Record<string, unknown>;
    }

    test("auto-remediation hint uses consultation purpose accepted by typesafe_prepare_advisor", async () => {
      const params = emittedParams();
      expect(params.purpose).toBe("consultation");
      // Tool-level: the registered tool accepts this purpose (an invented one is UNAVAILABLE) and returns a pending native task.
      const host = new AdvisorHostFixture(); await host.start();
      expect((await host.prepare({ purpose: "invented" }, false)).status).toBe("UNAVAILABLE");
      expect((await host.prepare(params, false)).status).toBe("REVIEW_REQUIRED");
      // Runtime-level: the real consultation mode prepares a draft for the hint's selector without any task proof...
      const source = await readonlyVerificationFixture();
      try {
        const runtime = createTaskVerificationRuntime({ contracts: source.contracts, evidence: source.evidence, invocations: source.invocations, policyDigest: source.policyDigest,
          approvalPolicy: createSemanticApprovalPolicy({}), getAdvisorReviews: async () => [], appendEntry: source.appendEntry,
          createClient() { throw new Error("remediation hint preparation must not dispatch a judge"); } });
        const selector = { ...params, task: source.task, phase: "Investigation" };
        const consultation = await runtime.advisorServices.prepareReview(selector, source.context, "consultation");
        expect("binding" in consultation && consultation.binding.purpose).toBe("consultation");
        // ...whereas the purpose-less form selects task mode, which the runtime refuses without complete proof.
        const { purpose: _omitted, ...withoutPurpose } = selector;
        const taskMode = await runtime.advisorServices.prepareReview(withoutPurpose, source.context, "task");
        expect("status" in taskMode && taskMode.status).toBe("EVIDENCE_REQUIRED");
      } finally { await source.dispose(); }
    });
  });

  describe("shouldAppendAdvisorRemediation", () => {
    test("is appended for REJECTED and for EVIDENCE_REQUIRED that names missing criteria (a review exists)", () => {
      expect(shouldAppendAdvisorRemediation({ status: "REJECTED" })).toBe(true);
      expect(shouldAppendAdvisorRemediation({ status: "EVIDENCE_REQUIRED", missingCriterionIds: ["c1"] })).toBe(true);
    });

    test("remediation is not appended for UNAVAILABLE/HUMAN_REQUIRED or missing-review preflight", async () => {
      expect(shouldAppendAdvisorRemediation({ status: "UNAVAILABLE" })).toBe(false);
      expect(shouldAppendAdvisorRemediation({ status: "HUMAN_REQUIRED" })).toBe(false);
      expect(shouldAppendAdvisorRemediation({ status: "EVIDENCE_REQUIRED", reviewMissing: true })).toBe(false);
      // The runtime's real "no review yet" preflight outcome must be classified as not-appendable.
      const source = await readonlyVerificationFixture();
      try {
        const runtime = createTaskVerificationRuntime({ contracts: source.contracts, evidence: source.evidence, invocations: source.invocations, policyDigest: source.policyDigest,
          approvalPolicy: createSemanticApprovalPolicy({}), getAdvisorReviews: async () => [], appendEntry: source.appendEntry,
          createClient() { throw new Error("preflight must not dispatch a judge"); } });
        const outcome = await runtime.preflight(source.context, { task: source.task, phase: "Investigation" }, "done");
        expect(outcome.status).toBe("EVIDENCE_REQUIRED");
        expect("reviewMissing" in outcome && outcome.reviewMissing).toBe(true);
        expect(shouldAppendAdvisorRemediation(outcome)).toBe(false);
      } finally { await source.dispose(); }
    });

    test("post-review EVIDENCE_REQUIRED with an empty missing list (Advisor-owned recovery) still gets the hint", () => {
      // bicameral-consensus returns EVIDENCE_REQUIRED with [] after a real review; the recovery owner is the Advisor.
      expect(shouldAppendAdvisorRemediation({ status: "EVIDENCE_REQUIRED" })).toBe(true);
      expect(shouldAppendAdvisorRemediation({ status: "EVIDENCE_REQUIRED", reviewMissing: false })).toBe(true);
    });
  });
});
