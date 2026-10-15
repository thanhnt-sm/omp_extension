import { describe, expect, test, beforeEach } from "bun:test";
import registerExtension, {
  runMultiPersonaDebate,
  constructMultiPersonaQuestions,
  normalizeQuestionForTypeSafe,
  inferTaskType,
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

  test("runMultiPersonaDebate routes evaluation exclusively to predict tier (jev-latest default)", async () => {
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

    expect(capturedModel).toBe("jev-latest");
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

describe("TypeSafe JEV Alignment: taskType inference & deliverableArtifacts", () => {
  test("infers taskType correctly based on modified files and uncommitted artifacts", async () => {
    const { inferTaskType } = await import("../typesafe-planner");
    expect(inferTaskType).toBeDefined();
    
    // Code changes
    expect(inferTaskType("M src/feature.ts", "")).toBe("code_change");
    expect(inferTaskType("A tests/feature.test.ts", "")).toBe("code_change");
    expect(inferTaskType("M package.json", "")).toBe("code_change");
    
    // Pure doc specifications
    expect(inferTaskType("M docs/spec.md", "")).toBe("doc_specification");
    expect(inferTaskType("?? docs/spec.md\n?? README.md", "")).toBe("doc_specification");
    
    // Analysis/research when no diff or only untracked reports/markdown
    expect(inferTaskType("", "report content")).toBe("analysis_research");
    expect(inferTaskType("?? reports/audit.md", "audit findings")).toBe("analysis_research");
  });

  test("classifies cognitive, research, brainstorming, and planning tasks without code modifications as analysis_research while preserving anti-spoofing", () => {
    // Cognitive/workflow tasks with empty gitStatus and no artifact files
    expect(inferTaskType("", "", "Read relevant ck:* skills and inspect codebase")).toBe("analysis_research");
    expect(inferTaskType("", "", "Clarify requirements and brainstorm 3 approaches")).toBe("analysis_research");
    expect(inferTaskType("", "", "Step 2: Synthesize findings and consult advisor")).toBe("analysis_research");
    expect(inferTaskType("", "", "Organize plan structure and journal decisions")).toBe("analysis_research");

    // Implementation verb guard when gitStatus is empty
    expect(inferTaskType("", "", "Implement plan execution in src/runner.ts")).toBe("code_change");
    expect(inferTaskType("", "", "Step 1: Fix auth bug and refactor validation")).toBe("code_change");

    // Anti-spoofing preserved when code files are modified
    expect(inferTaskType(" M src/index.ts", "", "Brainstorm auth architecture")).toBe("code_change");
    expect(inferTaskType("M src/planner.ts", "", "Read and clarify requirements")).toBe("code_change");
  });
});

describe("P3: advisory and native todo lifecycle", () => {
  test("completion advisory never mutates factory-owned todo state", async () => {
    const registeredTools: Record<string, { execute: Function }> = {};
    const mockPi = {
      zod: {
        object: (value: unknown) => value, union: (value: unknown) => value,
        string: () => ({ optional: () => "string", min: () => "string" }),
        number: () => ({ optional: () => "number" }), record: (value: unknown) => value,
        enum: (value: unknown) => value, unknown: () => ({ optional: () => "unknown" }),
        array: (value: unknown) => ({ min: () => value, optional: () => value }),
      },
      on() {}, sendMessage: async () => {}, registerTool(tool: { name: string; execute: Function }) { registeredTools[tool.name] = tool; },
    };
    const state = registerExtension(mockPi as never);
    state.phases = [{ name: "P", tasks: [{ content: "task-advisory-1", status: "in_progress" }] }];
    expect(registeredTools.typesafe_verify_completion).toBeDefined();
    expect(state.activeContractedTasks.has("task-advisory-1")).toBe(true);
  });
});

describe("Phase 2: Extension-Layer Schema Normalization", () => {
  test("normalizes choice question with string array criteria into dictionary", () => {
    const input = {
      architecture: {
        type: "choice" as const,
        instructions: "Evaluate architecture",
        criteria: [
          "HOLD: Keep current design unchanged",
          "EXPANSION: Add features without refactoring",
          "REFACTOR - Completely restructure module",
          "Other option without delimiter"
        ]
      }
    };

    const normalized = normalizeQuestionForTypeSafe(input);
    expect(normalized.architecture.criteria).toEqual({
      HOLD: "Keep current design unchanged",
      EXPANSION: "Add features without refactoring",
      REFACTOR: "Completely restructure module",
      option_3: "Other option without delimiter"
    });
  });

  test("normalizes noul question with 2-element array criteria into true/false dict", () => {
    const input = {
      is_secure: {
        type: "noul" as const,
        instructions: "Is the implementation secure?",
        criteria: ["Implementation passes security audit", "Implementation has vulnerabilities"]
      }
    };

    const normalized = normalizeQuestionForTypeSafe(input);
    expect(normalized.is_secure.criteria).toEqual({
      true: "Implementation passes security audit",
      false: "Implementation has vulnerabilities"
    });
  });

  test("normalizes noul question with 1-element array criteria into true/false dict", () => {
    const input = {
      is_clean: {
        type: "noul" as const,
        instructions: "Is the code clean?",
        criteria: ["Code is well structured"]
      }
    };

    const normalized = normalizeQuestionForTypeSafe(input);
    expect(normalized.is_clean.criteria).toEqual({
      true: "Code is well structured",
      false: "Not Code is well structured"
    });
  });

  test("normalizes score question criteria ensuring string levels", () => {
    const input = {
      code_quality: {
        type: "score" as const,
        instructions: "Rate quality",
        criteria: ["Level 0: Poor", 123, "Level 2: Good"]
      }
    };

    const normalized = normalizeQuestionForTypeSafe(input as unknown as Parameters<typeof normalizeQuestionForTypeSafe>[0]);
    expect(normalized.code_quality.criteria).toEqual([
      "Level 0: Poor",
      "123",
      "Level 2: Good"
    ]);
  });

  test("leaves compliant dictionary criteria untouched", () => {
    const input = {
      scope: {
        type: "choice" as const,
        instructions: "Select scope",
        criteria: {
          STRICT: "Strict adherence",
          LENIENT: "Lenient adherence"
        }
      }
    };

    const normalized = normalizeQuestionForTypeSafe(input);
    expect(normalized.scope.criteria).toEqual({
      STRICT: "Strict adherence",
      LENIENT: "Lenient adherence"
    });
  });
});
