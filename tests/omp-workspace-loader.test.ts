import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import loaderDefault, { READ_ONLY_TOOL_ALLOWLIST, createWorkspaceLoader, degradedToolDecision } from "../tools/omp-workspace-loader";

type Handler = (event: unknown, ctx?: unknown) => unknown;

function fakePi() {
  const handlers: Record<string, Handler[]> = {};
  const sent: Array<Record<string, unknown>> = [];
  const recorded: unknown[] = [];
  const pi = {
    on: (event: string, handler: Handler) => { if (typeof handler === "function") (handlers[event] ??= []).push(handler); },
    sendMessage: (message: Record<string, unknown>) => { sent.push(message); },
    record: (value: unknown) => { recorded.push(value); },
  };
  return { pi, handlers, sent, recorded };
}

const scratch = mkdtempSync(join(tmpdir(), "omp-workspace-loader-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
function writeEntry(name: string, source: string): string {
  const file = join(scratch, name);
  writeFileSync(file, source, "utf8");
  return file;
}

/** Runs every registered tool_call handler; returns the first non-undefined result (a block), like the host does. */
async function callTool(handlers: Record<string, Handler[]>, toolName: unknown, input: unknown = {}) {
  const results = [];
  for (const handler of handlers.tool_call ?? []) results.push(await handler({ toolName, toolCallId: "t", input }));
  return results.find((result) => result !== undefined) as { block?: boolean; reason?: string } | undefined;
}

const MUTATING_AND_UNKNOWN = ["bash", "write", "edit", "patch", "ast_edit", "apply_patch", "notebook_edit", "todo", "task", "eval", "browser", "lsp", "ls", "mcp__x_delete", "typesafe_review_task", "", "READ", "read ", "unknown_future_tool"];
const LOCAL_INPUT: Record<string, unknown> = {
  read: { path: "src/a.ts" }, grep: { pattern: "https://example.com", path: "src" }, glob: { path: "src/**/*.ts" }, find: { query: "where is x" }, ast_grep: { pat: "foo($A)", path: "src" },
};

const BROKEN_ENTRIES: Array<[string, () => string]> = [
  ["missing file", () => join(scratch, "does-not-exist.ts")],
  ["syntax error", () => writeEntry("syntax-error.ts", "export default function ( {{{\n")],
  ["import throws at module load", () => writeEntry("throws-at-load.ts", "throw new Error('boom at load');\nexport default () => {};\n")],
  ["no default export", () => writeEntry("no-default.ts", "export const value = 1;\n")],
  ["default export is not a function", () => writeEntry("default-not-function.ts", "export default { not: 'a function' };\n")],
  ["factory throws", () => writeEntry("factory-throws.ts", "export default function () { throw new Error('factory exploded'); }\n")],
  ["async factory rejects", () => writeEntry("factory-rejects.ts", "export default async function () { throw new Error('async exploded'); }\n")],
  ["imports fine but registers nothing", () => writeEntry("registers-nothing.ts", "export default function () {}\n")],
  ["registers only non-gate handlers", () => writeEntry("registers-session-only.ts", "export default function (pi: any) { pi.on('session_start', () => undefined); pi.on('input', () => undefined); }\n")],
  ["registers a gate, then throws (partial registration)", () => writeEntry("partial-then-throws.ts", "export default function (pi: any) { pi.on('tool_call', () => undefined); throw new Error('half registered'); }\n")],
  ["async: registers a gate, then rejects", () => writeEntry("partial-then-rejects.ts", "export default async function (pi: any) { pi.on('tool_call', () => undefined); await Promise.resolve(); throw new Error('half registered async'); }\n")],
];

describe("omp workspace loader: unusable entry fails closed", () => {
  for (const [label, makeEntry] of BROKEN_ENTRIES) {
    it(`blocks mutating and unknown tools but allows local read-only tools (${label})`, async () => {
      const { pi, handlers } = fakePi();
      await createWorkspaceLoader(makeEntry())(pi);
      for (const tool of MUTATING_AND_UNKNOWN) {
        const result = await callTool(handlers, tool, { path: "src/a.ts" });
        expect(result?.block, `tool ${JSON.stringify(tool)} must be blocked`).toBe(true);
        expect(result?.reason).toContain("workspace gate is not active");
        expect(result?.reason).toContain("omp-target-gate-overlay.yml");
      }
      for (const tool of READ_ONLY_TOOL_ALLOWLIST) expect(await callTool(handlers, tool, LOCAL_INPUT[tool]), tool).toBeUndefined();
    });
  }

  it("a partially registered gate that allows everything cannot weaken degraded mode", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(writeEntry("partial-allows-all.ts", "export default function (pi: any) { pi.on('tool_call', () => undefined); throw new Error('x'); }\n"))(pi);
    expect(handlers.tool_call).toHaveLength(2);
    expect((await callTool(handlers, "bash", { command: "rm -rf /" }))?.block).toBe(true);
  });

  it("names the no-registration case in the reason", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(writeEntry("none-reason.ts", "export default function () {}\n"))(pi);
    expect((await callTool(handlers, "write", { path: "x" }))?.reason).toContain("registered no tool_call gate");
  });

  it("read cannot fetch URLs in degraded mode: any scheme, skill://, and malformed input are blocked", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(join(scratch, "does-not-exist.ts"))(pi);
    for (const target of ["https://example.com/a", "http://localhost:8080/x", "skill://anything", "ssh://host/etc/passwd", "omp://docs/x.md", "file:///C:/Windows/win.ini", "src/a.ts;https://example.com", "HTTPS://EXAMPLE.COM"]) {
      expect((await callTool(handlers, "read", { path: target }))?.block, target).toBe(true);
    }
    for (const input of [undefined, null, {}, [], "src/a.ts", { path: 7 }, { path: ["a"] }, { path: null }, { paths: ["a"] }]) {
      expect((await callTool(handlers, "read", input))?.block, JSON.stringify(input)).toBe(true);
    }
    expect(await callTool(handlers, "read", { path: "src/a.ts:10-20" })).toBeUndefined();
    expect(await callTool(handlers, "read", { path: "C:\\Users\\me\\a.txt" })).toBeUndefined();
  });

  it("other read-only tools also refuse URLs in path/paths and malformed paths, but may omit path", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(join(scratch, "does-not-exist.ts"))(pi);
    expect((await callTool(handlers, "grep", { pattern: "x", path: "https://example.com/a" }))?.block).toBe(true);
    expect((await callTool(handlers, "ast_grep", { pat: "x", path: "skill://s" }))?.block).toBe(true);
    expect((await callTool(handlers, "glob", { paths: ["src", "https://e.com"] }))?.block).toBe(true);
    expect((await callTool(handlers, "glob", { paths: "src" }))?.block).toBe(true);
    expect((await callTool(handlers, "grep", { pattern: "x", path: 5 }))?.block).toBe(true);
    expect((await callTool(handlers, "grep", "not-an-object"))?.block).toBe(true);
    expect(await callTool(handlers, "grep", { pattern: "https://in-pattern-is-fine" })).toBeUndefined();
  });

  it("read-only tools cannot reach network shares in degraded mode: UNC paths (both slash forms) are blocked in path and paths", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(join(scratch, "does-not-exist.ts"))(pi);
    for (const target of ["\\\\host\\share\\a.txt", "//host/share/a.txt", "\\\\?\\UNC\\host\\share\\a", "\\\\.\\pipe\\x", "//127.0.0.1/c$/a", "\\\\host"]) {
      expect((await callTool(handlers, "read", { path: target }))?.block, target).toBe(true);
      expect((await callTool(handlers, "grep", { pattern: "x", path: target }))?.block, target).toBe(true);
      expect((await callTool(handlers, "glob", { paths: ["src", target] }))?.block, target).toBe(true);
    }
    // Local forms with slashes still pass: absolute posix, drive letters, single leading slash, UNC-looking text in the middle.
    for (const target of ["/usr/local/a.txt", "C:/Users/me/a.txt", "C:\\Users\\me\\a.txt", "src//a.ts", "src/a.ts"]) {
      expect(await callTool(handlers, "read", { path: target }), target).toBeUndefined();
    }
  });

  it("blocks malformed tool_call events instead of failing open", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(join(scratch, "does-not-exist.ts"))(pi);
    const handler = handlers.tool_call[0];
    for (const event of [undefined, null, {}, { toolName: 42 }, { toolName: ["read"] }, "read"]) {
      expect((await handler(event) as { block?: boolean }).block).toBe(true);
    }
  });

  it("includes the failure cause in the block reason and surfaces it at session_start", async () => {
    const { pi, handlers, sent } = fakePi();
    await createWorkspaceLoader(writeEntry("cause.ts", "export default () => { throw new Error('distinctive-cause-123'); };\n"))(pi);
    const blocked = await callTool(handlers, "bash") as { reason: string };
    expect(blocked.reason).toContain("distinctive-cause-123");
    const notices: Array<[string, string]> = [];
    await handlers.session_start[0]({}, { ui: { notify: (message: string, kind: string) => { notices.push([message, kind]); } } });
    expect(notices).toHaveLength(1);
    expect(notices[0][1]).toBe("error");
    expect(notices[0][0]).toContain("distinctive-cause-123");
    expect(sent).toHaveLength(1);
    expect(sent[0].customType).toBe("typesafe-workspace-loader-error");
    expect(sent[0].display).toBe(true);
  });

  it("session_start surfacing never throws when ui or sendMessage fail", async () => {
    const handlers: Record<string, Handler[]> = {};
    const pi = {
      on: (event: string, handler: Handler) => { (handlers[event] ??= []).push(handler); },
      sendMessage: () => { throw new Error("host rejected message"); },
    };
    await createWorkspaceLoader(join(scratch, "does-not-exist.ts"))(pi);
    await handlers.session_start[0]({}, { ui: { notify: () => { throw new Error("ui down"); } } });
    await handlers.session_start[0]({}, undefined);
  });
});

