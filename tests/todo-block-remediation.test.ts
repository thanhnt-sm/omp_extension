import { describe, expect, test } from "bun:test";
import registerExtension, { buildGateRejectionMessage } from "../typesafe-planner";

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

describe("P3 block and remediation transaction", () => {
  test("missing block target preserves canonical state and does not stage", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }] }];
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "block-none", params: { op: "block", reason: "waiting" } }, { cwd: process.cwd() });
    expect(state.stagedCalls.size).toBe(0);
    expect(state.phases[0].tasks[0].status).toBe("in_progress");
  });

  test("block result updates canonical state only after authoritative result", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }] }];
    const params = { op: "block", task: "A", reason: "waiting" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "block-A", params }, { cwd: process.cwd() });
    expect(state.phases[0].tasks[0].status).toBe("in_progress");
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "block-A", params, details: { op: "block", phases: [{ name: "P1", tasks: [{ content: "A", status: "blocked", blocker: "waiting" }] }] } }, {});
    expect(state.phases[0].tasks[0].status).toBe("blocked");
  });

  test("gate rejection guidance remains actionable", () => {
    const message = buildGateRejectionMessage({ gate: "Gate 1 Micro-Check", taskId: "A", reasons: ["Test suite failed with exit code 1"], testExitCode: 1 });
    expect(message).toContain("NEXT ACTIONS FOR AGENT:");
  });
});
