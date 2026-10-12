import { describe, expect, test, beforeEach } from "bun:test";
import registerExtension, {
  runMultiPersonaDebate,
  constructMultiPersonaQuestions,
  normalizeQuestionForTypeSafe,
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
});

describe("Phase 3: Advisory Pre-Flight & Fast-Path Drop", () => {
  test("typesafe_verify_completion advisory hook returns evaluation without mutating activeContractedTasks", async () => {
    const { activeContractedTasks } = await import("../typesafe-planner");
    activeContractedTasks.add("task-advisory-1");

    const registeredTools: Record<string, { name: string; execute: Function }> = {};
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
      registerTool: (tool: { name: string; execute: Function }) => {
        registeredTools[tool.name] = tool;
      },
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    expect(registeredTools.typesafe_verify_completion).toBeDefined();

    // Invoking verify completion must NOT delete activeContractedTasks
    expect(activeContractedTasks.has("task-advisory-1")).toBe(true);
    activeContractedTasks.delete("task-advisory-1");
  });

  test("todo(op: 'drop') fast-paths without Gate 1/2 failure but sends UI warning notification", async () => {
    const { activeContractedTasks } = await import("../typesafe-planner");
    let toolCallHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const sentMessages: Array<{ content?: string; customType?: string }> = [];

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
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "tool_call") toolCallHandler = handler;
      },
      sendMessage: async (msg: { content?: string; customType?: string }) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    expect(toolCallHandler).toBeDefined();

    activeContractedTasks.add("task-to-drop");
    const event = {
      toolName: "todo",
      params: { op: "drop", task: "task-to-drop", isHuman: true },
    };

    await expect(toolCallHandler(event, { isHuman: true })).resolves.toBeUndefined();
    expect(activeContractedTasks.has("task-to-drop")).toBe(false);
    expect(sentMessages.some((m) => m.customType === "typesafe-task-report" && m.content && m.content.includes('DROP "task-to-drop"'))).toBe(true);
  });

  test("unauthorized todo(op: 'drop') of contracted task triggers EGC escalation gate", async () => {
    const { activeContractedTasks } = await import("../typesafe-planner");
    let toolCallHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const sentMessages: Array<{ content?: string; customType?: string }> = [];

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
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "tool_call") toolCallHandler = handler;
      },
      sendMessage: async (msg: { content?: string; customType?: string }) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    expect(toolCallHandler).toBeDefined();

    activeContractedTasks.add("contracted-drop-task");
    const event = {
      toolName: "todo",
      params: { op: "drop", task: "contracted-drop-task" },
    };

    if (toolCallHandler) {
      await expect(toolCallHandler(event, {})).rejects.toThrow("TypeSafe drop gate rejected");
    }
    expect(sentMessages.some((m) => m.customType === "typesafe-compliance-escalation")).toBe(true);
    activeContractedTasks.delete("contracted-drop-task");
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
