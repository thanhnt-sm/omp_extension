import { afterEach, describe, expect, it } from "bun:test";
import defaultExport from "../src/egc.js";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { assertEgcIdentity, boundedEgcJson, boundedEgcToolResult, prepareEgcData } from "../src/egc-safety";
import { EgcNativeLedger, egcInputDigest, projectEgcNativeHistory, todoOperations } from "../src/egc-native";
import { createEgcJudge } from "../src/egc-judge";

interface MockToolSpec {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  handler?: (args: unknown, ctx: unknown) => unknown;
}

interface MockCommandSpec {
  description?: string;
  handler: (args: string, ctx: MockCommandContext) => unknown;
}

interface MockCommandContext {
  cwd: string;
  ui: {
    notify: (msg: string, level: string) => { msg: string; level: string };
  };
}

describe("EGC Extension", () => {
  it("exports an extension initialization function", () => {
    expect(typeof defaultExport).toBe("function");
  });

  it("registers tools and commands with ExtensionAPI mock", async () => {
    const registeredTools: Record<string, MockToolSpec> = {};
    const registeredCommands: Record<string, MockCommandSpec> = {};
    const eventHandlers: Record<string, Array<(...args: unknown[]) => unknown>> = {};

    const mockPi = {
      zod: {
        z: {
          object: (schema: unknown) => schema,
          string: () => ({ describe: () => ({}) }),
        },
      },
      appendEntry: (_type: string, _data: unknown) => {},
      registerTool: (spec: MockToolSpec) => {
        registeredTools[spec.name] = spec;
      },
      registerCommand: (name: string, spec: MockCommandSpec) => {
        registeredCommands[name] = spec;
      },
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      },
    };

    // Initialize extension
    defaultExport(mockPi as unknown as Parameters<typeof defaultExport>[0]);

    // Verify registration
    expect(registeredTools["egc_blocked"]).toBeDefined();
    expect(registeredCommands["egc"]).toBeDefined();
    expect(eventHandlers["tool_call"]).toBeDefined();
    expect(eventHandlers["session_stop"]).toBeDefined();

    // Verify /egc init command behavior
    const testDir = join(tmpdir(), "egc_test_" + Date.now());
    const mockCtx: MockCommandContext = {
      cwd: testDir,
      ui: {
        notify: (msg: string, level: string) => ({ msg, level }),
      },
    };

    await registeredCommands["egc"].handler("init", mockCtx);
    const egcConfigPath = join(testDir, ".omp", "egc.json");
    expect(existsSync(egcConfigPath)).toBe(true);

    const configContent = JSON.parse(readFileSync(egcConfigPath, "utf8")) as {
      uncontracted?: string;
      tasks?: Record<string, unknown>;
    };
    expect(configContent.uncontracted).toBe("defaults");
    expect(configContent.tasks?.["T1"]).toBeDefined();

    // Clean up
    rmSync(testDir, { recursive: true, force: true });
  });
});

const TASK = "[T1] Implement the public feature";
const PHASE = "Implementation";
const phaseSnapshot = (status = "in_progress", content = TASK) => [{ name: PHASE, tasks: [{ content, status }] }];
function assistantCall(id: string, input: unknown, entry = `entry-${id}`) {
  return { id: entry, type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "todo", arguments: input }] } };
}
interface NativeResult {
  toolName: string; toolCallId: string; isError: boolean;
  details: { op: string; phases: { name: string; tasks: { content: string; status: string }[] }[]; completedTasks: { phase: string; content: string }[] };
}
function nativeResult(id: string, op: string, status = "in_progress", content = TASK): NativeResult {
  return { toolName: "todo", toolCallId: id, isError: false, details: { op, phases: phaseSnapshot(status, content),
    completedTasks: status === "completed" ? [{ phase: PHASE, content }] : [] } };
}
function historyResult(result: NativeResult) {
  return { type: "message", message: { role: "toolResult", ...result } };
}
function nativeFixture() {
  const input = { op: "init", list: [{ phase: PHASE, items: [TASK] }] };
  const entries: unknown[] = [assistantCall("init-call", input), historyResult(nativeResult("init-call", "init"))];
  const ledger = new EgcNativeLedger();
  ledger.reconcile(entries);
  const task = [...ledger.debts.values()][0];
  expect(task).toBeDefined();
  return { entries, ledger, task };
}
function stageDone() {
  const fixture = nativeFixture(), input = { op: "done", task: TASK, phase: PHASE };
  fixture.task.assessment = "ready"; fixture.task.passFp = "public-evidence-fingerprint";
  fixture.entries.push(assistantCall("done-call", input));
  fixture.ledger.stage("done-call", "todo", input, [fixture.task], fixture.entries);
  return { ...fixture, input, result: nativeResult("done-call", "done", "completed") };
}

