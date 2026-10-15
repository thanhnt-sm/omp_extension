import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import registerExtension from "../typesafe-planner";

const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
const schema = { optional: () => schema, min: () => schema };
const pi = {
  zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
  on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { (handlers[event] ??= []).push(handler); },
  registerTool() {},
  async sendMessage() {},
};

const cwd = mkdtempSync(path.join(tmpdir(), "todo-remediation-"));
try {
  const state = registerExtension(pi as never);
  state.phases = [{ name: "Smoke", tasks: [{ content: "native todo smoke", status: "in_progress" }] }];
  const params = { op: "drop", task: "native todo smoke" };
  await handlers.tool_call[0]({ tool: "todo", toolCallId: "smoke-drop", params }, { cwd, isHuman: true });
  assert.equal(state.activeContractedTasks.has("native todo smoke"), true, "tool_call must not claim progress");
  await handlers.tool_result[0]({
    tool: "todo",
    toolCallId: "smoke-drop",
    params,
    details: { op: "drop", phases: [{ name: "Smoke", tasks: [{ content: "native todo smoke", status: "abandoned" }] }] },
  }, { cwd });
  assert.equal(state.activeContractedTasks.has("native todo smoke"), false, "matching native result must commit");
  console.log("PASS native todo transaction smoke");
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
