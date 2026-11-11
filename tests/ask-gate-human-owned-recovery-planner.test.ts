import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostHistoryEntry } from "../src/host-history";
import type { ProjectedNativePhase } from "../src/types/verification";
import type { AdvisorHostToolInfo } from "../src/advisor-host-types";
import { TECHNICAL_ASK_BLOCK_REASON } from "../src/anti-blocking-guards";
import type { TaskVerificationRuntime } from "../src/task-verification-runtime";

// Host-level wiring test for typesafe-planner's `currentTaskRecoveryIsHumanOwned` -> `interceptAskCall({ humanOwned })`.
// Recovery state cannot be produced without a full bound-contract review flow, so the real runtime is wrapped and
// ONLY getRecovery is overridden while `recoveryProbe` is set; otherwise the real runtime is used unchanged.
type RecoveryProbe = (target: { task: string; phase?: string }) => unknown;
let recoveryProbe: RecoveryProbe | undefined;
// Snapshot: the module namespace itself is live-rebound by mock.module, so copy the real exports first.
const realRuntimeModule = { ...(await import("../src/task-verification-runtime")) };
mock.module("../src/task-verification-runtime", () => ({
  ...realRuntimeModule,
  createTaskVerificationRuntime(options: Parameters<typeof realRuntimeModule.createTaskVerificationRuntime>[0]): TaskVerificationRuntime {
    const real = realRuntimeModule.createTaskVerificationRuntime(options);
    return { ...real, getRecovery: (context, target) => (recoveryProbe ? recoveryProbe(target) as never : real.getRecovery(context, target)) };
  },
}));
const { default: registerExtension } = await import("../typesafe-planner");

const workspaces: string[] = [];
afterEach(() => {
  recoveryProbe = undefined;
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

type Hook = (event: unknown, context: unknown) => unknown | Promise<unknown>;
const TECHNICAL = "Tests are failing in auth.ts. How should I fix this?";

async function createHost(tasks: Array<{ content: string; status: "pending" | "in_progress" }>) {
  const cwd = mkdtempSync(join(tmpdir(), "ask-gate-human-owned-"));
  workspaces.push(cwd);
  const entries: HostHistoryEntry[] = [];
  const handlers = new Map<string, Hook[]>();
  const schema = { optional: () => schema, min: () => schema };
  const infos = new Map<string, AdvisorHostToolInfo>([["todo", { name: "todo", description: "Native todo", parameters: { type: "object" }, sourceInfo: { source: "builtin", path: "<builtin:todo>" } }]]);
  const pending: Array<{ name: string; description: string; parameters: unknown; sourcePath?: string }> = [];
  let started = false;
  let sequence = 0;
  const append = (entry: Omit<HostHistoryEntry, "id" | "parentId">) => {
    entries.push({ ...structuredClone(entry), id: `entry-${++sequence}`, parentId: entries.at(-1)?.id ?? null });
  };
  const context = {
    cwd, agent: { kind: "main", id: "Main", name: "Main" },
    abort() { throw new Error("Unexpected parent abort"); },
    sessionManager: { getSessionId: () => "ask-session", getSessionFile: () => "ask-session.jsonl", getHeader: () => ({}), getBranch: () => entries },
  };
  const pi = {
    events: {},
    zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, boolean: () => schema, literal: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
    on(name: string, handler: Hook) { handlers.set(name, [...handlers.get(name) ?? [], handler]); },
    registerTool(tool: { name: string; description: string; parameters: unknown; sourcePath?: string }) { if (started) pending.push(tool); },
    getAllTools() { if (!started) throw new Error("SDK tools unavailable during load"); return [...infos.values()]; },
    getActiveTools: () => ["todo"],
    async setActiveTools() {
      for (const tool of pending.splice(0)) infos.set(tool.name, { name: tool.name, description: tool.description, parameters: tool.parameters, sourceInfo: { source: "extension", path: tool.sourcePath ?? "" } });
    },
    appendEntry(customType: string, data: unknown) { append({ type: "custom", customType, data }); },
    async sendMessage() {},
  };
  registerExtension(pi as never, { env: { TYPESAFE_API_KEY: "" } });
  append({ type: "message", message: { role: "user", content: "Implement the listed tasks." } });
  // Seeded through a native `init` result. The native model keeps at most one task in progress, so a branch that
  // claims several is unreliable and projects no active task at all (covered by the "two in-progress" case).
  const phases: ProjectedNativePhase[] = [{ name: "P1", tasks: tasks.map(task => ({ ...task })) }];
  append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "init", name: "todo", arguments: { op: "init", list: [{ phase: "P1", items: tasks.map(task => task.content) }] } }] } });
  append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: "init", isError: false, details: { op: "init", phases } } });
  started = true;
  const emit = async (name: string, event: unknown = {}) => {
    let result: unknown;
    for (const handler of handlers.get(name) ?? []) { const next = await handler(event, context); if (next !== undefined) result = next; }
    return result;
  };
  await emit("session_start");
  return { ask: (questions: Array<{ question: string }>) => emit("tool_call", { toolName: "ask", toolCallId: "ask-1", input: { questions } }) };
}

