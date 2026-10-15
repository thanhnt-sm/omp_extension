import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import registerExtension, {
  activeContractedTasks,
  resetLastCheckpoint,
} from "../typesafe-planner";
import { synthesizePlanDelta } from "../src/remediation-generator";

interface MockToolDefinition {
  name: string;
  description: string;
  parameters: {
    safeParse: (val: unknown) => { success: boolean; data?: unknown; error?: unknown };
  };
  execute: (id: string, params: unknown, signal?: AbortSignal, ctx?: unknown) => Promise<unknown>;
}

interface MockEvent {
  tool?: string;
  name?: string;
  toolName?: string;
  params?: Record<string, unknown>;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  cancel?: (reason: string) => void;
}

interface MockPiMessage {
  customType?: string;
  content?: string;
  display?: boolean;
}

function createZodMock() {
  const schema = {
    safeParse: (val: unknown) => {
      if (val && typeof val === "object") {
        return { success: true, data: val };
      }
      return { success: false, error: new Error("Invalid") };
    },
    optional: () => schema,
    default: () => schema,
    describe: () => schema,
    min: () => schema,
  };

  return {
    object: () => schema,
    union: () => schema,
    string: () => schema,
    number: () => schema,
    boolean: () => schema,
    record: () => schema,
    enum: (vals: string[]) => ({
      ...schema,
      safeParse: (val: unknown) => {
        return typeof val === "string" && vals.includes(val)
          ? { success: true, data: val }
          : { success: false, error: new Error("Enum mismatch") };
      },
    }),
    unknown: () => schema,
    array: () => ({
      ...schema,
      min: () => schema,
    }),
  };
}

function createMockPi() {
  const tools: Record<string, MockToolDefinition> = {};
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const messages: MockPiMessage[] = [];

  const mockPi = {
    zod: createZodMock(),
    registerTool(def: MockToolDefinition) {
      tools[def.name] = def;
    },
    on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    async sendMessage(msg: MockPiMessage) {
      messages.push(msg);
    },
  };

  return { tools, handlers, messages, mockPi };
}

describe("Phase 3: Sovereign Human Authority & Adaptive Plan Reconciliation", () => {
  describe("synthesizePlanDelta", () => {
    test("synthesizes structured plan delta with required actions", () => {
      const delta = synthesizePlanDelta({
        taskId: "task-checkout",
        reasons: ["Missing error handling for expired credit cards"],
        nextActions: ["Implement ExpiredCardError catch block and test"],
        suggestedTasks: ["Add expired card unit test in tests/checkout.test.ts"],
      });

      expect(delta).toContain("<plan_reconciliation>");
      expect(delta).toContain("</plan_reconciliation>");
      expect(delta).toContain("<task_id>task-checkout</task_id>");
      expect(delta).toContain("<unfulfilled_criteria>");
      expect(delta).toContain("Missing error handling for expired credit cards");
      expect(delta).toContain("<required_actions>");
      expect(delta).toContain("Implement ExpiredCardError catch block and test");
      expect(delta).toContain("<proposed_plan_delta>");
      expect(delta).toContain("<add_task>Add expired card unit test in tests/checkout.test.ts</add_task>");
    });
  });

  describe("Sovereign Human Invariant in handleTodoInterception", () => {
    const { handlers, messages, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    beforeEach(() => {
      resetLastCheckpoint();
      activeContractedTasks.clear();
      messages.length = 0;
    });

    test("Sovereign Human Override via ctx.isHuman unblocks drop immediately with zero throws", async () => {
      activeContractedTasks.add("ObsoleteTask1");

      let cancelled = false;
      const dropEvt: MockEvent = {
        tool: "todo",
        params: { op: "drop", task: "ObsoleteTask1" },
        cancel: () => {
          cancelled = true;
        },
      };

      const ctx = { isHuman: true };
      let threw = false;
      try {
        await interceptor?.(dropEvt, ctx);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(cancelled).toBe(false);
      expect(activeContractedTasks.has("ObsoleteTask1")).toBe(false);

      const report = messages.find((m) => m.customType === "typesafe-task-report");
      expect(report).toBeDefined();
      expect(report?.content).toContain("host-authorization");
    });

    test("Sovereign Human UI Confirmation permanently records authorization", async () => {
      activeContractedTasks.add("ObsoleteBuildTask");

      let confirmCalled = false;
      const ctx = {
        hasUI: true,
        ui: {
          confirm: async () => {
            confirmCalled = true;
            return true;
          },
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          answers: {
            drop_verdict: { choice: "ESCALATE", confidence: 0.5 },
          },
        }),
      })) as unknown as typeof globalThis.fetch;

      let threw = false;
      const dropEvt: MockEvent = {
        tool: "todo",
        params: { op: "drop", task: "ObsoleteBuildTask" },
        cancel: () => {},
      };

      try {
        await interceptor?.(dropEvt, ctx);
      } catch {
        threw = true;
      } finally {
        globalThis.fetch = originalFetch;
      }

      expect(threw).toBe(false);
      expect(activeContractedTasks.has("ObsoleteBuildTask")).toBe(false);
    });

    test("Clean build scenario: Clean build evidence auto-allows drop via Bicameral Consensus", async () => {
      activeContractedTasks.add("FixCompileError");

      const ctx = {
        userRequest: "The project extensions built successfully without any MSBuild errors. Please drop FixCompileError.",
      };

      let threw = false;
      let cancelled = false;
      const dropEvt: MockEvent = {
        tool: "todo",
        params: {
          op: "drop",
          task: "FixCompileError",
          reason: "Built successfully with zero MSBuild errors",
        },
        cancel: () => {
          cancelled = true;
        },
      };

      try {
        await interceptor?.(dropEvt, ctx);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(cancelled).toBe(false);
      expect(activeContractedTasks.has("FixCompileError")).toBe(false);
    });
  });
});
