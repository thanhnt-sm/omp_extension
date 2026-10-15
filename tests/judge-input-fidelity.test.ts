import { describe, expect, test } from "bun:test";
import registerExtension, { collectConversationContext, formatTaskReport, sanitizeStateForTypeSafe, summarizeUnifiedDiff } from "../typesafe-planner";

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

describe("P3 judge input fidelity", () => {
  test("done stages an exact canonical target and only result advances checkpoint", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "abandoned" }] }];
    const params = { op: "done", phase: "P" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "done-p", params }, { cwd: process.cwd(), isHuman: true });
    expect(state.stagedCalls.get("done-p")?.verifiedTasks).toEqual(["A", "B"]);
    expect(state.lastCheckpoint).toBeUndefined();
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "done-p", params, details: { op: "done", phases: [{ name: "P", tasks: [{ content: "A", status: "completed" }, { content: "B", status: "completed" }] }], completedTasks: [{ content: "A" }, { content: "B" }] } }, {});
    expect(state.lastCheckpoint).toBeDefined();
    expect(state.activeContractedTasks.size).toBe(0);
  });

  test("malformed successful result refuses progress and forces rehydration", async () => {
    const fixture = createPi();
    const state = registerExtension(fixture.pi as never);
    state.phases = [{ name: "P", tasks: [{ content: "A", status: "in_progress" }] }];
    const params = { op: "drop", task: "A" };
    await fixture.handlers.tool_call[0]({ tool: "todo", toolCallId: "bad", params }, { cwd: process.cwd(), isHuman: true });
    await fixture.handlers.tool_result[0]({ tool: "todo", toolCallId: "bad", params, details: { op: "drop" } }, {});
    expect(state.uninitialized).toBe(true);
    expect(state.phases[0].tasks[0].status).toBe("in_progress");
  });

  test("state and report helpers preserve safe structured output", () => {
    const sanitized = sanitizeStateForTypeSafe({ test_summary: "x".repeat(4000) });
    expect(String(sanitized.test_summary)).toContain("[...");
    expect(summarizeUnifiedDiff("diff --git a/a.ts b/a.ts\n+const x = 1")).toContain("const x");
    expect(formatTaskReport({ kind: "DONE", tasks: ["A"], approved: true, decidedBy: "judge", reasons: [] })).toContain("DONE");
    expect(collectConversationContext({}).userRequest).toBe("");
  });
});
