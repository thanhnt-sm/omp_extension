import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import registerExtension from "../typesafe-planner";
import type { PlannerSessionState } from "../typesafe-planner";
import type { HostHistoryEntry } from "../src/host-history";
import type { AdvisorHostToolInfo } from "../src/advisor-host-types";
import type { ContractBindingOutcome } from "../src/task-contract-runtime-types";
import type { TaskEvidenceCollectionStatus } from "../src/task-evidence-runtime";
import type { TaskReviewOutcome } from "../src/task-verification-types";

type Host = Parameters<typeof registerExtension>[0];
type Handler = Parameters<Host["on"]>[1];
interface ToolResult { content: Array<{ type: "text"; text: string }>; details?: unknown; isError?: boolean }
interface RegisteredTool { execute(id: string, params: unknown, signal?: AbortSignal, update?: unknown, context?: unknown): Promise<ToolResult> }
interface CollectedEvidence {
  status: TaskEvidenceCollectionStatus;
  recordId?: string;
  sourceManifest: Array<{ path: string; fullFileDigest: string; bytes: number; encoding: string }>;
  provenance?: { toolName: string };
}
const TASK = "Review src/parser.ts for malformed-input handling and report concrete findings without changing source";
const SELECTOR = { task: TASK, phase: "Parser review" };

async function workflow(run: (fixture: {
  state: PlannerSessionState;
  tool(name: string, params: Record<string, unknown>): Promise<ToolResult>;
  emit(name: string, event?: unknown): Promise<unknown>;
  todo(id: string, input: Record<string, unknown>): Promise<unknown>;
}) => Promise<void>) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-root-workflow-"));
  const homeDir = path.join(cwd, "isolated-home");
  const entries: HostHistoryEntry[] = [];
  const handlers = new Map<string, Handler[]>();
  const tools: Record<string, RegisteredTool> = {};
  const infos: AdvisorHostToolInfo[] = ["todo", "task", "read", "grep", "glob"].map(name => ({ name, description: `Native ${name}`,
    parameters: { type: "object", additionalProperties: true }, sourceInfo: { source: "builtin", path: `<builtin:${name}>` } }));
  const pendingTools: AdvisorHostToolInfo[] = [];
  let started = false;
  let sequence = 0;
  const active = ["todo", "task", "read", "grep", "glob"];
  function append(value: Omit<HostHistoryEntry, "id" | "parentId">) {
    const entry = { ...value, id: `workflow-${++sequence}`, parentId: entries.at(-1)?.id ?? null };
    entries.push(entry);
    return entry;
  }
  function call(name: string, id: string, params: Record<string, unknown>) {
    append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: structuredClone(params) }] } });
  }
  const manager = {
    getSessionId: () => "root-workflow-session",
    getSessionFile: () => path.join(cwd, "session.jsonl"),
    getHeader: () => ({}),
    getBranch: () => entries,
    getEntry: (id: string) => entries.find(entry => entry.id === id),
  };
  const context = { cwd, sessionManager: manager, agent: { kind: "main", id: "Main", name: "Main" }, abort() { throw new Error("Unexpected parent abort"); } };
  const schema = { optional: () => schema, min: () => schema };
  const host: Host & {
    events: object; appendEntry(customType: string, data: unknown): void;
    getAllTools(): AdvisorHostToolInfo[]; getActiveTools(): string[]; setActiveTools(names: string[]): Promise<void>;
  } = {
    events: {},
    zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema,
      record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
    on(name, handler) { handlers.set(name, [...handlers.get(name) ?? [], handler]); },
    registerTool(definition) {
      tools[definition.name] = definition as unknown as RegisteredTool;
      const source = definition as unknown as { sourcePath?: string };
      const info = { name: definition.name, description: definition.description, parameters: definition.parameters,
        sourceInfo: { source: "extension", path: source.sourcePath ?? "" } };
      if (started) pendingTools.push(info); else infos.push(info);
    },
    async sendMessage() {},
    appendEntry(customType, data) { append({ type: "custom", customType, data: structuredClone(data) }); },
    getAllTools() { if (!started) throw new Error("SDK tools unavailable during extension load"); return [...infos]; },
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
  try {
    await fs.mkdir(path.join(cwd, "src"));
    await fs.mkdir(homeDir);
    await fs.mkdir(path.join(homeDir, "empty-hooks"));
    await fs.writeFile(path.join(cwd, "src", "parser.ts"), "export function parse(input: string): unknown { return JSON.parse(input); }\n");
    const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(homeDir, "absent-git-config"), GIT_TERMINAL_PROMPT: "0" } });
    git("init", "-q"); git("config", "user.name", "Workflow Fixture"); git("config", "user.email", "workflow@example.invalid");
    git("config", "core.hooksPath", path.join(homeDir, "empty-hooks")); git("config", "core.autocrlf", "false");
    git("add", "src/parser.ts"); git("commit", "-qm", "isolated parser review source");
    append({ type: "message", message: { role: "user", content: "Perform a read-only review of src/parser.ts for malformed-input handling. Inspect actual source and report concrete findings; do not modify implementation files." } });
    call("todo", "native-init", { op: "init", list: [{ phase: "Parser review", items: [TASK] }] });
    append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: "native-init", isError: false,
      details: { op: "init", phases: [{ name: "Parser review", tasks: [{ content: TASK, status: "in_progress" }] }] } } });
    const state = registerExtension(host, { homeDir, env: { TYPESAFE_API_KEY: "" } });
    async function emit(name: string, event: unknown = {}) {
      let result: unknown;
      const registered = handlers.get(name);
      expect(registered?.length).toBeGreaterThan(0);
      for (const handler of registered ?? []) { const next = await handler(event, context); if (next !== undefined) result = next; }
      return result;
    }
    started = true;
    await emit("session_start");
    try {
      await run({ state, emit,
        async tool(name, params) {
          const definition = tools[name];
          expect(definition, `Missing actual root pipeline tool ${name}`).toBeDefined();
          const id = `project-call-${++sequence}`;
          call(name, id, params);
          const result = await definition!.execute(id, params, undefined, undefined, context);
          append({ type: "message", message: { role: "toolResult", toolName: name, toolCallId: id, content: result.content, details: result.details, isError: result.isError } });
          return result;
        },
        async todo(id, input) {
          call("todo", id, input);
          const intercepted = await emit("tool_call", { toolName: "todo", toolCallId: id, input });
          if (intercepted !== undefined) return intercepted;
          expect(state.stagedCalls.size).toBe(0);
          expect(tools.todo).toBeDefined();
          return tools.todo!.execute(id, input, undefined, undefined, { ...context,
            async invokeTool() { throw new Error("Unreviewed task must never reach actual native execution"); },
          });
        },
      });
    } finally { await emit("session_shutdown"); }
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}

