import { describe, expect, test } from "bun:test";
import {
  checkDeterministicPreconditions,
  constructGateQuestions,
  verifyTaskCompletion,
  type GateJudgeClient,
  type TaskVerificationContext,
  generateFallbackRemediation,
} from "../src/verification-gate";
import type { TaskEvidenceResult } from "../src/evidence-collector";

describe("Phase 3: Execution Compliance & Dual Verification Gate", () => {
  test("constructGateQuestions creates criteria, drift, and isolation questions", () => {
    const questions = constructGateQuestions(["Test must pass with exit code 0"]);
    expect(questions.meets_criteria).toBeDefined();
    expect(questions.meets_criteria.type).toBe("noul");
    expect(questions.plan_drift).toBeDefined();
    expect(questions.plan_drift.type).toBe("choice");
    expect(questions.claude_account_untouched).toBeDefined();
    expect(questions.claude_account_untouched.type).toBe("noul");
  });

  test("Gate 1 blocks completion when test exit code is nonzero (fail-fast)", () => {
    const evidence: TaskEvidenceResult = {
      gitStatus: "M src/service.ts",
      gitDiff: "diff --git a/src/service.ts b/src/service.ts",
      testExitCode: 1,
      testOutput: "FAIL src/service.test.ts > 1 failed",
      criteria: ["Implement service"],
      cleanWorkingTree: false,
      timestamp: new Date().toISOString(),
    };

    const g1 = checkDeterministicPreconditions(evidence);
    expect(g1.passed).toBe(false);
    expect(g1.testPassed).toBe(false);
    expect(g1.reasons.some((r) => r.includes("Test suite failed"))).toBe(true);
  });

  test("Gate 1 blocks completion when git status/diff touches .claude directory", () => {
    const evidence: TaskEvidenceResult = {
      gitStatus: "M .claude/settings.json\nM src/service.ts",
      gitDiff: "diff --git a/.claude/settings.json b/.claude/settings.json",
      testExitCode: 0,
      testOutput: "PASS 10 tests passed",
      criteria: ["Implement service"],
      cleanWorkingTree: false,
      timestamp: new Date().toISOString(),
    };

    const g1 = checkDeterministicPreconditions(evidence);
    expect(g1.passed).toBe(false);
    expect(g1.claudeSafe).toBe(false);
    expect(g1.reasons.some((r) => r.includes("Claude boundary"))).toBe(true);
  });

  test("Gate 1 failure skips Gate 2 remote call completely (zero tokens)", async () => {
    let judgeCalled = false;
    const mockJudge: GateJudgeClient = {
      evaluateGate: async () => {
        judgeCalled = true;
        return { answers: {} };
      },
    };

    const context: TaskVerificationContext = {
      taskId: "task-1",
      testCommand: "bun -e \"process.exit(1)\"",
    };

    const result = await verifyTaskCompletion(context, mockJudge);
    expect(result.approved).toBe(false);
    expect(result.gate1.passed).toBe(false);
    expect(judgeCalled).toBe(false);
    expect(result.gate2).toBeUndefined();
  });

  test("Gate 2 blocks completion when meets_criteria is below 0.70 threshold", async () => {
    const mockJudge: GateJudgeClient = {
      evaluateGate: async () => ({
        answers: {
          meets_criteria: { noul: 0.45 },
          plan_drift: { choice: "no_drift" },
          claude_account_untouched: { noul: 1.0 },
        },
      }),
    };

    const context: TaskVerificationContext = {
      taskId: "task-2",
      testCommand: "bun -e \"process.exit(0)\"",
    };

    const result = await verifyTaskCompletion(context, mockJudge);
    expect(result.approved).toBe(false);
    expect(result.gate1.passed).toBe(true);
    expect(result.gate2).toBeDefined();
    expect(result.gate2?.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("meets_criteria"))).toBe(true);
  });

  test("Gate 2 blocks completion when plan_drift choice is unapproved_deviation", async () => {
    const mockJudge: GateJudgeClient = {
      evaluateGate: async () => ({
        answers: {
          meets_criteria: { noul: 0.95 },
          plan_drift: { choice: "unapproved_deviation" },
          claude_account_untouched: { noul: 1.0 },
        },
      }),
    };

    const context: TaskVerificationContext = {
      taskId: "task-3",
      testCommand: "bun -e \"process.exit(0)\"",
    };

    const result = await verifyTaskCompletion(context, mockJudge);
    expect(result.approved).toBe(false);
    expect(result.gate2?.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("plan_drift"))).toBe(true);
  });

  test("approves completion when Gate 1 and Gate 2 all pass", async () => {
    const mockJudge: GateJudgeClient = {
      evaluateGate: async () => ({
        answers: {
          meets_criteria: { noul: 0.94 },
          plan_drift: { choice: "no_drift" },
          claude_account_untouched: { noul: 1.0 },
        },
      }),
    };

    const context: TaskVerificationContext = {
      taskId: "task-4",
      testCommand: "bun -e \"process.exit(0)\"",
    };

    const result = await verifyTaskCompletion(context, mockJudge);
    expect(result.approved).toBe(true);
    expect(result.gate1.passed).toBe(true);
    expect(result.gate2?.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  test("escalates to user on judge error or offline (fail-closed, no auto-approval)", async () => {
    const mockJudge: GateJudgeClient = {
      evaluateGate: async () => ({
        error: "network_timeout_504",
      }),
    };

    const context: TaskVerificationContext = {
      taskId: "task-5",
      testCommand: "bun -e \"process.exit(0)\"",
    };

    const result = await verifyTaskCompletion(context, mockJudge);
    expect(result.approved).toBe(false);
    expect(result.escalateToUser).toBe(true);
    expect(result.reasons.some((r) => r.includes("fail-closed escalation"))).toBe(true);
  });

  describe("Dumb Model Fallback Protocol (XML Remediation Injection)", () => {
    test("generates strict XML-wrapped remediation instructions when Gate 1 fails", async () => {
      const mockJudge: GateJudgeClient = {
        evaluateGate: async () => ({ answers: {} }),
      };

      const context: TaskVerificationContext = {
        taskId: "task-failing-tests",
        testCommand: "bun -e \"process.exit(1)\"",
      };

      const result = await verifyTaskCompletion(context, mockJudge);
      expect(result.approved).toBe(false);
      expect(result.remediation).toBeDefined();
      expect(result.remediation).toContain("<remediation>");
      expect(result.remediation).toContain("</remediation>");
      expect(result.remediation).toContain("<immutable_constraints>");
      expect(result.remediation).toContain("Test suite failed with exit code 1");
      expect(result.remediation).toContain("immutable constraints");
    });

    test("generates strict XML-wrapped remediation instructions when Gate 2 fails", async () => {
      const mockJudge: GateJudgeClient = {
        evaluateGate: async () => ({
          answers: {
            meets_criteria: { noul: 0.3 },
            plan_drift: { choice: "no_drift" },
            claude_account_untouched: { noul: 1.0 },
          },
        }),
      };

      const context: TaskVerificationContext = {
        taskId: "task-criteria-failed",
        testCommand: "bun -e \"process.exit(0)\"",
      };

      const result = await verifyTaskCompletion(context, mockJudge);
      expect(result.approved).toBe(false);
      expect(result.remediation).toBeDefined();
      expect(result.remediation).toContain("<remediation>");
      expect(result.remediation).toContain("<failure_reasons>");
      expect(result.remediation).toContain("meets_criteria");
    });

    test("does not generate remediation when verification succeeds", async () => {
      const mockJudge: GateJudgeClient = {
        evaluateGate: async () => ({
          answers: {
            meets_criteria: { noul: 0.95 },
            plan_drift: { choice: "no_drift" },
            claude_account_untouched: { noul: 1.0 },
          },
        }),
      };

      const context: TaskVerificationContext = {
        taskId: "task-success",
        testCommand: "bun -e \"process.exit(0)\"",
      };

      const result = await verifyTaskCompletion(context, mockJudge);
      expect(result.approved).toBe(true);
      expect(result.remediation).toBeUndefined();
    });

    test("generateFallbackRemediation constructs valid XML structure", () => {
      const reasons = ["Test failure", "Scope deviation"];
      const xml = generateFallbackRemediation(reasons, { taskId: "task-xyz" });
      expect(xml.startsWith("<remediation>")).toBe(true);
      expect(xml.endsWith("</remediation>")).toBe(true);
      expect(xml).toContain("<reason>Test failure</reason>");
      expect(xml).toContain("<reason>Scope deviation</reason>");
      expect(xml).toContain("<task_id>task-xyz</task_id>");
    });
  });

  describe("Autonomous Auto-Approval & Proof-of-Completion Invariants", () => {
    test("Gate 1 blocks completion if agent fails to prove task or todo completion", async () => {
      let judgeCalled = false;
      const mockJudge: GateJudgeClient = {
        evaluateGate: async () => {
          judgeCalled = true;
          return {
            answers: {
              meets_criteria: { noul: 0.99 },
              plan_drift: { choice: "no_drift" },
              claude_account_untouched: { noul: 1.0 },
            },
          };
        },
      };

      const context: TaskVerificationContext = {
        taskId: "unproven-task",
        testCommand: "bun -e \"process.exit(0)\"",
        taskDoneProven: false,
        todoCompleted: false,
      };

      const result = await verifyTaskCompletion(context, mockJudge);
      expect(result.approved).toBe(false);
      expect(result.gate1.passed).toBe(false);
      expect(judgeCalled).toBe(false);
      expect(result.reasons.some((r) => r.includes("proof") || r.includes("todo") || r.includes("precondition"))).toBe(true);
    });

    test("Gate 2 auto-approval threshold defaults to 80% (0.80)", async () => {
      delete process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD;

      const mockJudge: GateJudgeClient = {
        evaluateGate: async () => ({
          answers: {
            meets_criteria: { noul: 0.75 },
            plan_drift: { choice: "no_drift" },
            claude_account_untouched: { noul: 1.0 },
          },
        }),
      };

      const context: TaskVerificationContext = {
        taskId: "threshold-default-check",
        testCommand: "bun -e \"process.exit(0)\"",
        taskDoneProven: true,
        todoCompleted: true,
      };

      const result = await verifyTaskCompletion(context, mockJudge);
      expect(result.approved).toBe(false);
      expect(result.reasons.some((r) => r.includes("0.80") || r.includes("threshold"))).toBe(true);
    });

    test("Gate 2 auto-approves completely without prompting user when score >= configurable threshold", async () => {
      process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD = "70";
      try {
        const mockJudge: GateJudgeClient = {
          evaluateGate: async () => ({
            answers: {
              meets_criteria: { noul: 0.75 },
              plan_drift: { choice: "no_drift" },
              claude_account_untouched: { noul: 1.0 },
            },
          }),
        };

        const context: TaskVerificationContext = {
          taskId: "custom-threshold-pass",
          testCommand: "bun -e \"process.exit(0)\"",
          taskDoneProven: true,
          todoCompleted: true,
        };

        const result = await verifyTaskCompletion(context, mockJudge);
        expect(result.approved).toBe(true);
        expect(result.gate2?.passed).toBe(true);
        expect(result.escalateToUser).toBe(false);
      } finally {
        delete process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD;
      }
    });
  });
});