import { createEvidenceStateValidator, type JudgeEvidencePacket } from "./judge-evidence-packet";
import { runPhaseMacroCheck, type MacroCheckResult } from "./cook-expert-judge";
import { canonicalDigest } from "./task-contract-source";
import { createEvidencePacketValidator, type JudgeEvidencePacket } from "./judge-evidence-packet";
import type { TaskEvidenceRecord } from "./task-evidence-runtime";
import type { FrozenContractSourceContext } from "./contract-runtime";
import type { TaskVerificationRuntimeOptions } from "./task-verification-types";
import type { PreparedRequestValidator } from "./payload-safety";

interface CanonicalStateRedactor { redactEvidenceState(state: unknown, options: { apiKey?: string; homeDirs?: readonly string[] }): unknown }
export interface MonolithicReviewResult { packet?: JudgeEvidencePacket; result: MacroCheckResult }

/** M remains exactly one original-rubric task judgment, never an atomic/child-pass aggregate. */
export async function evaluateMonolithicTask(options: TaskVerificationRuntimeOptions, context: unknown, evidence: TaskEvidenceRecord, source: FrozenContractSourceContext, semanticAttemptCount: number): Promise<MonolithicReviewResult> {
  const contract = evidence.contract;
  const ids = contract.criteria.map(criterion => criterion.id).sort();
  const selected = evidence.packetSet.packets.filter(value => canonicalDigest(value.packet.criteria.map(criterion => criterion.id).sort()) === canonicalDigest(ids));
  if (!evidence.packetSet.ok || !evidence.packetSet.manifest.coverageComplete || selected.length !== 1) {
    const reasons = ["M requires exactly one authentic bounded packet covering every original task criterion. Provide explicit complete-task curation; otherwise an independent H benchmark/human adoption prerequisite is required, not silent atomic adoption."];
    return { result: { approved: false, reasons, outcome: { status: "EVIDENCE_REQUIRED", missingCriterionIds: ids, reasons }, error: "monolithic_packet_curation_required" } };
  }
  const packet = selected[0].packet;
  if (selected[0].digest !== canonicalDigest(packet)) throw new Error("monolithic_packet_identity_invalid");
  const state = {
    todo_task: contract.target.content,
    task_requirements: contract.criteria.map(criterion => ({ id: criterion.id, text: criterion.text, source: criterion.source })),
    user_request: source.originalUserRequest.text,
    diff_scope: "Task-bound authentic endpoint evidence and retained full-source manifest; unrelated changes are not task deliverables.",
    diff_summary: evidence.evidence.changedFiles,
    unified_diff: "Read the complete evidence_packet.diff and evidence_packet.source proof. Source selections retain original full-file identities in evidence_manifest; no omitted bytes are represented as inspected.",
    test_summary: "Read the actual evidence_packet.verification result and counterevidence. Only contract-applicable commands are required.",
    deliverable_artifacts: "Read the complete evidence_packet.artifacts content, identities and criterion bindings.",
    evidence_packet: packet,
    evidence_manifest: evidence.packetSet.manifest,
  };
  const guard: PreparedRequestValidator = createEvidenceStateValidator(state, options.privacy);
  const client = options.createClient(context, "native_done", guard);
  const result = await runPhaseMacroCheck({
    todoTask: contract.target.content, phaseTitle: contract.target.phase,
    planRequirements: contract.criteria.map(criterion => criterion.text), contract,
    diffSummary: evidence.evidence.gitStatus, unifiedDiff: packet.diff,
    testSummary: evidence.evidence.testOutput,
    taskType: contract.taskKind === "implementation" ? "code_change" : "analysis_research",
    userRequest: source.originalUserRequest.text,
    attemptCount: semanticAttemptCount,
  }, { async evaluate(request) { return client.evaluate({ state, questions: request.questions }); } }, { approvalPolicy: options.approvalPolicy });
  if (result.error && /(?:budget|packet|EVIDENCE_REQUIRED|too_large|payload|curation|question.*(?:limit|count|many)|body.*(?:limit|bytes))/i.test(result.error + " " + result.reasons.join(" "))) {
    const reasons = ["The complete M task packet could not be delivered under its exact final-body policy. Supply honest bounded curation or resolve the independent benchmark/human prerequisite; no clipping, summary, threshold change or H adoption is permitted."];
    return { packet, result: { ...result, approved: false, outcome: { status: "EVIDENCE_REQUIRED", missingCriterionIds: ids, reasons }, reasons } };
  }
  return { packet, result };
}
