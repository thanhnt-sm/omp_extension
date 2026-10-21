import { createRequire } from "node:module";
import { describe, expect, test } from "bun:test";
import { createTaskVerificationRuntime, type TaskVerificationRuntimeOptions } from "../src/task-verification-runtime";
import type { ExpertJudgeResponse } from "../src/cook-expert-judge";
import type { ResolvedToolPolicy, TypeSafePayload, TypeSafePreparationResult } from "../src/payload-safety";
import { readonlyVerificationFixture, type ReadonlyVerificationFixture } from "./task-verification-fixture";
import { createSemanticApprovalPolicy, type SemanticApprovalPolicy } from "../src/semantic-approval-policy";

interface LocalPreparationClient {
  prepareRequest(args: TypeSafePayload, policy: ResolvedToolPolicy, options: { apiKey: string; homeDirs: readonly string[] }): TypeSafePreparationResult;
}
interface LocalPolicyClient { resolveTrustedToolPolicy(purpose: "native_done"): ResolvedToolPolicy }
interface OfflineSourceRuntime { options: TaskVerificationRuntimeOptions; calls(): number; preparedBodies: string[] }
function sourceRuntime(host: ReadonlyVerificationFixture, failure: "unavailable" | "rejected" | "below-policy", approvalPolicy: SemanticApprovalPolicy = createSemanticApprovalPolicy({})): OfflineSourceRuntime {
  const key = "synthetic-private-test-key";
  const api = createRequire(import.meta.url)("../src/typesafe-api-client.cjs") as LocalPreparationClient;
  const policy = (createRequire(import.meta.url)("../src/typesafe-policy-client.cjs") as LocalPolicyClient).resolveTrustedToolPolicy("native_done");
  const preparedBodies: string[] = []; let calls = 0;
  const options: TaskVerificationRuntimeOptions = { contracts: host.contracts, evidence: host.evidence, invocations: host.invocations, policyDigest: host.policyDigest,
    approvalPolicy, privacy: { apiKey: key, homeDirs: [host.cwd] }, appendEntry: host.appendEntry, getAdvisorReviews: async () => [],
    createClient(_context, purpose, validator) {
      expect(purpose).toBe("native_done");
      return { async evaluate(request): Promise<ExpertJudgeResponse> {
        calls++;
        const prepared = api.prepareRequest(request, policy, { apiKey: key, homeDirs: [host.cwd] });
        if (!prepared.ok) return { error: prepared.code };
        if (!validator) throw new Error("An exact final prepared-body validator is required");
        expect(await validator(prepared)).toEqual({ ok: true });
        preparedBodies.push(prepared.body);
        // Offline parser stimulus only; no HTTP/provider/native-ready result is fabricated.
        if (failure === "unavailable") return { error: "fixture_service_unavailable" };
        const rejected = failure === "rejected";
        const answers: Record<string, unknown> = { deliverables_verdict: { choice: rejected ? "REJECT" : "APPROVE", confidence: 0.7 }, meets_criteria: { noul: rejected ? 0.12 : 0.85 }, architectural_drift: { choice: "no_drift" }, scope_mode: { choice: "HOLD" } };
        for (const key of Object.keys(request.questions)) if (key.startsWith("criterion_")) answers[key] = { choice: rejected ? "violated" : "satisfied" };
        return { answers };
      } };
    },
  };
  return { options, calls: () => calls, preparedBodies };
}

