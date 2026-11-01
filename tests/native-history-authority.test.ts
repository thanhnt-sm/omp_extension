import { describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import registerExtension, {
  type CanonicalTodoPhase,
  type PendingRemediation,
  type PlannerSessionState,
} from "../typesafe-planner";

type Host = Parameters<typeof registerExtension>[0];
type Handler = Parameters<Host["on"]>[1];
type NativeInput = Record<string, unknown> & { op: string };
interface HistoryEntry {
  type: "message" | "custom";
  id: string;
  parentId: string | null;
  message?: {
    role: "user" | "assistant" | "toolResult";
    content?: string | Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }>;
    toolName?: string;
    toolCallId?: string;
    isError?: unknown;
    details?: { op: string; phases: CanonicalTodoPhase[]; completedTasks?: Array<{ phase: string; content: string }> };
  };
  customType?: string;
  data?: unknown;
}

interface FixtureToolInfo {
  name: string;
  description: string;
  parameters: unknown;
  sourceInfo: { source: string; path: string };
}

function copyPhases(phases: CanonicalTodoPhase[]): CanonicalTodoPhase[] {
  return phases.map((phase) => ({ name: phase.name, tasks: phase.tasks.map((task) => ({ ...task })) }));
}

class HostHistory {
  entries: HistoryEntry[] = [];
  private sequence = 0;

  append(value: Omit<HistoryEntry, "id" | "parentId">): HistoryEntry {
    const entry = { ...value, id: `entry-${++this.sequence}`, parentId: this.entries.at(-1)?.id ?? null };
    this.entries.push(entry);
    return entry;
  }

  user(content: string): void {
    this.append({ type: "message", message: { role: "user", content } });
  }

  call(callId: string, input: Record<string, unknown>, toolName = "todo"): void {
    this.append({ type: "message", message: {
      role: "assistant", content: [{ type: "toolCall", id: callId, name: toolName, arguments: structuredClone(input) }],
    } });
  }

  result(callId: string, input: NativeInput, phases: CanonicalTodoPhase[], isError = false): HistoryEntry {
    return this.append({ type: "message", message: {
      role: "toolResult", toolName: "todo", toolCallId: callId, isError,
      details: {
        op: input.op,
        phases: copyPhases(phases),
        ...(input.op === "done" ? { completedTasks: phases.flatMap((phase) => phase.tasks
          .filter((task) => task.status === "completed" && (!input.task || task.content === input.task))
          .map((task) => ({ phase: phase.name, content: task.content }))) } : {}),
      },
    } });
  }

  pair(callId: string, input: NativeInput, phases: CanonicalTodoPhase[]): void {
    this.call(callId, input);
    this.result(callId, input, phases);
  }
}

const PHASE = "Native authority";
const TASK = "Retain the original obligation";
const COMPANION = "Independent native work already in progress";
const DEBT: PendingRemediation = {
  taskId: TASK, gate: "Gate 2 Macro-Check", diffHash: "unchanged-rejected-evidence",
  reasons: ["The task-bound deliverable is missing"], nextActions: ["Supply the original deliverable"], timestamp: 1,
};

function singleTask(
  status: CanonicalTodoPhase["tasks"][number]["status"],
  blocker = "External fixture prerequisite",
): CanonicalTodoPhase[] {
  return [{ name: PHASE, tasks: [
    { content: COMPANION, status: status === "in_progress" ? "pending" : "in_progress" },
    { content: TASK, status, ...(status === "blocked" ? { blocker } : {}) },
  ] }];
}

function seedDebt(state: PlannerSessionState): void {
  state.pendingRemediations.set(TASK, structuredClone(DEBT));
  state.lastFailureReasonByTask.set(TASK, DEBT.reasons[0]);
  state.consecutiveFailuresByTask.set(TASK, 2);
}

function expectDebt(state: PlannerSessionState): void {
  expect(state.pendingRemediations.get(TASK)).toEqual(DEBT);
  expect(state.lastFailureReasonByTask.get(TASK)).toBe(DEBT.reasons[0]);
  expect(state.consecutiveFailuresByTask.get(TASK)).toBe(2);
}

function expectBlocked(result: unknown): void {
  expect(result).toEqual(expect.objectContaining({ block: true, reason: expect.any(String) }));
  if (!result || typeof result !== "object" || !("reason" in result) || typeof result.reason !== "string") {
    throw new Error("Expected the SDK native guard to return a blocking reason");
  }
  expect(result.reason.length).toBeGreaterThan(0);
}

