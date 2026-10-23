import { afterEach, describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";
import type { HostHistoryEntry } from "../src/host-history";
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
const initial: ProjectedNativePhase[] = [
  { name: "P1", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] },
  { name: "P2", tasks: [{ content: "C", status: "pending" }] },
];
const startedB: ProjectedNativePhase[] = [
  { name: "P1", tasks: [{ content: "A", status: "pending" }, { content: "B", status: "in_progress" }] },
  { name: "P2", tasks: [{ content: "C", status: "pending" }] },
];

function createHost(sessionId = "lifecycle-session", kind = "main", nativeAvailable = true) {
  const cwd = mkdtempSync(join(tmpdir(), "typesafe-lifecycle-gating-"));
  workspaces.push(cwd);
  const entries: HostHistoryEntry[] = [];
  const handlers = new Map<string, Hook[]>();
  const tools = new Map<string, RegisteredTool>();
  const messages: Array<Record<string, unknown>> = [];
  const schema = { optional: () => schema, min: () => schema };
  const nativeSchema = { type: "object", properties: { op: { type: "string" } } };
  const infos = new Map<string, AdvisorHostToolInfo>(nativeAvailable ? [["todo", { name: "todo", description: "Native todo", parameters: nativeSchema, sourceInfo: { source: "builtin", path: "<builtin:todo>" } }]] : []);
  const pending: RegisteredTool[] = [];
  let started = false;
  let sequence = 0;
  const append = (entry: Omit<HostHistoryEntry, "id" | "parentId">) => {
    entries.push({ ...structuredClone(entry), id: `${sessionId}-${++sequence}`, parentId: entries.at(-1)?.id ?? null });
  };
  const context = {
    cwd, agent: { kind, id: sessionId, name: sessionId },
    abort() { throw new Error("Unexpected parent abort"); },
    sessionManager: { getSessionId: () => sessionId, getSessionFile: () => `${sessionId}.jsonl`, getHeader: () => ({}), getBranch: () => entries },
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
    async sendMessage(message: Record<string, unknown>) { messages.push(message); },
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
  function result(id: string, op: string, phases: ProjectedNativePhase[], isError?: boolean) {
    append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: id, ...(isError === undefined ? {} : { isError }), details: { op, phases } } });
  }
  async function seed(rejected = false, empty = false) {
    append({ type: "message", message: { role: "user", content: "Implement A, B and C without discarding unresolved work." } });
    if (!empty) {
      call("init", { op: "init", list: [{ phase: "P1", items: ["A", "B"] }, { phase: "P2", items: ["C"] }] });
      result("init", "init", initial, false);
      if (rejected) { call("failed-done", { op: "done", task: "A" }); result("failed-done", "done", [], true); }
    }
    started = true;
    await emit("session_start");
  }
  async function prepare(input: Record<string, unknown>) {
    const tool = tools.get("typesafe_prepare_todo_mutation");
    if (!tool) throw new Error("Missing registered native mutation preparation tool");
    return object(object(await tool.execute("prepare", { input }, undefined, undefined, {
      ...context, hasUI: true, ui: { confirm: async () => true },
    })).details);
  }
  async function native(id: string, input: Record<string, unknown>, phases: ProjectedNativePhase[]) {
    expect(await emit("tool_call", { toolName: "todo", toolCallId: id, input })).toBeUndefined();
    const tool = tools.get("todo");
    if (!tool) throw new Error("Missing registered native todo wrapper");
    expect(tool.parameters).toBe(nativeSchema);
    let invocations = 0;
    const output = object(await tool.execute(id, input, undefined, undefined, { ...context, invokeTool: async (owned: unknown) => {
      invocations++;
      expect(owned).toEqual(input);
      return { content: [{ type: "text", text: "Static Core result" }], details: { op: input.op, phases: structuredClone(phases) } };
    } }));
    expect(output.isError).not.toBe(true);
    expect(invocations).toBe(1);
  }
  return { entries, context, state, messages, tools, emit, call, result, seed, prepare, native };
}

