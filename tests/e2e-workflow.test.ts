import { describe, expect, test } from "bun:test";
import { evaluatePlanDraft, type PlanJudgeClient } from "../src/plan-evaluator";
import { verifyTaskCompletion, type GateJudgeClient } from "../src/verification-gate";
import registerExtension from "../typesafe-planner";

describe("Phase 4: End-to-End Workflow & OMP Integration", () => {
  test("Full lifecycle: Plan draft elevation -> implementation -> task dual-verification", async () => {
    // Step 1: Draft plan evaluated and elevated
    const planJudge: PlanJudgeClient = {
      evaluatePlan: async () => ({
        answers: {
          scope_mode: { choice: "HOLD" },
          algorithm_depth: { score: 2.8 },
          task_actionability: { noul: 0.94 },
          claude_isolation_adherence: { noul: 1.0 },
        },
      }),
    };

    const planResult = await evaluatePlanDraft(
      {
        planTitle: "Production Token Cache",
        planContent: "Implement memory-efficient LRU cache with TTL expiration and comprehensive error handling.",
        attempt: 1,
      },
      planJudge
    );

    expect(planResult.approved).toBe(true);
    expect(planResult.score).toBeGreaterThanOrEqual(2.0);
    expect(planResult.noul).toBeGreaterThanOrEqual(0.70);

    // Step 2: Implementation verified with Gate 1 deterministic and Gate 2 semantic checks
    const gateJudge: GateJudgeClient = {
      evaluateGate: async () => ({
        answers: {
          meets_criteria: { noul: 0.95 },
          plan_drift: { choice: "no_drift" },
          claude_account_untouched: { noul: 1.0 },
        },
      }),
    };

    const taskResult = await verifyTaskCompletion(
      {
        taskId: "implement-lru-cache",
        testCommand: "bun -e \"process.exit(0)\"",
      },
      gateJudge
    );

    expect(taskResult.approved).toBe(true);
    expect(taskResult.gate1.passed).toBe(true);
    expect(taskResult.gate2?.passed).toBe(true);
  });

  test("Extension exposes typesafe_elevate_plan and typesafe_verify_completion tools", () => {
    const registeredTools: string[] = [];
    const mockPi = {
      zod: {
        object: (x: unknown) => x,
        union: (x: unknown) => x,
        string: () => ({ optional: () => "string", min: () => "string" }),
        number: () => ({ optional: () => "number" }),
        record: (x: unknown) => x,
        enum: (x: unknown) => x,
        unknown: () => ({ optional: () => "unknown" }),
        array: (x: unknown) => ({ min: () => x }),
      },
      on: () => {},
      sendMessage: async () => {},
      registerTool: (def: { name: string }) => {
        registeredTools.push(def.name);
      },
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);

    expect(registeredTools).toContain("typesafe_judge");
    expect(registeredTools).toContain("typesafe_rerank");
    expect(registeredTools).toContain("typesafe_evaluate_multi");
    expect(registeredTools).toContain("typesafe_elevate_plan");
    expect(registeredTools).toContain("typesafe_verify_completion");
  });
});
