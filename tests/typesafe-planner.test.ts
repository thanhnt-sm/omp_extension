import { describe, expect, test, beforeEach } from "bun:test";
import registerExtension, {
  runMultiPersonaDebate,
  constructMultiPersonaQuestions,
  type MultiPersonaDebateResult,
  type DebateJudgeClient,
} from "../typesafe-planner";

describe("Phase 5: Multi-Persona Pre-Analysis (ck:predict Integration)", () => {
  test("constructMultiPersonaQuestions defines 5 personas (Architect, Security, Performance, UX, Devil's Advocate)", () => {
    const questions = constructMultiPersonaQuestions();
    expect(questions.architect).toBeDefined();
    expect(questions.architect.type).toBe("score");
    expect(questions.security).toBeDefined();
    expect(questions.security.type).toBe("score");
    expect(questions.performance).toBeDefined();
    expect(questions.performance.type).toBe("score");
    expect(questions.ux).toBeDefined();
    expect(questions.ux.type).toBe("score");
    expect(questions.devils_advocate).toBeDefined();
    expect(questions.devils_advocate.type).toBe("score");
  });

  test("runMultiPersonaDebate routes evaluation exclusively to fast-model tier (jev-fast)", async () => {
    let capturedModel = "";
    let capturedQuestions: Record<string, unknown> = {};

    const mockClient: DebateJudgeClient = {
      evaluateDebate: async (params) => {
        capturedModel = params.model;
        capturedQuestions = params.questions;
        return {
          modelUsed: params.model,
          answers: {
            architect: { score: 3 },
            security: { score: 3 },
            performance: { score: 2 },
            ux: { score: 3 },
            devils_advocate: { score: 2 },
          },
        };
      },
    };

    const plan = "1. Step 1: Implement secure cache in src/cache.ts\nVerification: bun test";
    const result = await runMultiPersonaDebate(plan, mockClient);

    expect(capturedModel).toBe("jev-fast");
    expect(Object.keys(capturedQuestions)).toEqual([
      "architect",
      "security",
      "performance",
      "ux",
      "devils_advocate",
    ]);
    expect(result.approved).toBe(true);
    expect(result.modelTier).toBe("fast");
    expect(result.consensusScore).toBeGreaterThanOrEqual(2.0);
  });

  test("runMultiPersonaDebate rejects plans with low consensus score or critical blind spots", async () => {
    const mockClient: DebateJudgeClient = {
      evaluateDebate: async (params) => ({
        modelUsed: params.model,
        answers: {
          architect: { score: 2 },
          security: { score: 0 }, // Critical security flaw flagged
          performance: { score: 1 },
          ux: { score: 1 },
          devils_advocate: { score: 0 }, // Fatal blind spot
        },
      }),
    };

    const plan = "1. Step 1: Disable auth tokens in src/auth.ts to improve speed\nVerification: manual";
    const result = await runMultiPersonaDebate(plan, mockClient);

    expect(result.approved).toBe(false);
    expect(result.modelTier).toBe("fast");
    expect(result.consensusScore).toBeLessThan(1.5);
    expect(result.reasons.some((r) => r.toLowerCase().includes("security") || r.toLowerCase().includes("advocate"))).toBe(true);
  });

  test("typesafe_elevate_plan tool executes multi-persona debate as preliminary check", async () => {
    let registeredTools: Record<string, { execute: Function }> = {};
    const mockPi = {
      zod: {
        object: (x: unknown) => x,
        union: (x: unknown) => x,
        string: () => ({ optional: () => "string", min: () => "string" }),
        number: () => ({ optional: () => "number" }),
        record: (x: unknown) => x,
        enum: (x: unknown) => x,
        unknown: () => ({ optional: () => "unknown" }),
        array: (x: unknown) => ({ min: () => x, optional: () => x }),
      },
      on: () => {},
      sendMessage: async () => {},
      registerTool: (def: { name: string; execute: Function }) => {
        registeredTools[def.name] = def;
      },
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    expect(registeredTools.typesafe_elevate_plan).toBeDefined();

    // Verify execution invokes debate
    const res = await registeredTools.typesafe_elevate_plan.execute("call-1", {
      planTitle: "Test Plan",
      planContent: "1. Step 1: Update src/auth.ts\nVerification: bun test tests/auth.test.ts",
    });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.debate).toBeDefined();
    expect(parsed.debate.modelTier).toBe("fast");
  });
});