describe("omp workspace loader: usable entry", () => {
  it("calls the entry factory with a host that forwards every member to the real one, and adds no blocking handler", async () => {
    const entry = writeEntry("good.ts", [
      "export default function (pi: any) {",
      "  pi.record(import.meta.url);",
      "  pi.record(typeof pi.sendMessage);",
      "  pi.on('tool_call', () => undefined);",
      "  pi.on('session_start', () => undefined);",
      "}",
    ].join("\n"));
    const { pi, handlers, recorded } = fakePi();
    await createWorkspaceLoader(entry)(pi);
    expect(recorded[1]).toBe("function");
    expect(handlers.tool_call).toHaveLength(1);
    expect(handlers.session_start).toHaveLength(1);
    expect(await callTool(handlers, "bash", { command: "ls" })).toBeUndefined();
  });

  it("imports through a computed file URL with no query: the loaded instance sees a query-free import.meta.url", async () => {
    const entry = writeEntry("origin.ts", "export default function (pi: any) { pi.record(import.meta.url); pi.on('tool_call', () => undefined); }\n");
    const { pi, recorded } = fakePi();
    await createWorkspaceLoader(entry)(pi);
    expect(recorded).toEqual([pathToFileURL(entry).href]);
    expect(String(recorded[0])).not.toMatch(/[?#]/);
  });

  it("hands the importer exactly the entry's file URL: no query, no hash (a tagged URL breaks relative requires)", async () => {
    const entry = writeEntry("specifier.ts", "export default function (pi: any) { pi.on('tool_call', () => undefined); }\n");
    const seen: string[] = [];
    await createWorkspaceLoader(entry, async specifier => { seen.push(specifier); return import(specifier); })(fakePi().pi);
    expect(seen).toEqual([pathToFileURL(entry).href]);
    expect(seen[0]).not.toMatch(/[?#]/);
  });

  it("awaits an async entry factory so its gate is registered before the loader resolves", async () => {
    const entry = writeEntry("good-async.ts", [
      "export default async function (pi: any) {",
      "  await new Promise(resolve => setTimeout(resolve, 20));",
      "  pi.on('tool_call', () => undefined);",
      "}",
    ].join("\n"));
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(entry)(pi);
    expect(handlers.tool_call).toHaveLength(1);
  });
});

describe("omp workspace loader: only a successful tool_call registration counts as a gate", () => {
  const swallowing = (source: string) => writeEntry(`swallow-${Math.random().toString(36).slice(2)}.ts`, source);

  it("a host whose `on` throws for tool_call does not count, even if the entry swallows the error", async () => {
    const { pi, handlers } = fakePi();
    const realOn = pi.on;
    let rejected = false; // only the entry's registration is rejected; the loader's own degraded gate must still register
    pi.on = ((event: string, handler: Handler) => { if (event === "tool_call" && !rejected) { rejected = true; throw new Error("host rejected tool_call"); } realOn(event, handler); }) as typeof pi.on;
    const entry = swallowing("export default function (pi: any) { try { pi.on('tool_call', () => undefined); } catch { /* swallowed */ } }\n");
    await createWorkspaceLoader(entry)(pi);
    expect((await callTool(handlers, "bash", { command: "ls" }))?.block).toBe(true);
    expect((await callTool(handlers, "bash", { command: "ls" }))?.reason).toContain("registered no tool_call gate");
  });

  it("a non-function tool_call handler does not count as a gate", async () => {
    for (const handlerSource of ["undefined", "null", "'not a function'", "{ handle() {} }"]) {
      const { pi, handlers } = fakePi();
      const entry = swallowing(`export default function (pi: any) { try { pi.on('tool_call', ${handlerSource}); } catch { /* host may reject */ } }\n`);
      await createWorkspaceLoader(entry)(pi);
      expect((await callTool(handlers, "bash", { command: "ls" }))?.block, handlerSource).toBe(true);
    }
  });

  it("a function handler registered successfully still counts (the loader stays out of the way)", async () => {
    const { pi, handlers } = fakePi();
    await createWorkspaceLoader(swallowing("export default function (pi: any) { pi.on('tool_call', () => undefined); }\n"))(pi);
    expect(await callTool(handlers, "bash", { command: "ls" })).toBeUndefined();
  });
});

describe("omp workspace loader: default export loads the workspace planner", () => {
  it("emits a runtime-origin proof for THIS workspace's typesafe-planner.ts, without a query, and registers a gate", async () => {
    const home = mkdtempSync(join(tmpdir(), "loader-default-home-"));
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY };
    try {
      process.env.HOME = home; process.env.USERPROFILE = home; delete process.env.TYPESAFE_API_KEY;
      const handlers: Record<string, Handler[]> = {};
      const messages: Array<Record<string, unknown>> = [];
      const chain: unknown = new Proxy({}, { get: () => () => chain });
      const pi = {
        zod: chain, on: (name: string, handler: Handler) => { (handlers[name] ??= []).push(handler); },
        registerTool: () => {}, registerCommand: () => {}, sendMessage: async (message: Record<string, unknown>) => { messages.push(message); },
      };
      await loaderDefault(pi as unknown as Parameters<typeof loaderDefault>[0]);
      expect(handlers.tool_call?.length ?? 0).toBeGreaterThan(0);
      expect(messages.filter(message => message.customType === "typesafe-workspace-loader-error")).toEqual([]);
      const ctx = { cwd: home, sessionManager: { getBranch: () => [], getSessionId: () => "loader-default", getEntry: () => undefined, getHeader: () => ({}) }, agent: { kind: "main", id: "Main", name: "Main" } };
      for (const handler of handlers.session_start ?? []) await handler({}, ctx);
      const health = messages.find(message => message.customType === "typesafe-health" && String(message.content).includes('"runtime-origin"'));
      expect(health, "planner must emit the runtime-origin proof").toBeDefined();
      const proof = JSON.parse(String(health?.content)) as { entrypoint: { origin: string; sha256: string } };
      expect(proof.entrypoint.origin).toBe(pathToFileURL(resolve(import.meta.dir, "..", "typesafe-planner.ts")).href);
      expect(proof.entrypoint.origin).not.toMatch(/[?#]/);
      expect(proof.entrypoint.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("omp workspace loader: policy surface", () => {
  it("allowlist is exactly the non-mutating built-ins (no ls) and excludes every EGC writer", () => {
    expect([...READ_ONLY_TOOL_ALLOWLIST].sort()).toEqual(["ast_grep", "find", "glob", "grep", "read"]);
    for (const writer of ["bash", "write", "edit", "patch", "ast_edit", "apply_patch", "notebook_edit", "ls"]) expect(READ_ONLY_TOOL_ALLOWLIST.has(writer)).toBe(false);
  });

  it("degradedToolDecision is pure and fail-closed", () => {
    expect(degradedToolDecision({ toolName: "grep", input: { pattern: "x" } }, "x")).toBeUndefined();
    expect(degradedToolDecision({ toolName: "bash", input: {} }, "cause")?.block).toBe(true);
    expect(degradedToolDecision(undefined, "cause")?.block).toBe(true);
    expect(degradedToolDecision({ toolName: "read", input: { path: "https://x" } }, "cause")?.block).toBe(true);
  });
});