describe("EGC native lifecycle", () => {
  it("READY remains open until an exact successful native semantic result", () => {
    const { ledger, task, entries, result } = stageDone();
    expect(task.lifecycle).toBe("open");
    expect(task.assessment).toBe("ready");
    expect(ledger.commit(result, entries)).toBe(true);
    expect(task.lifecycle).toBe("completed");
    expect(task.completionCall).toBe("done-call");
    expect(ledger.commit(result, entries)).toBe(false);
  });

  it("accepts already-appended matching original native history without inventing event input", () => {
    const { ledger, task, entries, result } = stageDone();
    entries.push(historyResult(result));
    expect(ledger.commit(result, entries)).toBe(true);
    expect(task.lifecycle).toBe("completed");
  });

  it("rejects failures, wrong tool/call/input/phase/content and missing semantic effects", () => {
    const cases = [
      (result: NativeResult) => ({ ...result, isError: true }),
      (result: NativeResult) => ({ ...result, toolName: "other" }),
      (result: NativeResult) => ({ ...result, toolCallId: "wrong-call" }),
      (result: NativeResult) => ({ ...result, input: { op: "done", task: "other task" } }),
      (result: NativeResult) => ({ ...result, details: { ...result.details, op: "start" } }),
      (result: NativeResult) => ({ ...result, details: { ...result.details, completedTasks: [] } }),
      (result: NativeResult) => ({ ...result, details: { ...result.details, phases: phaseSnapshot("pending") } }),
      (result: NativeResult) => ({ ...result, details: { ...result.details, completedTasks: [{ phase: "Other", content: TASK }] } }),
      (result: NativeResult) => ({ ...result, details: { ...result.details, phases: phaseSnapshot("completed", "other task") } }),
    ];
    for (const mutate of cases) {
      const { ledger, task, entries, result } = stageDone();
      expect(ledger.commit(mutate(result), entries)).toBe(false);
      expect(task.lifecycle).toBe("open");
    }
  });

  it("does not accept event details which disagree with the real history result", () => {
    const { ledger, task, entries, result } = stageDone();
    entries.push(historyResult(nativeResult("done-call", "done", "pending")));
    expect(ledger.commit(result, entries)).toBe(false);
    expect(task.lifecycle).toBe("open");
  });

  it("requires the original assistant call and exact original arguments", () => {
    for (const missing of [true, false]) {
      const { ledger, task, entries, result } = stageDone();
      entries.pop();
      if (!missing) entries.push(assistantCall("done-call", { op: "done", task: "different" }));
      expect(ledger.commit(result, entries)).toBe(false);
      expect(task.lifecycle).toBe("open");
    }
  });

  it("revokes late native results across fork, resume and lifecycle invalidation", () => {
    for (const mode of ["revoke", "resume", "fork"]) {
      const { ledger, task, entries, result } = stageDone();
      if (mode === "revoke") ledger.revoke();
      else ledger.reconcile(mode === "fork" ? [] : entries, [...ledger.debts.values()]);
      expect(ledger.commit(result, entries)).toBe(false);
      expect(task.lifecycle).toBe("open");
    }
  });

  it("keeps rejected and blocked debt on resume/fork-after, but not fork-before creation", () => {
    const { ledger, task, entries } = nativeFixture();
    task.lifecycle = "blocked"; task.assessment = "rejected"; task.attempts = 2; task.note = "required public proof is missing";
    ledger.revoke();
    expect(task.assessment).toBe("rejected");
    ledger.reconcile(entries, [...ledger.debts.values()]);
    const resumed = [...ledger.debts.values()][0];
    expect(resumed.lifecycle).toBe("blocked");
    expect(resumed.note).toContain("public proof");
    expect(resumed.attempts).toBe(2);
    ledger.reconcile([]);
    expect(ledger.debts.size).toBe(0);
  });

  it("does not restore READY or imported/fabricated completion as authority", () => {
    const { ledger, task, entries } = nativeFixture();
    task.assessment = "ready"; task.passFp = "a favorable assessment is not completion";
    ledger.reconcile(entries, [{ ...task, lifecycle: "completed", completionCall: "invented" }]);
    expect([...ledger.debts.values()][0].lifecycle).toBe("open");
    expect([...ledger.debts.values()][0].assessment).toBe("unassessed");
  });

  it("restores genuinely committed completion only with its matching native proof", () => {
    const { ledger, entries, result } = stageDone();
    expect(ledger.commit(result, entries)).toBe(true);
    entries.push(historyResult(result));
    entries.push({ type: "custom", customType: "egc-ledger", data: { tasks: [...ledger.debts.values()] } });
    const resumed = new EgcNativeLedger();
    resumed.reconcile(entries, [...ledger.debts.values()]);
    expect([...resumed.debts.values()][0].lifecycle).toBe("completed");
  });

  it("does not use imported ledger JSON to approve a completed native task", () => {
    const { ledger, entries, result } = stageDone();
    expect(ledger.commit(result, entries)).toBe(true);
    entries.push(historyResult(result));
    const imported = new EgcNativeLedger();
    imported.reconcile(entries, [...ledger.debts.values()]);
    expect([...imported.debts.values()][0].lifecycle).toBe("open");
  });

  it("preserves old rejected debt when native removes and reappends the same text", () => {
    const { ledger, entries, task } = nativeFixture();
    task.assessment = "rejected"; task.note = "unresolved obligation";
    const remove = nativeResult("remove-call", "rm"); remove.details.phases = [{ name: PHASE, tasks: [] }];
    entries.push(assistantCall("remove-call", { op: "rm", task: TASK }), historyResult(remove));
    entries.push(assistantCall("append-call", { op: "append", phase: PHASE, items: [TASK] }), historyResult(nativeResult("append-call", "append")));
    ledger.reconcile(entries, [...ledger.debts.values()]);
    expect(ledger.debts.size).toBe(2);
    const replacement = [...ledger.debts.values()].find((item) => item.key !== task.key);
    expect(replacement?.lifecycle).toBe("open");
    expect(replacement?.assessment).toBe("unassessed");
    expect(ledger.debts.get(task.key)?.note).toBe("unresolved obligation");
  });

  it("ignores unpaired or failed native snapshots instead of importing JSON authority", () => {
    const result = nativeResult("unknown-call", "init", "completed");
    expect(projectEgcNativeHistory([historyResult(result)]).targets).toEqual([]);
    expect(egcInputDigest({ task: TASK, op: "done" })).toBe(egcInputDigest({ op: "done", task: TASK }));
  });

  it("normalizes genuine nullable assistant arguments and ignores only transport i metadata", () => {
    const input = { op: "done", task: TASK, phase: PHASE };
    const actual = { ...input, list: null, items: null, reason: null, i: "Completing the exact native obligation" };
    expect(egcInputDigest(actual)).toBe(egcInputDigest(input));
    expect(todoOperations(actual)).toEqual([input]);
    expect(egcInputDigest({ ...input, items: [] })).not.toBe(egcInputDigest(input));
    expect(egcInputDigest({ ...input, reason: "" })).not.toBe(egcInputDigest(input));
    expect(() => egcInputDigest({ ...input, op: null })).toThrow();
    expect(() => egcInputDigest({ ...input, ops: [] })).toThrow();
    expect(() => egcInputDigest({ ...input, unrelatedOverride: true })).toThrow();
    const fixture = stageDone();
    fixture.entries[fixture.entries.length - 1] = assistantCall("done-call", actual);
    expect(fixture.ledger.commit(fixture.result, fixture.entries)).toBe(true);
    expect(fixture.task.lifecycle).toBe("completed");
  });

  it("cannot stage a historical settled call for replay after regression", () => {
    const { ledger, entries, result, input, task } = stageDone();
    expect(ledger.commit(result, entries)).toBe(true);
    entries.push(historyResult(result));
    task.lifecycle = "open"; task.assessment = "ready"; task.passFp = "fresh supporting evidence";
    expect(() => ledger.stage("done-call", "todo", input, [task], entries)).toThrow("egc_stage_original_call_required");
    expect(ledger.commit(result, entries)).toBe(false);
    expect(task.lifecycle).toBe("open");
  });

  it("rejects paired results that complete or delete an unrelated obligation", () => {
    const second = "[T2] Preserve the second public obligation";
    const initial = nativeResult("two-init", "init");
    initial.details.phases[0].tasks.push({ content: second, status: "pending" });
    const baseEntries = [assistantCall("two-init", { op: "init", list: [{ phase: PHASE, items: [TASK, second] }] }), historyResult(initial)];
    for (const operation of ["start", "done"]) {
      const wrong = nativeResult(`wrong-${operation}`, operation, operation === "start" ? "in_progress" : "completed");
      if (operation === "start") wrong.details.phases[0].tasks.push({ content: second, status: "completed" });
      const entries = [...baseEntries, assistantCall(`wrong-${operation}`, { op: operation, phase: PHASE, task: TASK }), historyResult(wrong)];
      const projection = projectEgcNativeHistory(entries);
      expect(projection.targets.map((target) => [target.content, target.status])).toEqual([[TASK, "in_progress"], [second, "pending"]]);
      const ledger = new EgcNativeLedger(); ledger.reconcile(entries);
      expect([...ledger.debts.values()].every((task) => task.lifecycle === "open")).toBe(true);
      expect(ledger.debts.size).toBe(2);
    }
    const legitimate = nativeResult("real-start", "start", "in_progress");
    legitimate.details.phases[0].tasks.push({ content: second, status: "pending" });
    const accepted = projectEgcNativeHistory([...baseEntries, assistantCall("real-start", { op: "start", phase: PHASE, task: TASK }), historyResult(legitimate)]);
    expect(accepted.targets.map((target) => target.status)).toEqual(["in_progress", "pending"]);
  });
});

