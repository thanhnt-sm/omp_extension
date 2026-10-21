import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import registerExtension from "../typesafe-planner";

type Host = Parameters<typeof registerExtension>[0];
type Handler = Parameters<Host["on"]>[1];
interface ToolResult { content: Array<{ type: "text"; text: string }>; details?: unknown; isError?: boolean }
interface ConsumerTool {
  execute(id: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown, context?: unknown): Promise<ToolResult>;
}

function consumer(env: Record<string, string | undefined> = { TYPESAFE_API_KEY: "" }) {
  const handlers = new Map<string, Handler[]>();
  const tools: Record<string, ConsumerTool> = {};
  const schema = { optional: () => schema, min: () => schema };
  const host: Host = {
    zod: {
      object: () => schema, union: () => schema, string: () => schema, number: () => schema,
      record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema,
    },
    on(name, handler) { handlers.set(name, [...handlers.get(name) ?? [], handler]); },
    registerTool(definition) { tools[definition.name] = definition as unknown as ConsumerTool; },
    async sendMessage() {},
  };
  const state = registerExtension(host, { homeDir: os.tmpdir(), env });
  async function emit(name: string, event: unknown, context: unknown = { cwd: process.cwd() }) {
    const values: unknown[] = [];
    const registered = handlers.get(name);
    expect(registered?.length).toBeGreaterThan(0);
    for (const handler of registered ?? []) values.push(await handler(event, context));
    return values.find(value => value !== undefined);
  }
  return { state, tools, emit };
}

