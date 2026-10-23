import { afterEach, describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";
import type { HostHistoryEntry } from "../src/host-history";
import { LIFECYCLE_RECOVERY_ENTRY, type RecoveryHandoff } from "../src/todo-lifecycle-authority";
import type { ProjectedNativePhase } from "../src/types/verification";
import type { AdvisorHostToolInfo } from "../src/advisor-host-types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaces: string[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

type Hook = (event: unknown, context: unknown) => unknown | Promise<unknown>;
interface RegisteredTool {
  name: string;
  description: string;
  parameters: unknown;
  sourcePath?: string;
  execute(id: string, input: unknown, signal: AbortSignal | undefined, update: undefined, context: unknown): Promise<unknown>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected host result object");
  return value as Record<string, unknown>;
}

function createHost() {
  const cwd = mkdtempSync(join(tmpdir(), "todo-block-remediation-"));
  workspaces.push(cwd);
  const entries: HostHistoryEntry[] = [];
  const handlers = new Map<string, Hook[]>();
  const tools = new Map<string, RegisteredTool>();
  const schema = { optional: () => schema, min: () => schema };
  const nativeSchema = { type: "object", properties: { op: { type: "string" } } };
  const infos = new Map<string, AdvisorHostToolInfo>([["todo", { name: "todo", description: "Native todo", parameters: nativeSchema, sourceInfo: { source: "builtin", path: "<builtin:todo>" } }]]);
  const pending: RegisteredTool[] = [];
  let started = false;
  let sequence = 0;
  const append = (entry: Omit<HostHistoryEntry, "id" | "parentId">) => {
    entries.push({ ...structuredClone(entry), id: `entry-${++sequence}`, parentId: entries.at(-1)?.id ?? null });
  };
  const context = {
    cwd, agent: { kind: "main", id: "Main", name: "Main" },
    abort() { throw new Error("Unexpected parent abort"); },
    sessionManager: { getSessionId: () => "block-session", getSessionFile: () => "block-session.jsonl", getHeader: () => ({}), getBranch: () => entries },
  };
  const pi = {
    events: {},
    zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, boolean: () => schema, literal: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
    on(name: string, handler: Hook) { handlers.set(name, [...handlers.get(name) ?? [], handler]); },
    registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); if (started) pending.push(tool); },
    getAllTools() { if (!started) throw new Error("SDK tools unavailable during load"); return [...infos.values()]; },
    getActiveTools: () => ["todo"],
    async setActiveTools(names: string[]) {
      expect(names).toEqual(["todo"]);
      for (const tool of pending.splice(0)) infos.set(tool.name, { name: tool.name, description: tool.description, parameters: tool.parameters, sourceInfo: { source: "extension", path: tool.sourcePath ?? "" } });
    },
    appendEntry(customType: string, data: unknown) { append({ type: "custom", customType, data }); },
    async sendMessage() {},
  };
  const state = registerExtension(pi as never, { env: { TYPESAFE_API_KEY: "" } });
  async function emit(name: string, event: unknown = {}, ctx: unknown = context) {
    let result: unknown;
    for (const handler of handlers.get(name) ?? []) {
      const next = await handler(event, ctx);
      if (next !== undefined) result = next;
    }
    return result;
  }
  function call(id: string, input: Record<string, unknown>) {
    append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "todo", arguments: input }] } });
  }
  function result(id: string, op: string, phases: ProjectedNativePhase[], isError = false) {
    append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: id, isError, details: { op, phases } } });
  }
  async function seed(rejected = false) {
    append({ type: "message", message: { role: "user", content: "Implement A and B; preserve unfinished work and rejection debt." } });
    call("init", { op: "init", list: [{ phase: "P1", items: ["A", "B"] }] });
    result("init", "init", [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }]);
    if (rejected) {
      call("failed-done", { op: "done", task: "A" });
      result("failed-done", "done", [], true);
    }
    started = true;
    await emit("session_start");
  }
  async function prepare(input: Record<string, unknown>, handoff?: RecoveryHandoff, ctx: unknown = context) {
    const tool = tools.get("typesafe_prepare_todo_mutation");
    if (!tool) throw new Error("Missing registered native mutation preparation tool");
    return object(object(await tool.execute("prepare", { input, handoff }, undefined, undefined, ctx)).details);
  }
  async function native(id: string, input: Record<string, unknown>, phases: ProjectedNativePhase[], ctx: unknown = context) {
    expect(await emit("tool_call", { toolName: "todo", toolCallId: id, input }, ctx)).toBeUndefined();
    const tool = tools.get("todo");
    if (!tool) throw new Error("Missing registered native todo wrapper");
    expect(tool.parameters).toBe(nativeSchema);
    let invocations = 0;
    const output = object(await tool.execute(id, input, undefined, undefined, { ...object(ctx), invokeTool: async (owned: unknown) => {
      invocations++;
      expect(owned).toEqual(input);
      return { content: [{ type: "text", text: "Static Core result" }], details: { op: input.op, phases: structuredClone(phases) } };
    } }));
    expect(output.isError).not.toBe(true);
    expect(invocations).toBe(1);
  }
  async function reject(id: string, input: Record<string, unknown>, ctx: unknown = context) {
    expect(await emit("tool_call", { toolName: "todo", toolCallId: id, input }, ctx)).toBeUndefined();
    const tool = tools.get("todo");
    if (!tool) throw new Error("Missing registered native todo wrapper");
    expect(tool.parameters).toBe(nativeSchema);
    let invocations = 0;
    const output = object(await tool.execute(id, input, undefined, undefined, { ...object(ctx), invokeTool: async () => {
      invocations++; throw new Error("Rejected mutation reached Core");
    } }));
    expect(output.isError).toBe(true);
    expect(invocations).toBe(0);
  }
  return { entries, context, state, tools, emit, call, result, seed, prepare, native, reject };
}

