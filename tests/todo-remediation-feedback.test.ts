import { describe, expect, test } from "bun:test";
import { buildGateRejectionMessage } from "../typesafe-planner";
import { generateRemediationBlock } from "../src/remediation-generator";

describe("TypeSafe Actionable Blocked-Todo Guidance & Remediation", () => {
  test("Gate 1 Micro-Check: formats test failure with exact command and exit code", () => {
    const msg = buildGateRejectionMessage({
      gate: "Gate 1 Micro-Check",
      taskId: "Run security audit",
      reasons: ["Test suite failed with exit code 1. Test failure must be resolved before completing task."],
      testCommand: "bun test tests/security.test.ts",
      testExitCode: 1,
    });

    expect(msg).toContain("Task completion rejected by TypeSafe Dual Verification Gate (Gate 1 Micro-Check):");
    expect(msg).toContain("NEXT ACTIONS FOR AGENT:");
    expect(msg).toContain("$ bun test tests/security.test.ts");
    expect(msg).toContain("Do NOT retry 'todo done' without modifying code or fixing test failures.");
    expect(msg.length).toBeLessThanOrEqual(1200);
  });

  test("Gate 1 Micro-Check: formats test evasion and zero evidence directives", () => {
    const msg = buildGateRejectionMessage({
      gate: "Gate 1 Micro-Check",
      taskId: "Implement cryptographic signing",
      reasons: [
        "Test evasion detected: deleted assertion in tests/crypto.test.ts",
        "Zero evidence: no test execution or git modifications observed for task completion.",
      ],
      testExitCode: null,
      testEvasion: true,
    });

    expect(msg).toContain("Review removed coverage or meaningful behavior before re-attempting completion.");
    expect(msg).toContain("Produce real implementation code changes or execute tests");
    expect(msg).toContain("NEXT ACTIONS FOR AGENT:");
    expect(msg.length).toBeLessThanOrEqual(1200);
  });

  test("Gate 1 remediation consumes the explicit test-evasion classification", () => {
    const msg = buildGateRejectionMessage({
      gate: "Gate 1 Micro-Check",
      taskId: "Implement cryptographic signing",
      reasons: ["Unrelated wording that does not name the heuristic."],
      testEvasion: true,
    });

    expect(msg).toContain("Review removed coverage or meaningful behavior before re-attempting completion.");
  });

  test("Gate 2 Macro-Check: formats scope reduction with planned requirements and scores", () => {
    const msg = buildGateRejectionMessage({
      gate: "Gate 2 Macro-Check",
      taskId: "Implement user authentication",
      reasons: ["Scope reduction detected: implementation omitted planned deliverables."],
      planRequirements: [
        "Implement OAuth2 callback handler",
        "Add session token rotation logic",
        "Write integration tests",
      ],
      scores: {
        meetsCriteria: 0.15,
        drift: "no_drift",
        scope: "REDUCTION",
      },
      isUnavailable: false,
    });

    expect(msg).toContain("Task completion rejected by TypeSafe Dual Verification Gate (Gate 2 Macro-Check):");
    expect(msg).toContain("[Judge Evaluation]: meets_criteria=0.15, drift=no_drift, scope=REDUCTION");
    expect(msg).toContain('Address omitted deliverables for "Implement user authentication"');
    expect(msg).toContain("Requirements: ");
    expect(msg).toContain("Do NOT retry 'todo done' immediately without implementing missing deliverables");
    expect(msg.length).toBeLessThanOrEqual(1200);
  });

  test("Gate 2 Macro-Check: formats architectural drift resolution", () => {
    const msg = buildGateRejectionMessage({
      gate: "Gate 2 Macro-Check",
      taskId: "Refactor database models",
      reasons: ["Architectural drift detected: scope_creep. Must maintain strict adherence to planned boundaries."],
      scores: {
        meetsCriteria: 0.88,
        drift: "scope_creep",
        scope: "HOLD",
      },
    });

    expect(msg).toContain("Resolve architectural drift (scope_creep): confine modifications strictly to planned task contracts.");
    expect(msg).toContain("NEXT ACTIONS FOR AGENT:");
    expect(msg.length).toBeLessThanOrEqual(1200);
  });

  test("Gate 2 Macro-Check: formats external infrastructure unavailability without asking to edit code", () => {
    const msg = buildGateRejectionMessage({
      gate: "Gate 2 Macro-Check",
      taskId: "Deploy cluster",
      reasons: ["TypeSafe evaluation unavailable: judge request failed (HTTP 503)."],
      isUnavailable: true,
    });

    expect(msg).toContain("TypeSafe evaluation service is unavailable. Do NOT alter codebase or tests evasively.");
    expect(msg).toContain("Verify network connectivity and TYPESAFE_API_KEY environment configuration");
    expect(msg).not.toContain("Do NOT retry 'todo done' without modifying code");
    expect(msg.length).toBeLessThanOrEqual(1200);
  });

  test("XML Remediation Generator: escapes XML entities to prevent tag injection", () => {
    const xml = generateRemediationBlock({
      instruction: "Fix <malicious> & unsafe 'tags' \"in\" instruction",
      immutableConstraints: ["Do not break <tag> & preserve &quot;"],
      failureReasons: ["Compiler error: foo < bar && baz > qux"],
      actionItems: ["Run: bun test --filter 'User<Auth>'"],
      taskId: "Task <id> & \"special\"",
      criteria: ["Criterion <1> & 'two'"],
    });

    expect(xml).toContain("&lt;malicious&gt;");
    expect(xml).toContain("&amp; unsafe");
    expect(xml).toContain("&lt;tag&gt;");
    expect(xml).toContain("<task_id>Task &lt;id&gt; &amp; &quot;special&quot;</task_id>");
    expect(xml).toContain("<criterion>Criterion &lt;1&gt; &amp; &apos;two&apos;</criterion>");
    expect(xml).not.toContain("<malicious>");
  });
});