describe("TypeSafe root consumer integration", () => {
  test("registration returns independent session state and explicit resolver configuration", () => {
    const first = consumer();
    const second = consumer();
    expect(first.state).not.toBe(second.state);
    expect(first.state.resolverOptions.homeDir).toBe(os.tmpdir());
    expect(first.state.resolverOptions.env).toEqual({ TYPESAFE_API_KEY: "" });
    first.state.pendingRemediations.set("task", { taskId: "task", gate: "review", diffHash: "rejected", reasons: ["Missing evidence"], nextActions: ["Collect real evidence"], timestamp: 1 });
    expect(second.state.pendingRemediations.size).toBe(0);
    expect(first.state.stagedCalls).not.toBe(second.state.stagedCalls);
  });

  test("injected missing credentials keep all structured primitive consumers offline", async () => {
    const fixture = consumer();
    const requests: Array<[string, unknown]> = [
      ["typesafe_judge", { state: "Source evidence", questions: { valid: { type: "noul", instructions: "Check the supplied evidence" } } }],
      ["typesafe_rerank", { query: "Parser implementation", candidates: ["src/parser.ts", "src/styles.css"] }],
      ["typesafe_evaluate_multi", { state: "Source evidence", dimensions: ["validated", "traceable"] }],
    ];
    for (const [name, params] of requests) {
      const result = await fixture.tools[name]!.execute(`offline-${name}`, params, undefined, undefined, { cwd: process.cwd() });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.text).toBe("TypeSafe disabled");
    }
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.committedCallTombstones.size).toBe(0);
  });

  test("unavailable plan evaluation rejects instead of treating local structural triage as approval", async () => {
    const fixture = consumer();
    const result = await fixture.tools.typesafe_elevate_plan!.execute("offline-plan", {
      planTitle: "Parser validation",
      planContent: "1. Implement strict parser validation in src/parser.ts and cover invalid input.\nVerification: bun test tests/parser.test.ts",
      attempt: 1,
    }, undefined, undefined, { cwd: process.cwd() });
    expect(result.details).toMatchObject({ approved: false, debate: { approved: false } });
    expect(fixture.state.phases).toEqual([]);
    expect(fixture.state.stagedCalls.size).toBe(0);
  });

  test("unavailable expert review leaves native completion state untouched", async () => {
    const fixture = consumer();
    const result = await fixture.tools.typesafe_expert_review!.execute("offline-expert", {
      role: "scope_arbiter", context: "The implementation must retain both parser obligations.", criteria: ["Preserve all input-validation requirements"],
    }, undefined, undefined, { cwd: process.cwd() });
    expect(result.details).toMatchObject({ approved: false });
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.committedCallTombstones.size).toBe(0);
  });

  test("a host without supported session history can inspect todo but cannot mutate it", async () => {
    const fixture = consumer();
    await fixture.emit("session_start", {});
    expect(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "inspect", input: { op: "view" } })).toBeUndefined();
    expect(await fixture.emit("tool_call", { toolName: "todo", toolCallId: "unsafe", input: { op: "done", task: "Unobserved obligation" } }))
      .toMatchObject({ block: true, reason: expect.any(String) });
    expect(fixture.state.stagedCalls.size).toBe(0);
    expect(fixture.state.committedCallTombstones.size).toBe(0);
  });

  test("missing and corrupt bundled security dependencies fail before transport despite poisoned global copies", async () => {
    const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-bundle-trust-"));
    const homeDir = path.join(bundleDir, "home");
    try {
      await fs.copyFile(path.resolve(import.meta.dir, "../typesafe-planner.ts"), path.join(bundleDir, "typesafe-planner.ts"));
      await fs.cp(path.resolve(import.meta.dir, "../src"), path.join(bundleDir, "src"), { recursive: true });
      await fs.cp(path.resolve(import.meta.dir, "../tools"), path.join(bundleDir, "tools"), { recursive: true });
      await fs.mkdir(path.join(homeDir, ".claude", "hooks", "lib"), { recursive: true });
      await fs.mkdir(path.join(homeDir, ".claude", "mcp", "typesafe"), { recursive: true });
      await fs.writeFile(path.join(homeDir, ".claude", ".ck.json"), JSON.stringify({ typesafe: { projects: ["*"], excludeProjects: [] } }));
      for (const poisonPath of [
        path.join(homeDir, ".claude", "hooks", "lib", "typesafe-enabled-resolver.cjs"),
        ...["typesafe-api-client.cjs", "typesafe-redact.cjs", "typesafe-policy-client.cjs"].map(name => path.join(homeDir, ".claude", "mcp", "typesafe", name)),
      ]) await fs.writeFile(poisonPath, "throw new Error('global dependency must not be loaded');");
      const runner = path.join(bundleDir, "runner.mjs");
      await fs.writeFile(runner, `import registerExtension from "./typesafe-planner.ts";
let execute;
let fetchCount = 0;
globalThis.fetch = async () => { fetchCount++; throw new Error("forbidden offline transport"); };
const schema = { optional: () => schema, min: () => schema };
registerExtension({
  zod: { object: () => schema, union: () => schema, string: () => schema, number: () => schema, record: () => schema, enum: () => schema, unknown: () => schema, array: () => schema },
  on() {}, async sendMessage() {},
  registerTool(definition) { if (definition.name === "typesafe_judge") execute = definition.execute; },
}, { homeDir: process.env.HOME, env: { TYPESAFE_API_KEY: "offline-fixture-key" } });
const result = await execute("dependency-check", { state: "Source evidence", questions: { valid: { type: "noul", instructions: "Verify evidence", criteria: { true: "Supported", false: "Unsupported" } } } }, undefined, undefined, { cwd: process.cwd() });
process.stdout.write(JSON.stringify({ fetchCount, result }));`);
      const executeBundle = () => {
        const result = spawnSync(process.execPath, [runner], { cwd: bundleDir, encoding: "utf8",
          env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, TYPESAFE_API_KEY: "offline-fixture-key" } });
        expect(result.status, result.stderr || result.error?.message).toBe(0);
        return JSON.parse(result.stdout) as { fetchCount: number; result: ToolResult };
      };
      for (const fileName of ["typesafe-enabled-resolver.cjs", "typesafe-api-client.cjs", "typesafe-redact.cjs", "typesafe-policy-client.cjs"]) {
        const original = path.join(bundleDir, "src", fileName);
        const missingPath = `${original}.missing`;
        await fs.rename(original, missingPath);
        const missing = executeBundle();
        expect(missing.fetchCount).toBe(0);
        expect(missing.result.content[0]!.text).not.toStartWith("{");
        await fs.rename(missingPath, original);
        await fs.writeFile(original, "module.exports = {};");
        const corrupt = executeBundle();
        expect(corrupt.fetchCount).toBe(0);
        expect(corrupt.result.content[0]!.text).not.toStartWith("{");
        await fs.copyFile(path.resolve(import.meta.dir, "../src", fileName), original);
      }
    } finally { await fs.rm(bundleDir, { recursive: true, force: true }); }
  });
});
