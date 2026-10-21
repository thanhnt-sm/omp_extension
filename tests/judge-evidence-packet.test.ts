import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReviewBinding, TaskContract } from "../src/types/verification";
import { canonicalDigest } from "../src/task-contract";
import { prepareAtomicInput } from "../src/atomic-preparation";
import { createAtomicJudge } from "../src/atomic-judge";
import type { ReviewSnapshot } from "../src/advisor-protocol";
import { captureWorkspaceSnapshot, collectTaskEvidence, type TaskEvidenceResult } from "../src/evidence-collector";
import { digestBytes } from "../src/evidence-workspace";
import { buildJudgeEvidencePacket, buildJudgeEvidencePacketSet, createEvidencePacketValidator, createEvidencePacketSetValidator, finalizeEvidencePacket, retrieveEvidenceSource, type EvidenceArtifact, type JudgeEvidencePacket } from "../src/judge-evidence-packet";
const { prepareRequest, redactEvidenceState } = createRequire(import.meta.url)("../src/typesafe-api-client.cjs");
const { resolveTrustedToolPolicy, judgeWithPolicy } = createRequire(import.meta.url)("../src/typesafe-policy-client.cjs");

async function fixture(content: string, run: (input: { contract: TaskContract; evidence: TaskEvidenceResult; artifact: EvidenceArtifact; cwd: string }) => Promise<void>, integration = false): Promise<void> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-packet-"));
  try {
    const git = (args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });
    git(["init"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.com"]);
    await fs.writeFile(path.join(cwd, "seed.txt"), "baseline"); git(["add", "."]); git(["commit", "-qm", "baseline"]);
    const user = { sessionId: "session", entryId: "user", digest: "request", kind: "user_request" as const };
    const source = { path: "phase-02.md", digest: "approved-phase", startLine: 40, endLine: 44, text: "- [ ] Preserve the full report and its decisive final proof.\n  The final row, not a signature, is mandatory." };
    const contract: TaskContract = {
      schemaVersion: 1, contractId: "contract", revision: 1, revisionId: "revision", incarnationId: "incarnation",
      creation: { sessionId: "session", branchId: "branch", entryId: "native-result", callId: "native-call" },
      target: { phase: "Research", phaseOrdinal: 0, content: "Deliver actual report", ordinal: 0 }, taskKind: "research",
      allowedMutationScope: { paths: ["report.json"], operations: ["read", "create", "modify"] },
      approvedSource: { kind: "plan", path: source.path, digest: source.digest, approval: user, spans: [source] },
      originalUserRequest: user, amendments: [], criteria: [{ id: "criterion-exact", kind: "acceptance", text: "Report preserves decisive final proof.", source }],
      approvedCommandIds: [], parentRequirements: integration ? [{ parentContractId: "parent", criterionId: "parent-integration", source }] : [], policyDigest: "policy",
    };
    const baseline = await captureWorkspaceSnapshot(cwd, { contract });
    await fs.writeFile(path.join(cwd, "report.json"), content);
    const evidence = await collectTaskEvidence({ cwd, contract, baseline });
    const artifact: EvidenceArtifact = { path: "report.json", content, sha256: digestBytes(content), criterionIds: ["criterion-exact"], required: true };
    await run({ contract, evidence, artifact, cwd });
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}
function packetFrom(contract: TaskContract, evidence: TaskEvidenceResult, artifact: EvidenceArtifact): JudgeEvidencePacket {
  const result = buildJudgeEvidencePacket({ contract, evidence, artifacts: [artifact], requiredArtifactPaths: [artifact.path] });
  if (!result.ok) throw new Error(result.reasons.join(","));
  return result.packet;
}

describe("Full criterion evidence packets", () => {
  test("preserves exact original criterion spans, report tail, full source and stable evidence IDs", async () => fixture('{"rows":["first","DECISIVE_FINAL_ROW"]}', async ({ contract, evidence, artifact }) => {
    const packet = packetFrom(contract, evidence, artifact);
    expect(packet.criteria).toEqual(contract.criteria);
    expect(packet.originalSource.spans[0].startLine).toBe(40);
    expect(packet.criteria[0].source.text).toContain("final row, not a signature");
    expect(packet.artifacts[0].content).toContain("DECISIVE_FINAL_ROW");
    expect(packet.source[0].content).toBe(artifact.content);
    expect(packet.obligations[0].id).toBe("criterion-exact:semantic");
    expect(packet.obligations[0].evidenceIds).toContain(`source:report.json:${artifact.sha256}`);
    expect(packet.applicability.taskKind).toBe("research");
    expect(packet.verification).toBeUndefined();
  }));

  test("mandatory proof omission, unrelated criterion and forged source hashes never reach semantic review", async () => fixture('{"proof":"actual"}', async ({ contract, evidence, artifact }) => {
    const absent = buildJudgeEvidencePacket({ contract, evidence, requiredArtifactPaths: ["report.json"] });
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(absent.reasons).toContain("MANDATORY_ARTIFACT_MISSING");
    const foreign = buildJudgeEvidencePacket({ contract, evidence, artifacts: [{ ...artifact, criterionIds: ["another-task"] }] });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.reasons).toContain("FOREIGN_ARTIFACT_CRITERION");
    const signature = buildJudgeEvidencePacket({ contract, evidence, artifacts: [{ ...artifact, content: "summary: verified" }] });
    expect(signature.ok).toBe(false);
    if (!signature.ok) expect(signature.reasons).toContain("ARTIFACT_CONTENT_NOT_EVALUATED");
    const forged = buildJudgeEvidencePacket({ contract, evidence: { ...evidence, sourceEvidence: evidence.sourceEvidence?.map((item) => ({ ...item, content: "invented content" })) }, artifacts: [artifact] });
    expect(forged.ok).toBe(false);
    if (!forged.ok) { expect(forged.reasons).toContain("HOST_TASK_EVIDENCE_REQUIRED"); expect(forged.reasons).toContain("SOURCE_CONTENT_NOT_EVALUATED"); }
  }));

  test("preserves exactly 4940 UTF-8 bytes, rejects overflow and never clips mandatory packet proof", async () => {
    const prefix = '{"proof":"'; const suffix = 'DECISIVE_TAIL"}';
    const content = prefix + "a".repeat(4940 - Buffer.byteLength(prefix + suffix)) + suffix;
    await fixture(content, async ({ contract, evidence, artifact }) => {
      const packet = packetFrom(contract, evidence, artifact);
      expect(Buffer.byteLength(packet.artifacts[0].content)).toBe(4940);
      expect(packet.artifacts[0].content.endsWith(suffix)).toBe(true);
      const constrained = buildJudgeEvidencePacket({ contract, evidence, artifacts: [artifact], maxBytes: 1000 });
      expect(constrained.ok).toBe(false);
      if (!constrained.ok) expect(constrained.reasons).toContain("MANDATORY_PACKET_PROOF_EXCEEDS_BUDGET");
    });
    await fixture(content.slice(0, -suffix.length) + "é" + suffix, async ({ contract, evidence, artifact }) => {
      const result = buildJudgeEvidencePacket({ contract, evidence, artifacts: [artifact] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain("MANDATORY_ARTIFACT_BUDGET_EXCEEDED");
    });
  });

  test("parent integration proof requires applicable host-validated receipts, not model reference strings", async () => fixture('{"proof":"actual"}', async ({ contract, evidence, artifact }) => {
    const receipt = { parentContractId: "parent", criterionId: "parent-integration", receiptId: "actual-host-receipt", evidenceDigest: "actual-evidence" };
    const missing = buildJudgeEvidencePacket({ contract, evidence, artifacts: [artifact], integrationReceipts: [receipt] });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reasons).toContain("PARENT_INTEGRATION_EVIDENCE_REQUIRED:parent:parent-integration");
    const actual = buildJudgeEvidencePacket({ contract, evidence, artifacts: [artifact], integrationReceipts: [receipt], validateIntegrationReceipt: (input) => input === receipt });
    expect(actual.ok).toBe(true);
    if (actual.ok) expect(actual.packet.obligations.find((item) => item.kind === "integration")?.evidenceIds).toContain(receipt.receiptId);
  }, true));

  test("actual canonical final preparation preserves all packet fields after shared redaction", async () => fixture('{"proof":"PUBLIC_TAIL private-active-key"}', async ({ contract, evidence, artifact }) => {
    const packet = packetFrom(contract, evidence, artifact); const apiKey = "private-active-key";
    const policy = resolveTrustedToolPolicy("expert");
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;
    const prepared = prepareRequest({ state: { evidence_packet: packet }, questions: { proof: { type: "noul", instructions: "Evaluate the exact frozen criteria" } } }, policy, { apiKey });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const guard = createEvidencePacketValidator(packet, { apiKey });
    expect(guard(prepared)).toEqual({ ok: true });
    expect(prepared.body).not.toContain(apiKey);
    expect(prepared.body).toContain("PUBLIC_TAIL");
    const identity = finalizeEvidencePacket(packet, prepared.body);
    expect(identity.packetDigest).toBe(canonicalDigest(packet));
    expect(identity.bodyDigest).toBe(prepared.bodyDigest);
    expect(identity.bodyBytes).toBe(prepared.bodyBytes);
    const actual = JSON.parse(prepared.body);
    actual.state.evidence_packet.artifacts[0].content = "summary substituted after preparation";
    expect(guard({ body: JSON.stringify(actual) }).ok).toBe(false);
    actual.state.evidence_packet = redactEvidenceState({ evidence_packet: packet }, { apiKey }).evidence_packet;
    actual.state.evidence_packet.criteria[0].source.endLine--;
    expect(guard({ body: JSON.stringify(actual) }).ok).toBe(false);
    expect(guard({ body: prepared.body, bodyDigest: "claimed-only-digest" }).ok).toBe(false);
    for (const field of ["counterevidence", "omissions", "parentRequirements"]) {
      actual.state.evidence_packet = redactEvidenceState({ evidence_packet: packet }, { apiKey }).evidence_packet;
      delete actual.state.evidence_packet[field];
      expect(guard({ body: JSON.stringify(actual) }).ok).toBe(false);
    }
    const substituted = structuredClone(packet);
    substituted.artifacts = substituted.artifacts.map((item) => ({ ...item, content: "summary substituted before dispatch" }));
    let dispatches = 0;
    const rejected = await judgeWithPolicy({
      purpose: "expert", trustedPolicy: policy, apiKey,
      args: { state: { evidence_packet: substituted }, questions: { proof: { type: "noul", instructions: "Evaluate frozen evidence" } } },
      validatePrepared: guard,
      fetchImpl: async () => { dispatches++; throw new Error("Forbidden dispatch after incomplete proof"); },
    });
    expect(rejected.ok).toBe(false);
    expect(dispatches).toBe(0);
  }));
});

test("an 80KB root consumer gets a verified bounded claim packet without approving an uncovered parent obligation", async () => fixture('{"existing":"report context"}', async ({ cwd, contract }) => {
  const file = "typesafe-planner.ts";
  const lines = ["export function boundedClaim() {", "  return 0;", "}", ...Array.from({ length: 1100 }, (_, index) => `// authorized root context ${index} ${"context ".repeat(9)}`), "export const parentIntegration = false;"];
  const before = lines.join("\r\n") + "\r\n";
  expect(Buffer.byteLength(before)).toBeGreaterThan(80000);
  await fs.writeFile(path.join(cwd, file), before);
  execFileSync("git", ["add", file], { cwd, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "root consumer baseline"], { cwd, stdio: "ignore" });
  const baseSource = contract.criteria[0].source;
  const rootContract: TaskContract = {
    ...contract, taskKind: "implementation", policyDigest: canonicalDigest({ policy: "large-source-fixture" }),
    allowedMutationScope: { paths: [file, "report.json"], operations: ["read", "modify"] },
    criteria: [
      { id: "bounded-root-claim", kind: "acceptance", text: "boundedClaim returns one.", source: { ...baseSource, text: "- [ ] boundedClaim returns one." } },
      { id: "parent-root-integration", kind: "parent_integration", text: "The root tail must integrate the parent behavior, not remain false.", source: { ...baseSource, startLine: 45, endLine: 46, text: "- [ ] Parent integration must be true at the actual root tail." } },
    ],
    parentRequirements: [{ parentContractId: "parent-root", criterionId: "parent-root-integration", source: { ...baseSource, startLine: 45, endLine: 46, text: "Parent integration remains mandatory." } }],
  };
  const baseline = await captureWorkspaceSnapshot(cwd, { contract: rootContract });
  const after = before.replace("return 0;", "return 1;");
  await fs.writeFile(path.join(cwd, file), after);
  const evidence = await collectTaskEvidence({ cwd, contract: rootContract, baseline });
  expect(evidence.evidenceStatus).toBe("READY");
  const strict = buildJudgeEvidencePacket({ contract: rootContract, evidence });
  expect(strict.ok).toBe(false);
  if (!strict.ok) expect(strict.reasons).toContain("MANDATORY_PACKET_PROOF_EXCEEDS_BUDGET");
  const fullFileDigest = digestBytes(after);
  const text = after.split(/(?<=\n)/).slice(0, 3).join("");
  const selection = { criterionIds: ["bounded-root-claim"], sources: [{ path: file, fullFileDigest, spans: [{ startLine: 1, endLine: 3, digest: digestBytes(text) }] }] };
  const unboundedSelection = buildJudgeEvidencePacket({ contract: rootContract, evidence, selection: { criterionIds: ["bounded-root-claim"], sources: [{ path: file, fullFileDigest }] } });
  expect(unboundedSelection.ok).toBe(false);
  if (!unboundedSelection.ok) expect(unboundedSelection.reasons).toContain("MANDATORY_PACKET_PROOF_EXCEEDS_BUDGET");
  const missingProof = buildJudgeEvidencePacket({ contract: rootContract, evidence, selection: { criterionIds: ["bounded-root-claim"], sources: [{ path: file, fullFileDigest: "not-the-host-digest", spans: [{ startLine: 1, endLine: 3 }] }] } });
  expect(missingProof.ok).toBe(false);
  if (!missingProof.ok) expect(missingProof.reasons).toContain("SELECTED_SOURCE_IDENTITY_MISMATCH");
  const set = buildJudgeEvidencePacketSet({ contract: rootContract, evidence, selections: [selection] });
  expect(set.packets).toHaveLength(1);
  expect(set.ok).toBe(false);
  expect(set.status).toBe("EVIDENCE_REQUIRED");
  expect(set.manifest.uncoveredCriterionIds).toContain("parent-root-integration");
  expect(set.manifest.uncoveredParentRequirementIds).toContain("parent:parent-root:parent-root-integration");
  expect(set.manifest.requiresIndependentParentReview).toBe(true);
  expect(set.manifest.globalCompletionEligible).toBe(false);
  const packet = set.packets[0].packet;
  expect(packet.scope?.globalCompletionEligible).toBe(false);
  expect(packet.source[0].content).toBeUndefined();
  expect(packet.source[0].coverage).toBe("spans");
  expect(packet.source[0].spans?.[0].text).toBe(text);
  expect(packet.source[0].spans?.[0].digest).toBe(digestBytes(text));
  expect(packet.manifest?.source.find((item) => item.path === "report.json")?.coverage).toBe("out_of_packet_scope");
  expect(packet.manifest?.criteria.find((item) => item.id === "parent-root-integration")?.coverage).toBe("out_of_packet_scope");
  expect(packet.manifest?.diff.coverage).toBe("out_of_packet_scope");
  const policy = resolveTrustedToolPolicy("expert");
  const prepared = prepareRequest({ state: { evidence_packet: packet }, questions: { claim: { type: "noul", instructions: "Evaluate only the bounded root claim; parent obligations remain unresolved." } } }, policy, { apiKey: "range-fixture" });
  expect(prepared.ok).toBe(true);
  if (prepared.ok) {
    expect(prepared.bodyBytes).toBeLessThanOrEqual(32768);
    expect(createEvidencePacketValidator(packet, { apiKey: "range-fixture" })(prepared)).toEqual({ ok: true });
  }
  const macroPrepared = prepareRequest({ state: { evidence_packets: set.packets.map((entry) => entry.packet), evidence_manifest: set.manifest }, questions: { integration: { type: "noul", instructions: "Review the original integration obligations, including uncovered parent proof." } } }, policy, { apiKey: "range-fixture" });
  expect(macroPrepared.ok).toBe(true);
  if (macroPrepared.ok) {
    const macroGuard = createEvidencePacketSetValidator(set, { apiKey: "range-fixture" });
    expect(macroGuard(macroPrepared)).toEqual({ ok: true });
    const amputated = JSON.parse(macroPrepared.body);
    amputated.state.evidence_manifest.uncoveredParentRequirementIds = [];
    expect(macroGuard({ body: JSON.stringify(amputated) }).ok).toBe(false);
    const missingPacket = JSON.parse(macroPrepared.body);
    missingPacket.state.evidence_packets.pop();
    expect(macroGuard({ body: JSON.stringify(missingPacket) }).ok).toBe(false);
  }
  const binding: ReviewBinding = {
    purpose: "shadow", corpus: { corpusId: "fixture", caseId: "large-source", contractDigest: canonicalDigest(rootContract) },
    authorizedScope: { paths: rootContract.allowedMutationScope.paths, operations: ["read"] },
    provenance: { sessionId: rootContract.creation.sessionId, branchId: rootContract.creation.branchId, requestEntryId: rootContract.originalUserRequest.entryId, dispatchId: "host-fixture", evidenceDigest: set.manifest.evidenceDigest, policyDigest: rootContract.policyDigest, questionDigest: canonicalDigest(rootContract.criteria) },
  };
  const reviewSnapshot: ReviewSnapshot = {
    contractDigest: canonicalDigest(rootContract), evidenceDigest: set.manifest.evidenceDigest, treeDigest: packet.snapshots.evaluatedTreeDigest,
    testDigest: canonicalDigest(evidence.verificationReceipt ?? null), policyDigest: rootContract.policyDigest,
    parentDigest: canonicalDigest(rootContract.parentRequirements), childDigest: canonicalDigest([]), integrationDigest: canonicalDigest([]),
  };
  const input = prepareAtomicInput({ contract: rootContract, packetSet: set, binding, snapshot: reviewSnapshot, model: "jev-latest" });
  const actualBodies: string[] = [];
  const atomic = createAtomicJudge({
    apiKey: "fixture-key",
    fetchImpl: async (_url, init) => {
      const raw = String(init?.body); actualBodies.push(raw);
      const body: { questions: Record<string, unknown> } = JSON.parse(raw);
      return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map((id) => [id, { choice: "supports", confidence: 0.8 }])) }), { status: 200 });
    },
  });
  const reviewed = await atomic.review(input);
  expect(actualBodies).toHaveLength(1);
  const actual: { state: { evidence_packet: JudgeEvidencePacket } } = JSON.parse(actualBodies[0]);
  expect(actual.state.evidence_packet.source[0].coverage).toBe("spans");
  expect(actual.state.evidence_packet.source[0].spans?.[0].text).toBe(text);
  expect(actual.state.evidence_packet.source[0].content).toBeUndefined();
  expect(actualBodies[0]).not.toContain("authorized root context 1000");
  expect(Buffer.byteLength(actualBodies[0])).toBeLessThanOrEqual(32768);
  expect(reviewed.attempts[0].bodyDigest).toBe(digestBytes(actualBodies[0]));
  expect(reviewed.outcomes[0].relation).toBe("supports");
  expect(reviewed.status).toBe("insufficient");
  expect(reviewed.uncoveredCriterionIds).toContain("parent-root-integration");
  expect(reviewed.uncoveredParentRequirementIds).toContain("parent:parent-root:parent-root-integration");
  const parentProof = retrieveEvidenceSource(evidence, { path: file, fullFileDigest, spans: [{ startLine: lines.length, endLine: lines.length }] });
  expect(parentProof.ok).toBe(true);
  if (parentProof.ok) expect(parentProof.source.spans?.[0].text).toContain("parentIntegration = false");
  expect(retrieveEvidenceSource(evidence, { path: file, fullFileDigest: "wrong-sha", spans: [{ startLine: 1, endLine: 3 }] }).ok).toBe(false);
  expect(retrieveEvidenceSource(evidence, { path: file, fullFileDigest, spans: [{ startLine: 1, endLine: 3, digest: "invented-span-digest" }] }).ok).toBe(false);
}));