const initialApiKey = process.env.TYPESAFE_API_KEY;
afterEach(() => { if (initialApiKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = initialApiKey; });

describe("EGC bounded data and sink safety", () => {
  it("preserves legitimate public evidence, questions, booleans and numeric facts", () => {
    delete process.env.TYPESAFE_API_KEY;
    const input = { state: { publicEvidence: "The integration test passed with Unicode ✓", exitCode: 0, complete: false }, questions: { public_requirement: "Does the feature implement the requirement?" } };
    expect(JSON.parse(JSON.stringify(prepareEgcData(input)))).toEqual(input);
  });

  it("validates complete real native result details without treating host-envelope nesting as extra evidence depth", () => {
    const result = nativeResult("public-native-result", "done", "completed");
    expect(JSON.parse(JSON.stringify(boundedEgcToolResult(result)))).toEqual(result);
  });

  it("redacts raw and trimmed active literals in complete state, keys and questions", () => {
    process.env.TYPESAFE_API_KEY = "  bare-key  ";
    const input = { state: { ["prefix-bare-key"]: "bare-key appears twice: bare-key", error: "  bare-key  " }, questions: { public_question: "Check bare-key without disclosing it" } };
    const serialized = JSON.stringify(prepareEgcData(input));
    expect(serialized).not.toContain("bare-key");
    expect(serialized).toContain("public_question");
  });

  it("rejects sensitive authoritative question/task IDs rather than renaming them", () => {
    process.env.TYPESAFE_API_KEY = "bare-key";
    expect(() => prepareEgcData({ state: "public", questions: { ["question-bare-key"]: "public" } })).toThrow("egc_sensitive_identity");
    expect(() => assertEgcIdentity("[T1] bare-key")).toThrow("egc_sensitive_identity");
  });

  it("rejects sanitized key collisions and escaped residual active literals", () => {
    process.env.TYPESAFE_API_KEY = "bare-key";
    expect(() => prepareEgcData({ state: { ["bare-key"]: 1, ["[REDACTED:api-key]"]: 2 } })).toThrow("egc_key_collision");
    const escaped = [..."bare-key"].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
    expect(() => prepareEgcData({ state: escaped })).toThrow("egc_residual_secret");
  });

  it("rejects getters and toJSON before invoking them", () => {
    let calls = 0;
    const getter = Object.defineProperty({}, "value", { enumerable: true, get() { calls++; return "private"; } });
    const serializer = { toJSON() { calls++; return "private"; } };
    expect(() => boundedEgcJson(getter)).toThrow("egc_accessor");
    expect(() => boundedEgcJson(serializer)).toThrow("egc_unsupported_property");
    expect(calls).toBe(0);
  });

  it("bounds depth, nodes, strings and aggregate; rejects cycles and unsupported values", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    const invalid: unknown[] = [cycle, { a: { b: { c: { d: { e: { f: 1 } } } } } }, Array.from({ length: 2001 }, () => 0), "x".repeat(32769), Array.from({ length: 5 }, () => "x".repeat(30000)), Infinity, NaN, undefined, BigInt(1), () => 1, new Date(), new Map(), new Uint8Array(1), Array(5)];
    for (const input of invalid) expect(() => boundedEgcJson(input)).toThrow();
    expect(boundedEgcJson({ a: { b: { c: { d: { e: "public" } } } } })).toBeDefined();
  });

  it("canonical bounded judge transport sends no host calls for rejected unknown input", async () => {
    delete process.env.TYPESAFE_API_KEY;
    let hostCalls = 0;
    const context = { judge: async () => { hostCalls++; return { answers: { q: { noul: 0.9 } } }; } };
    const judge = createEgcJudge(), cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const state of [cycle, "x".repeat(32769), { a: { b: { c: { d: { e: { f: "forbidden" } } } } } }]) {
      expect((await judge(context, state, { q: "public question" })).kind).toBe("UNAVAILABLE");
    }
    expect(hostCalls).toBe(0);
  });

  it("canonical bounded judge transport preserves real public evidence and canonical noul only", async () => {
    delete process.env.TYPESAFE_API_KEY;
    let calls = 0, captured: unknown;
    const judge = createEgcJudge();
    const result = await judge({ judge: async (args) => { calls++; captured = args; return { answers: { q: { noul: 0.9 } } }; } },
      { publicEvidence: "real implementation and passing tests" }, { q: "Does the evidence establish the public requirement?" });
    expect(result).toEqual({ kind: "ASSESSED", probabilities: { q: 0.9 } });
    expect(calls).toBe(1);
    expect(JSON.stringify(captured)).toContain("real implementation and passing tests");
    const missing = await judge({ judge: async () => ({ answers: { q: { probability: 0.9, confidence: 1 } } }) }, "public", { q: "public?" });
    expect(missing.kind).toBe("UNAVAILABLE");
  });

  it("canonical bounded judge transport rejects counts and body overflow without trimming or host dispatch", async () => {
    delete process.env.TYPESAFE_API_KEY;
    const judge = createEgcJudge(); let calls = 0;
    const context = { judge: async () => { calls++; return { answers: {} }; } };
    const questions = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`q${index}`, "public?"]));
    const tooMany = await judge(context, "public", questions);
    expect(tooMany).toEqual({ kind: "UNAVAILABLE", code: "question_limit_exceeded" });
    const tooLarge = await judge(context, { diff: "public-line\\n".repeat(2500) }, { q: "public?".repeat(1000) });
    expect(tooLarge.kind).toBe("UNAVAILABLE");
    expect(calls).toBe(0);
  });

  it("fails closed before host dispatch when the bundled redactor or serializer fails", async () => {
    delete process.env.TYPESAFE_API_KEY;
    const patterns = createRequire(import.meta.url)("../src/typesafe-redact-patterns.cjs") as { redactString: (value: string, options?: unknown) => string };
    const originalRedactor = patterns.redactString, originalSerializer = JSON.stringify;
    const judge = createEgcJudge(); let calls = 0;
    const context = { judge: async () => { calls++; return { answers: { q: { noul: 0.9 } } }; } };
    try {
      patterns.redactString = () => { throw new Error("private exception must not escape"); };
      expect((await judge(context, { publicEvidence: "real evidence" }, { q: "public?" })).kind).toBe("UNAVAILABLE");
      patterns.redactString = originalRedactor;
      JSON.stringify = () => { throw new Error("private serialization exception must not escape"); };
      const result = await judge(context, { publicEvidence: "real evidence" }, { q: "public?" });
      JSON.stringify = originalSerializer;
      expect(result).toEqual({ kind: "UNAVAILABLE", code: "egc_redaction_failed" });
      expect(calls).toBe(0);
    } finally { patterns.redactString = originalRedactor; JSON.stringify = originalSerializer; }
  });
});

