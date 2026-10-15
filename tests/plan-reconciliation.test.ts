import { describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";
import { synthesizePlanDelta } from "../src/remediation-generator";

function createPi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const messages: Array<{ customType?: string; content?: string }> = [];
  const schema = { optional: () => schema, min: () => schema };
  const pi = {
    zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
    on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { (handlers[event] ??= []).push(handler); },
    registerTool() {},
    async sendMessage(message: { customType?: string; content?: string }) { messages.push(message); },
  };
  return { pi, handlers, messages };
}

describe("P3 native todo transaction", () => {
  test("commits only a matching successful native result", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }] }];
    const params = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "drop-A", params }, { cwd: process.cwd(), isHuman: true });
    expect(state.activeContractedTasks.has("A")).toBe(true);
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "drop-A", params, details: { op: "drop", phases: [{ name: "P1", tasks: [{ content: "A", status: "abandoned" }] }] } }, {});
    expect(state.activeContractedTasks.has("A")).toBe(false);
    expect(state.phases[0].tasks[0].status).toBe("abandoned");
  });

  test("does not commit an error result or a result with revised input", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }] }];
    const params = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "drop-A", params }, { cwd: process.cwd(), isHuman: true });
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "drop-A", params, isError: true }, {});
    expect(state.phases[0].tasks[0].status).toBe("in_progress");
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "drop-B", params }, { cwd: process.cwd(), isHuman: true });
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "drop-B", params: { op: "drop", task: "other" }, details: { op: "drop", phases: [] } }, {});
    expect(state.phases[0].tasks[0].status).toBe("in_progress");
  });

  test("synthesizes reconciliation guidance independently of todo state", () => {
    expect(synthesizePlanDelta({ taskId: "A", reasons: ["missing"], nextActions: ["fix"] })).toContain("<plan_reconciliation>");
  });
});
