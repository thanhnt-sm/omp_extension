import { describe, expect, test } from "bun:test";
import { createTaskRecoveryPolicy, recoveryProgressDigest, recordRecoveryAttempt, createRejectionDebt, type RecoveryProgress, type RecoveryIdentity, type DebtResolution } from "../src/task-recovery";
import type { VerificationOutcome } from "../src/types/verification";

const digest = "a".repeat(64);
const progress: RecoveryProgress = { contractDigest: digest, policyDigest: digest, criterionEvidence: { criterion: [digest] } };
const identity: RecoveryIdentity = { contract: { contractId: "task", revisionId: "revision", incarnationId: "incarnation" }, bindingDigest: digest, criterionIds: ["criterion"] };
const rejection: Extract<VerificationOutcome, { status: "REJECTED" }> = { status: "REJECTED", criterionIds: ["criterion"], reasons: ["Criterion contradicts task evidence"] };
const unavailable: VerificationOutcome = { status: "UNAVAILABLE", component: "semantic_judge", reasons: ["Provider unavailable"] };
const rejectingHost = {
  consumeAvailabilityChange: () => false,
  nativeCommitSucceeded: () => false,
  humanAmendmentValidated: () => false,
};

describe("Task-bound actionable recovery", () => {
  test("progress uses only relevant criterion, contract, and policy evidence identities", () => {
    const reordered: RecoveryProgress = { ...progress, criterionEvidence: { criterion: [digest, digest] } };
    expect(recoveryProgressDigest(progress)).toBe(recoveryProgressDigest(reordered));
    expect(recoveryProgressDigest({ ...progress, criterionEvidence: { criterion: ["b".repeat(64)] } })).not.toBe(recoveryProgressDigest(progress));
    expect(recoveryProgressDigest({ ...progress, policyDigest: "b".repeat(64) })).not.toBe(recoveryProgressDigest(progress));
    expect(() => recoveryProgressDigest({ ...progress, criterionEvidence: { criterion: ["timestamp-only"] } })).toThrow("recovery_progress_invalid");
  });
  test("semantic rejection counts honestly, while outage and evidence requests do not count as failed implementation", () => {
    const first = recordRecoveryAttempt(undefined, rejection, recoveryProgressDigest(progress));
    expect(first.semanticFailures).toBe(1);
    const outage = recordRecoveryAttempt(first, unavailable, first.progressDigest);
    expect(outage.semanticFailures).toBe(1);
    const evidence = recordRecoveryAttempt(outage, { status: "EVIDENCE_REQUIRED", missingCriterionIds: ["criterion"], reasons: ["Artifact missing"] }, first.progressDigest);
    expect(evidence.semanticFailures).toBe(1);
    expect(recordRecoveryAttempt(evidence, rejection, first.progressDigest).semanticFailures).toBe(2);
  });
  test("repair assignments are dependency ordered and include parent verification and independent review", () => {
    const policy = createTaskRecoveryPolicy(rejectingHost);
    const plan = policy.plan({ outcome: rejection, progress });
    expect(plan.kind).toBe("repair");
    expect(plan.assignments.map(a => a.id)).toEqual(["diagnose", "execute", "verify", "review", "reevaluate"]);
    expect(plan.assignments[1].dependsOn).toEqual(["diagnose"]);
    expect(plan.assignments[2].owner).toBe("parent");
    expect(plan.assignments[3].owner).toBe("independent_reviewer");
    expect(plan.assignments[4].dependsOn).toEqual(["review"]);
    expect(plan.assignments[0].action).toContain("criterion");
    expect(Object.isFrozen(plan.assignments)).toBe(true);
  });
  test("same rejected evidence cannot enter an autonomous self-retry loop", () => {
    const previous = recordRecoveryAttempt(undefined, rejection, recoveryProgressDigest(progress));
    const policy = createTaskRecoveryPolicy(rejectingHost);
    const unchanged = policy.plan({ outcome: rejection, progress, previous });
    expect(unchanged.retryAllowed).toBe(false);
    expect(unchanged.kind).toBe("human");
    const changed = policy.plan({ outcome: rejection, progress: { ...progress, criterionEvidence: { criterion: ["b".repeat(64)] } }, previous });
    expect(changed.kind).toBe("repair");
    expect(changed.retryAllowed).toBe(true);
  });
  test("outage recovery requires a real host-observed change, not code edits or payload booleans", () => {
    const change = { failedAttemptId: "failed-dispatch:1", component: "semantic_judge", previousObservationId: "outage:1", currentObservationId: "restored:1" };
    const request = { outcome: unavailable, progress, failedAttemptId: change.failedAttemptId, availabilityChange: change };
    const denied = createTaskRecoveryPolicy(rejectingHost).plan(request);
    expect(denied.kind).toBe("service");
    expect(denied.retryAllowed).toBe(false);
    expect(denied.assignments.every(a => a.owner !== "scoped_executor")).toBe(true);
    const policy = createTaskRecoveryPolicy({ ...rejectingHost, consumeAvailabilityChange: value => value.currentObservationId === "restored:1" });
    expect(policy.plan({ ...request, failedAttemptId: "unrelated-failed-dispatch" }).retryAllowed).toBe(false);
    expect(policy.plan({ ...request, availabilityChange: { ...change, currentObservationId: change.previousObservationId } }).retryAllowed).toBe(false);
    expect(policy.plan({ ...request, availabilityChange: { ...change, component: "other" } }).retryAllowed).toBe(false);
    expect(policy.plan(request).retryAllowed).toBe(true);
    expect(policy.plan(request).retryAllowed).toBe(false);
    expect(policy.plan({ ...request, failedAttemptId: "failed-dispatch:2", availabilityChange: { ...change, failedAttemptId: "failed-dispatch:2" } }).retryAllowed).toBe(false);
    expect(policy.plan({ ...request, failedAttemptId: "failed-dispatch:2", availabilityChange: { ...change, failedAttemptId: "failed-dispatch:2", previousObservationId: "outage:2" } }).retryAllowed).toBe(false);
  });
  test("durably consumed restoration observation cannot be replayed through a new policy instance", () => {
    const consumed = new Set<string>();
    const host = {
      ...rejectingHost,
      consumeAvailabilityChange(change: { failedAttemptId: string; currentObservationId: string }, expected: { failedAttemptId: string; progressDigest: string }) {
        if (change.failedAttemptId !== expected.failedAttemptId || expected.progressDigest !== recoveryProgressDigest(progress) || consumed.has(change.currentObservationId)) return false;
        consumed.add(change.currentObservationId);
        return true;
      },
    };
    const request = { outcome: unavailable, progress, failedAttemptId: "failed-dispatch:1", availabilityChange: {
      failedAttemptId: "failed-dispatch:1", component: "semantic_judge", previousObservationId: "outage:1", currentObservationId: "restored:1",
    } };
    expect(createTaskRecoveryPolicy(host).plan(request).retryAllowed).toBe(true);
    expect(createTaskRecoveryPolicy(host).plan(request).retryAllowed).toBe(false);
    expect(createTaskRecoveryPolicy(host).plan({ ...request, failedAttemptId: "failed-dispatch:2",
      availabilityChange: { ...request.availabilityChange, failedAttemptId: "failed-dispatch:2", previousObservationId: "outage:2" } }).retryAllowed).toBe(false);
    expect(createTaskRecoveryPolicy(host).plan({ ...request, failedAttemptId: "failed-dispatch:2",
      availabilityChange: { ...request.availabilityChange, failedAttemptId: "failed-dispatch:2", previousObservationId: "outage:2", currentObservationId: "restored:2" } }).retryAllowed).toBe(true);
  });
  test("missing investigation evidence requests evidence, not unrelated implementation", () => {
    const plan = createTaskRecoveryPolicy(rejectingHost).plan({ outcome: { status: "EVIDENCE_REQUIRED", missingCriterionIds: ["report.findings"], reasons: ["Task-bound findings artifact is absent"] }, progress });
    expect(plan.kind).toBe("evidence");
    expect(plan.assignments[1].action).toContain("Collect");
    expect(plan.assignments[1].action).toContain("report.findings");
    expect(plan.assignments[2].verification).toContain("investigation/report artifacts");
  });
});