describe("native execution seam", () => {
  test("a supported hook is readiness only; staging belongs to the same-native execute wrapper", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "start", task: "B" };
    host.call("actual-start", input);
    expect(await host.emit("tool_call", { toolName: "todo", toolCallId: "actual-start", input })).toBeUndefined();
    expect(host.state.stagedCalls.size).toBe(0);
    await host.native("actual-start", input, startedB);
    expect(host.state.stagedCalls.has("actual-start")).toBe(true);
    expect(host.state.phases).toEqual(initial);
    host.result("actual-start", "start", startedB);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(startedB);
  });

  test("the native wrapper owns the exact input before asynchronous preflight", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "start", task: "B" };
    host.call("owned-input", input);
    expect(await host.emit("tool_call", { toolName: "todo", toolCallId: "owned-input", input })).toBeUndefined();
    const tool = host.tools.get("todo");
    if (!tool) throw new Error("Missing registered native todo wrapper");
    const delegated: unknown[] = [];
    const execution = tool.execute("owned-input", input, undefined, undefined, { ...host.context, invokeTool: async (owned: unknown) => {
      delegated.push(structuredClone(owned));
      return { content: [], details: { op: "start", phases: structuredClone(startedB) } };
    } });
    input.task = "C";
    expect(object(await execution).isError).not.toBe(true);
    expect(delegated).toEqual([{ op: "start", task: "B" }]);
    expect(host.state.stagedCalls.get("owned-input")?.input).toEqual({ op: "start", task: "B" });
    host.result("owned-input", "start", startedB);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(startedB);
  });

  test("an unsupported SDK cannot run an unguarded native mutation", async () => {
    const host = createHost("unsupported-sdk", "main", false);
    await host.seed();
    const input = { op: "start", task: "B" };
    host.call("unguarded-start", input);
    expect(object(await host.emit("tool_call", { toolName: "todo", toolCallId: "unguarded-start", input })).block).toBe(true);
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.phases).toEqual(initial);
  });
});

