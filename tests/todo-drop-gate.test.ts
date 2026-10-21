import { afterEach, describe, expect, test } from "bun:test";
import registerExtension from "../typesafe-planner";
import type { HostHistoryEntry } from "../src/host-history";
import { LIFECYCLE_RECOVERY_ENTRY } from "../src/todo-lifecycle-authority";
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

function createHost() {
  const cwd = mkdtempSync(join(tmpdir(), "todo-drop-gate-"));
  workspaces.push(cwd);
  const entries: HostHistoryEntry[] = [];
  const handlers = new Map<string, Hook[]>();
  const tools = new Map<string, RegisteredTool>();
  const messages: Array<Record<string, unknown>> = [];
  const schema = { optional: () => schema, min: () => schema };
  const nativeSchema = { type: "object", properties: { op: { type: "string" } } };
  const infos = new Map<string, AdvisorHostToolInfo>([["todo", { name: "todo", description: "Native todo", parameters: nativeSchema, sourceInfo: { source: "builtin", path: "<builtin:todo>" } }]]);
  const pending: RegisteredTool[] = [];
  let started = false;
  let sequence = 0;
  const append = (entry: Omit<HostHistoryEntry, "id" | "parentId">) => {
    entries.push({ ...structuredClone(entry), id: `drop-${++sequence}`, parentId: entries.at(-1)?.id ?? null });
  };
  const context = {
    cwd, agent: { kind: "main", id: "Main", name: "Main" },
    abort() { throw new Error("Unexpected parent abort"); },
    sessionManager: { getSessionId: () => "drop-session", getSessionFile: () => "drop-session.jsonl", getHeader: () => ({}), getBranch: () => entries },
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
  function result(id: string, op: string, phases: ProjectedNativePhase[], isError = false) {
    append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: id, isError, details: { op, phases } } });
  }
  async function seed(rejected = false) {
    append({ type: "message", message: { role: "user", content: "Implement A, B and C; any descope needs my exact confirmation." } });
    call("init", { op: "init", list: [{ phase: "P1", items: ["A", "B"] }, { phase: "P2", items: ["C"] }] });
    result("init", "init", initial);
    if (rejected) { call("failed-done", { op: "done", task: "A" }); result("failed-done", "done", [], true); }
    started = true;
    await emit("session_start");
  }
  async function prepare(input: Record<string, unknown>, ctx: unknown = context) {
    const tool = tools.get("typesafe_prepare_todo_mutation");
    if (!tool) throw new Error("Missing registered native mutation preparation tool");
    return object(object(await tool.execute("prepare", { input }, undefined, undefined, ctx)).details);
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
    if (id) expect(await emit("tool_call", { toolName: "todo", toolCallId: id, input }, ctx)).toBeUndefined();
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
  async function execute(id: string, input: Record<string, unknown>, phases: ProjectedNativePhase[]) {
    call(id, input);
    await native(id, input, phases);
    result(id, String(input.op), phases);
    await emit("message_end");
    expect(state.phases).toEqual(phases);
  }
  return { entries, context, state, messages, emit, call, result, seed, prepare, execute, native, reject };
}