const human = { kind: "human", owner: "human" };
const blocked = (result: unknown) => result as { block?: boolean; reason?: string } | undefined;
/** The block must come from the technical-ask gate itself, not from the handler's generic UNAVAILABLE catch-all (which would mask a dropped try/catch). */
function expectTechnicalBlock(result: unknown, label = ""): void {
  expect(blocked(result)?.block, label).toBe(true);
  expect(blocked(result)?.reason, label).toBe(TECHNICAL_ASK_BLOCK_REASON);
}

describe("planner ask gate wiring: currentTaskRecoveryIsHumanOwned -> interceptAskCall", () => {
  test("single in-progress task with human-owned recovery may ask the human a technical question", async () => {
    const targets: Array<{ task: string; phase?: string }> = [];
    recoveryProbe = target => { targets.push(target); return human; };
    const host = await createHost([{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }]);
    const result = await host.ask([{ question: TECHNICAL }]);
    expect(blocked(result)?.block).not.toBe(true);
    expect(targets).toEqual([{ task: "A", phase: "P1" }]);
  });

  test("single in-progress task without a recovery plan keeps the technical ask blocked (real getRecovery)", async () => {
    const host = await createHost([{ content: "A", status: "in_progress" }]);
    const result = blocked(await host.ask([{ question: TECHNICAL }]));
    expectTechnicalBlock(result);
    expect(result?.reason).toContain("BLOCKED");
  });

  test("non-human recovery (advisor-owned repair, or human kind with non-human owner) keeps the block", async () => {
    for (const plan of [{ kind: "repair", owner: "advisor" }, { kind: "human", owner: "advisor" }, { kind: "service", owner: "human" }]) {
      recoveryProbe = () => plan;
      const host = await createHost([{ content: "A", status: "in_progress" }]);
      expectTechnicalBlock(await host.ask([{ question: TECHNICAL }]), JSON.stringify(plan));
    }
  });

  test("zero in-progress tasks keeps the block even if a human recovery would be reported", async () => {
    let consulted = 0;
    recoveryProbe = () => { consulted++; return human; };
    const host = await createHost([{ content: "A", status: "pending" }, { content: "B", status: "pending" }]);
    expectTechnicalBlock(await host.ask([{ question: TECHNICAL }]));
    expect(consulted).toBe(0);
  });

  test("two in-progress tasks (inconsistent with the native one-active model) keep the block and never consult recovery", async () => {
    let consulted = 0;
    recoveryProbe = () => { consulted++; return human; };
    const host = await createHost([{ content: "A", status: "in_progress" }, { content: "B", status: "in_progress" }]);
    expectTechnicalBlock(await host.ask([{ question: TECHNICAL }]));
    expect(consulted).toBe(0);
  });

  test("a throwing getRecovery fails closed: the technical ask stays blocked", async () => {
    recoveryProbe = () => { throw new Error("recovery history unreadable"); };
    const host = await createHost([{ content: "A", status: "in_progress" }]);
    expectTechnicalBlock(await host.ask([{ question: TECHNICAL }]));
  });

  test("a technical later question is blocked when not human-owned, allowed when human-owned", async () => {
    const questions = [{ question: "Which logo do you prefer?" }, { question: TECHNICAL }];
    const plain = await createHost([{ content: "A", status: "in_progress" }]);
    expectTechnicalBlock(await plain.ask(questions));
    recoveryProbe = () => human;
    const owned = await createHost([{ content: "A", status: "in_progress" }]);
    expect(blocked(await owned.ask(questions))?.block).not.toBe(true);
  });
});
