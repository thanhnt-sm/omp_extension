import { describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";

function createPi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const schema = { optional: () => schema, min: () => schema };
  return {
    handlers,
    pi: {
      zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
      on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { (handlers[event] ??= []).push(handler); },
      registerTool() {},
      async sendMessage() {},
    },
  };
}

describe("P3 factory owned session lifecycle", () => {
  test("same task text is isolated across two main bindings and a subagent", async () => {
    const first = createPi();
    const second = createPi();
    const child = createPi();
    const firstState = registerExtension(first.pi as never);
    const secondState = registerExtension(second.pi as never);
    const childState = registerExtension(child.pi as never);
    firstState.phases = [{ name: "P", tasks: [{ content: "A", status: "in_progress" }] }];
    secondState.phases = [{ name: "P", tasks: [{ content: "A", status: "pending" }] }];
    childState.phases = [{ name: "P", tasks: [{ content: "A", status: "blocked" }] }];
    await child.handlers.session_start[0]({}, { agent: { kind: "sub" } });
    expect(firstState.activeContractedTasks.has("A")).toBe(true);
    expect(secondState.phases[0].tasks[0].status).toBe("pending");
    expect(childState.phases).toEqual([]);
  });

  test("branch lifecycle invalidates staged calls and canonical state rehydrates from native result", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P", tasks: [{ content: "A", status: "in_progress" }] }];
    const params = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "drop-A", params }, { cwd: process.cwd(), isHuman: true });
    expect(state.stagedCalls.size).toBe(1);
    await fixture.handlers.session_branch[0]({}, { sessionManager: { getBranch: () => [] } });
    expect(state.stagedCalls.size).toBe(0);
    expect(state.generation).toBeGreaterThan(0);
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "drop-A", params, details: { op: "drop", phases: [] } }, {});
    expect(state.phases).toEqual([]);
  });

  test("plan closure is bound to the explicit instance state", async () => {
    const first = createPi();
    const second = createPi();
    const firstState = registerExtension(first.pi as never);
    registerExtension(second.pi as never);
    firstState.phases = [{ name: "P", tasks: [{ content: "A", status: "pending" }] }];
    await expect(first.handlers.tool_call[0]({ tool: "write", params: { path: "plans/x/plan.md", content: "status: completed" } }, {})).rejects.toThrow("Plan closure rejected");
    await expect(second.handlers.tool_call[0]({ tool: "write", params: { path: "plans/x/plan.md", content: "status: completed" } }, {})).resolves.toBeUndefined();
  });
});