describe("factory-owned native lifecycle", () => {
  test("the same native task text remains isolated across main sessions and a subagent", async () => {
    const first = createHost("main-one");
    const second = createHost("main-two");
    const child = createHost("child", "sub");
    await first.seed(); await second.seed(); await child.seed();
    const input = { op: "start", task: "B" };
    first.call("start-B", input);
    expect(await first.native("start-B", input, startedB)).toBeUndefined();
    first.result("start-B", "start", startedB);
    await first.emit("message_end");
    expect(first.state.phases).toEqual(startedB);
    expect(second.state.phases).toEqual(initial);
    expect(child.state.phases).toEqual(initial);
    expect(second.state.stagedCalls.size).toBe(0);
    expect(child.state.stagedCalls.size).toBe(0);
  });

  for (const lifecycle of ["session_start", "session_switch", "session_branch", "session_tree"]) {
    test(`${lifecycle} invalidates a staged call and an old branch result cannot report success`, async () => {
      const host = createHost();
      await host.seed(true);
      const input = { op: "drop", task: "A", reason: "The human explicitly removed this obligation." };
      expect((await host.prepare(input)).status).toBe("PREPARED");
      const retainedBranch = structuredClone(host.entries);
      host.call("old-drop", input);
      const dropped: ProjectedNativePhase[] = [
        { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "in_progress" }] }, initial[1],
      ];
      expect(await host.native("old-drop", input, dropped)).toBeUndefined();
      const generation = host.state.generation;
      host.entries.splice(0, host.entries.length, ...retainedBranch);
      await host.emit(lifecycle);
      expect(host.state.stagedCalls.size).toBe(0);
      expect(host.state.generation).toBeGreaterThan(generation);
      await host.emit("tool_result", { toolName: "todo", toolCallId: "old-drop", input, details: { op: "drop", phases: [] }, isError: false });
      await host.emit("message_end");
      expect(host.state.phases).toEqual(initial);
      expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
      expect(host.messages.filter(message => message.customType === "typesafe-task-report")).toHaveLength(0);
    });
  }

  test("plan closure reads its own persisted native obligations and returns SDK blocking results", async () => {
    const first = createHost("open-plan");
    const second = createHost("empty-plan");
    await first.seed(); await second.seed(false, true);
    const event = { toolName: "write", toolCallId: "close-plan", input: { path: "plans/x/plan.md", content: "status: completed" } };
    expect(object(await first.emit("tool_call", event)).block).toBe(true);
    expect(object(await second.emit("tool_call", event)).block).toBe(true);
  });

  test("flat items initialization uses the native default phase and automatic first pointer", async () => {
    const host = createHost();
    await host.seed(false, true);
    const input = { op: "init", items: ["A", "B"] };
    host.call("flat-init", input);
    const phases: ProjectedNativePhase[] = [{ name: "Tasks", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }];
    expect(await host.native("flat-init", input, phases)).toBeUndefined();
    expect(host.state.phases).toEqual([]);
    host.result("flat-init", "init", phases);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(phases);
    expect(host.state.uninitialized).toBe(false);
  });

  for (const boundary of ["message_end", "turn_end", "agent_end", "before_agent_start", "tool_call"]) {
    test(`${boundary} reconciles only persisted settled results and does not poll`, async () => {
      const host = createHost();
      await host.seed();
      const input = { op: "start", task: "B" };
      host.call("start-B", input);
      expect(await host.native("start-B", input, startedB)).toBeUndefined();
      await host.emit("tool_result", { toolName: "todo", toolCallId: "start-B", input, details: { op: "start", phases: startedB } });
      expect(host.state.phases).toEqual(initial);
      expect(host.state.stagedCalls.has("start-B")).toBe(true);
      await host.emit("turn_end");
      expect(host.state.stagedCalls.has("start-B")).toBe(true);
      host.result("start-B", "start", startedB);
      await host.emit(boundary, boundary === "tool_call" ? { toolName: "read", toolCallId: "read", input: { path: "src/index.ts" } } : {});
      expect(host.state.phases).toEqual(startedB);
      expect(host.state.stagedCalls.size).toBe(0);
      expect(host.state.committedCallTombstones.has("start-B")).toBe(true);
    });
  }

  test("phase-local targets reject a settled result affecting a different unique task", async () => {
    const host = createHost();
    await host.seed(true);
    const input = { op: "drop", phase: "P1", reason: "The human removed phase P1." };
    expect((await host.prepare(input)).status).toBe("PREPARED");
    host.call("wrong-phase", input);
    const dropped: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "abandoned" }] },
      { name: "P2", tasks: [{ content: "C", status: "in_progress" }] },
    ];
    expect(await host.native("wrong-phase", input, dropped)).toBeUndefined();
    host.result("wrong-phase", "drop", [
      initial[0], { name: "P2", tasks: [{ content: "C", status: "abandoned" }] },
    ]);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(initial);
    expect(host.state.uninitialized).toBe(true);
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    expect(host.messages.filter(message => message.customType === "typesafe-task-report")).toHaveLength(0);
  });

  test("duplicate middleware observations cannot emit a second report or clear debt", async () => {
    const host = createHost();
    await host.seed(true);
    const input = { op: "drop", task: "A", reason: "Human-approved scope change." };
    expect((await host.prepare(input)).status).toBe("PREPARED");
    host.call("drop-A", input);
    const phases: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "in_progress" }] }, initial[1],
    ];
    expect(await host.native("drop-A", input, phases)).toBeUndefined();
    host.result("drop-A", "drop", phases, false);
    await host.emit("message_end");
    const observation = { toolName: "todo", toolCallId: "drop-A", input, details: { op: "drop", phases }, isError: false };
    await host.emit("tool_result", observation);
    await host.emit("tool_result", observation);
    await host.emit("turn_end");
    expect(host.state.phases).toEqual(phases);
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    expect(host.messages.filter(message => message.customType === "typesafe-task-report")).toHaveLength(1);
  });

  test("a reused call id is refused while the first stage is pending, and nothing is committed", async () => {
    const host = createHost();
    await host.seed(true);
    const input = { op: "drop", task: "A", reason: "Human-approved scope change." };
    expect((await host.prepare(input)).status).toBe("PREPARED");
    host.call("same", input);
    expect(await host.native("same", input, [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "in_progress" }] }, initial[1],
    ])).toBeUndefined();
    const tool = host.tools.get("todo");
    if (!tool) throw new Error("Missing registered native todo wrapper");
    let reached = 0;
    const second = object(await tool.execute("same", input, undefined, undefined, { ...host.context, invokeTool: async () => { reached++; return { content: [] }; } }));
    expect(second.isError).toBe(true);
    expect(JSON.stringify(second)).toContain("todo_call_id_duplicate");
    expect(reached).toBe(0);
    expect(host.state.phases).toEqual(initial);
  });

  test("a late persisted result cannot overwrite a newer native revision or clear its debt", async () => {
    const host = createHost();
    await host.seed(true);
    const input = { op: "drop", task: "A", reason: "The human removed the exact observed obligation." };
    expect((await host.prepare(input)).status).toBe("PREPARED");
    const dropped: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "in_progress" }] }, initial[1],
    ];
    host.call("late-drop-A", input);
    expect(await host.native("late-drop-A", input, dropped)).toBeUndefined();
    host.call("external-start-C", { op: "start", task: "C" });
    const startedC: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "pending" }, { content: "B", status: "pending" }] },
      { name: "P2", tasks: [{ content: "C", status: "in_progress" }] },
    ];
    host.result("external-start-C", "start", startedC);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(startedC);
    expect(host.state.stagedCalls.has("late-drop-A")).toBe(true);
    host.result("late-drop-A", "drop", dropped);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(startedC);
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.committedCallTombstones.has("late-drop-A")).toBe(false);
    expect(host.messages.filter(message => message.customType === "typesafe-task-report")).toHaveLength(0);
  });

  test("rm retains empty phase objects and promotes the first remaining pending task", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "rm", phase: "P1" };
    expect((await host.prepare(input)).status).toBe("PREPARED");
    host.call("rm-P1", input);
    const phases: ProjectedNativePhase[] = [
      { name: "P1", tasks: [] }, { name: "P2", tasks: [{ content: "C", status: "in_progress" }] },
    ];
    expect(await host.native("rm-P1", input, phases)).toBeUndefined();
    host.result("rm-P1", "rm", phases);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(phases);
    expect(host.state.uninitialized).toBe(false);
  });
});