describe("EGC canonical HTTP boundary", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("redacts complete outgoing evidence/questions, keeps public evidence and dispatches once", async () => {
    process.env.TYPESAFE_API_KEY = "  bare-key  ";
    const bodies: string[] = [];
    globalThis.fetch = async (_url, options) => {
      bodies.push(String(options?.body));
      return Response.json({ answers: { q: { noul: 0.9 } } });
    };
    const result = await createEgcJudge()({}, { ["evidence-bare-key"]: "public implementation proof; bare-key bare-key" }, { q: "Does bare-key demonstrate public implementation?" });
    expect(result.kind).toBe("ASSESSED");
    expect(bodies.length).toBe(1);
    expect(bodies[0]).not.toContain("bare-key");
    expect(bodies[0]).toContain("public implementation proof");
  });

  it("does not retain a separate any-5xx retry owner", async () => {
    process.env.TYPESAFE_API_KEY = "fixture-key";
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("server unavailable", { status: 500 }); };
    expect((await createEgcJudge()({}, { publicEvidence: "actual product diff" }, { q: "public requirement?" })).kind).toBe("UNAVAILABLE");
    expect(calls).toBe(1);
  });

  it("rejects authoritative IDs, collision, escaped residual and oversized proof before HTTP or host", async () => {
    process.env.TYPESAFE_API_KEY = "bare-key";
    let fetchCalls = 0, hostCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; return Response.json({ answers: { q: { noul: 0.9 } } }); };
    const context = { judge: async () => { hostCalls++; return { answers: { q: { noul: 0.9 } } }; } };
    const judge = createEgcJudge();
    expect((await judge(context, "public", { ["id-bare-key"]: "public?" })).kind).toBe("UNAVAILABLE");
    expect((await judge(context, { ["bare-key"]: "x", ["[REDACTED:api-key]"]: "y" }, { q: "public?" })).kind).toBe("UNAVAILABLE");
    const escaped = [..."bare-key"].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
    expect((await judge(context, { evidence: escaped }, { q: "public?" })).kind).toBe("UNAVAILABLE");
    expect((await judge(context, { evidence: "public ".repeat(5000) }, { q: "public?" })).kind).toBe("UNAVAILABLE");
    expect(fetchCalls).toBe(0);
    expect(hostCalls).toBe(0);
  });
});

