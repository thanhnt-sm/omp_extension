import { describe, expect, test } from "bun:test";
import { canonicalDigest, contractDigest } from "../src/task-contract-source";
import { stateProgressDigest } from "../src/task-verification-state";
import type { TaskEvidenceRecord } from "../src/task-evidence-runtime";
import type { JudgeEvidencePacket } from "../src/judge-evidence-packet";
import { readonlyVerificationFixture } from "./task-verification-fixture";

/** Unowned pure hash projections only. Copies are never supplied to an evidence/runtime authority registry. */
function projectedRecord(original: TaskEvidenceRecord, packet: JudgeEvidencePacket, nonce: string): TaskEvidenceRecord {
  const files = new Map(original.snapshot.files);
  for (const source of packet.source) files.set(source.path, source.sha256);
  const treeDigest = canonicalDigest([...files]);
  const packets = [{ packet, digest: canonicalDigest(packet) }];
  const manifest = { ...original.packetSet.manifest, evidenceDigest: canonicalDigest({ nonce, treeDigest }),
    changedFiles: [...files.keys()], source: packet.source.map(source => ({ path: source.path, fullFileDigest: source.sha256, bytes: Buffer.byteLength(source.content ?? ""), encoding: source.encoding })),
    packets: packets.map(value => ({ digest: value.digest, criterionIds: value.packet.criteria.map(criterion => criterion.id), source: value.packet.manifest?.source ?? [], artifactPaths: value.packet.artifacts.map(artifact => artifact.path) })) };
  return { ...original, id: nonce, status: "EVIDENCE_REQUIRED", // Explicitly not a host-issued collection replacement.
    snapshot: { ...original.snapshot, files, treeDigest, snapshotId: nonce, capturedAt: nonce },
    reviewSnapshot: { ...original.reviewSnapshot, treeDigest, evidenceDigest: manifest.evidenceDigest },
    evidence: { ...original.evidence, timestamp: nonce, evaluatedTreeDigest: treeDigest, changedFiles: [...files.keys()] },
    packetSet: { ...original.packetSet, packets, manifest }, sourceManifest: manifest };
}

describe("Recovery hashes actual relevant evidence, not operational progress narration", () => {
  test("new recovery wrapper UUID/body/ambient tree/manifest timestamps do not unlock unchanged rejection", async () => {
    const host = await readonlyVerificationFixture();
    try {
      const original = host.record; const base = original.packetSet.packets[0].packet;
      function operational(nonce: string): TaskEvidenceRecord {
        const file = `plans/reports/typesafe-recovery/${nonce}.md`;
        const content = JSON.stringify({ schemaVersion: 1, owner: "advisor", task: { task: host.task, phase: "Investigation" }, action: `Diagnostic narrative ${nonce}` }, null, 2);
        const sha256 = contractDigest(content);
        const packet: JudgeEvidencePacket = { ...base,
          source: [...base.source, { path: file, sha256, content, encoding: "utf8", criterionIds: original.contract.criteria.map(criterion => criterion.id) }],
          // Even requested/required metadata alone cannot turn a non-task-associated wrapper into a semantic deliverable.
          artifacts: [...base.artifacts, { path: file, content, sha256, criterionIds: original.contract.criteria.map(criterion => criterion.id), required: true }],
          counterevidence: [...base.counterevidence, `Operational recovery report created: ${file}`],
        };
        return projectedRecord(original, packet, nonce);
      }
      expect(stateProgressDigest(operational("first"))).toBe(stateProgressDigest(original));
      expect(stateProgressDigest(operational("second"))).toBe(stateProgressDigest(original));
      expect(operational("second").snapshot.treeDigest).not.toBe(original.snapshot.treeDigest);
      expect(operational("second").packetSet.packets[0].packet.counterevidence).toContain("Operational recovery report created: plans/reports/typesafe-recovery/second.md");
    } finally { await host.dispose(); }
  });
  test("changed required task-bound report bytes are genuine progress, not excluded by path convention", async () => {
    const host = await readonlyVerificationFixture();
    try {
      const original = host.record; const base = original.packetSet.packets[0].packet;
      const content = `Task: ${host.task}\n\n## Corrected findings\nThe exact violated criterion is now supported by source-bound counterevidence.\n`;
      const sha256 = contractDigest(content);
      const packet: JudgeEvidencePacket = { ...base,
        source: base.source.map(source => source.path === "reports/cause.md" ? { ...source, content, sha256 } : source),
        artifacts: base.artifacts.map(artifact => artifact.path === "reports/cause.md" ? { ...artifact, content, sha256 } : artifact),
      };
      expect(stateProgressDigest(projectedRecord(original, packet, "real-report-change"))).not.toBe(stateProgressDigest(original));
    } finally { await host.dispose(); }
  });
  test("unrelated optional artifact prose and foreign parent receipt IDs do not count as task progress", async () => {
    const host = await readonlyVerificationFixture();
    try {
      const original = host.record; const base = original.packetSet.packets[0].packet;
      const content = "Operational commentary, no Task-line association and no required deliverable.";
      const packet: JudgeEvidencePacket = { ...base, artifacts: [...base.artifacts, { path: "reports/notes.md", content, sha256: contractDigest(content), criterionIds: original.contract.criteria.map(criterion => criterion.id), required: false }],
        integrationReceipts: [{ parentContractId: "unrelated-parent", criterionId: "unrelated", receiptId: "new-nonce", evidenceDigest: "b".repeat(64) }] };
      expect(stateProgressDigest(projectedRecord(original, packet, "irrelevant"))).toBe(stateProgressDigest(original));
    } finally { await host.dispose(); }
  });
});