const handoff: RecoveryHandoff = {
  owner: "repository maintainer", nextAction: "Restore the missing dependency and rerun the contracted review.",
  unblockCondition: "The dependency is available and the exact task can resume.", resumeCommand: "todo unblock task=A",
};

describe("registered native block recovery", () => {
  test("a missing-target Core error never changes canonical state or leaves a committed stage", async () => {
    const host = createHost();
    await host.seed();
    const before = structuredClone(host.state.phases);
    const input = { op: "block", task: "missing", reason: "Dependency unavailable" };
    host.call("missing-target", input);
    expect(await host.emit("tool_call", { toolName: "todo", toolCallId: "missing-target", input })).toBeUndefined();
    const tool = host.tools.get("todo");
    if (!tool) throw new Error("Missing registered native todo wrapper");
    let invocations = 0;
    const output = object(await tool.execute("missing-target", input, undefined, undefined, { ...host.context, invokeTool: async () => {
      invocations++;
      return { isError: true, content: [{ type: "text", text: "Native target not found" }] };
    } }));
    expect(output.isError).toBe(true);
    expect(invocations).toBe(1);
    host.result("missing-target", "block", [], true);
    await host.emit("message_end");
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.phases).toEqual(before);
    expect(host.state.committedCallTombstones.has("missing-target")).toBe(false);
  });

  test("block preparation persists the recovery handoff and only a settled result commits", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "block", task: "A", reason: "Dependency unavailable" };
    expect((await host.prepare(input)).status).toBe("EVIDENCE_REQUIRED");
    expect((await host.prepare(input, handoff, { ...host.context, hasUI: true, ui: { confirm: async () => true } })).status).toBe("PREPARED");
    const recovery = host.entries.findLast(entry => entry.customType === LIFECYCLE_RECOVERY_ENTRY);
    const report = object(JSON.parse(String(object(recovery?.data).report)));
    expect(report.handoff).toEqual(handoff);
    expect(report.completionClaimed).toBe(false);
    expect(report.debtReleased).toBe(false);
    host.call("block-A", input);
    const phases: ProjectedNativePhase[] = [{ name: "P1", tasks: [{ content: "A", status: "blocked", blocker: input.reason }, { content: "B", status: "in_progress" }] }];
    expect(await host.native("block-A", input, phases)).toBeUndefined();
    await host.emit("tool_result", { toolName: "todo", toolCallId: "block-A", input, isError: false, details: { op: "block", phases } });
    expect(host.state.phases[0].tasks[0].status).toBe("in_progress");
    expect(host.state.stagedCalls.has("block-A")).toBe(true);
    host.result("block-A", "block", phases);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(phases);
    expect(host.state.stagedCalls.size).toBe(0);
  });

  test("rejected-task block requires genuine exact confirmation outside native preflight and retains debt", async () => {
    const host = createHost();
    await host.seed(true);
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    const input = { op: "block", task: "A", reason: "Dependency unavailable" };
    expect((await host.prepare(input, handoff)).status).toBe("HUMAN_REQUIRED");
    expect((await host.prepare(input, handoff, { ...host.context, hasUI: true, ui: { confirm: async () => false } })).status).toBe("HUMAN_REQUIRED");
    const confirmations: unknown[] = [];
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async (_title: string, message: string) => { confirmations.push(JSON.parse(message)); return true; } } };
    expect((await host.prepare(input, handoff, ctx)).status).toBe("PREPARED");
    expect(confirmations).toHaveLength(1);
    expect(object(confirmations[0]).targets).toEqual([{ phase: "P1", phaseOrdinal: 0, content: "A", ordinal: 0 }]);
    host.call("block-rejected", input);
    const phases: ProjectedNativePhase[] = [{ name: "P1", tasks: [{ content: "A", status: "blocked", blocker: input.reason }, { content: "B", status: "in_progress" }] }];
    expect(await host.native("block-rejected", input, phases, ctx)).toBeUndefined();
    expect(confirmations).toHaveLength(1);
    host.result("block-rejected", "block", phases);
    await host.emit("turn_end");
    expect(host.state.phases[0].tasks[0].status).toBe("blocked");
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    expect(host.state.activeContractedTasks.has("A")).toBe(true);
  });

  test("unblock, start, and view cannot forgive rejected-task debt or manufacture a completion receipt", async () => {
    const host = createHost();
    await host.seed(true);
    const block = { op: "block", task: "A", reason: "Dependency unavailable" };
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async () => true } };
    expect((await host.prepare(block, handoff, ctx)).status).toBe("PREPARED");
    host.call("block", block);
    const blocked: ProjectedNativePhase[] = [{ name: "P1", tasks: [{ content: "A", status: "blocked", blocker: block.reason }, { content: "B", status: "in_progress" }] }];
    await host.native("block", block, blocked);
    host.result("block", "block", blocked);
    await host.emit("message_end");
    const transitions: Array<{ op: string; phases: ProjectedNativePhase[] }> = [
      { op: "unblock", phases: [{ name: "P1", tasks: [{ content: "A", status: "pending" }, { content: "B", status: "in_progress" }] }] },
      { op: "start", phases: [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }] },
      { op: "view", phases: [{ name: "P1", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }] },
    ];
    for (const { op, phases } of transitions) {
      const input = op === "view" ? { op } : { op, task: "A" };
      host.call(op, input);
      expect(await host.native(op, input, phases)).toBeUndefined();
      host.result(op, op, phases);
      await host.emit("message_end");
      expect(host.state.phases).toEqual(phases);
      expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    }
    const done = { op: "done", task: "A" };
    host.call("unreviewed-done", done);
    await host.reject("unreviewed-done", done);
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
  });
});