test("private workspace paths and opaque binary stay host evidence, never public packet text", async () => fixture('{"proof":"PUBLIC_TASK_PROOF"}', async ({ cwd, contract, artifact }) => {
  const reviewContract: TaskContract = { ...contract, taskKind: "review", allowedMutationScope: { paths: ["**"], operations: ["read", "create", "modify", "delete"] } };
  const baseline = await captureWorkspaceSnapshot(cwd, { contract: reviewContract });
  const privateText = "ordinary confidential environment prose PRIVATE_WORKSPACE_SENTINEL";
  const binary = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from("active-literal-key")]);
  await fs.writeFile(path.join(cwd, ".env"), privateText);
  await fs.writeFile(path.join(cwd, "image.dat"), binary);
  const evidence = await collectTaskEvidence({ cwd, contract: reviewContract, baseline });
  expect(evidence.contract?.taskKind).toBe("review");
  expect(evidence.sourceEvidence?.find((item) => item.path === "image.dat")?.sha256).toBe(digestBytes(binary));
  const strict = buildJudgeEvidencePacket({ contract: reviewContract, evidence, artifacts: [artifact] });
  expect(strict.ok).toBe(false);
  if (!strict.ok) {
    expect(strict.reasons).toContain("PRIVATE_SOURCE_REQUIRES_PUBLIC_REPRESENTATION");
    expect(strict.reasons).toContain("BINARY_PUBLIC_REPRESENTATION_REQUIRED");
  }
  const selected = buildJudgeEvidencePacket({ contract: reviewContract, evidence, artifacts: [artifact], selection: { criterionIds: [contract.criteria[0].id], sources: [{ path: artifact.path, fullFileDigest: artifact.sha256 }], artifactPaths: [artifact.path] } });
  expect(selected.ok).toBe(true);
  if (selected.ok) {
    const policy = resolveTrustedToolPolicy("expert");
    const prepared = prepareRequest({ state: { evidence_packet: selected.packet }, questions: { relation: { type: "noul", instructions: "Review only the actual public report proof." } } }, policy, { apiKey: "active-literal-key" });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.body).toContain("PUBLIC_TASK_PROOF");
      expect(prepared.body).not.toContain(privateText);
      expect(prepared.body).not.toContain(binary.toString("base64"));
      expect(selected.packet.manifest?.source.find((item) => item.path === ".env")?.coverage).toBe("out_of_packet_scope");
    }
  }
  const privateRead = retrieveEvidenceSource(evidence, { path: ".env", fullFileDigest: digestBytes(privateText), spans: [{ startLine: 1, endLine: 1 }] });
  expect(privateRead.ok).toBe(false);
  if (!privateRead.ok) expect(privateRead.reason).toBe("PRIVATE_SOURCE_REQUIRES_PUBLIC_REPRESENTATION");
  const binaryRead = retrieveEvidenceSource(evidence, { path: "image.dat", fullFileDigest: digestBytes(binary) });
  expect(binaryRead.ok).toBe(false);
  if (!binaryRead.ok) expect(binaryRead.reason).toBe("BINARY_PUBLIC_REPRESENTATION_REQUIRED");
}));
