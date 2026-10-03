import { describe, expect, test } from "bun:test";
import {
  checkClaudePlanIsolation,
  constructPlanQuestions,
  evaluatePlanDraft,
  type PlanEvaluationInput,
  type PlanJudgeClient,
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
      planContent: "Implement token bucket rate limiter with 100% test coverage and boundary validation.",
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
      planContent: "Just add a simple function without error handling.",
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
      planContent: "Do some refactoring. Verification: test manually.",
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
      planContent: "Skip 3 requested requirements to save time.",
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
      planContent: "Incomplete draft",
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
