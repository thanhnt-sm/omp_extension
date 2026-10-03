import { describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";

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

function createZodMock() {
  const schema = {
    safeParse: (val: unknown) => {
      if (val && typeof val === "object") {
        const obj = val as Record<string, unknown>;
        if (
          obj.role === "scope_arbiter" ||
          obj.role === "drift_guard" ||
          obj.role === "risk_security_triage"
        ) {
          return { success: true, data: val };
        }
      }
      return { success: false, error: new Error("Invalid role") };
    },
    optional: () => schema,
  };

  return {
    object: () => schema,
    union: () => schema,
    string: () => schema,
    number: () => schema,
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

describe("Phase 3: OMP Extension Interception Bridge", () => {
  function createMockPi() {
    const tools: Record<string, MockToolDefinition> = {};
    const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
    const messages: unknown[] = [];

    const mockPi = {
      zod: createZodMock(),
      registerTool(def: MockToolDefinition) {
        tools[def.name] = def;
      },
      on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      async sendMessage(msg: unknown) {
        messages.push(msg);
      },
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);

    return { tools, handlers, messages };
  }

  test("registers typesafe_expert_review tool with proper schema", () => {
    const { tools } = createMockPi();
    expect(tools.typesafe_expert_review).toBeDefined();
    expect(tools.typesafe_expert_review.description).toContain("expert");

    const schema = tools.typesafe_expert_review.parameters;
    const parsed = schema.safeParse({
      role: "scope_arbiter",
      context: "Drafting plan",
    });
    expect(parsed.success).toBe(true);
  });

  test("typesafe_expert_review validates valid roles and rejects invalid roles", () => {
    const { tools } = createMockPi();
    const schema = tools.typesafe_expert_review.parameters;

    expect(schema.safeParse({ role: "drift_guard", context: "diff" }).success).toBe(true);
    expect(schema.safeParse({ role: "risk_security_triage", context: "triage" }).success).toBe(true);
    expect(schema.safeParse({ role: "invalid_role", context: "diff" }).success).toBe(false);
  });

  test("intercepts write and edit tools targeting todo.json (Direct File Bypass Defense)", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    let cancelledReason: string | undefined;
    const writeEvent: MockEvent = {
      tool: "write",
      params: { path: "todo.json", content: "{\"tasks\": []}" },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    try {
      await interceptor!(writeEvent, {});
    } catch {
      // expected error on cancel
    }

    expect(cancelledReason).toBeDefined();
    expect(cancelledReason).toContain("Direct file modification of todo.json is prohibited");

    let editCancelledReason: string | undefined;
    const editEvent: MockEvent = {
      tool: "edit",
      params: { path: ".todo.json", input: "..." },
      cancel: (r: string) => {
        editCancelledReason = r;
      },
    };

    try {
      await interceptor!(editEvent, {});
    } catch {}

    expect(editCancelledReason).toBeDefined();
    expect(editCancelledReason).toContain("Direct file modification of todo.json is prohibited");
  });

  test("allows non-todo write operations to pass without interruption", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call![0];

    let cancelled = false;
    const safeEvent: MockEvent = {
      tool: "write",
      params: { path: "src/index.ts", content: "export const x = 1;" },
      cancel: () => {
        cancelled = true;
      },
    };

    await interceptor(safeEvent, {});
    expect(cancelled).toBe(false);
  });

  test("fast-paths non-completion todo operations (op: view, op: start)", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call![0];

    let cancelled = false;
    const viewEvent: MockEvent = {
      tool: "todo",
      params: { op: "view" },
      cancel: () => {
        cancelled = true;
      },
    };

    await interceptor(viewEvent, {});
    expect(cancelled).toBe(false);
  });

  test("intercepts todo done and executes Gate 1 micro-check, rejecting failing tests", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call![0];

    let cancelledReason: string | undefined;
    const doneEvent: MockEvent = {
      tool: "todo",
      params: {
        op: "done",
        task: "Failing test task",
        testCommand: "bun -e \"process.exit(1)\"",
      },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    try {
      await interceptor(doneEvent, { cwd: process.cwd() });
    } catch {
      // expected rejection
    }

    expect(cancelledReason).toBeDefined();
    expect(cancelledReason).toContain("Gate 1 Micro-Check");
  });
});
