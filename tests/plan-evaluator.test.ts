import { describe, expect, test } from "bun:test";
import {
  checkClaudePlanIsolation,
  constructPlanQuestions,
  evaluatePlanDraft,
  type PlanEvaluationInput,
  type PlanJudgeClient,
  preEvaluationTriage,
} from "../src/plan-evaluator";

describe("Phase 2: Plan-Time Quality Elevation Engine", () => {
  test("constructPlanQuestions builds 3-question rubric plus isolation question", () => {
    const questions = constructPlanQuestions();
    expect(questions.scope_mode).toBeDefined();
    expect(questions.scope_mode.type).toBe("choice");
    expect(questions.algorithm_depth).toBeDefined();
    expect(questions.algorithm_depth.type).toBe("score");
    expect(questions.task_actionability).toBeDefined();
    expect(questions.task_actionability.type).toBe("noul");
    expect(questions.claude_isolation_adherence).toBeDefined();
    expect(questions.claude_isolation_adherence.type).toBe("noul");
  });

  test("checkClaudePlanIsolation detects prohibited edits to ~/.claude or Anthropic configs", () => {
    const badPlan1 = "We will modify ~/.claude/settings.json to add custom settings.";
    expect(checkClaudePlanIsolation(badPlan1).safe).toBe(false);

    const badPlan2 = "Edit .claude/hooks/lib/something.cjs to bypass check.";
    expect(checkClaudePlanIsolation(badPlan2).safe).toBe(false);

    const badPlan3 = "Store credentials into ~/.claude.json.";
    expect(checkClaudePlanIsolation(badPlan3).safe).toBe(false);

    const cleanPlan = "Implement src/auth.ts with password hashing and unit tests.";
    expect(checkClaudePlanIsolation(cleanPlan).safe).toBe(true);
  });

  test("approves high-quality plan draft meeting all criteria", async () => {
    const mockClient: PlanJudgeClient = {
      evaluatePlan: async () => ({
        answers: {
          scope_mode: { choice: "HOLD" },
          algorithm_depth: { score: 2.6 },
          task_actionability: { noul: 0.88 },
          claude_isolation_adherence: { noul: 1.0 },
        },
      }),
    };

    const input: PlanEvaluationInput = {
      planTitle: "Robust Rate Limiter",
      planContent:
        "1. Step 1: Implement token bucket rate limiter in src/rate-limiter.ts with 100% test coverage and boundary validation.\nVerification: bun test tests/rate-limiter.test.ts",
      attempt: 1,
    };

    const result = await evaluatePlanDraft(input, mockClient);
    expect(result.approved).toBe(true);
    expect(result.score).toBe(2.6);
    expect(result.noul).toBe(0.88);
    expect(result.claudeIsolationSafe).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  test("rejects vague plan draft with low algorithm depth score (<2.0)", async () => {
    const mockClient: PlanJudgeClient = {
      evaluatePlan: async () => ({
        answers: {
          scope_mode: { choice: "HOLD" },
          algorithm_depth: { score: 1.2 },
          task_actionability: { noul: 0.85 },
          claude_isolation_adherence: { noul: 1.0 },
        },
      }),
    };

    const input: PlanEvaluationInput = {
      planTitle: "Quick feature",
      planContent:
        "1. Step 1: Just add a simple function in src/quick.ts without error handling.\nVerification: bun test tests/quick.test.ts",
      attempt: 1,
    };

    const result = await evaluatePlanDraft(input, mockClient);
    expect(result.approved).toBe(false);
    expect(result.score).toBe(1.2);
    expect(result.reasons.some((r) => r.includes("Algorithm depth"))).toBe(true);
  });

  test("rejects plan with untestable tasks (task_actionability < 0.70)", async () => {
    const mockClient: PlanJudgeClient = {
      evaluatePlan: async () => ({
        answers: {
          scope_mode: { choice: "HOLD" },
          algorithm_depth: { score: 2.5 },
          task_actionability: { noul: 0.45 },
          claude_isolation_adherence: { noul: 1.0 },
        },
      }),
    };

    const input: PlanEvaluationInput = {
      planTitle: "Untestable plan",
      planContent:
        "1. Step 1: Do some refactoring in src/refactor.ts.\nVerification: test manually.",
      attempt: 1,
    };

    const result = await evaluatePlanDraft(input, mockClient);
    expect(result.approved).toBe(false);
    expect(result.noul).toBe(0.45);
    expect(result.reasons.some((r) => r.includes("Task actionability"))).toBe(true);
  });

  test("rejects plan attempting unauthorized scope REDUCTION", async () => {
    const mockClient: PlanJudgeClient = {
      evaluatePlan: async () => ({
        answers: {
          scope_mode: { choice: "REDUCTION" },
          algorithm_depth: { score: 2.8 },
          task_actionability: { noul: 0.9 },
          claude_isolation_adherence: { noul: 1.0 },
        },
      }),
    };

    const input: PlanEvaluationInput = {
      planTitle: "Reduced scope plan",
      planContent:
        "1. Step 1: Skip 3 requested requirements in src/scope.ts to save time.\nVerification: bun test tests/scope.test.ts",
      attempt: 1,
    };

    const result = await evaluatePlanDraft(input, mockClient);
    expect(result.approved).toBe(false);
    expect(result.scopeMode).toBe("REDUCTION");
    expect(result.reasons.some((r) => r.includes("Scope reduction"))).toBe(true);
  });

  test("rejects plan attempting to modify Claude configuration without calling remote judge", async () => {
    let judgeCalled = false;
    const mockClient: PlanJudgeClient = {
      evaluatePlan: async () => {
        judgeCalled = true;
        return { answers: {} };
      },
    };

    const input: PlanEvaluationInput = {
      planTitle: "Malicious Plan",
      planContent: "Modify ~/.claude/settings.json to disable hooks.",
      attempt: 1,
    };

    const result = await evaluatePlanDraft(input, mockClient);
    expect(result.approved).toBe(false);
    expect(result.claudeIsolationSafe).toBe(false);
    expect(judgeCalled).toBe(false); // Short-circuits before network
    expect(result.reasons.some((r) => r.includes("Claude zero-touch"))).toBe(true);
  });

  test("escalates to user on 3rd failed attempt with structured feedback", async () => {
    const mockClient: PlanJudgeClient = {
      evaluatePlan: async () => ({
        answers: {
          scope_mode: { choice: "HOLD" },
          algorithm_depth: { score: 1.0 },
          task_actionability: { noul: 0.5 },
          claude_isolation_adherence: { noul: 1.0 },
        },
      }),
    };

    const input: PlanEvaluationInput = {
      planTitle: "Persistently bad plan",
      planContent:
        "1. Step 1: Incomplete draft in src/bad.ts.\nVerification: bun test tests/bad.test.ts",
      attempt: 3,
    };

    const result = await evaluatePlanDraft(input, mockClient);
    expect(result.approved).toBe(false);
    expect(result.escalateToUser).toBe(true);
    expect(result.feedback).toBeDefined();
    expect(result.feedback).toContain("Algorithm depth");
    expect(result.feedback).toContain("Task actionability");
  });
});

  describe("PreEvaluationTriage: Structural Integrity Guard", () => {
    test("rejects plan without target files or paths", () => {
      const emptyPlan = "# Feature Plan\n1. Do some stuff.\n2. Do some other stuff.\nVerification: manual check.";
      const result = preEvaluationTriage(emptyPlan);
      expect(result.valid).toBe(false);
      expect(result.reasons.some((r) => r.toLowerCase().includes("file") || r.toLowerCase().includes("path"))).toBe(true);
    });

    test("rejects plan with floating forward dependencies or nonexistent steps", () => {
      const brokenDepPlan = `# Implementation Plan
1. Step 1: Update src/auth.ts (depends on Step 4).
2. Step 2: Update src/config.ts.
Verification: bun test`;
      const result = preEvaluationTriage(brokenDepPlan);
      expect(result.valid).toBe(false);
      expect(result.reasons.some((r) => r.toLowerCase().includes("depend") || r.toLowerCase().includes("step"))).toBe(true);
    });

    test("rejects plan missing verification or test strategy", () => {
      const noVerificationPlan = `# Implementation Plan
1. Step 1: Update src/auth.ts.
2. Step 2: Update src/routes.ts.`;
      const result = preEvaluationTriage(noVerificationPlan);
      expect(result.valid).toBe(false);
      expect(result.reasons.some((r) => r.toLowerCase().includes("verification") || r.toLowerCase().includes("test"))).toBe(true);
    });

    test("approves well-structured plan with files, valid step flow, and verification", () => {
      const goodPlan = `# Implementation Plan
1. Step 1: Update src/auth.ts with token validation.
2. Step 2: Update src/routes.ts to use auth middleware (depends on Step 1).
Verification: Run bun test tests/auth.test.ts.`;
      const result = preEvaluationTriage(goodPlan);
      expect(result.valid).toBe(true);
      expect(result.reasons.length).toBe(0);
    });

    test("evaluatePlanDraft short-circuits on triage failure without calling judgeClient", async () => {
      let judgeCalled = false;
      const mockClient: PlanJudgeClient = {
        evaluatePlan: async () => {
          judgeCalled = true;
          return { answers: {} };
        },
      };

      const input: PlanEvaluationInput = {
        planTitle: "Vague Plan",
        planContent: "Just do things without files or verification.",
        attempt: 1,
      };

      const result = await evaluatePlanDraft(input, mockClient);
      expect(result.approved).toBe(false);
      expect(result.triagePassed).toBe(false);
      expect(judgeCalled).toBe(false);
      expect(result.reasons.some((r) => r.includes("Structural triage"))).toBe(true);
    });
  });
