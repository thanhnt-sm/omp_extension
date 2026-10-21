import { canonicalDigest, contractDigest } from "../src/task-contract-source";
import { createAdvisorRequest, type AdvisorAssessment, type AdvisorRequest, type ReviewSnapshot } from "../src/advisor-protocol";
import type { ReviewBindingContext } from "../src/task-contract-review";
import type { ReviewBinding, TaskContract } from "../src/types/verification";
import type { JudgeEvidencePacket, JudgeEvidencePacketSetResult } from "../src/judge-evidence-packet";

export const digest = canonicalDigest("fixture");
export function advisorFixture(purpose: "consultation" | "task_review" | "parent_review" | "shadow" = "consultation"): { request: AdvisorRequest; contract: TaskContract; packet: JudgeEvidencePacket; packetSet: JudgeEvidencePacketSetResult; context: ReviewBindingContext } {
  const original = { sessionId: "session", entryId: "user-entry", digest, kind: "user_request" as const };
  const source = { path: "plans/public-plan.md", digest: contractDigest("public obligation"), startLine: 1, endLine: 1, text: "public obligation" };
  const criterion = { id: "original-criterion", kind: purpose === "parent_review" ? "parent_integration" as const : "acceptance" as const, text: "public obligation", source };
  const scope = { paths: ["src/public.ts"], operations: ["read" as const] };
  const contract: TaskContract = { schemaVersion: 1, contractId: "contract", revision: 1, revisionId: "revision", incarnationId: "incarnation",
    creation: { sessionId: "session", branchId: "branch", entryId: "native-result", callId: "native-call" }, target: { phase: "phase", phaseOrdinal: 0, content: "public task", ordinal: 0 }, taskKind: "review",
    allowedMutationScope: scope, approvedSource: { kind: "plan", path: source.path, digest: source.digest, approval: original, spans: [source] },
    originalUserRequest: original, amendments: [], criteria: [criterion], approvedCommandIds: [], parentRequirements: [], policyDigest: digest };
  const provenance = { sessionId: "session", branchId: "branch", requestEntryId: "user-entry", dispatchId: "dispatch", evidenceDigest: digest, policyDigest: digest, questionDigest: digest };
  const base = { provenance, authorizedScope: scope };
  const contractRef = { contractId: contract.contractId, revisionId: contract.revisionId, incarnationId: contract.incarnationId };
  const binding: ReviewBinding = purpose === "consultation" ? { ...base, purpose, request: original }
    : purpose === "shadow" ? { ...base, purpose, corpus: { corpusId: "corpus", caseId: "case", contractDigest: canonicalDigest(contract) } }
      : purpose === "parent_review" ? { ...base, purpose, contract: contractRef, logicalOperationId: "operation", target: contract.target, parentObligationIds: [criterion.id], childReceiptIds: ["child-receipt"], integrationReceiptIds: ["integration-receipt"] }
        : { ...base, purpose, contract: contractRef, logicalOperationId: "operation", target: contract.target };
  const context: ReviewBindingContext = { sessionId: "session", branchId: "branch", purpose, expectedProvenance: provenance, authorizedScope: scope, validateReference: () => true,
    contract, logicalOperationId: "operation", parentObligationIds: [criterion.id], childReceiptIds: ["child-receipt"], integrationReceiptIds: ["integration-receipt"], corpus: { corpusId: "corpus", caseId: "case", contractDigest: canonicalDigest(contract) } };
  const snapshot: ReviewSnapshot = { contractDigest: canonicalDigest(contract), evidenceDigest: digest, treeDigest: digest, testDigest: digest, policyDigest: digest, parentDigest: digest, childDigest: digest, integrationDigest: digest };
  const publicPrompt = "Independently assess the supplied public obligation and evidence. Return the full structured assessment using yield(data).";
  const request = createAdvisorRequest({ binding, snapshot, criterionIds: [criterion.id], evidenceRefs: ["source:src/public.ts:fixture", "integration-receipt", "writer-reader-mismatch"], integrationEvidenceRefs: ["integration-receipt"], publicPrompt, sessionEpoch: "epoch", parentAgentId: "parent", parentToolCallId: "task-call", itemIndex: 0, agent: "advisor",
    scope: { workspaceRoot: "D:/workspace", files: [{ path: "src/public.ts", sha256: digest }], resources: [], publicContextDigest: canonicalDigest([{ role: "user", content: publicPrompt }]), egressPolicyDigest: digest } }, context);
  const packet: JudgeEvidencePacket = { schemaVersion: 1, binding: { ...contractRef, originalRequestDigest: original.digest, policyDigest: digest, target: contract.target },
    applicability: { taskKind: contract.taskKind, allowedMutationScope: scope, sourceMutations: [] }, originalSource: contract.approvedSource, parentRequirements: [], criteria: [criterion],
    obligations: [{ id: "obligation", criterionId: criterion.id, kind: "semantic", evidenceIds: ["source:src/public.ts:fixture"], requirement: criterion.text }],
    snapshots: { baselineId: "baseline", evaluatedId: "evaluated", evaluatedTreeDigest: digest }, source: [], diff: "", artifacts: [], counterevidence: [], omissions: [] };
  const packetSet: JudgeEvidencePacketSetResult = { ok: true, status: "READY_FOR_PARENT_REVIEW", packets: [{ packet, digest: canonicalDigest(packet) }], reasons: [], manifest: {
    schemaVersion: 1, contractDigest: canonicalDigest(contract), evidenceDigest: digest, criteria: contract.criteria, originalSource: contract.approvedSource, parentRequirements: [], source: [],
    diff: { digest: contractDigest(""), bytes: 0 }, artifacts: [], changedFiles: [], packets: [{ digest: canonicalDigest(packet), criterionIds: [criterion.id], source: [], artifactPaths: [] }],
    counterevidence: [], omissions: [], uncoveredCriterionIds: [], uncoveredParentRequirementIds: [], uncoveredArtifactPaths: [], coverageComplete: true, requiresIndependentParentReview: true, globalCompletionEligible: false,
  } };
  return { request, contract, packet, packetSet, context };
}
export function validAssessment(parent = false): AdvisorAssessment {
  return { verdict: "proceed", recommendation: "Proceed only after deterministic checks and native commit.", rankedOptions: [{ rank: 1, option: "Preserve obligations", rationale: "The complete public evidence addresses the criterion." }], findings: [], confidence: 0.8, openQuestions: [],
    criterionCoverage: [{ criterionId: "original-criterion", status: "covered", evidenceRefs: ["source:src/public.ts:fixture"] }],
    parentIntegration: { status: parent ? "supported" : "not_applicable", criterionIds: parent ? ["original-criterion"] : [], evidenceRefs: parent ? ["integration-receipt"] : [] } };
}
export const responsesPayload = { model: "gpt-fixture", input: [{ role: "user", content: "PRIVATE AMBIENT CONTEXT" }], instructions: "PRIVATE SYSTEM", prompt_cache_key: "PRIVATE SESSION", tools: [
  { type: "function", name: "yield", parameters: { type: "object", properties: { data: { type: "object" } } } },
  { type: "function", name: "bash", description: "PRIVATE TOOL", parameters: { type: "object" } },
] };
