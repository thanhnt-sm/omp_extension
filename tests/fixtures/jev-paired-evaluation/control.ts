import { canonicalDigest } from "../../../src/task-contract-source";
import type { Attempt, Episode, FrozenBundle, Manifest } from "../../../tools/jev-paired-types";
import { digest, schedulePairs } from "../../../tools/jev-paired-validation";
export function fixtureManifest(bundle: FrozenBundle): Manifest {
  return { schemaVersion:1,runId:"fixture-run",kind:bundle.protocol.kind,frozen:structuredClone(bundle),schedule:schedulePairs(bundle),createdAt:"2026-10-20T00:00:00.000Z",status:"inconclusive",pendingInputs:[],interrupted:false };
}
export function fixtureObservations(manifest: Manifest): { episodes: Episode[]; attempts: Attempt[] } {
  const attempts: Attempt[] = [], episodes: Episode[] = [];
  for (const s of manifest.schedule) {
    const c = manifest.frozen.cases.find(c => c.id === s.caseId)!;
    const a: Attempt = { receiptId:`paid-${s.id}`,runId:manifest.runId,caseId:c.id,arm:s.arm,parentId:c.parentId,role:"jev",requestedModel:"fixture-jev-exact",resolvedModel:"fixture-jev-exact",provider:"fixture-provider",usage:{ inputTokens:100,outputTokens:10,cachedInputTokens:0 },unknownReason:null,billedUsd:null,billingReason:"synthetic fixture is not an actual bill",bodyDigest:digest(s.id),bodyBytes:100,questionIds:["compatibility"],startedAt:"2026-10-20T00:00:00.000Z",endedAt:"2026-10-20T00:00:00.010Z",retry:0,cooldownMs:0,error:null };
    attempts.push(a);
    episodes.push({ id:s.id,caseId:c.id,arm:s.arm,receiptId:`terminal-${s.id}`,disposition:"REJECT",status:"terminal",reason:"Synthetic incompatible reader/writer",admittedAt:a.startedAt,terminalAt:a.endedAt,latencyMs:10,timingSegments:[{ start:a.startedAt,end:a.endedAt,elapsedMs:10 }],attemptIds:[a.receiptId],integrationMiss:false,unnecessaryReviewerActions:0,accountingComplete:true,accountingReason:null,predicateDecisionPolicyDigest:s.arm === "H" ? canonicalDigest(manifest.frozen.protocol.predicateDecisionPolicy) : null,macroApprovalPolicyDigest:s.arm === "M" ? canonicalDigest(manifest.frozen.protocol.approvalPolicy) : null,coverage:{required:1,covered:1,uncoveredCriterionIds:[],parentRequired:1,parentCovered:0,uncoveredParentRequirementIds:["integration"],uncoveredArtifactPaths:[]},advisorReceiptId:null,completionEvent:null });
  }
  return { episodes,attempts };
}
