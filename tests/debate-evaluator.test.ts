import { describe, expect, test } from "bun:test";
import {
  constructMultiPersonaQuestions,
  runMultiPersonaDebate,
  resolveDebateModel,
  type MultiPersonaDebateResult,
  type DebateJudgeClient,
} from "../src/debate-evaluator";

describe("Multi-Persona Debate Evaluator (jev-latest default & config options)", () => {
  test("resolveDebateModel defaults to jev-latest per TypeSafe official docs", () => {
    delete process.env.TYPESAFE_PREDICT_MODEL;
    delete process.env.TYPESAFE_DEBATE_MODEL;
    expect(resolveDebateModel()).toBe("jev-latest");
  });

  test("resolveDebateModel respects environment variable configuration", () => {
    process.env.TYPESAFE_PREDICT_MODEL = "jev-1.13";
    expect(resolveDebateModel()).toBe("jev-1.13");
    delete process.env.TYPESAFE_PREDICT_MODEL;
  });

  test("constructMultiPersonaQuestions defines 5 personas with rubrics", () => {
    const questions = constructMultiPersonaQuestions();
    const personas = ["architect", "security", "performance", "ux", "devils_advocate"];
    for (const p of personas) {
      expect(questions[p]).toBeDefined();
      expect(questions[p].type).toBe("score");
      expect(Array.isArray(questions[p].criteria)).toBe(true);
      expect(questions[p].criteria!.length).toBe(4);
    }
  });

  test("runMultiPersonaDebate defaults model to jev-latest", async () => {
    let capturedModel = "";
    let capturedState = "";

    const mockClient: DebateJudgeClient = {
      evaluateDebate: async (params) => {
        capturedModel = params.model || "";
        capturedState = params.state;
        return {
          modelUsed: params.model || "jev-latest",
          answers: {
            architect: { score: 3, verdict: "Solid" },
            security: { score: 3, verdict: "Secure" },
            performance: { score: 3, verdict: "Fast" },
            ux: { score: 3, verdict: "Intuitive" },
            devils_advocate: { score: 3, verdict: "No blindspots" },
          },
        };
      },
    };

    const plan = "1. Step 1: Safe migration";
    const res = await runMultiPersonaDebate(plan, mockClient);

    expect(capturedModel).toBe("jev-latest");
    expect(capturedState).toContain("Multi-Persona Pre-Analysis Debate (ck:predict)");
    expect(res.approved).toBe(true);
    expect(res.modelTier).toBe("jev-latest");
  });

  test("runMultiPersonaDebate allows explicit model override via options", async () => {
    let capturedModel = "";

    const mockClient: DebateJudgeClient = {
      evaluateDebate: async (params) => {
        capturedModel = params.model || "";
        return {
          modelUsed: params.model,
          answers: {
            architect: { score: 3 },
            security: { score: 3 },
            performance: { score: 3 },
            ux: { score: 3 },
            devils_advocate: { score: 3 },
          },
        };
      },
    };

    const res = await runMultiPersonaDebate("Plan", mockClient, { model: "jev-1.13" });
    expect(capturedModel).toBe("jev-1.13");
    expect(res.modelTier).toBe("jev-1.13");
  });
});