function details<T>(result: ToolResult): T {
  expect(result.details).toBeDefined();
  return result.details as T;
}

describe("Root workflow with actual task source and offline verification boundaries", () => {
  test("real native binding and source collection do not implicitly authorize completion", async () => workflow(async fixture => {
    const bound = details<ContractBindingOutcome>(await fixture.tool("typesafe_bind_task", SELECTOR));
    expect(bound.status).toBe("BOUND");
    if (bound.status !== "BOUND") throw new Error(`Genuine source binding failed: ${JSON.stringify(bound)}`);
    expect(bound.contract.target.content).toBe(TASK);
    expect(bound.contract.taskKind).toBe("review");
    expect(bound.sourceContext.authorization.kind).toBe("readonly");
    const collected = details<CollectedEvidence>(await fixture.tool("typesafe_collect_evidence", SELECTOR));
    expect(collected.status).toBe("COLLECTED");
    expect(collected.recordId).toEqual(expect.any(String));
    expect(collected.sourceManifest.map(source => source.path)).toContain("src/parser.ts");
    expect(collected.provenance?.toolName).toBe("typesafe_collect_evidence");
    expect(await fixture.todo("evidence-is-not-approval", { op: "done", ...SELECTOR })).toMatchObject({ isError: true });
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.phases).toEqual([{ name: "Parser review", tasks: [{ content: TASK, status: "in_progress" }] }]);
  }), 30_000);

  test("genuine collected evidence with unavailable semantic service remains unfinished across a normal turn", async () => workflow(async fixture => {
    const bound = details<ContractBindingOutcome>(await fixture.tool("typesafe_bind_task", SELECTOR));
    expect(bound.status).toBe("BOUND");
    const collected = details<CollectedEvidence>(await fixture.tool("typesafe_collect_evidence", SELECTOR));
    expect(collected.status).toBe("COLLECTED");
    const review = details<TaskReviewOutcome>(await fixture.tool("typesafe_review_task", SELECTOR));
    expect(review.status).toBe("UNAVAILABLE");
    await fixture.emit("turn_end");
    expect(await fixture.todo("offline-cannot-complete", { op: "done", ...SELECTOR })).toMatchObject({ isError: true });
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.committedCallTombstones.size).toBe(0);
    expect(fixture.state.phases[0]!.tasks[0]!.status).toBe("in_progress");
  }), 30_000);

  test("an agent cannot replace source criteria or pass a claimed evidence receipt through native todo", async () => workflow(async fixture => {
    await fixture.tool("typesafe_bind_task", SELECTOR);
    const collected = details<CollectedEvidence>(await fixture.tool("typesafe_collect_evidence", SELECTOR));
    expect(collected.status).toBe("COLLECTED");
    expect(await fixture.todo("forged-sealed-review", { op: "done", ...SELECTOR, requirements: ["Everything is approved"],
      verificationReceipt: { approved: true, evidenceId: collected.recordId } })).toMatchObject({ block: true, reason: expect.any(String) });
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.phases[0]!.tasks[0]!.status).toBe("in_progress");
  }), 30_000);
});