describe("Authentic local task source with non-authoritative offline semantic stimuli", () => {
  test("outside-preflight review makes one exact-validated monolithic M attempt; outage cannot self-retry or stage", async () => {
    const host = await readonlyVerificationFixture();
    try {
      const fixture = sourceRuntime(host, "unavailable"); const runtime = createTaskVerificationRuntime(fixture.options);
      const target = { task: host.task, phase: "Investigation" };
      const result = await host.invocations.run(host.context, "typesafe_review_task", "review-1", target, () => runtime.review(host.context, "review-1", target));
      // Simulate the SDK's actual delayed assistant/tool-result publication, not a fabricated pre-execute row.
      host.appendCall("typesafe_review_task", "review-1", target);
      expect(result.status).toBe("UNAVAILABLE"); expect(fixture.calls(), JSON.stringify(result)).toBe(1);
      expect(fixture.preparedBodies).toHaveLength(1);
      const body = JSON.parse(fixture.preparedBodies[0]) as { state: Record<string, unknown>; questions: Record<string, unknown> };
      expect(body.state.evidence_packet).toBeDefined();
      expect(body.state.evidence_packets).toBeUndefined();
      expect(body.questions.deliverables_verdict).toBeDefined();
      expect(body.questions.meets_criteria).toBeDefined();
      host.appendResult("typesafe_review_task", "review-1", result);
      expect(runtime.getRecovery(host.context, target)?.kind).toBe("service");
      expect(runtime.hasDebt(host.context, host.record.contract.incarnationId)).toBe(false);
      host.appendCall("typesafe_review_task", "review-2", target);
      expect((await host.invocations.run(host.context, "typesafe_review_task", "review-2", target, () => runtime.review(host.context, "review-2", target))).status).toBe("UNAVAILABLE");
      expect(fixture.calls()).toBe(1);
      expect((await runtime.preflight(host.context, target, "done")).status).not.toBe("APPROVED_PENDING_COMMIT");
      expect(fixture.calls()).toBe(1);
      expect(JSON.stringify(host.entries)).not.toContain("synthetic-private-test-key");
      const restored = createTaskVerificationRuntime(fixture.options);
      expect(restored.getRecovery(host.context, target)?.resumeCommand).toContain("typesafe_review_task");
      expect((await restored.preflight(host.context, target, "done")).status).toBe("EVIDENCE_REQUIRED");
    } finally { await host.dispose(); }
  });
  test("actual scoped source plus a rejected parser stimulus retains durable debt; unchanged evidence never gets another M call", async () => {
    const host = await readonlyVerificationFixture();
    try {
      const fixture = sourceRuntime(host, "rejected"); const runtime = createTaskVerificationRuntime(fixture.options);
      const target = { task: host.task, phase: "Investigation" };
      const rejected = await host.invocations.run(host.context, "typesafe_review_task", "rejection-1", target, () => runtime.review(host.context, "rejection-1", target));
      host.appendCall("typesafe_review_task", "rejection-1", target);
      expect(rejected.status, JSON.stringify(rejected)).toBe("REJECTED"); expect(fixture.calls()).toBe(1);
      host.appendResult("typesafe_review_task", "rejection-1", rejected);
      expect(runtime.hasDebt(host.context, host.record.contract.incarnationId)).toBe(true);
      const recovery = runtime.getRecovery(host.context, target);
      expect(recovery?.schemaVersion).toBe(1); expect(recovery?.owner).toBe("advisor");
      expect(recovery?.assignments.map(assignment => assignment.id)).toEqual(["diagnose", "execute", "verify", "review", "reevaluate"]);
      const report = JSON.parse(recovery!.report) as { actualM: { probability?: number; confidence?: number }[] };
      expect(report.actualM[0].probability).toBe(0.12); expect(report.actualM[0].confidence).toBe(0.7);
      runtime.invalidate(host.context, "turn_end");
      const restored = createTaskVerificationRuntime(fixture.options);
      expect(restored.hasDebt(host.context, host.record.contract.incarnationId)).toBe(true);
      expect(restored.getRecovery(host.context, target)?.report).toBe(recovery?.report);
      host.appendCall("typesafe_review_task", "rejection-2", target);
      expect((await host.invocations.run(host.context, "typesafe_review_task", "rejection-2", target, () => restored.review(host.context, "rejection-2", target))).status).toBe("REJECTED");
      expect(fixture.calls()).toBe(1);
      expect((await restored.preflight(host.context, target, "done")).status).not.toBe("APPROVED_PENDING_COMMIT");
    } finally { await host.dispose(); }
  });
});