describe("Rejection debt binding and release", () => {
  const native: Extract<DebtResolution, { kind: "native_commit" }> = { kind: "native_commit", contract: identity.contract, debtBindingDigest: digest, bindingDigest: digest, stagedReceiptId: "staged", nativeCallId: "call", nativeResultEntryId: "result" };
  const amendment: Extract<DebtResolution, { kind: "human_amendment" }> = { kind: "human_amendment", contract: identity.contract, amendsBindingDigest: digest,
    amendment: { sessionId: "session", entryId: "host-amendment", digest, kind: "user_amendment" } };
  test("a favorable preflight, message, branch change or reappend cannot release debt", () => {
    const debt = createRejectionDebt(identity, rejection, recoveryProgressDigest(progress));
    const policy = createTaskRecoveryPolicy(rejectingHost);
    expect(policy.releaseDebt(debt, native)).toBe(false);
    expect(policy.releaseDebt(debt, amendment)).toBe(false);
    const allowed = createTaskRecoveryPolicy({ ...rejectingHost, nativeCommitSucceeded: () => true });
    expect(allowed.releaseDebt(debt, { ...native, contract: { ...native.contract, incarnationId: "reappend" } })).toBe(false);
    expect(allowed.releaseDebt(debt, { ...native, debtBindingDigest: "b".repeat(64) })).toBe(false);
    expect(allowed.releaseDebt(debt, { ...native, nativeResultEntryId: "" })).toBe(false);
    expect(Object.isFrozen(debt.identity.contract)).toBe(true);
  });
  test("only exact matching real native success or host-validated amendment releases debt", () => {
    const debt = createRejectionDebt(identity, rejection, recoveryProgressDigest(progress));
    const policy = createTaskRecoveryPolicy({ consumeAvailabilityChange: () => false,
      nativeCommitSucceeded: value => value.nativeResultEntryId === "result",
      humanAmendmentValidated: value => value.amendment.entryId === "host-amendment" });
    expect(policy.releaseDebt(debt, native)).toBe(true);
    expect(policy.releaseDebt(debt, { ...native, bindingDigest: "b".repeat(64) })).toBe(true);
    expect(policy.releaseDebt(debt, amendment)).toBe(true);
    expect(policy.releaseDebt(debt, { ...amendment, amendsBindingDigest: "b".repeat(64) })).toBe(false);
  });
  test("staging never closes an obligation or releases debt", () => {
    const plan = createTaskRecoveryPolicy(rejectingHost).plan({ outcome: { status: "APPROVED_PENDING_COMMIT", receiptId: "receipt", bindingDigest: digest }, progress });
    expect(plan.kind).toBe("pending_commit");
    expect(plan.retryAllowed).toBe(false);
    expect(plan.assignments[0].verification).toContain("outer error/abort/missing result cannot commit");
  });
});
