import { describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";

function createPi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const messages: Array<{ customType?: string; content?: string }> = [];
  const schema = { optional: () => schema, min: () => schema };
  return {
    handlers,
    messages,
    pi: {
      zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
      on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { (handlers[event] ??= []).push(handler); },
      registerTool() {},
      async sendMessage(message: { customType?: string; content?: string }) { messages.push(message); },
    },
  };
}

function registerTestExtension(pi: ReturnType<typeof createPi>["pi"]) {
  return registerExtension(pi as never, { env: { TYPESAFE_API_KEY: "" } });
}

describe("P3 native drop transaction", () => {
  test("phase drop stages all active phase tasks and commits only its result", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [
      { name: "P1", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] },
      { name: "P2", tasks: [{ content: "C", status: "pending" }] },
    ];
    const params = { op: "drop", phase: "P1" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "drop-p1", params }, { cwd: process.cwd(), isHuman: true });
    expect(state.stagedCalls.get("drop-p1")?.affectedTasks).toEqual(["A", "B"]);
    expect(state.activeContractedTasks.has("A")).toBe(true);
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "drop-p1", params, details: { op: "drop", phases: [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "abandoned" }] },
      { name: "P2", tasks: [{ content: "C", status: "in_progress" }] },
    ] } }, {});
    expect(state.activeContractedTasks.has("A")).toBe(false);
    expect(state.activeContractedTasks.has("C")).toBe(true);
  });

  test("requires bicameral verification before any agent-issued task deletion can stage", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];
    const params = { op: "drop", task: "A" };

    await expect(
      fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "drop-headless", params }, { cwd: process.cwd() })
    ).rejects.toThrow("typesafe_verification_unavailable");
    expect(state.stagedCalls.size).toBe(0);
  });

  test("does not invoke UI before bicameral verification is available", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];
    const params = { op: "drop", task: "A" };
    const confirmations: Array<[string, string]> = [];

    await expect(
      fixture.handlers.tool_call[0](
        { tool: "todo", toolCallId: "drop-confirmed", params },
        {
          cwd: process.cwd(),
          hasUI: true,
          ui: {
            confirm: async (title: string, message: string) => {
              confirmations.push([title, message]);
              return true;
            },
          },
        }
      )
    ).rejects.toThrow("typesafe_verification_unavailable");

    expect(confirmations).toEqual([]);
    expect(state.stagedCalls.size).toBe(0);
  });

  test("does not invoke UI rejection handling before bicameral verification is available", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];

    await expect(
      fixture.handlers.tool_call[0](
        { tool: "todo", toolCallId: "drop-rejected", params: { op: "drop", task: "A" } },
        { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => false } }
      )
    ).rejects.toThrow("typesafe_verification_unavailable");
    expect(state.stagedCalls.size).toBe(0);
  });

  test("does not invoke a failing UI before bicameral verification is available", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];

    await expect(
      fixture.handlers.tool_call[0](
        { tool: "todo", toolCallId: "drop-ui-error", params: { op: "drop", task: "A" } },
        { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => { throw new Error("UI unavailable"); } } }
      )
    ).rejects.toThrow("typesafe_verification_unavailable");
    expect(state.stagedCalls.size).toBe(0);
  });

  test("does not treat an unverified authorization claim as a bicameral or human approval", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];
    const params = { op: "drop", task: "A" };

    await expect(
      fixture.handlers.tool_call[0](
        { tool: "todo", toolCallId: "drop-unverified", params },
        { cwd: process.cwd(), authorized: true }
      )
    ).rejects.toThrow("typesafe_verification_unavailable");
    expect(state.stagedCalls.size).toBe(0);
  });

  test("does not carry a prior drop authorization to a reappended task", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];
    const dropParams = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0](
      { tool: "todo", toolCallId: "drop-A", params: dropParams },
      { cwd: process.cwd(), isHuman: true }
    );
    await fixture.handlers.tool_result[0](
      {
        tool: "todo",
        toolCallId: "drop-A",
        params: dropParams,
        details: { op: "drop", phases: [{ name: "P1", tasks: [{ content: "A", status: "abandoned" }] }] },
      },
      {}
    );

    const initParams = { op: "init", list: [{ phase: "P2", items: ["A"] }] };
    await fixture.handlers.tool_call[0](
      { tool: "todo", toolCallId: "init-A", params: initParams },
      { cwd: process.cwd(), isHuman: true }
    );
    await fixture.handlers.tool_result[0](
      {
        tool: "todo",
        toolCallId: "init-A",
        params: initParams,
        details: { op: "init", phases: [{ name: "P2", tasks: [{ content: "A", status: "pending" }] }] },
      },
      {}
    );

    await expect(
      fixture.handlers.tool_call[0](
        { tool: "todo", toolCallId: "redrop-A", params: dropParams },
        { cwd: process.cwd() }
      )
    ).rejects.toThrow("typesafe_verification_unavailable");
  });

  test("synthetic ops wrapper and missing native ID are rejected before staging", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "pending" }] }];
    await expect(fixture.handlers.tool_call[0]({ tool: "todo", params: { ops: [{ op: "drop", task: "A" }] } }, { cwd: process.cwd() })).rejects.toThrow("todo_ops_unsupported");
    await expect(fixture.handlers.tool_call[0]({ tool: "todo", params: { op: "drop", task: "A" } }, { cwd: process.cwd() })).rejects.toThrow("todo_call_id_missing");
    expect(state.stagedCalls.size).toBe(0);
  });

  test("init replacement stages without modifying state before native commit", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }] }];
    const params = { op: "init", list: [{ phase: "P2", items: ["B"] }] };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "init-p2", params }, { cwd: process.cwd(), isHuman: true });
    expect(state.phases[0].tasks[0].content).toBe("A");
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "init-p2", params, details: { op: "init", phases: [{ name: "P2", tasks: [{ content: "B", status: "in_progress" }] }] } }, {});
    expect(state.phases[0].tasks[0].content).toBe("B");
  });

  test("replacing init clears stale evidence and failure state for a same-content new incarnation", async () => {
    const fixture = createPi();
    const state = registerTestExtension(fixture.pi);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }] }];
    state.taskBaselines.set("A", { files: new Map([["old.ts", "stale"]]), truncated: false });
    state.pendingRemediations.set("A", {
      taskId: "A",
      gate: "Gate 1 Micro-Check",
      diffHash: "stale",
      reasons: ["stale"],
      nextActions: ["stale"],
      timestamp: 1,
    });
    state.consecutiveFailuresByTask.set("A", 2);
    state.lastFailureReasonByTask.set("A", "stale");
    const params = { op: "init", list: [{ phase: "P2", items: ["A"] }] };

    await fixture.handlers.tool_call[0](
      { tool: "todo", toolCallId: "replace-A", params },
      { cwd: process.cwd(), isHuman: true }
    );
    await fixture.handlers.tool_result[0](
      {
        tool: "todo",
        toolCallId: "replace-A",
        params,
        details: { op: "init", phases: [{ name: "P2", tasks: [{ content: "A", status: "pending" }] }] },
      },
      {}
    );

    expect(state.taskBaselines.has("A")).toBe(false);
    expect(state.pendingRemediations.has("A")).toBe(false);
    expect(state.consecutiveFailuresByTask.has("A")).toBe(false);
    expect(state.lastFailureReasonByTask.has("A")).toBe(false);
  });
});
