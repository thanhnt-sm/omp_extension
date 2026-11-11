import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import registerExtension from "../typesafe-planner";
import defaultEgc from "../src/egc.js";
import { astEditEntryCovers, astEditTargets } from "../src/file-mutation-targets";

// The workspace layer (`.omp/config.yml` + `tools/omp-workspace-loader.ts`) is guarded against an agent disabling it by the
// planner's source-mutation guard (PROTECTED_INTEGRITY_PATTERNS) for write/edit/ast_edit. This is prevention for those tools only:
// bash and eval cannot be fully screened, so the byte/existence check in `verify:workspace` is detection, not prevention.
// The EGC writer screen (src/egc.ts) is deliberately NOT extended: it scans whole inputs and would deny `cat .omp/config.yml`.

const repoRoot = resolve(import.meta.dir, "..");
type Handler = (event: unknown, ctx: unknown) => unknown;

/** Drives the real planner tool_call handler. Without appendEntry there is no contract runtime, so no mutation grant can exist. */
function plannerGuard(cwd: string = repoRoot) {
  const handlers: Record<string, Handler[]> = {};
  const schema: Record<string, unknown> = {};
  const chain = new Proxy(schema, { get: () => () => chain });
  const host = {
    zod: chain, on: (name: string, handler: Handler) => { (handlers[name] ??= []).push(handler); },
    registerTool: () => {}, registerCommand: () => {}, sendMessage: async () => {},
  };
  registerExtension(host as unknown as Parameters<typeof registerExtension>[0], { env: { TYPESAFE_API_KEY: "" }, homeDir: join(tmpdir(), "no-such-home-for-guard-test") });
  const ctx = { cwd, sessionManager: { getBranch: () => [], getSessionId: () => "guard-test", getEntry: () => undefined, getHeader: () => ({}) }, agent: { kind: "main", id: "Main", name: "Main" } };
  return async (toolName: string, input: unknown) => {
    const values: unknown[] = [];
    for (const handler of handlers.tool_call ?? []) values.push(await handler({ toolName, toolCallId: "guard", input }, ctx));
    return values.find(value => value !== undefined) as { block?: boolean; reason?: string } | undefined;
  };
}

