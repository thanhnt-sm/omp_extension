import { describe, expect, test } from "bun:test";
import { buildMonolithicMacroState } from "../src/task-verification-macro";

import type { TaskContract } from "../src/types/verification";
import type { FrozenContractSourceContext } from "../src/contract-runtime";
import type { TaskEvidenceRecord } from "../src/task-evidence-runtime";
import type { JudgeEvidencePacket } from "../src/judge-evidence-packet";

describe("Macro State Real Evidence Fields (No Placeholder Text)", () => {
  const mockContract = {
    target: { content: "Implement feature X", phase: "Phase 1" },
    criteria: [
      { id: "c1", text: "Criteria 1 text", source: { path: "plan.md", startLine: 1, endLine: 2 } },
    ],
    taskKind: "implementation",
  } as unknown as TaskContract;

  const mockSource = {
    originalUserRequest: { text: "Please implement feature X" },
  } as unknown as FrozenContractSourceContext;

  const mockEvidence = {
    evidence: {
      changedFiles: ["src/feature.ts", "tests/feature.test.ts"],
      gitStatus: "M src/feature.ts\nM tests/feature.test.ts",
      testOutput: "10 pass, 0 fail across 1 file. [150ms]",
    },
    packetSet: {
      manifest: {
        schemaVersion: 1,
        coverageComplete: true,
      },
    },
  } as unknown as TaskEvidenceRecord;

  const mockPacket = {
    diff: "diff --git a/src/feature.ts b/src/feature.ts\n+export function feature() { return true; }",
    artifacts: [
      { path: "plans/reports/report.md", content: "Analysis report content details", sha256: "abc", criterionIds: ["c1"] },
    ],
  };

  test("macro state carries real evidence text instead of placeholder sentences", () => {
    const state = buildMonolithicMacroState(mockContract, mockSource, mockEvidence, mockPacket);

    // 1. unified_diff must contain actual diff content, NOT the placeholder sentence
    expect(state.unified_diff).not.toContain("Read the complete evidence_packet.diff");
    expect(state.unified_diff).toContain("+export function feature()");

    // 2. test_summary must contain actual test output, NOT the placeholder sentence
    expect(state.test_summary).not.toContain("Read the actual evidence_packet.verification");
    expect(state.test_summary).toContain("10 pass, 0 fail");

    // 3. deliverable_artifacts must contain actual artifact content, NOT the placeholder sentence
    expect(state.deliverable_artifacts).not.toContain("Read the complete evidence_packet.artifacts");
    expect(state.deliverable_artifacts).toContain("Analysis report content details");

    // 4. Total state JSON byte length must be within 32768 bytes
    const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
    expect(bytes).toBeLessThanOrEqual(32768);
  });

  test("handles 40KB diff and 6KB artifacts: enforces maxBytes <= 32768, deduplicates nested packet, and announces truncation", () => {
    const largeDiff = "diff --git a/large.ts b/large.ts\n" + "+line of code added in large file\n".repeat(1200); // ~40KB
    const largeArtifact = "Artifact analysis content\n".repeat(250); // ~6.5KB

    const packetWithLargeDiff = {
      diff: largeDiff,
      artifacts: [
        { path: "plans/reports/large.md", content: largeArtifact, sha256: "deadbeef", criterionIds: ["c1"] },
      ],
    } as unknown as JudgeEvidencePacket;

    const state = buildMonolithicMacroState(mockContract, mockSource, mockEvidence, packetWithLargeDiff, 32768);

    // Final JSON bytes must not exceed 32768
    const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
    expect(bytes).toBeLessThanOrEqual(32768);

    // Truncation must be explicitly announced in-line
    expect(state.unified_diff).toContain("[TRUNCATED: shown");
    expect(state.unified_diff).toContain("bytes, full_sha256:");

    // Deduplication: evidence_packet.diff inside state must not duplicate the 40KB diff
    const nestedPacket = state.evidence_packet as any;
    expect(nestedPacket.diff).not.toBe(largeDiff);
    expect(nestedPacket.diff).toContain("unified_diff");

    // Truncated flag must be set
    expect(state.truncated).toBe(true);
  });

  test("handles multibyte UTF-8 diff without exceeding 32768 bytes or corrupting characters", () => {
    // Vietnamese characters: each takes 2-3 bytes in UTF-8
    const vietnameseDiff = "diff --git a/tieng-viet.ts b/tieng-viet.ts\n" +
      "+ Thử nghiệm chuỗi ký tự tiếng Việt có dấu: Ắ, Ằ, Ẳ, Ẵ, Ặ, Ế, Ề, Ể, Ễ, Ệ, Ố, Ồ, Ổ, Ỗ, Ộ\n".repeat(600);

    const packetWithMultibyteDiff = {
      diff: vietnameseDiff,
      artifacts: [],
    } as unknown as JudgeEvidencePacket;

    const state = buildMonolithicMacroState(mockContract, mockSource, mockEvidence, packetWithMultibyteDiff, 32768);
    const totalBytes = Buffer.byteLength(JSON.stringify(state), "utf8");

    expect(totalBytes).toBeLessThanOrEqual(32768);
    expect(state.truncated).toBe(true);
    expect(state.overflow).toBe(false);
    expect(state.unified_diff).not.toContain("\uFFFD");

    // Edge case: multibyte character straddling exactly the 14000 byte cut boundary
    // 'a'.repeat(13999) + 'ế' (3 bytes: 0xE1, 0xBA, 0xBF)
    const straddlingDiff = "a".repeat(13999) + "ế" + " extra trailing content";
    const straddlePacket = { diff: straddlingDiff, artifacts: [] } as unknown as JudgeEvidencePacket;
    const straddleState = buildMonolithicMacroState(mockContract, mockSource, mockEvidence, straddlePacket, 32768);
    expect(straddleState.unified_diff).not.toContain("\uFFFD");
  });
});
