import { describe, expect, test } from "bun:test";
import { canonicalDigest } from "../src/task-contract-source";
import { createAdvisorRequest, foldAdvisorHistory, makeAdvisorReceipt, validateAdvisorReceipt, validateAssessment, type AdvisorJournalRecord } from "../src/advisor-protocol";
import { advisorFixture, digest, validAssessment } from "./advisor-fixtures";
import { arbitrateConsensus, evaluateAdvisorIntent } from "../src/bicameral-consensus";

describe("Advisor protocol authority and coverage", () => {
  for (const purpose of ["consultation", "task_review", "parent_review", "shadow"] as const) {
    test(`binds ${purpose} without confusing native authority`, () => {
      const { request } = advisorFixture(purpose);
      const receipt = makeAdvisorReceipt(request, validAssessment(purpose === "parent_review"), "allocated-real-child", digest);
      expect(receipt.authority).toBe(purpose === "consultation" || purpose === "shadow" ? "none" : "task_bound");
      expect(validateAdvisorReceipt(receipt, { binding: request.binding, snapshot: request.snapshot, criterionIds: request.criterionIds, requireParentIntegration: purpose === "parent_review" }).valid).toBe(true);
      expect(Object.isFrozen(receipt.assessment.criterionCoverage)).toBe(true);
    });
  }
  test("consultation cannot carry a task target", () => {
    const { request, context, contract } = advisorFixture();
    expect(() => createAdvisorRequest({ ...request, binding: { ...request.binding, purpose: "task_review", target: contract.target, logicalOperationId: "operation", contract: { contractId: "contract", revisionId: "revision", incarnationId: "incarnation" } } }, context)).toThrow();
  });
  test("canonical copy is independent of mutable child output", () => {
    const { request } = advisorFixture(); const raw = validAssessment();
    const receipt = makeAdvisorReceipt(request, raw, "real-child", digest);
    raw.recommendation = "changed after terminal delivery";
    expect(receipt.assessment.recommendation).not.toBe(raw.recommendation);
  });
  test("all children passing cannot replace parent integration", () => {
    const assessment = validAssessment();
    expect(validateAssessment(assessment, ["original-criterion"], true)).toBe(false);
    assessment.parentIntegration = { status: "contradicted", criterionIds: ["original-criterion"], evidenceRefs: ["writer-reader-mismatch"] };
    expect(validateAssessment(assessment, ["original-criterion"], true)).toBe(true);
    const { request } = advisorFixture("parent_review");
    const receipt = makeAdvisorReceipt(request, assessment, "real-child", digest);
    expect(receipt.assessment.parentIntegration.status).toBe("contradicted");
  });
  test("rejects missing, duplicate and foreign original coverage", () => {
    const assessment = validAssessment();
    expect(validateAssessment({ ...assessment, criterionCoverage: [] }, ["original-criterion"], false)).toBe(false);
    expect(validateAssessment({ ...assessment, criterionCoverage: [...assessment.criterionCoverage, ...assessment.criterionCoverage] }, ["original-criterion"], false)).toBe(false);
    expect(validateAssessment({ ...assessment, criterionCoverage: [{ criterionId: "generated-replacement", status: "covered", evidenceRefs: ["e"] }] }, ["original-criterion"], false)).toBe(false);
  });
  test("rejects leaked hidden fields and invalid confidence", () => {
    expect(validateAssessment({ ...validAssessment(), rawThinking: "private" }, ["original-criterion"], false)).toBe(false);
    expect(validateAssessment({ ...validAssessment(), rankedOptions: [{ rank: 1, option: "x", rationale: "x", prompt: "private" }] }, ["original-criterion"], false)).toBe(false);
    expect(validateAssessment({ ...validAssessment(), confidence: NaN }, ["original-criterion"], false)).toBe(false);
  });
  test("changed test tree or contract incarnation invalidates applicability", () => {
    const { request } = advisorFixture("task_review"); const receipt = makeAdvisorReceipt(request, validAssessment(), "child", digest);
    expect(validateAdvisorReceipt(receipt, { binding: request.binding, snapshot: { ...request.snapshot, testDigest: canonicalDigest("changed tests") }, criterionIds: request.criterionIds }).valid).toBe(false);
    if (request.binding.purpose !== "task_review") throw new Error("fixture");
    expect(validateAdvisorReceipt(receipt, { binding: { ...request.binding, contract: { ...request.binding.contract, incarnationId: "reincarnated" } }, snapshot: request.snapshot, criterionIds: request.criterionIds }).valid).toBe(false);
  });
  test("ordinary history restore retains applicable review but foreign epochs do not", () => {
    const { request } = advisorFixture(); const receipt = makeAdvisorReceipt(request, validAssessment(), "child", digest);
    const entries: AdvisorJournalRecord[] = [{ kind: "advisor_request", request }, { kind: "advisor_receipt", receipt }, { kind: "advisor_continued", requestId: request.requestId }];
    expect(foldAdvisorHistory(entries, { sessionId: "session", sessionEpoch: "epoch" }).get(request.requestId)?.receipt?.receiptId).toBe(receipt.receiptId);
    expect(foldAdvisorHistory(entries, { sessionId: "session", sessionEpoch: "fork-epoch" }).size).toBe(0);
    expect(foldAdvisorHistory(entries, { sessionId: "foreign", sessionEpoch: "epoch" }).size).toBe(0);
  });
  test("conflicting terminal duplicates remain invalid across repeated request entries", () => {
    const { request } = advisorFixture(); const first = makeAdvisorReceipt(request, validAssessment(), "child", digest);
    const second = makeAdvisorReceipt(request, { ...validAssessment(), verdict: "block" }, "child", digest);
    const entries: AdvisorJournalRecord[] = [{ kind: "advisor_request", request }, { kind: "advisor_receipt", receipt: first }, { kind: "advisor_receipt", receipt: second }, { kind: "advisor_request", request }];
    const state = foldAdvisorHistory(entries, { sessionId: "session", sessionEpoch: "epoch" }).get(request.requestId);
    expect(state?.invalidated).toBe(true); expect(state?.receipt).toBeUndefined();
  });
  test("actual composition cannot close a parent on all-child-pass with integration contradiction", () => {
    const { request } = advisorFixture("parent_review");
    const assessment = validAssessment(true);
    assessment.parentIntegration = { status: "contradicted", criterionIds: [...request.criterionIds], evidenceRefs: ["writer-reader-mismatch"] };
    const receipt = makeAdvisorReceipt(request, assessment, "actual-native-fixture-child", digest);
    const rawAdvisor = evaluateAdvisorIntent({ operation: "done", task: "Original writer/reader parent integration" });
    const decision = arbitrateConsensus(rawAdvisor, { verdict: "APPROVE", probability: 1, reasons: ["All child unit checks pass."] },
      { receipt, binding: request.binding, snapshot: request.snapshot, criterionIds: request.criterionIds, requireParentIntegration: true });
    expect(decision.disposition.status).not.toBe("APPROVED_PENDING_COMMIT");
    expect(decision.jev.verdict).toBe("APPROVE");
    expect(receipt.assessment.parentIntegration.status).toBe("contradicted");
  });
  test("actual composition rejects consultation as native task authority", () => {
    const { request } = advisorFixture("consultation");
    const receipt = makeAdvisorReceipt(request, validAssessment(), "actual-native-fixture-child", digest);
    const decision = arbitrateConsensus(evaluateAdvisorIntent({ operation: "ask", task: "Technical consultation" }),
      { verdict: "APPROVE", probability: 1, reasons: [] }, { receipt, binding: request.binding, snapshot: request.snapshot, criterionIds: request.criterionIds });
    expect(decision.disposition.status).toBe("EVIDENCE_REQUIRED");
    expect(receipt.authority).toBe("none");
  });
});
