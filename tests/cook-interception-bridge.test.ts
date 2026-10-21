import { describe, expect, test } from "bun:test";
import registerExtension, { type CanonicalTodoPhase } from "../typesafe-planner";
import type { HostHistoryEntry } from "../src/host-history";
import type { AdvisorHostToolInfo } from "../src/advisor-host-types";

type Host = Parameters<typeof registerExtension>[0];
type Handler = Parameters<Host["on"]>[1];
interface RegisteredTool {
  execute(id: string, params: unknown, signal?: AbortSignal, update?: unknown, context?: unknown): Promise<unknown>;
}

function bridge() {
  const handlers = new Map<string, Handler[]>();
  const entries: HostHistoryEntry[] = [];
  const messages: unknown[] = [];
  const tools: Record<string, RegisteredTool> = {};
  const active = ["todo", "task", "read", "grep", "glob"];
  const infos: AdvisorHostToolInfo[] = active.map(name => ({ name, description: `Native ${name}`,
    parameters: { type: "object" }, sourceInfo: { source: "builtin", path: `<builtin:${name}>` } }));
  const pendingTools: AdvisorHostToolInfo[] = [];
  const schema = { optional: () => schema, min: () => schema };
  let started = false;
  let nativeCalls = 0;
  function append(value: Omit<HostHistoryEntry, "id" | "parentId">) {
    const entry = { ...value, id: `bridge-${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null };
    entries.push(entry);
    return entry;
  }
  const host: Host & { events: object; appendEntry(customType: string, data: unknown): void;
    getAllTools(): AdvisorHostToolInfo[]; getActiveTools(): string[]; setActiveTools(names: string[]): Promise<void> } = {
    events: {},
    zod: {
      object: () => schema, union: () => schema, string: () => schema, number: () => schema,
      record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema,
    },
    on(name, handler) { handlers.set(name, [...handlers.get(name) ?? [], handler]); },
    registerTool(definition) {
      tools[definition.name] = definition as unknown as RegisteredTool;
      const source = definition as unknown as { sourcePath?: string };
      const info = { name: definition.name, description: definition.description, parameters: definition.parameters,
        sourceInfo: { source: "extension", path: source.sourcePath ?? "" } };
      if (started) pendingTools.push(info); else infos.push(info);
    },
    async sendMessage(message) { messages.push(message); },
    appendEntry(customType, data) { append({ type: "custom", customType, data: structuredClone(data) }); },
    getAllTools() { if (!started) throw new Error("SDK tools unavailable during load"); return [...infos]; },
    getActiveTools: () => [...active],
    async setActiveTools(names) {
      for (const info of pendingTools) {
        const index = infos.findIndex(value => value.name === info.name);
        if (index < 0) infos.push(info); else infos[index] = info;
      }
      pendingTools.length = 0;
      active.splice(0, active.length, ...names);
    },
  };
  const state = registerExtension(host, { env: { TYPESAFE_API_KEY: "" } });
  function call(id: string, input: Record<string, unknown>) {
    append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "todo", arguments: structuredClone(input) }] } });
  }
  function result(id: string, op: string, phases: CanonicalTodoPhase[]) {
    return append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: id,
      details: { op, phases: structuredClone(phases) } } });
  }
  const manager = { getSessionId: () => "bridge-session", getBranch: () => entries,
    getEntry: (id: string) => entries.find(entry => entry.id === id),
    getSessionFile: () => "bridge-session.jsonl", getHeader: () => ({}) };
  const context = { cwd: process.cwd(), sessionManager: manager, agent: { kind: "main", id: "Main", name: "Main" },
    abort() { throw new Error("Unexpected parent abort"); } };
  async function emit(name: string, event: unknown = {}) {
    const values: unknown[] = [];
    const registered = handlers.get(name);
    expect(registered?.length).toBeGreaterThan(0);
    for (const handler of registered ?? []) values.push(await handler(event, context));
    return values.find(value => value !== undefined);
  }
  async function initialize() {
    append({ type: "message", message: { role: "user", content: "Implement both parser obligations and preserve their verification criteria." } });
    call("seed", { op: "init", list: [{ phase: "Parser", items: ["Parse valid input", "Reject malformed input"] }] });
    result("seed", "init", INITIAL);
    started = true;
    await emit("session_start");
  }
  async function executeTodo(id: string, input: Record<string, unknown>, phases: CanonicalTodoPhase[] = STARTED) {
    expect(tools.todo).toBeDefined();
    return tools.todo!.execute(id, input, undefined, undefined, { ...context,
      async invokeTool(actual: unknown) {
        nativeCalls++;
        expect(actual).toEqual(input);
        return { content: [], details: { op: input.op, phases: structuredClone(phases) } };
      },
    });
  }
  return { state, entries, messages, call, result, emit, initialize, executeTodo, nativeCalls: () => nativeCalls };
}

// Independent SDK effects, not generated by the production transition validator.
const INITIAL: CanonicalTodoPhase[] = [{ name: "Parser", tasks: [
  { content: "Parse valid input", status: "in_progress" },
  { content: "Reject malformed input", status: "pending" },
] }];
const STARTED: CanonicalTodoPhase[] = [{ name: "Parser", tasks: [
  { content: "Parse valid input", status: "pending" },
  { content: "Reject malformed input", status: "in_progress" },
] }];

function expectBlocked(value: unknown) {
  expect(value).toMatchObject({ block: true, reason: expect.any(String) });
  if (!value || typeof value !== "object" || !("reason" in value)) throw new Error("Missing SDK block reason");
  expect(String(value.reason).length).toBeGreaterThan(0);
}

describe("OMP interception bridge SDK return contract", () => {
  test("write and edit return blocks for native todo storage without invoking legacy cancellation", async () => {
    const fixture = bridge();
    let cancellationCalls = 0;
    for (const [toolName, file] of [["write", "todo.json"], ["edit", "nested/.todo.json"], ["write", "C:\\workspace\\todo.json"]]) {
      const outcome = await fixture.emit("tool_call", { toolName, input: { path: file, content: "{}" }, cancel() { cancellationCalls++; } });
      expectBlocked(outcome);
    }
    expect(cancellationCalls).toBe(0);
    expect(fixture.state.stagedCalls.size).toBe(0);
  });

  test("ordinary writes and native view pass without changing lifecycle state", async () => {
    const fixture = bridge();
    await fixture.initialize();
    expect(await fixture.emit("tool_call", { toolName: "write", input: { path: "src/parser.ts", content: "export const parse = JSON.parse;" } })).toBeUndefined();
    expect(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "view", input: { op: "view" } })).toBeUndefined();
    expect(fixture.state.phases).toEqual(INITIAL);
    expect(fixture.state.stagedCalls.size).toBe(0);
  });

  test("native done without a sealed review blocks before running verification or changing todo", async () => {
    const fixture = bridge();
    await fixture.initialize();
    const input = { op: "done", task: "Parse valid input" };
    fixture.call("unreviewed", input);
    expect(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "unreviewed", input })).toBeUndefined();
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(await fixture.executeTodo("unreviewed", input)).toMatchObject({ isError: true });
    expect(fixture.nativeCalls()).toBe(0);
    expect(fixture.state.phases).toEqual(INITIAL);
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.committedCallTombstones.size).toBe(0);
  });

  test("native completion rejects extension-only execution and requirements fields", async () => {
    const fixture = bridge();
    await fixture.initialize();
    for (const metadata of [{ testCommand: "not-an-approved-command" }, { requirements: ["Agent supplied replacement criterion"] }, { ops: [{ op: "done", task: "Reject malformed input" }] }]) {
      expectBlocked(await fixture.emit("tool_call", { toolName: "todo", toolCallId: `invalid-${Object.keys(metadata)[0]}`,
        input: { op: "done", task: "Parse valid input", ...metadata } }));
    }
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.phases).toEqual(INITIAL);
  });

  test("native start waits for the persisted matching Core result, not middleware observation", async () => {
    const fixture = bridge();
    await fixture.initialize();
    const input = { op: "start", task: "Reject malformed input" };
    fixture.call("start-second", input);
    expect(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "start-second", input })).toBeUndefined();
    expect(fixture.state.stagedCalls.size).toBe(0);
    await fixture.executeTodo("start-second", input);
    expect(fixture.nativeCalls()).toBe(1);
    expect(fixture.state.stagedCalls.has("start-second")).toBe(true);
    await fixture.emit("tool_result", { toolName: "todo", toolCallId: "start-second", isError: false, details: { op: "start", phases: STARTED } });
    expect(fixture.state.phases).toEqual(INITIAL);
    expect(fixture.state.stagedCalls.has("start-second")).toBe(true);
    fixture.result("start-second", "start", STARTED);
    await fixture.emit("message_end");
    expect(fixture.state.phases).toEqual(STARTED);
    expect(fixture.state.stagedCalls.has("start-second")).toBe(false);
    expect(fixture.state.committedCallTombstones.has("start-second")).toBe(true);
  });

  test("an observed but not yet persisted Core result survives an ordinary turn boundary", async () => {
    const fixture = bridge();
    await fixture.initialize();
    const input = { op: "start", task: "Reject malformed input" };
    fixture.call("delayed-result", input);
    expect(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "delayed-result", input })).toBeUndefined();
    expect(fixture.state.stagedCalls.size).toBe(0);
    await fixture.executeTodo("delayed-result", input);
    expect(fixture.nativeCalls()).toBe(1);
    await fixture.emit("tool_result", { toolName: "todo", toolCallId: "delayed-result", details: { op: "start", phases: STARTED } });
    await fixture.emit("turn_end");
    expect(fixture.state.stagedCalls.has("delayed-result")).toBe(true);
    expect(fixture.state.phases).toEqual(INITIAL);
    fixture.result("delayed-result", "start", STARTED);
    await fixture.emit("before_agent_start");
    expect(fixture.state.phases).toEqual(STARTED);
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.committedCallTombstones.has("delayed-result")).toBe(true);
  });

  test("closing a plan is blocked while a native obligation remains active", async () => {
    const fixture = bridge();
    await fixture.initialize();
    expectBlocked(await fixture.emit("tool_call", { toolName: "write", input: { path: "plans/parser/plan.md", content: "---\nstatus: completed\n---" } }));
    expect(fixture.state.phases).toEqual(INITIAL);
  });
});