describe("planner guard protects the workspace layer files (real handler)", () => {
  const guard = plannerGuard();
  const blocked = (result: { block?: boolean; reason?: string } | undefined) => {
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("HUMAN_REQUIRED: protected source mutation");
  };

  it("blocks write to the project config and the loader, by relative, absolute and backslash path", async () => {
    blocked(await guard("write", { path: ".omp/config.yml", content: "extensions: []\n" }));
    blocked(await guard("write", { path: join(repoRoot, ".omp", "config.yml"), content: "x" }));
    blocked(await guard("write", { path: ".omp\\config.yml", content: "x" }));
    blocked(await guard("write", { path: "tools/omp-workspace-loader.ts", content: "export default () => {}" }));
    blocked(await guard("write", { path: "D:/some/other/repo/.omp/config.yml", content: "x" }));
    // Outside the workspace cwd only the PROTECTED_INTEGRITY_PATTERNS suffix match applies (the bundle listing is cwd-relative).
    blocked(await guard("write", { path: "D:/some/other/repo/tools/omp-workspace-loader.ts", content: "x" }));
  });

  it("blocks NTFS alternate data streams and trailing-dot aliases of protected files", async () => {
    blocked(await guard("write", { path: ".omp/config.yml::$DATA", content: "x" }));
    blocked(await guard("write", { path: ".omp/config.yml:hidden", content: "x" }));
    blocked(await guard("write", { path: "tools/omp-workspace-loader.ts::$DATA", content: "x" }));
    blocked(await guard("write", { path: ".omp/config.yml.", content: "x" }));
    blocked(await guard("write", { path: ".omp/config.yml ", content: "x" }));
  });

  it("blocks hashline edit of a protected file", async () => {
    blocked(await guard("edit", { input: "[.omp/config.yml#ABCD]\n+extensions: []" }));
  });

  it("blocks ast_edit naming a protected file, a covering directory, or a covering glob", async () => {
    const ops = [{ pat: "a", out: "b" }];
    blocked(await guard("ast_edit", { ops, paths: [".omp/config.yml"] }));
    blocked(await guard("ast_edit", { ops, paths: ["tools/omp-workspace-loader.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: ["tools"] }));
    blocked(await guard("ast_edit", { ops, paths: ["tools/"] }));
    blocked(await guard("ast_edit", { ops, paths: ["tools/*.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: ["**/*.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: [".omp/*.yml"] }));
    blocked(await guard("ast_edit", { ops, paths: ["docs", ".omp/config.yml"] }));
    blocked(await guard("ast_edit", { ops, paths: ["."] }));
    blocked(await guard("ast_edit", { ops, paths: ["src"] }));
    blocked(await guard("ast_edit", { ops, paths: ["src/**/*.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: [join(repoRoot, "tools")] }));
  });

  it("blocks brace globs that expand to a protected path (and fails closed on malformed braces)", async () => {
    const ops = [{ pat: "a", out: "b" }];
    blocked(await guard("ast_edit", { ops, paths: ["{src,tools}/**/*.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: ["{docs,tools}/*.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: ["{.omp,docs}/config.yml"] }));
    blocked(await guard("ast_edit", { ops, paths: ["{{tools,docs},notes}/*.ts"] }));
    blocked(await guard("ast_edit", { ops, paths: ["{tools"] }));
    blocked(await guard("ast_edit", { ops, paths: ["tools}"] }));
    expect(await guard("ast_edit", { ops, paths: ["{docs,notes}/*.md"] })).toBeUndefined();
  });

  it("does not block ast_edit in an unrelated project, but still blocks this repo's files by absolute path", async () => {
    const other = mkdtempSync(join(tmpdir(), "ast-edit-other-project-"));
    const fwd = (value: string) => value.replace(/\\/g, "/");
    try {
      mkdirSync(join(other, "src"), { recursive: true });
      mkdirSync(join(other, "tools"), { recursive: true });
      const otherGuard = plannerGuard(other);
      const ops = [{ pat: "a", out: "b" }];
      for (const entry of ["src", "src/", "src/**/*.ts", "**/*.ts", ".", "tools", "tools/*.ts", "{src,tools}/**/*.ts", "*", "a.ts"]) {
        expect(await otherGuard("ast_edit", { ops, paths: [entry] }), entry).toBeUndefined();
      }
      // An entry that really reaches this repo's protected set is still blocked.
      blocked(await otherGuard("ast_edit", { ops, paths: [join(repoRoot, "tools")] }));
      blocked(await otherGuard("ast_edit", { ops, paths: [`${fwd(repoRoot)}/src/**/*.ts`] }));
      blocked(await otherGuard("ast_edit", { ops, paths: [`${fwd(repoRoot)}/{src,tools}/**/*.ts`] }));
      blocked(await otherGuard("ast_edit", { ops, paths: [repoRoot] }));
      blocked(await otherGuard("ast_edit", { ops, paths: [join(repoRoot, ".omp", "config.yml")] }));
    } finally { rmSync(other, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  });

  it("fails closed on malformed ast_edit input", async () => {
    for (const input of [undefined, {}, { paths: [] }, { paths: "tools" }, { paths: [1] }, { paths: [""] }, { paths: ["ok.md", 7] }]) {
      const result = await guard("ast_edit", input);
      expect(result?.block, JSON.stringify(input)).toBe(true);
    }
  });

  it("does not over-block unrelated files", async () => {
    expect(await guard("write", { path: "notes/readme.md", content: "x" })).toBeUndefined();
    expect(await guard("write", { path: ".omp/agents/advisor.md", content: "x" })).toBeUndefined();
    expect(await guard("write", { path: "config.yml", content: "x" })).toBeUndefined();
    expect(await guard("write", { path: "C:/x/y.txt", content: "x" })).toBeUndefined();
    expect(await guard("ast_edit", { ops: [], paths: ["docs"] })).toBeUndefined();
    expect(await guard("ast_edit", { ops: [], paths: ["notes/*.md"] })).toBeUndefined();
    expect(await guard("ast_edit", { ops: [], paths: ["local://scratch.ts"] })).toBeUndefined();
  });
});

describe("ast_edit target helpers", () => {
  it("extracts only well-formed paths and flags globs as broad", () => {
    expect(astEditTargets({ paths: ["a.ts", "src/**/*.ts"] }).map(t => [t.path, t.broad === true])).toEqual([["a.ts", false], ["src/**/*.ts", true]]);
    expect(astEditTargets({ paths: [] })).toEqual([]);
    expect(astEditTargets({ paths: ["a", 1] })).toEqual([]);
    expect(astEditTargets(null)).toEqual([]);
  });
  const base = resolve("/repo-under-test").replace(/\\/g, "/");
  it("matches directories by prefix and globs by pattern, case-insensitively, against absolute protected paths", () => {
    const candidates = [".omp/config.yml", "tools/omp-workspace-loader.ts", "typesafe-planner.ts"].map(rel => `${base}/${rel}`);
    expect(astEditEntryCovers("tools", true, candidates, base)).toBe(true);
    expect(astEditEntryCovers("", true, candidates, base)).toBe(true);
    expect(astEditEntryCovers(".", true, candidates, base)).toBe(true);
    expect(astEditEntryCovers("docs", true, candidates, base)).toBe(false);
    expect(astEditEntryCovers("**/*.TS", false, candidates, base)).toBe(true);
    expect(astEditEntryCovers("tools/*.yml", false, candidates, base)).toBe(false);
    expect(astEditEntryCovers(".omp/*", false, candidates, base)).toBe(true);
    expect(astEditEntryCovers("to*", false, candidates, base)).toBe(true); // matches the protected directory itself
  });
  it("applies only when the entry really reaches the protected set: other cwd, parent, or absolute entries", () => {
    const candidates = ["tools/omp-workspace-loader.ts", "typesafe-planner.ts"].map(rel => `${base}/${rel}`);
    const other = resolve("/some-other-project");
    for (const entry of ["tools", "src", ".", "**/*.ts", "tools/*.ts", "{tools,src}/**", "*"]) expect(astEditEntryCovers(entry, !/[*{]/.test(entry), candidates, other), entry).toBe(false);
    expect(astEditEntryCovers("../repo-under-test/tools", true, candidates, other)).toBe(true);
    expect(astEditEntryCovers("../repo-under-test/**/*.ts", false, candidates, other)).toBe(true);
    expect(astEditEntryCovers(`${base}/tools`, true, candidates, other)).toBe(true);
    expect(astEditEntryCovers("..", true, candidates, other)).toBe(true);
  });
  it("expands brace globs (nested, multiple) and fails closed on non-trivial braces", () => {
    const candidates = [`${base}/tools/omp-workspace-loader.ts`];
    expect(astEditEntryCovers("{src,tools}/**/*.ts", false, candidates, base)).toBe(true);
    expect(astEditEntryCovers("{docs,notes}/**/*.ts", false, candidates, base)).toBe(false);
    expect(astEditEntryCovers("{{docs,notes},tools}/*.ts", false, candidates, base)).toBe(true);
    expect(astEditEntryCovers("{tools,docs}/{a,omp-workspace-loader}.ts", false, candidates, base)).toBe(true);
    expect(astEditEntryCovers("tools/omp-workspace-loader.{js,ts}", false, candidates, base)).toBe(true);
    expect(astEditEntryCovers("{docs,notes}/{a,b}.md", false, candidates, base)).toBe(false);
    // Unbalanced, comma-less (range / literal) and over-large expansions cannot be reasoned about: cover.
    for (const entry of ["{docs", "docs}", "}docs{", "{docs}/x.md", "{1..3}/x.md", `${"{a,b}".repeat(9)}.ts`]) expect(astEditEntryCovers(entry, false, candidates, base), entry).toBe(true);
  });
  it("fails closed when a glob cannot be compiled", () => {
    expect(astEditEntryCovers("src/[a-", false, [`${base}/y.ts`], base)).toBe(true);
  });
});

describe("EGC writer screen is not extended for the workspace layer", () => {
  it("still allows reading the config through bash and the documented native-judge-setup --check", async () => {
    const root = mkdtempSync(join(tmpdir(), "egc-workspace-layer-"));
    const environment = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY };
    try {
      process.env.HOME = root; process.env.USERPROFILE = root; delete process.env.TYPESAFE_API_KEY;
      execSync("git init && git config user.name Test && git config user.email test@example.com", { cwd: root, stdio: "ignore" });
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "public.ts"), "export const v = 1;\n");
      execSync("git add . && git commit -qm init", { cwd: root, stdio: "ignore" });
      const handlers: Record<string, Handler> = {};
      const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<unknown> }> = {};
      defaultEgc({
        zod: { z: { object: (shape: unknown) => shape, string: () => ({ describe: () => ({}) }) } },
        on: (name: string, handler: Handler) => { handlers[name] = handler; },
        registerTool: () => {}, registerCommand: (name: string, spec: { handler: (args: string, ctx: unknown) => Promise<unknown> }) => { commands[name] = spec; },
        appendEntry: () => {},
      } as unknown as Parameters<typeof defaultEgc>[0]);
      const ctx = { cwd: root, sessionManager: { getBranch: () => [] }, ui: { notify: () => {} }, judge: async () => ({ answers: {} }) };
      mkdirSync(join(root, ".omp"), { recursive: true });
      writeFileSync(join(root, ".omp", "egc.json"), JSON.stringify({
        mode: "enforce", isolation: "inplace", uncontracted: "allow", jev: { mode: "off" },
        tasks: { T1: { verify: [`"${process.execPath}" -e "process.exit(0)"`], planFiles: ["src/public.ts"], requirements: ["r"] } },
      }));
      await handlers.session_start({}, ctx);
      await commands.egc.handler("lock", ctx);
      for (const command of ["cat .omp/config.yml", "bun tools/native-judge-setup.cjs --check --config C:/Users/me/.omp/agent/config.yml"]) {
        expect(await handlers.tool_call({ toolName: "bash", toolCallId: "c", input: { command } }, ctx), command).toBeUndefined();
      }
      // Sanity: the screen is live (its existing protected set still denies).
      expect(await handlers.tool_call({ toolName: "write", toolCallId: "c", input: { path: ".omp/egc.json", content: "{}" } }, ctx)).toEqual({ block: true, reason: "EGC: protected configuration or unsandboxed operation denied." });
    } finally {
      for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }, 60_000);
});