describe("registered native descope authorization", () => {
  test("phase drop prepares the exact target set outside preflight and commits only persisted Core effects", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "drop", phase: "P1", reason: "The user removed phase P1 from the requested scope." };
    const confirmations: Record<string, unknown>[] = [];
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async (_title: string, text: string) => { confirmations.push(object(JSON.parse(text))); return true; } } };
    expect((await host.prepare(input, ctx)).status).toBe("PREPARED");
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].targets).toEqual([
      { phase: "P1", phaseOrdinal: 0, content: "A", ordinal: 0 },
      { phase: "P1", phaseOrdinal: 0, content: "B", ordinal: 1 },
    ]);
    host.call("drop-P1", input);
    const phases: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "abandoned" }] },
      { name: "P2", tasks: [{ content: "C", status: "in_progress" }] },
    ];
    expect(await host.native("drop-P1", input, phases, ctx)).toBeUndefined();
    expect(confirmations).toHaveLength(1);
    expect(host.state.stagedCalls.get("drop-P1")?.affectedTasks).toEqual(["A", "B"]);
    expect(host.state.phases).toEqual(initial);
    await host.emit("tool_result", { toolName: "todo", toolCallId: "drop-P1", input, isError: false, details: { op: "drop", phases } });
    expect(host.state.phases).toEqual(initial);
    expect(host.state.stagedCalls.has("drop-P1")).toBe(true);
    host.result("drop-P1", "drop", phases);
    await host.emit("agent_end");
    expect(host.state.phases).toEqual(phases);
    expect(host.state.activeContractedTasks.has("C")).toBe(true);
    expect(host.state.activeContractedTasks.has("A")).toBe(false);
  });

  test("native preflight never prompts or accepts context authorization claims", async () => {
    const host = createHost();
    await host.seed();
    let confirmations = 0;
    const input = { op: "drop", task: "A", reason: "An agent proposed removing A." };
    host.call("unprepared-drop", input);
    await host.reject("unprepared-drop", input, {
      ...host.context, isHuman: true, authorized: true, hasUI: true,
      ui: { confirm: async () => { confirmations++; return true; } },
    });
    expect(confirmations).toBe(0);
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.phases).toEqual(initial);
  });

  for (const confirmation of ["absent", "declined", "unavailable"] as const) {
    test(`${confirmation} host confirmation cannot prepare a descope`, async () => {
      const host = createHost();
      await host.seed();
      const input = { op: "drop", task: "A", reason: "A proposed scope reduction." };
      const ctx = confirmation === "absent" ? host.context : {
        ...host.context, hasUI: true, ui: { confirm: async () => {
          if (confirmation === "unavailable") throw new Error("Host UI unavailable");
          return false;
        } },
      };
      expect((await host.prepare(input, ctx)).status).toBe("HUMAN_REQUIRED");
      host.call("denied-drop", input);
      await host.reject("denied-drop", input);
      expect(host.state.stagedCalls.size).toBe(0);
      expect(host.entries.filter(entry => entry.customType === LIFECYCLE_RECOVERY_ENTRY)).toHaveLength(0);
    });
  }

  test("a grant is exact-input and single-use, not transferable to another task", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "drop", task: "A", reason: "The human removed A." };
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async () => true } };
    expect((await host.prepare(input, ctx)).status).toBe("PREPARED");
    const changed = { ...input, task: "B" };
    host.call("wrong-target", changed);
    await host.reject("wrong-target", changed);
    const phases: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "in_progress" }] }, initial[1],
    ];
    await host.execute("drop-A", input, phases);
    host.call("repeat-drop", input);
    await host.reject("repeat-drop", input);
    expect(host.state.stagedCalls.size).toBe(0);
  });

  test("native targets changed during confirmation require new exact preparation", async () => {
    const host = createHost();
    await host.seed();
    const input = { op: "drop", phase: "P1", reason: "The human removed the observed phase." };
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async () => {
      host.call("external-append", { op: "append", phase: "P1", items: ["D"] });
      host.result("external-append", "append", [
        { name: "P1", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }, { content: "D", status: "pending" }] }, initial[1],
      ]);
      return true;
    } } };
    expect((await host.prepare(input, ctx)).status).toBe("EVIDENCE_REQUIRED");
    host.call("stale-drop", input);
    await host.reject("stale-drop", input);
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.phases[0].tasks.map(task => task.content)).toEqual(["A", "B", "D"]);
  });

  test("replacing init requires exact preparation and cannot semantically release incarnation debt", async () => {
    const host = createHost();
    await host.seed(true);
    const debt = [...host.state.debtByIncarnation.keys()];
    expect(debt.length).toBeGreaterThan(0);
    const input = { op: "init", list: [{ phase: "Replacement", items: ["A"] }] };
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async () => true } };
    expect((await host.prepare(input, ctx)).status).toBe("PREPARED");
    host.call("replace", input);
    expect(host.state.phases).toEqual(initial);
    const phases: ProjectedNativePhase[] = [{ name: "Replacement", tasks: [{ content: "A", status: "in_progress" }] }];
    expect(await host.native("replace", input, phases)).toBeUndefined();
    host.result("replace", "init", phases);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(phases);
    for (const incarnation of debt) expect(host.state.debtByIncarnation.has(incarnation)).toBe(true);
    const report = object(JSON.parse(String(object(host.entries.findLast(entry => entry.customType === LIFECYCLE_RECOVERY_ENTRY)?.data).report)));
    expect(report.completionClaimed).toBe(false);
    expect(report.debtReleased).toBe(false);
    const drop = { op: "drop", task: "A", reason: "The old confirmation does not cover the new incarnation." };
    host.call("redrop-A", drop);
    await host.reject("redrop-A", drop);
  });

  test("rm and reappend retain removed-incarnation debt without granting the new task semantic approval", async () => {
    const host = createHost();
    await host.seed(true);
    const debt = [...host.state.debtByIncarnation.keys()];
    expect(debt.length).toBeGreaterThan(0);
    const input = { op: "rm", task: "A" };
    const ctx = { ...host.context, hasUI: true, ui: { confirm: async () => true } };
    expect((await host.prepare(input, ctx)).status).toBe("PREPARED");
    await host.execute("rm-A", input, [
      { name: "P1", tasks: [{ content: "B", status: "in_progress" }] }, initial[1],
    ]);
    await host.execute("append-A", { op: "append", phase: "P1", items: ["A"] }, [
      { name: "P1", tasks: [{ content: "B", status: "in_progress" }, { content: "A", status: "pending" }] }, initial[1],
    ]);
    for (const incarnation of debt) expect(host.state.debtByIncarnation.has(incarnation)).toBe(true);
    const done = { op: "done", task: "A" };
    host.call("unreviewed-new-A", done);
    await host.reject("unreviewed-new-A", done);
    expect(host.state.stagedCalls.size).toBe(0);
  });

  test("synthetic native operations and legacy completion payloads return blocks before staging", async () => {
    const host = createHost();
    await host.seed();
    const inputs: Array<Record<string, unknown>> = [
      { ops: [{ op: "drop", task: "A" }] },
      { op: "done", task: "A", testCommand: "bun test" },
      { op: "done", task: "A", requirements: ["Claimed semantic proof"] },
    ];
    for (const [index, input] of inputs.entries()) {
      const id = `invalid-${index}`;
      host.call(id, input);
      expect(object(await host.emit("tool_call", { toolName: "todo", toolCallId: id, input })).block).toBe(true);
    }
    await host.reject("", { op: "start", task: "A" });
    expect(host.state.stagedCalls.size).toBe(0);
    expect(host.state.phases).toEqual(initial);
  });

  test("a settled forged recovery result does not report success or forgive rejected debt", async () => {
    const host = createHost();
    await host.seed(true);
    const input = { op: "drop", task: "A", reason: "The human removed A." };
    expect((await host.prepare(input, { ...host.context, hasUI: true, ui: { confirm: async () => true } })).status).toBe("PREPARED");
    host.call("forged-drop", input);
    const dropped: ProjectedNativePhase[] = [
      { name: "P1", tasks: [{ content: "A", status: "abandoned" }, { content: "B", status: "in_progress" }] }, initial[1],
    ];
    expect(await host.native("forged-drop", input, dropped)).toBeUndefined();
    host.result("forged-drop", "drop", initial);
    await host.emit("message_end");
    expect(host.state.phases).toEqual(initial);
    expect(host.state.uninitialized).toBe(true);
    expect(host.state.lastFailureReasonByTask.has("A")).toBe(true);
    expect(host.messages.filter(message => message.customType === "typesafe-task-report")).toHaveLength(0);
  });
});
