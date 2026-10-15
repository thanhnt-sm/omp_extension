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
      registerTool() {}, async sendMessage() {},
    },
  };
}

describe("P3 native todo red-team cases", () => {
  test("rejects synthetic ops wrapper before state or network work", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P", tasks: [{ content: "A", status: "pending" }] }];
    await expect(fixture.handlers.tool_call[0]({ tool: "todo", params: { ops: [{ op: "done", task: "A" }] } }, { cwd: process.cwd() })).rejects.toThrow("todo_ops_unsupported");
    expect(state.stagedCalls.size).toBe(0);
  });

  test("a duplicate pending native call cannot self-authorize", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P", tasks: [{ content: "A", status: "pending" }] }];
    const params = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "same", params }, { cwd: process.cwd(), isHuman: true });
    await expect(fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "same", params }, { cwd: process.cwd(), isHuman: true })).rejects.toThrow("todo_call_id_duplicate");
    expect(state.phases[0].tasks[0].status).toBe("pending");
  });

  test("a stale post-branch result cannot mutate the replacement generation", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P", tasks: [{ content: "A", status: "pending" }] }];
    const params = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "stale", params }, { cwd: process.cwd(), isHuman: true });
    await fixture.handlers.session_branch[0]({}, { sessionManager: { getBranch: () => [] } });
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "stale", params, details: { op: "drop", phases: [] } }, {});
    expect(state.phases).toEqual([]);
  });
});