function expectAllowed(result: unknown): void {
  expect(result).not.toEqual(expect.objectContaining({ block: true }));
}

interface Fixture {
  cwd: string;
  planDir: string;
  history: HostHistory;
  state: PlannerSessionState;
  messages: Array<string | { customType?: string; content: string; display?: boolean }>;
  context(extra?: Record<string, unknown>): Record<string, unknown>;
  emit(name: string, event?: unknown, context?: Record<string, unknown>): Promise<unknown>;
  result(callId: string, input: NativeInput, phases: CanonicalTodoPhase[], isError?: boolean): Promise<void>;
  projectTool(name: string, input: Record<string, unknown>, context?: Record<string, unknown>): Promise<unknown>;
  executeNative(callId: string, input: NativeInput, phases: CanonicalTodoPhase[], context?: Record<string, unknown>): Promise<unknown>;
  coreInputs: Record<string, unknown>[];
  successReports(): unknown[];
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-native-history-"));
  const cwd = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const planDir = path.join(cwd, "plans", "explicit-authority");
  const history = new HostHistory();
  const sessionManager = {
    getBranch: () => history.entries,
    getSessionId: () => "native-history-session",
    getLeafId: () => history.entries.at(-1)?.id ?? null,
    getEntry: (id: string) => history.entries.find((entry) => entry.id === id),
    getSessionFile: () => undefined,
    getHeader: () => null,
  };
  const handlers = new Map<string, Handler[]>();
  const messages: Fixture["messages"] = [];
  const tools = new Map<string, (id: string, input: Record<string, unknown>, context: unknown) => Promise<unknown>>();
  const coreInputs: Record<string, unknown>[] = [];
  const originalTodoSchema = Object.freeze({});
  const installedTools = new Map<string, FixtureToolInfo>([["todo", {
    name: "todo", description: "Native Core todo", parameters: originalTodoSchema,
    sourceInfo: { source: "builtin", path: "<builtin:todo>" },
  }]]);
  const pendingTools = new Map<string, FixtureToolInfo>();
  let activeTools = ["todo"];
  // Any attempted network request is a failure, including health probes and accidental retries.
  const fetchGuard = spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Native history regression attempted network access");
  });
  try {
    await fs.mkdir(planDir, { recursive: true });
    await fs.mkdir(path.join(homeDir, ".omp", "agent"), { recursive: true });
    await fs.mkdir(path.join(homeDir, "empty-hooks"));
    await fs.writeFile(path.join(homeDir, ".omp", "agent", "typesafe.json"), JSON.stringify({ typesafe: { projects: ["*"], excludeProjects: [] } }));
    await fs.writeFile(path.join(planDir, "plan.md"), [
      "---", "title: Explicit native authority", "status: in_progress", "---", "# Explicit native authority", "",
      "| Phase | Status |", "| --- | --- |", "| [1](phase-01-authority.md) | pending |", "",
    ].join("\n"));
    await fs.writeFile(path.join(planDir, "phase-01-authority.md"), [
      "---", "phase: 1", "status: pending", "---", "# Authority", "## Success Criteria", `- [ ] ${TASK}`, "",
    ].join("\n"));
    const gitEnv = {
      ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(homeDir, "no-global-git-config"),
      GIT_TERMINAL_PROMPT: "0",
    };
    const git = (...args: string[]) => execFileSync("git", args, { cwd, env: gitEnv, windowsHide: true, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.name", "Native History Fixture");
    git("config", "user.email", "native-history@example.invalid");
    git("config", "core.autocrlf", "false");
    git("config", "core.hooksPath", path.join(homeDir, "empty-hooks"));
    git("add", "plans");
    git("commit", "-qm", "isolated native history baseline");

    interface Schema { optional(): Schema; min(): Schema; [key: string]: unknown }
    const schema: Schema = { optional: () => schema, min: () => schema };
    const host: Host & {
      events: object;
      appendEntry(customType: string, data: unknown): void;
      getAllTools(): FixtureToolInfo[];
      getActiveTools(): string[];
      setActiveTools(names: string[]): Promise<void>;
    } = {
      events: {},
      getAllTools: () => [...installedTools.values()],
      getActiveTools: () => [...activeTools],
      async setActiveTools(names) {
        for (const [name, info] of pendingTools) installedTools.set(name, info);
        pendingTools.clear();
        activeTools = [...names];
      },
      zod: {
        object: () => schema, union: () => schema, string: () => schema, number: () => schema,
        record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema,
      },
      on(name, handler) { const registered = handlers.get(name) ?? []; registered.push(handler); handlers.set(name, registered); },
      registerTool(definition) {
        const sourcePath: unknown = Reflect.get(definition, "sourcePath");
        pendingTools.set(definition.name, {
          name: definition.name, description: definition.description, parameters: definition.parameters,
          sourceInfo: { source: "extension", path: typeof sourcePath === "string" ? sourcePath : "typesafe-planner.ts" },
        });
        tools.set(definition.name, (id, input, context) =>
          definition.execute(id, input as Parameters<typeof definition.execute>[1], undefined, undefined, context));
      },
      async sendMessage(message) { messages.push(message); },
      appendEntry(customType, data) { history.append({ type: "custom", customType, data: structuredClone(data) }); },
    };
    const state = registerExtension(host, { homeDir, env: { TYPESAFE_API_KEY: "" } });
    const fixture: Fixture = {
      cwd, planDir, history, state, messages, coreInputs,
      context(extra = {}) {
        return {
          cwd,
          sessionManager,
          agent: { kind: "main", id: "native-history-main", name: "Main", depth: 0 },
          abort() { throw new Error("Unexpected native test-host abort"); },
          ...extra,
        };
      },
      async emit(name, event = {}, context = fixture.context()) {
        const registered = handlers.get(name);
        expect(registered?.length).toBeGreaterThan(0);
        let result: unknown;
        for (const handler of registered ?? []) {
          const returned = await handler(event, context);
          if (returned !== undefined) result = returned;
        }
        return result;
      },
      async result(callId, input, phases, isError = false) {
        const entry = history.result(callId, input, phases, isError);
        history.entries.pop();
        const wasStaged = state.stagedCalls.has(callId);
        const before = copyPhases(state.phases);
        // SDK middleware precedes persistence. It is not a final native success.
        await fixture.emit("tool_result", { toolName: "todo", toolCallId: callId, isError, details: entry.message?.details });
        if (wasStaged) {
          expect(state.stagedCalls.has(callId)).toBe(true);
          expect(state.phases).toEqual(before);
          expect(state.committedCallTombstones.has(callId)).toBe(false);
        }
        history.entries.push(entry);
        await fixture.emit("message_end", { message: entry.message });
      },
      async projectTool(name, input, context = fixture.context()) {
        const execute = tools.get(name);
        expect(execute).toBeDefined();
        const callId = `project-${name}-${history.entries.length}`;
        history.call(callId, input, name);
        return execute!(callId, input, context);
      },
      async executeNative(callId, input, phases, context = fixture.context()) {
        const execute = tools.get("todo");
        expect(execute).toBeDefined();
        expect(installedTools.get("todo")?.parameters).toBe(originalTodoSchema);
        const expectedInput = structuredClone(input);
        const actualContext = {
          ...context,
          async invokeTool(ownedInput: Record<string, unknown>) {
            coreInputs.push(structuredClone(ownedInput));
            expect(ownedInput).toEqual(expectedInput);
            expect(Object.isFrozen(ownedInput)).toBe(true);
            return {
              content: [{ type: "text", text: "Native Core todo result" }],
              details: { op: expectedInput.op, phases: copyPhases(phases) },
            };
          },
        };
        return execute!(callId, input, actualContext);
      },
      successReports() {
        return messages.filter((message) => typeof message !== "string" && message.customType === "typesafe-task-report");
      },
    };
    await run(fixture);
  } finally {
    const attemptedRequests = fetchGuard.mock.calls.length;
    fetchGuard.mockRestore();
    await fs.rm(root, { recursive: true, force: true });
    expect(attemptedRequests).toBe(0);
  }
}

function initialize(fixture: Fixture, status: CanonicalTodoPhase["tasks"][number]["status"] = "pending"): void {
  fixture.history.user(`Execute the approved plan ${path.join(fixture.planDir, "plan.md")} phase 1, retaining every criterion.`);
  fixture.history.pair("native-init", { op: "init", list: [{ phase: PHASE, items: [COMPANION, TASK] }] }, singleTask("pending"));
  if (status === "in_progress") {
    fixture.history.pair("native-initial-start", { op: "start", task: TASK }, singleTask(status));
  } else if (status === "blocked") {
    fixture.history.pair("native-initial-block", { op: "block", task: TASK, reason: "External fixture prerequisite" }, singleTask(status));
  }
}

function recoveredWorkspace(fixture: Fixture): CanonicalTodoPhase[] {
  const tasks: CanonicalTodoPhase["tasks"] = Array.from({ length: 23 }, (_, index) => ({
    content: index < 3 ? `Previously completed native target ${index + 1}` : `Original open obligation ${index - 2}`,
    status: "pending",
  }));
  tasks[0].status = "in_progress";
  const phases = [{ name: PHASE, tasks }];
  fixture.history.user(`Execute the approved plan ${path.join(fixture.planDir, "plan.md")}; preserve original obligations.`);
  fixture.history.pair("native-init-23", { op: "init", list: [{ phase: PHASE, items: tasks.map((task) => task.content) }] }, phases);
  fixture.history.append({ type: "custom", customType: "user_todo_edit", data: { phases: copyPhases(phases) } });
  for (let index = 0; index < 3; index++) {
    tasks[index].status = "completed";
    tasks[index + 1].status = "in_progress";
    fixture.history.pair(`native-completed-${index + 1}`, { op: "done", task: tasks[index].content }, phases);
  }
  return copyPhases(phases);
}

describe("registered native history authority boundaries", () => {
  test("the first genuine native init is allowed in a supported fresh branch and commits only after persistence", async () => {
    await withFixture(async (fixture) => {
      fixture.history.user(`Execute the approved plan ${path.join(fixture.planDir, "plan.md")} without discarding obligations.`);
      await fixture.emit("session_start");
      const input = { op: "init", list: [{ phase: PHASE, items: [COMPANION, TASK] }] };
      fixture.history.call("first-native-init", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "first-native-init", input }));
      expect(fixture.state.stagedCalls.size).toBe(0);
      await fixture.executeNative("first-native-init", input, singleTask("pending"));
      expect(fixture.state.phases).toEqual([]);
      expect(fixture.state.stagedCalls.has("first-native-init")).toBe(true);
      await fixture.result("first-native-init", input, singleTask("pending"));
      expect(fixture.state.phases).toEqual(singleTask("pending"));
      expect(fixture.state.committedCallTombstones.has("first-native-init")).toBe(true);
      expect(fixture.state.uninitialized).toBe(false);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("an unsupported session adapter cannot make a fresh init authoritative", async () => {
    await withFixture(async (fixture) => {
      const input = { op: "init", list: [{ phase: PHASE, items: [TASK] }] };
      fixture.history.user("Execute the original task without silently replacing its scope.");
      fixture.history.call("unsupported-init", input);
      expectBlocked(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "unsupported-init", input }, {
        cwd: fixture.cwd, sessionManager: { getBranch: () => fixture.history.entries },
      }));
      expect(fixture.state.phases).toEqual([]);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("native mutation cannot stage before deferred SDK wrapper initialization", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      const input = { op: "start", task: TASK };
      fixture.history.call("before-wrapper-activation", input);
      expectBlocked(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "before-wrapper-activation", input }));
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.coreInputs).toHaveLength(0);
      await fixture.emit("session_start");
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "before-wrapper-activation", input }));
      expect(fixture.state.stagedCalls.size).toBe(0);
      await fixture.executeNative("before-wrapper-activation", input, singleTask("in_progress"));
      expect(fixture.coreInputs).toEqual([input]);
      await fixture.result("before-wrapper-activation", input, singleTask("in_progress"));
      expect(fixture.state.committedCallTombstones.has("before-wrapper-activation")).toBe(true);
    });
  });

  test("latest valid paired host result preserves three completed and twenty open targets over an older custom edit", async () => {
    await withFixture(async (fixture) => {
      const expected = recoveredWorkspace(fixture);
      fixture.history.user("Continue. This unrelated turn does not amend the original obligations.");
      fixture.history.append({ type: "message", message: { role: "assistant", content: "An unrelated report was recorded." } });
      await fixture.emit("session_start");
      expect(fixture.state.phases).toEqual(expected);
      expect(fixture.state.phases.flatMap((phase) => phase.tasks).filter((task) => task.status === "completed")).toHaveLength(3);
      expect(fixture.state.activeContractedTasks.size).toBe(20);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.successReports()).toHaveLength(0);
      await fixture.emit("session_tree");
      expect(fixture.state.phases).toEqual(expected);
    });
  });

  test("a non-custom result entry is not masked by a false custom-phase expression", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      expect(fixture.state.phases).toEqual(singleTask("pending"));
      expect([...fixture.state.activeContractedTasks]).toEqual([COMPANION, TASK]);
      expect(fixture.state.uninitialized).toBe(false);
    });
  });

  for (const variant of ["failed-result", "assistant-prose", "foreign-tool", "wrong-call-id"] as const) {
    test(`${variant} cannot replace the latest valid native completion history`, async () => {
      await withFixture(async (fixture) => {
        const expected = recoveredWorkspace(fixture);
        const forged = copyPhases(expected);
        forged[0].tasks[3].status = "completed";
        forged[0].tasks[4].status = "in_progress";
        const input = { op: "done", task: forged[0].tasks[3].content };
        if (variant === "assistant-prose") {
          fixture.history.append({ type: "message", message: { role: "assistant", content: JSON.stringify({ toolName: "todo", details: { op: "done", phases: forged } }) } });
        } else {
          fixture.history.call("untrusted-done", input, variant === "foreign-tool" ? "bash" : "todo");
          fixture.history.result(variant === "wrong-call-id" ? "another-operation" : "untrusted-done", input, forged, variant === "failed-result");
        }
        await fixture.emit("session_start");
        expect(fixture.state.phases).toEqual(expected);
        expect(fixture.state.activeContractedTasks.size).toBe(20);
        expect(fixture.state.stagedCalls.size).toBe(0);
        expect(fixture.successReports()).toHaveLength(0);
      });
    });
  }

  test("view is a lifecycle observation, not a semantic receipt or a debt release", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture, "in_progress");
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "view" };
      fixture.history.call("native-view", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "native-view", input }));
      await fixture.executeNative("native-view", input, singleTask("in_progress"));
      await fixture.result("native-view", input, singleTask("in_progress"));
      expectDebt(fixture.state);
      expect(fixture.state.activeContractedTasks.has(TASK)).toBe(true);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.state.committedCallTombstones.has("native-view")).toBe(false);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("ordinary unblock and start recover missing result input from the exact original host call without forgiving debt", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture, "blocked");
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      for (const [op, status] of [["unblock", "pending"], ["start", "in_progress"]] as const) {
        const callId = `ordinary-${op}`;
        const input = { op, task: TASK };
        fixture.history.call(callId, input);
        expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: callId, input }));
        await fixture.executeNative(callId, input, singleTask(status));
        expect(fixture.state.stagedCalls.has(callId)).toBe(true);
        expectDebt(fixture.state);
        await fixture.result(callId, input, singleTask(status));
        expect(fixture.state.phases).toEqual(singleTask(status));
        expect(fixture.state.uninitialized).toBe(false);
        expect(fixture.state.committedCallTombstones.has(callId)).toBe(true);
        expect(fixture.state.stagedCalls.size).toBe(0);
        expectDebt(fixture.state);
      }
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("actual wrapper execution owns the checked input across an asynchronous caller mutation", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      const input = { op: "start", task: TASK };
      const original = structuredClone(input);
      fixture.history.call("owned-input-start", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "owned-input-start", input }));
      expect(fixture.state.stagedCalls.size).toBe(0);
      const execution = fixture.executeNative("owned-input-start", input, singleTask("in_progress"));
      input.task = COMPANION;
      await execution;
      expect(fixture.coreInputs).toEqual([original]);
      expect(fixture.state.stagedCalls.get("owned-input-start")?.affectedTasks).toEqual([TASK]);
      await fixture.result("owned-input-start", original, singleTask("in_progress"));
      expect(fixture.state.phases).toEqual(singleTask("in_progress"));
      expect(fixture.state.committedCallTombstones.has("owned-input-start")).toBe(true);
    });
  });

  test("actual guarded native done rejects a missing sealed review without executing Core or semantic services", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture, "in_progress");
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "done", task: TASK };
      fixture.history.call("unreviewed-done", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "unreviewed-done", input }));
      const denied = await fixture.executeNative("unreviewed-done", input, singleTask("completed"));
      expect(denied).toEqual(expect.objectContaining({ isError: true }));
      expect(fixture.coreInputs).toHaveLength(0);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.state.phases).toEqual(singleTask("in_progress"));
      expectDebt(fixture.state);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("an executed observation survives turn boundaries until its actual settled result is persisted", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "start", task: TASK };
      fixture.history.call("persisted-after-turn", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "persisted-after-turn", input }));
      await fixture.executeNative("persisted-after-turn", input, singleTask("in_progress"));
      await fixture.emit("tool_result", {
        toolName: "todo", toolCallId: "persisted-after-turn",
        details: { op: "start", phases: singleTask("in_progress") },
      });
      expect(fixture.state.stagedCalls.has("persisted-after-turn")).toBe(true);
      expect(fixture.state.committedCallTombstones.has("persisted-after-turn")).toBe(false);
      for (const event of ["turn_end", "agent_end"]) {
        await fixture.emit(event);
        expect(fixture.state.stagedCalls.has("persisted-after-turn")).toBe(true);
        expect(fixture.state.phases).toEqual(singleTask("pending"));
        expectDebt(fixture.state);
      }
      const settled = fixture.history.result("persisted-after-turn", input, singleTask("in_progress"));
      if (settled.message) delete settled.message.isError;
      await fixture.emit("before_agent_start");
      expect(fixture.state.phases).toEqual(singleTask("in_progress"));
      expect(fixture.state.committedCallTombstones.has("persisted-after-turn")).toBe(true);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expectDebt(fixture.state);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("a favorable middleware observation followed by an outer native error cannot commit", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "start", task: TASK };
      fixture.history.call("outer-error-start", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "outer-error-start", input }));
      await fixture.executeNative("outer-error-start", input, singleTask("in_progress"));
      await fixture.emit("tool_result", {
        toolName: "todo", toolCallId: "outer-error-start",
        details: { op: "start", phases: singleTask("in_progress") },
      });
      expect(fixture.state.committedCallTombstones.has("outer-error-start")).toBe(false);
      fixture.history.result("outer-error-start", input, singleTask("in_progress"), true);
      await fixture.emit("message_end");
      expect(fixture.state.phases).toEqual(singleTask("pending"));
      expect(fixture.state.committedCallTombstones.has("outer-error-start")).toBe(false);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expectDebt(fixture.state);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("a malformed settled error flag cannot commit; a later actual view restores observation without approval", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "start", task: TASK };
      fixture.history.call("malformed-error-flag", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "malformed-error-flag", input }));
      await fixture.executeNative("malformed-error-flag", input, singleTask("in_progress"));
      const malformed = fixture.history.result("malformed-error-flag", input, singleTask("in_progress"));
      if (malformed.message) malformed.message.isError = "false";
      await fixture.emit("message_end");
      expect(fixture.state.committedCallTombstones.has("malformed-error-flag")).toBe(false);
      expect(fixture.state.phases).toEqual(singleTask("pending"));
      expectDebt(fixture.state);
      const view = { op: "view" };
      fixture.history.call("actual-recovery-view", view);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "actual-recovery-view", input: view }));
      await fixture.executeNative("actual-recovery-view", view, singleTask("pending"));
      await fixture.result("actual-recovery-view", view, singleTask("pending"));
      expect(fixture.state.uninitialized).toBe(false);
      expect(fixture.state.phases).toEqual(singleTask("pending"));
      expect(fixture.state.committedCallTombstones.has("actual-recovery-view")).toBe(false);
      expectDebt(fixture.state);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  for (const variant of ["failed", "wrong-target", "foreign-call", "mismatched-call-id"] as const) {
    test(`a ${variant} start result cannot commit or erase rejected-task debt`, async () => {
      await withFixture(async (fixture) => {
        initialize(fixture);
        await fixture.emit("session_start");
        seedDebt(fixture.state);
        const input = { op: "start", task: TASK };
        fixture.history.call("staged-start", input, variant === "foreign-call" ? "bash" : "todo");
        const guard = await fixture.emit("tool_call", { toolName: "todo", toolCallId: "staged-start", input });
        if (variant !== "foreign-call") expectAllowed(guard);
        if (variant !== "foreign-call") await fixture.executeNative("staged-start", input, singleTask("in_progress"));
        const resultPhases = variant === "wrong-target"
          ? [{ name: PHASE, tasks: [{ content: "A different native target", status: "in_progress" as const }] }]
          : singleTask("in_progress");
        await fixture.result(variant === "mismatched-call-id" ? "not-staged-start" : "staged-start", input, resultPhases, variant === "failed");
        expect(fixture.state.phases).toEqual(singleTask("pending"));
        expect(fixture.state.committedCallTombstones.has("staged-start")).toBe(false);
        expectDebt(fixture.state);
        expect(fixture.successReports()).toHaveLength(0);
      });
    });
  }

  for (const lifecycle of ["session_start", "session_switch", "session_branch", "session_tree"] as const) {
    test(`${lifecycle} retains same-incarnation debt while invalidating a transient start stage`, async () => {
      await withFixture(async (fixture) => {
        initialize(fixture);
        await fixture.emit("session_start");
        seedDebt(fixture.state);
        const input = { op: "start", task: TASK };
        fixture.history.call("before-lifecycle", input);
        expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "before-lifecycle", input }));
        await fixture.executeNative("before-lifecycle", input, singleTask("in_progress"));
        expect(fixture.state.stagedCalls.has("before-lifecycle")).toBe(true);
        const generation = fixture.state.generation;
        await fixture.emit(lifecycle);
        expect(fixture.state.generation).toBeGreaterThan(generation);
        expect(fixture.state.phases).toEqual(singleTask("pending"));
        expect(fixture.state.stagedCalls.size).toBe(0);
        expectDebt(fixture.state);
        await fixture.result("before-lifecycle", input, singleTask("in_progress"));
        expect(fixture.state.committedCallTombstones.has("before-lifecycle")).toBe(false);
        expectDebt(fixture.state);
        expect(fixture.successReports()).toHaveLength(0);
      });
    });
  }

  test("branching before creation removes the visible obligation, returning after creation restores its original debt but no approval", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const originalBranch = [...fixture.history.entries];
      fixture.history.entries = originalBranch.slice(0, 1);
      await fixture.emit("session_branch");
      expect(fixture.state.activeContractedTasks.has(TASK)).toBe(false);
      expect(fixture.state.pendingRemediations.has(TASK)).toBe(false);
      expect(fixture.state.stagedCalls.size).toBe(0);
      fixture.history.entries = originalBranch;
      await fixture.emit("session_tree");
      expect([...fixture.state.activeContractedTasks]).toEqual([COMPANION, TASK]);
      expectDebt(fixture.state);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.state.committedCallTombstones.size).toBe(0);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("same text reappended in a new incarnation cannot inherit the old stage or old-incarnation debt", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const originalBranch = [...fixture.history.entries];
      const input = { op: "start", task: TASK };
      fixture.history.call("old-incarnation-start", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "old-incarnation-start", input }));
      await fixture.executeNative("old-incarnation-start", input, singleTask("in_progress"));
      fixture.history.pair("host-retire-old", { op: "drop", task: TASK }, singleTask("abandoned"));
      fixture.history.pair("host-remove-old", { op: "rm", task: TASK }, [{
        name: PHASE, tasks: [{ content: COMPANION, status: "in_progress" }],
      }]);
      fixture.history.pair("host-reappend", { op: "append", phase: PHASE, items: [TASK] }, singleTask("pending"));
      await fixture.emit("session_branch");
      expect(fixture.state.phases[0].tasks.map((task) => ({ content: task.content, status: task.status }))).toEqual([
        { content: COMPANION, status: "in_progress" }, { content: TASK, status: "pending" },
      ]);
      expect(fixture.state.activeContractedTasks.has(TASK)).toBe(true);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.state.pendingRemediations.has(TASK)).toBe(false);
      expect(fixture.state.lastFailureReasonByTask.has(TASK)).toBe(false);
      expect(fixture.state.consecutiveFailuresByTask.has(TASK)).toBe(false);
      fixture.history.entries = originalBranch;
      await fixture.emit("session_tree");
      expectDebt(fixture.state);
      expect(fixture.state.phases).toEqual(singleTask("pending"));
      expect(fixture.state.stagedCalls.size).toBe(0);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("rejected blocking is prepared through exact UI consent and a durable handoff, never inside native preflight", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture, "in_progress");
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "block", task: TASK, reason: "Waiting for a missing external artifact" };
      fixture.history.call("unprepared-block", input);
      const confirmations: Array<{ title: string; message: string }> = [];
      const uiContext = fixture.context({
        hasUI: true,
        ui: { confirm: async (title: string, message: string) => { confirmations.push({ title, message }); return true; } },
      });
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "unprepared-block", input }, uiContext));
      expect(await fixture.executeNative("unprepared-block", input, singleTask("blocked", input.reason), uiContext))
        .toEqual(expect.objectContaining({ isError: true }));
      expect(fixture.coreInputs).toHaveLength(0);
      expect(confirmations).toHaveLength(0);
      expect(fixture.state.stagedCalls.size).toBe(0);
      expectDebt(fixture.state);
      const prepared = await fixture.projectTool("typesafe_prepare_todo_mutation", {
        input,
        handoff: {
          owner: "Original task owner",
          nextAction: "Obtain the missing signed artifact and inspect its provenance",
          unblockCondition: "The signed artifact is present in the bound workspace",
          resumeCommand: "typesafe_collect_evidence for the original native target",
        },
      }, uiContext);
      expect(prepared).toEqual(expect.objectContaining({ details: expect.objectContaining({ status: "PREPARED" }) }));
      expect(confirmations).toHaveLength(1);
      expect(confirmations[0].message).toContain(TASK);
      expect(fixture.history.entries.some((entry) => entry.type === "custom" && entry.customType === "omp.typesafe.lifecycle-recovery.v1")).toBe(true);
      fixture.history.call("confirmed-exact-block", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "confirmed-exact-block", input }, uiContext));
      await fixture.executeNative("confirmed-exact-block", input, singleTask("blocked", input.reason), uiContext);
      expect(confirmations).toHaveLength(1);
      expect(fixture.state.phases).toEqual(singleTask("in_progress"));
      await fixture.result("confirmed-exact-block", input, singleTask("blocked", input.reason));
      expect(fixture.state.phases).toEqual(singleTask("blocked", input.reason));
      expectDebt(fixture.state);
      expect(fixture.state.activeContractedTasks.has(TASK)).toBe(true);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("plan-cli check 1 --start remains runnable with unrelated open work and an unsettled ordinary start", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      fixture.history.pair("unrelated-append", { op: "append", phase: PHASE, items: ["Unrelated workspace obligation"] }, [{
        name: PHASE, tasks: [...singleTask("pending")[0].tasks, { content: "Unrelated workspace obligation", status: "pending" }],
      }]);
      await fixture.emit("session_start");
      seedDebt(fixture.state);
      const input = { op: "start", task: TASK };
      fixture.history.call("start-still-pending", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "start-still-pending", input }));
      await fixture.executeNative("start-still-pending", input, singleTask("in_progress"));
      expectAllowed(await fixture.emit("tool_call", {
        toolName: "bash", input: { command: "node C:/host/skills/ck-plan/scripts/plan-cli.cjs check 1 --start" },
      }, fixture.context({ cwd: fixture.planDir })));
      expect(fixture.state.activeContractedTasks.size).toBe(3);
      expect(fixture.state.stagedCalls.has("start-still-pending")).toBe(true);
      expectDebt(fixture.state);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("an explicitly source-bound open task still guards real phase closure without blocking phase start", async () => {
    await withFixture(async (fixture) => {
      fixture.history.user(`ck:cook --auto "${path.join(fixture.planDir, "plan.md")}"`);
      fixture.history.pair("native-init", { op: "init", list: [{ phase: PHASE, items: [COMPANION, TASK] }] }, singleTask("pending"));
      await fixture.emit("session_start");
      const originalUserEntryId = fixture.history.entries[0].id;
      const binding = await fixture.projectTool("typesafe_bind_task", {
        task: TASK,
        phase: PHASE,
        planPath: path.join(fixture.planDir, "phase-01-authority.md"),
        phaseHeading: "Authority",
        originalUserEntryId,
      }, fixture.context({ hasUI: true, ui: { confirm: async () => true } }));
      expect(binding).toEqual(expect.objectContaining({ details: expect.objectContaining({ status: "BOUND" }) }));
      expectAllowed(await fixture.emit("tool_call", {
        toolName: "bash", input: { command: "node C:/host/skills/ck-plan/scripts/plan-cli.cjs check 1 --start" },
      }, fixture.context({ cwd: fixture.planDir })));
      expectBlocked(await fixture.emit("tool_call", {
        toolName: "bash", input: { command: "node C:/host/skills/ck-plan/scripts/plan-cli.cjs check 1" },
      }, fixture.context({ cwd: fixture.planDir })));
      expect(fixture.state.activeContractedTasks.has(TASK)).toBe(true);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });

  test("ordinary closure check is still guarded after the --start allowance", async () => {
    await withFixture(async (fixture) => {
      initialize(fixture);
      await fixture.emit("session_start");
      const input = { op: "start", task: TASK };
      fixture.history.call("pending-at-closure", input);
      expectAllowed(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "pending-at-closure", input }));
      await fixture.executeNative("pending-at-closure", input, singleTask("in_progress"));
      expectAllowed(await fixture.emit("tool_call", {
        toolName: "bash", input: { command: "node C:/host/skills/ck-plan/scripts/plan-cli.cjs check 1 --start" },
      }, fixture.context({ cwd: fixture.planDir })));
      expectBlocked(await fixture.emit("tool_call", {
        toolName: "bash", input: { command: "node C:/host/skills/ck-plan/scripts/plan-cli.cjs check 1" },
      }, fixture.context({ cwd: fixture.planDir })));
      expectBlocked(await fixture.emit("tool_call", {
        toolName: "write", input: { path: path.join(fixture.planDir, "plan.md"), content: "---\nstatus: completed\n---\n" },
      }));
      expect(fixture.state.activeContractedTasks.has(TASK)).toBe(true);
      expect(fixture.state.stagedCalls.has("pending-at-closure")).toBe(true);
      expect(fixture.successReports()).toHaveLength(0);
    });
  });
});