describe("EGC registered callback sink guards", () => {
  it("rejects unsafe native and blocker inputs with zero append/UI calls and keeps planner ownership", async () => {
    const root = mkdtempSync(join(tmpdir(), "egc-callback-"));
    const environment = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    const handlers: Record<string, (event: unknown, ctx: unknown) => unknown> = {};
    const tools: Record<string, { execute: (id: string, args: unknown, signal: unknown, update: unknown, ctx: unknown) => Promise<unknown> }> = {};
    let appendCalls = 0, notifyCalls = 0, getterCalls = 0;
    const appends: unknown[] = [], notifications: string[] = [];
    try {
      process.env.HOME = root; process.env.USERPROFILE = root; process.env.TYPESAFE_API_KEY = "bare-key";
      mkdirSync(join(root, ".omp"));
      writeFileSync(join(root, ".omp", "egc.json"), JSON.stringify({ mode: "enforce", jev: { mode: "off" }, tasks: { T1: { verify: ["npm test"], planFiles: ["src/public.ts"], requirements: ["public feature"] } } }));
      const host = {
        zod: { z: { object: (shape: unknown) => shape, string: () => ({ describe: () => ({}) }) } },
        on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => { handlers[name] = handler; },
        registerTool: (tool: { name: string; execute: (id: string, args: unknown, signal: unknown, update: unknown, ctx: unknown) => Promise<unknown> }) => { tools[tool.name] = tool; },
        registerCommand: () => {}, appendEntry: (_kind: string, data: unknown) => { appendCalls++; appends.push(data); },
      };
      defaultExport(host as unknown as Parameters<typeof defaultExport>[0]);
      const fixture = nativeFixture(), ctx = { cwd: root, sessionManager: { getBranch: () => fixture.entries }, ui: { notify: (message: string) => { notifyCalls++; notifications.push(message); } } };
      await handlers.session_start({}, ctx);
      appendCalls = 0; notifyCalls = 0; notifications.length = 0;
      fixture.entries.push(assistantCall("recover-original", { op: "done", phase: PHASE, task: TASK }));
      const recovered = await handlers.tool_call({ toolName: "todo", toolCallId: "recover-original" }, ctx);
      expect(recovered).toMatchObject({ block: true });
      expect(JSON.stringify(recovered)).toContain("contract approval required");
      const absent = await handlers.tool_call({ toolName: "todo", toolCallId: "absent-original" }, ctx);
      expect(absent).toMatchObject({ block: true });
      expect(JSON.stringify(absent)).toContain("UNAVAILABLE");
      const getter = Object.defineProperty({}, "task", { enumerable: true, get() { getterCalls++; return "bare-key"; } });
      const resultGetter = Object.defineProperty({}, "toolName", { enumerable: true, get() { getterCalls++; throw new Error("must not invoke result getter"); } });
      const detailGetter = Object.defineProperty({}, "phases", { enumerable: true, get() { getterCalls++; throw new Error("must not invoke details getter"); } });
      await handlers.tool_result(resultGetter, ctx);
      await handlers.tool_result({ toolName: "todo", toolCallId: "unsafe-result", isError: false, details: detailGetter }, ctx);
      const result = await handlers.tool_call({ toolName: "todo", toolCallId: "bad-input", input: getter }, ctx);
      expect(result).toMatchObject({ block: true });
      const identity = await handlers.tool_call({ toolName: "todo", toolCallId: "bad-id", input: { op: "done", task: "bare-key", egcApproved: true } }, ctx);
      expect(identity).toMatchObject({ block: true });
      await tools.egc_blocked.execute("block", { task: TASK, reason: getter, tried: "public" }, undefined, undefined, ctx);
      expect(appendCalls).toBe(0);
      expect(notifyCalls).toBe(0);
      expect(getterCalls).toBe(0);
      await tools.egc_blocked.execute("valid-blocker", { task: TASK, reason: "public blocker with bare-key", tried: "public verification attempt" }, undefined, undefined, ctx);
      expect(appendCalls).toBe(1);
      expect(notifyCalls).toBe(1);
      expect(JSON.stringify(appends)).not.toContain("bare-key");
      expect(notifications.join("")).not.toContain("bare-key");
      expect(JSON.stringify(appends)).toContain(TASK);
      expect(JSON.stringify(appends)).toContain("public blocker");
      expect(JSON.stringify(appends)).toContain('"lifecycle":"blocked"');
    } finally {
      for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("RT#4, RT#5, RT#14, RT#15: screens unsandboxed todo inputs, enforces allow-mode falsifiability, refuses oversized/missing evidence, and rejects ambiguous done targets", async () => {
    const root = mkdtempSync(join(tmpdir(), "egc-rt-phase3-"));
    const environment = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    const handlers: Record<string, (event: unknown, ctx: unknown) => unknown> = {};
    const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<unknown> }> = {};
    const appends: Array<{ kind: string; data: unknown }> = [];
    try {
      process.env.HOME = root; process.env.USERPROFILE = root; delete process.env.TYPESAFE_API_KEY;
      execSync("git init && git config user.name Test && git config user.email test@example.com", { cwd: root, stdio: "ignore" });
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "public.ts"), "export const v = 1;\n");
      execSync("git add . && git commit -qm init", { cwd: root, stdio: "ignore" });

      const host = {
        zod: { z: { object: (shape: unknown) => shape, string: () => ({ describe: () => ({}) }) } },
        on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => { handlers[name] = handler; },
        registerTool: () => {},
        registerCommand: (name: string, spec: { handler: (args: string, ctx: unknown) => Promise<unknown> }) => { commands[name] = spec; },
        appendEntry: (kind: string, data: unknown) => { appends.push({ kind, data }); },
      };
      defaultExport(host as unknown as Parameters<typeof defaultExport>[0]);

      const task2 = "[T2] Second obligation";
      const uncontractedTask = "[U1] Fix egc.ts lint";
      const initInput = { op: "init", list: [{ phase: PHASE, items: [TASK, task2, uncontractedTask] }] };
      const initRes: NativeResult = {
        toolName: "todo", toolCallId: "init-call", isError: false,
        details: {
          op: "init",
          phases: [{ name: PHASE, tasks: [{ content: TASK, status: "in_progress" }, { content: task2, status: "pending" }, { content: uncontractedTask, status: "pending" }] }],
          completedTasks: [],
        },
      };
      const entries: unknown[] = [assistantCall("init-call", initInput), historyResult(initRes)];
      let judgeCalls = 0;
      const ctx = {
        cwd: root,
        sessionManager: { getBranch: () => entries },
        ui: { notify: () => {} },
        judge: async () => {
          judgeCalls++;
          return { answers: { stub: { noul: 0.05 }, tamper: { noul: 0.05 }, impl_r1: { noul: 0.95 } } };
        },
      };

      const loadAndLock = async (contractObj: Record<string, unknown>) => {
        mkdirSync(join(root, ".omp"), { recursive: true });
        writeFileSync(join(root, ".omp", "egc.json"), JSON.stringify(contractObj));
        await handlers.session_start({}, ctx);
        await commands.egc.handler("lock", ctx);
      };

      // 1. RT#4: todo tool_call with "unsandboxed": true is blocked; task text "Fix egc.ts lint" is not blocked by the screen.
      await loadAndLock({
        mode: "enforce", isolation: "inplace", uncontracted: "allow",
        jev: { mode: "off" },
        tasks: { T1: { verify: [`"${process.execPath}" -e "process.exit(0)"`], planFiles: ["src/public.ts"], requirements: ["r"] } },
      });
      const unsandboxedBlocked = await handlers.tool_call({
        toolName: "todo", toolCallId: "unsandboxed-call",
        input: { op: "view", unsandboxed: true },
      }, ctx);
      expect(unsandboxedBlocked).toEqual({
        block: true,
        reason: "EGC: protected configuration or unsandboxed operation denied.",
      });
      const startEgcText = { op: "start", phase: PHASE, task: uncontractedTask };
      entries.push(assistantCall("start-egc-text", startEgcText));
      const egcTextRes = await handlers.tool_call({
        toolName: "todo", toolCallId: "start-egc-text", input: startEgcText,
      }, ctx);
      expect(egcTextRes).toBeUndefined();

      // 2. RT#5: uncontracted:"allow" with no verify/holdout and jev.mode unset -> EGC REFUSED containing "No verification command".
      writeFileSync(join(root, "src", "public.ts"), "export const v = 2;\n");
      await loadAndLock({
        mode: "enforce", isolation: "inplace", uncontracted: "allow",
      });
      const doneUncontracted1 = { op: "done", phase: PHASE, task: uncontractedTask };
      entries.push(assistantCall("done-u1-1", doneUncontracted1));
      const refusedAllow = await handlers.tool_call({
        toolName: "todo", toolCallId: "done-u1-1", input: doneUncontracted1,
      }, ctx) as { block?: boolean; reason?: string };
      expect(refusedAllow?.block).toBe(true);
      expect(refusedAllow?.reason).toContain("EGC REFUSED");
      expect(refusedAllow?.reason).toContain("No verification command");

      // With jev.mode:"enforce" and defaults.requirements:["r"] -> no such refusal line (judge path runs).
      await loadAndLock({
        mode: "enforce", isolation: "inplace", uncontracted: "allow",
        jev: { mode: "enforce" },
        defaults: { requirements: ["r"] },
      });
      judgeCalls = 0;
      const doneUncontracted2 = { op: "done", phase: PHASE, task: uncontractedTask };
      entries.push(assistantCall("done-u1-2", doneUncontracted2));
      const allowedWithJev = await handlers.tool_call({
        toolName: "todo", toolCallId: "done-u1-2", input: doneUncontracted2,
      }, ctx) as { block?: boolean; reason?: string } | undefined;
      expect(JSON.stringify(allowedWithJev ?? {})).not.toContain("No verification command");
      expect(judgeCalls).toBe(1);
      expect(allowedWithJev).toBeUndefined();

      // 3. RT#14: oversized planFiles entry, missing planFiles entry, and oversized untracked changed file -> EGC REFUSED: EVIDENCE_REQUIRED: FILE_TOO_LARGE|FILE_MISSING with assessment === "rejected".
      const lastLedgerTask = (content: string) => {
        const ledgerEntries = appends.filter((a) => a.kind === "egc-ledger");
        const latest = ledgerEntries[ledgerEntries.length - 1]?.data as { tasks?: Array<{ content: string; assessment: string }> } | undefined;
        return latest?.tasks?.find((t) => t.content === content);
      };

      // (a) planFiles entry > 131072 bytes (in-place mode so prepare() doesn't read it before gate() line 189)
      writeFileSync(join(root, "src", "public.ts"), "x".repeat(131073));
      await loadAndLock({
        mode: "enforce", isolation: "inplace",
        jev: { mode: "off" },
        tasks: { T1: { verify: [`"${process.execPath}" -e "process.exit(0)"`], planFiles: ["src/public.ts"], requirements: ["r"] } },
      });
      const doneT1Oversized = { op: "done", phase: PHASE, task: TASK };
      entries.push(assistantCall("done-t1-oversized", doneT1Oversized));
      const oversizedPlanRes = await handlers.tool_call({
        toolName: "todo", toolCallId: "done-t1-oversized", input: doneT1Oversized,
      }, ctx) as { block?: boolean; reason?: string };
      expect(oversizedPlanRes?.block).toBe(true);
      expect(oversizedPlanRes?.reason).toMatch(/EGC REFUSED: EVIDENCE_REQUIRED: FILE_TOO_LARGE src\/public\.ts/);
      expect(oversizedPlanRes?.reason).not.toContain("EGC UNAVAILABLE");
      expect(lastLedgerTask(TASK)?.assessment).toBe("rejected");

      // (b) missing planFiles entry
      writeFileSync(join(root, "src", "public.ts"), "export const v = 3;\n");
      await loadAndLock({
        mode: "enforce", isolation: "inplace",
        jev: { mode: "off" },
        tasks: { T1: { verify: [`"${process.execPath}" -e "process.exit(0)"`], planFiles: ["src/missing-plan.ts"], requirements: ["r"] } },
      });
      const doneT1Missing = { op: "done", phase: PHASE, task: TASK };
      entries.push(assistantCall("done-t1-missing", doneT1Missing));
      const missingPlanRes = await handlers.tool_call({
        toolName: "todo", toolCallId: "done-t1-missing", input: doneT1Missing,
      }, ctx) as { block?: boolean; reason?: string };
      expect(missingPlanRes?.block).toBe(true);
      expect(missingPlanRes?.reason).toMatch(/EGC REFUSED: EVIDENCE_REQUIRED: FILE_MISSING src\/missing-plan\.ts/);
      expect(missingPlanRes?.reason).not.toContain("EGC UNAVAILABLE");
      expect(lastLedgerTask(TASK)?.assessment).toBe("rejected");

      // (c) oversized untracked changed file
      writeFileSync(join(root, "src", "untracked-oversized.ts"), "y".repeat(131073));
      await loadAndLock({
        mode: "enforce", isolation: "inplace",
        jev: { mode: "off" },
        tasks: { T1: { verify: [`"${process.execPath}" -e "process.exit(0)"`], planFiles: ["src/public.ts"], requirements: ["r"] } },
      });
      const doneT1Untracked = { op: "done", phase: PHASE, task: TASK };
      entries.push(assistantCall("done-t1-untracked", doneT1Untracked));
      const untrackedOversizedRes = await handlers.tool_call({
        toolName: "todo", toolCallId: "done-t1-untracked", input: doneT1Untracked,
      }, ctx) as { block?: boolean; reason?: string };
      expect(untrackedOversizedRes?.block).toBe(true);
      expect(untrackedOversizedRes?.reason).toMatch(/EGC REFUSED: EVIDENCE_REQUIRED: FILE_TOO_LARGE src\/untracked-oversized\.ts/);
      expect(untrackedOversizedRes?.reason).not.toContain("EGC UNAVAILABLE");
      expect(lastLedgerTask(TASK)?.assessment).toBe("rejected");
      rmSync(join(root, "src", "untracked-oversized.ts"), { force: true });

      // 4. RT#15: done operation resolving to more than one target -> ambiguous completion target and nothing staged.
      const ambiguousDone = { op: "done", phase: PHASE };
      entries.push(assistantCall("done-ambiguous", ambiguousDone));
      const ambiguousRes = await handlers.tool_call({
        toolName: "todo", toolCallId: "done-ambiguous", input: ambiguousDone,
      }, ctx) as { block?: boolean; reason?: string };
      expect(ambiguousRes).toEqual({
        block: true,
        reason: "EGC: ambiguous completion target; specify exact phase and task content.",
      });
    } finally {
      for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
