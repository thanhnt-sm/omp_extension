import { describe, expect, it } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../tools/verify-omp-workspace-lib.cjs");
const runtime = require("../tools/verify-omp-workspace-runtime.cjs");
const cli = require("../tools/verify-omp-workspace.cjs");

const root = resolve(import.meta.dir, "..");
const ACTION_LINE = "Managed actions: NOOP:global_omp_agents/advisor.md, NOOP:target/.gitignore, CREATE:target/tools/omp-workspace-loader.ts, OVERWRITE:target/docs/a.md, NOOP_PRUNED:target/old.md, PRUNE:target/gone.md";

describe("verify-omp-workspace: config byte check", () => {
  const expected = Buffer.from(lib.EXPECTED_CONFIG, "utf8");
  it("accepts exact bytes and rejects any drift, CRLF, BOM and a missing file", () => {
    expect(lib.checkConfigBytes(expected).status).toBe("PASS");
    expect(lib.checkConfigBytes(null).status).toBe("FAIL");
    expect(lib.checkConfigBytes(Buffer.from(lib.EXPECTED_CONFIG.replace("extensions:\n", "extensions: []\n"))).status).toBe("FAIL");
    expect(lib.checkConfigBytes(Buffer.from(lib.EXPECTED_CONFIG.slice(0, -1))).status).toBe("FAIL");
    const crlf = lib.checkConfigBytes(Buffer.from(lib.EXPECTED_CONFIG.replace(/\n/g, "\r\n")));
    expect(crlf.status).toBe("FAIL");
    expect(crlf.detail).toContain("CRLF");
    const bom = lib.checkConfigBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), expected]));
    expect(bom.status).toBe("FAIL");
    expect(bom.detail).toContain("BOM");
  });

  it("expected content parses to the disable filter plus the loader path, and that loader file exists in this tree", () => {
    expect(Bun.YAML.parse(lib.EXPECTED_CONFIG)).toEqual({ disabledExtensions: ["extension-module:typesafe-planner"], extensions: ["./tools/omp-workspace-loader.ts"] });
    expect(existsSync(join(root, "tools", "omp-workspace-loader.ts"))).toBe(true);
  });

  it("matches the checked-in .omp/config.yml when this is the workspace (absent at the deploy target by design)", () => {
    const file = join(root, ".omp", "config.yml");
    if (existsSync(file)) expect(lib.checkConfigBytes(readFileSync(file)).status).toBe("PASS");
  });
});

describe("verify-omp-workspace: escape-hatch overlay", () => {
  it("overlay replaces both project arrays with empty ones, so neither the disable filter nor the workspace loader survives", () => {
    const overlay = Bun.YAML.parse(readFileSync(join(root, "tools", "omp-target-gate-overlay.yml"), "utf8")) as Record<string, unknown>;
    const project = Bun.YAML.parse(lib.EXPECTED_CONFIG) as Record<string, unknown>;
    for (const key of Object.keys(project)) {
      expect(Array.isArray(overlay[key]), `${key} must be overridden by the overlay`).toBe(true);
      expect(overlay[key]).toEqual([]);
    }
    expect(JSON.stringify(overlay)).not.toContain("omp-workspace-loader");
    expect(JSON.stringify(overlay)).not.toContain("typesafe-planner");
  });
});

describe("verify-omp-workspace: dry-run parsing is strict", () => {
  it("parses every action", () => {
    const parsed = lib.parseManagedActions(`Preflight succeeded for 9 baseline files.\n${ACTION_LINE}\nDry run completed`);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.actions.map((a: { action: string }) => a.action)).toEqual(["NOOP", "NOOP", "CREATE", "OVERWRITE", "NOOP_PRUNED", "PRUNE"]);
    expect(parsed.actions[3]).toEqual({ action: "OVERWRITE", root: "target", relativePath: "docs/a.md" });
    expect(parsed.actions[0]).toEqual({ action: "NOOP", root: "global_omp_agents", relativePath: "advisor.md" });
  });

  it("handles the empty and missing action lines", () => {
    expect(lib.parseManagedActions("Managed actions: none\n")).toEqual({ actions: [], invalid: [] });
    expect(lib.parseManagedActions("Preflight only\n")).toBeNull();
  });

  it("reports pending (non-NOOP) actions and treats NOOP_PRUNED as in sync", () => {
    const pending = lib.classifyDryRun({ status: 0, stdout: ACTION_LINE });
    expect(pending.status).toBe("PENDING");
    expect(pending.pending.map((a: { action: string }) => a.action)).toEqual(["CREATE", "OVERWRITE", "PRUNE"]);
    const clean = lib.classifyDryRun({ status: 0, stdout: "Managed actions: NOOP:target/a.md, NOOP_PRUNED:target/b.md\n" });
    expect(clean.status).toBe("IN_SYNC");
    expect(clean.pending).toEqual([]);
  });

  it("anything not fully understood is CONFLICT, never IN_SYNC", () => {
    const bad = [
      "Managed actions: CREATE:new_root/a.md",
      "Managed actions: NOOP:target/a.md, CREATE:new_root/b.md",
      "Managed actions: ???",
      "Managed actions: NOOP:target/a.md, ???",
      "Managed actions: ???, NOOP:target/a.md",
      "Managed actions: ",
      "Managed actions: NOOPX:target/a.md",
      "Managed actions: noop:target/a.md",
      "Managed actions: NOOP:target/",
      "Managed actions: NOOP:target",
      "Managed actions: MANIFEST:target/a.md",
      "Managed actions: NOOP:target/has, comma.md",
    ];
    for (const line of bad) {
      const verdict = lib.classifyDryRun({ status: 0, stdout: `${line}\n` });
      expect(verdict.status, line).toBe("CONFLICT");
      expect(verdict.pending).toEqual([]);
      expect(verdict.detail).toContain("not fully understood");
    }
  });

  it("only the real root names are accepted", () => {
    expect([...lib.KNOWN_ROOTS].sort()).toEqual(["global_claude", "global_omp_agents", "target"]);
    expect([...lib.KNOWN_ACTIONS].sort()).toEqual(["BOOTSTRAP_OVERWRITE", "CREATE", "NOOP", "NOOP_PRUNED", "OVERWRITE", "PRUNE"]);
  });

  it("a non-zero dry-run exit is CONFLICT, never 'no difference', even when stdout looks clean", () => {
    const conflict = lib.classifyDryRun({ status: 1, stdout: "Managed actions: NOOP:target/a.md\n", stderr: "[ERROR] managed file identity changed\n" });
    expect(conflict.status).toBe("CONFLICT");
    expect(conflict.detail).toContain("exit 1");
    expect(conflict.detail).toContain("managed file identity changed");
    expect(conflict.pending).toEqual([]);
    expect(lib.classifyDryRun({ status: 2, stdout: "", stderr: "" }).status).toBe("CONFLICT");
    expect(lib.classifyDryRun({ status: null, error: new Error("spawn bun ENOENT") }).status).toBe("CONFLICT");
    expect(lib.classifyDryRun({ status: 0, stdout: "no managed line at all" }).status).toBe("CONFLICT");
  });
});

describe("verify-omp-workspace: baseline-diff check status mapping", () => {
  const fake = (status: number | null, stdout: string, stderr = "") => () => ({ status, stdout, stderr });
  it("a pending baseline is INFO with the pending actions listed, never PASS", () => {
    const check = cli.checkBaselineDiff(root, fake(0, `${ACTION_LINE}\n`));
    expect(check.status).toBe("INFO");
    expect(check.items).toEqual(["CREATE target/tools/omp-workspace-loader.ts", "OVERWRITE target/docs/a.md", "PRUNE target/gone.md"]);
  });
  it("an in-sync baseline is PASS; a failing or unrecognized dry-run is CONFLICT", () => {
    expect(cli.checkBaselineDiff(root, fake(0, "Managed actions: NOOP:target/a.md\n")).status).toBe("PASS");
    expect(cli.checkBaselineDiff(root, fake(1, "", "[ERROR] boom")).status).toBe("CONFLICT");
    expect(cli.checkBaselineDiff(root, fake(0, "Managed actions: NOOP:target/a.md, CREATE:new_root/b.md\n")).status).toBe("CONFLICT");
  });
});

describe("verify-omp-workspace: global masking and deploy-target guard", () => {
  it("reports only key names for non-empty top-level extensions/disabledExtensions", () => {
    const parse = (text: string) => Bun.YAML.parse(text);
    expect(lib.findMaskingKeys(parse("model: secret-model\nextensions: []\ndisabledExtensions: []\n"))).toEqual([]);
    expect(lib.findMaskingKeys(parse("extensions:\n  - a\n"))).toEqual(["extensions"]);
    expect(lib.findMaskingKeys(parse("extensions: [x]\ndisabledExtensions:\n  - y\napiKey: sk-should-not-leak\n"))).toEqual(["extensions", "disabledExtensions"]);
    expect(lib.findMaskingKeys(null)).toEqual([]);
    expect(lib.findMaskingKeys([])).toEqual([]);
    expect(lib.findMaskingKeys({ extensions: "single" })).toEqual(["extensions"]);
  });

  it("refuses the deploy target by path or by missing project config", () => {
    expect(lib.isDeployTarget("C:/Users/x/Projects/omp_extension", "C:\\Users\\x\\Projects\\omp_extension\\", true)).toBe(true);
    expect(lib.isDeployTarget("D:/work/omp_extension", "C:/Users/x/Projects/omp_extension", false)).toBe(true);
    expect(lib.isDeployTarget("D:/work/omp_extension", "C:/Users/x/Projects/omp_extension", true)).toBe(false);
  });
});

describe("verify-omp-workspace: loader file check", () => {
  it("evaluateLoaderFile fails on missing, non-regular, unimportable and non-function default", () => {
    expect(lib.evaluateLoaderFile({ exists: false }).status).toBe("FAIL");
    expect(lib.evaluateLoaderFile({ exists: true, isFile: false }).status).toBe("FAIL");
    expect(lib.evaluateLoaderFile({ exists: true, isFile: true, error: "SyntaxError" }).status).toBe("FAIL");
    expect(lib.evaluateLoaderFile({ exists: true, isFile: true, defaultType: "object" }).status).toBe("FAIL");
    expect(lib.evaluateLoaderFile({ exists: true, isFile: true, defaultType: "function" }).status).toBe("PASS");
  });

  function workspace(loaderSource: string | null, kind: "file" | "directory" | "symlink" = "file") {
    const dir = mkdtempSync(join(tmpdir(), "verify-loader-file-"));
    mkdirSync(join(dir, "tools"), { recursive: true });
    const target = join(dir, "tools", "omp-workspace-loader.ts");
    if (loaderSource !== null && kind === "file") writeFileSync(target, loaderSource);
    if (kind === "directory") mkdirSync(target);
    if (kind === "symlink") { writeFileSync(join(dir, "real.ts"), "export default () => {};\n"); try { symlinkSync(join(dir, "real.ts"), target); } catch { return { dir, skip: true }; } }
    return { dir, skip: false };
  }

  it("checks real files on disk without calling the factory", async () => {
    const calledMarker = join(tmpdir(), `verify-loader-called-${process.pid}`);
    const cases: Array<[string, string | null, "file" | "directory", string]> = [
      ["good", `export default function () { require("node:fs").writeFileSync(${JSON.stringify(calledMarker)}, "called"); }\n`, "file", "PASS"],
      ["missing", null, "file", "FAIL"],
      ["directory", null, "directory", "FAIL"],
      ["syntax error", "export default function ( {{{\n", "file", "FAIL"],
      ["throws at load", "throw new Error('x');\nexport default () => {};\n", "file", "FAIL"],
      ["no default", "export const a = 1;\n", "file", "FAIL"],
      ["default not a function", "export default 42;\n", "file", "FAIL"],
    ];
    for (const [label, source, kind, expected] of cases) {
      const { dir } = workspace(source, kind);
      try { expect((await cli.checkLoaderFile(dir)).status, label).toBe(expected); } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    expect(existsSync(calledMarker)).toBe(false);
    const link = workspace("", "symlink");
    try { if (!link.skip) expect((await cli.checkLoaderFile(link.dir)).status, "symlink is not a regular file").toBe("FAIL"); } finally { rmSync(link.dir, { recursive: true, force: true }); }
  });

  it("passes for this workspace's real loader", async () => {
    expect((await cli.checkLoaderFile(root)).status).toBe("PASS");
  });
});

describe("verify-omp-workspace: runtime verdicts", () => {
  const expectedOrigin = "file:///D:/ws/typesafe-planner.ts";
  const goodProof = { origin: expectedOrigin, entrySha: true, bundled: 4, bundledShaNonNull: 4 };
  const observed = (extra: Record<string, unknown> = {}) => ({ finished: true, proofs: [goodProof], loaderErrors: [], extensionErrors: [], ...extra });
  const verdict = (o: unknown, excluded = false, loaderOk = true) => runtime.evaluateRuntime({ role: "workspace", expectedOrigin, observed: o, excluded, loaderOk });

  it("passes exactly one matching origin without query and complete hashes", () => {
    expect(verdict(observed()).status).toBe("PASS");
  });
  it("fails zero origins, multiple origins, wrong origin, query tags and incomplete hashes", () => {
    expect(verdict(observed({ proofs: [] })).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [goodProof, { ...goodProof, origin: "file:///C:/other/typesafe-planner.ts" }] })).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [{ ...goodProof, origin: "file:///C:/Users/x/Projects/omp_extension/typesafe-planner.ts" }] })).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [{ ...goodProof, origin: `${expectedOrigin}?mtime=1` }] })).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [{ ...goodProof, bundledShaNonNull: 3 }] })).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [{ ...goodProof, entrySha: false }] })).status).toBe("FAIL");
  });
  it("reports an excluded project separately from FAIL, but only when no origin is present", () => {
    expect(verdict(observed({ proofs: [] }), true).status).toBe("EXCLUDED");
    expect(verdict(observed({ proofs: [] }), false).status).toBe("FAIL");
  });
  it("an exclusion can never mask an unusable workspace loader, an extension error, or a loader failure", () => {
    expect(verdict(observed({ proofs: [] }), true, false).status).toBe("FAIL");
    expect(verdict(observed(), false, false).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [], extensionErrors: ["failed to load"] }), true).status).toBe("FAIL");
    expect(verdict(observed({ proofs: [], loaderErrors: ["TypeSafe workspace loader FAILED: x"] }), true).status).toBe("FAIL");
    expect(runtime.evaluateRuntime({ role: "target", expectedOrigin, observed: observed({ proofs: [] }), excluded: true, loaderOk: false }).status).toBe("EXCLUDED");
  });
  it("fails on an unfinished start, a crashed child and spawn errors", () => {
    expect(verdict(observed({ finished: false })).status).toBe("FAIL");
    const crashed = verdict(observed({ finished: false, exitCode: 3 }));
    expect(crashed.status).toBe("FAIL");
    expect(crashed.detail).toContain("exited");
    expect(verdict(observed({ spawnError: "ENOENT" })).status).toBe("FAIL");
  });
  it("computes planner origins as file URLs", () => {
    expect(runtime.plannerOrigin(root)).toMatch(/^file:\/\/\/.+\/typesafe-planner\.ts$/);
  });
});

// A frame recorded from a real `omp --mode rpc` get_entries response (paths/hashes only; no credentials).
const recordedEntries = (origin: string, message = "") => JSON.stringify({
  id: "entries", type: "response", command: "get_entries", success: true,
  data: { leafId: "x", entries: [
    { type: "custom_message", customType: "typesafe-health", display: false, id: "e1", content: JSON.stringify({
      kind: "runtime-origin", algorithm: "sha256", interpretation: "disk-observation-not-loaded-code-proof", loadedFactoryDigest: "b4f7",
      entrypoint: { origin, sha256: "36be2229fbffc8cbcdefaf011f0163c4bdf5074bc9c2d8ff8c52ab9a009f24d7" },
      bundledModules: [1, 2, 3, 4].map(n => ({ origin: `${origin}#m${n}`.replace("#", "/"), sha256: "f".repeat(64) })) }) },
    ...(message ? [{ type: "custom_message", customType: "typesafe-workspace-loader-error", display: true, id: "e2", content: message }] : []),
  ] },
});

describe("verify-omp-workspace: scan / summarizeProof / probeRpc with recorded frames", () => {
  const origin = "file:///D:/ws/typesafe-planner.ts";
  it("scan finds the proof in a recorded get_entries response and de-duplicates it", () => {
    const observed = { finished: false, proofs: [] as unknown[], loaderErrors: [] as string[], extensionErrors: [] as string[] };
    runtime.scan(JSON.parse(recordedEntries(origin)), observed);
    runtime.scan(JSON.parse(recordedEntries(origin)), observed);
    expect(observed.proofs).toEqual([{ origin, entrySha: true, bundled: 4, bundledShaNonNull: 4 }]);
    expect(observed.loaderErrors).toEqual([]);
  });
  it("scan records a loader failure notice and ignores unrelated frames", () => {
    const observed = { finished: false, proofs: [] as unknown[], loaderErrors: [] as string[], extensionErrors: [] as string[] };
    runtime.scan({ type: "ready" }, observed);
    runtime.scan({ type: "available_commands_update", commands: ["a", "b"] }, observed);
    expect(observed.proofs).toEqual([]);
    runtime.scan(JSON.parse(recordedEntries(origin, "TypeSafe workspace loader FAILED: boom. Mutating tools are blocked")), observed);
    expect(observed.loaderErrors).toHaveLength(1);
  });
  it("summarizeProof counts null hashes and rejects garbage", () => {
    const text = JSON.stringify({ kind: "runtime-origin", entrypoint: { origin, sha256: null }, bundledModules: [{ origin: "a", sha256: "1" }, { origin: "b", sha256: null }] });
    expect(runtime.summarizeProof(text)).toEqual({ origin, entrySha: false, bundled: 2, bundledShaNonNull: 1 });
    expect(runtime.summarizeProof("not json")).toBeNull();
    expect(runtime.summarizeProof("{}")).toBeNull();
  });

  /** A fake omp: speaks just enough RPC over stdin/stdout, then behaves per `mode`. */
  function fakeOmp(dir: string, mode: "proof" | "no-proof" | "loader-error" | "crash", entriesLine: string) {
    const script = join(dir, `fake-omp-${mode}.ts`);
    writeFileSync(script, [
      `const mode = ${JSON.stringify(mode)}; const entries = ${JSON.stringify(entriesLine)};`,
      `if (mode === "crash") { process.exit(3); }`,
      `console.log(JSON.stringify({ type: "ready" }));`,
      `let buffer = ""; process.stdin.on("data", chunk => { buffer += chunk; let i; while ((i = buffer.indexOf("\\n")) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue;`,
      `  const request = JSON.parse(line);`,
      `  if (request.type === "get_available_commands") console.log(JSON.stringify({ id: "cmds", type: "response", success: true, data: { commands: [] } }));`,
      `  if (request.type === "get_entries") console.log(mode === "no-proof" ? JSON.stringify({ id: "entries", type: "response", success: true, data: { entries: [] } }) : entries); } });`,
      `process.stdin.on("end", () => process.exit(0));`,
    ].join("\n"));
    return script;
  }

  async function probe(mode: "proof" | "no-proof" | "loader-error" | "crash", entriesLine: string) {
    const dir = mkdtempSync(join(tmpdir(), "probe-rpc-"));
    try {
      const script = fakeOmp(dir, mode, entriesLine);
      const cwd = join(dir, "cwd"); mkdirSync(cwd);
      const started = Date.now();
      const result = await runtime.probeRpc(cwd, { command: process.execPath, args: [script], timeoutMs: 20_000, graceMs: 500 });
      return { result, elapsed: Date.now() - started, cwd, dir };
    } catch (error) { rmSync(dir, { recursive: true, force: true }); throw error; }
  }

  it("probeRpc turns recorded frames into a proof (kills a scan that never finds one)", async () => {
    const { result, dir } = await probe("proof", recordedEntries(origin));
    try {
      expect(result.finished).toBe(true);
      expect(result.proofs).toEqual([{ origin, entrySha: true, bundled: 4, bundledShaNonNull: 4 }]);
      expect(runtime.evaluateRuntime({ role: "workspace", expectedOrigin: origin, observed: result, excluded: false }).status).toBe("PASS");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);

  it("probeRpc reports zero proofs when none is emitted, and a loader-failure notice when one is", async () => {
    const none = await probe("no-proof", "");
    const failed = await probe("loader-error", recordedEntries(origin, "TypeSafe workspace loader FAILED: boom"));
    try {
      expect(none.result.proofs).toEqual([]);
      expect(runtime.evaluateRuntime({ role: "workspace", expectedOrigin: origin, observed: none.result, excluded: false }).status).toBe("FAIL");
      expect(failed.result.loaderErrors).toHaveLength(1);
    } finally { rmSync(none.dir, { recursive: true, force: true }); rmSync(failed.dir, { recursive: true, force: true }); }
  }, 60_000);

  it("a crashing child fails fast with its exit code instead of waiting for the timeout", async () => {
    const { result, elapsed, dir } = await probe("crash", "");
    try {
      expect(result.finished).toBe(false);
      expect(result.exitCode).toBe(3);
      expect(elapsed).toBeLessThan(10_000);
      expect(runtime.evaluateRuntime({ role: "workspace", expectedOrigin: origin, observed: result, excluded: true }).status).toBe("FAIL");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);

  it("probeRpc resolves only after the child exited, so its cwd can be removed immediately", async () => {
    const { cwd, dir } = await probe("proof", recordedEntries(origin));
    try {
      runtime.removeScratchCwd(cwd);
      expect(existsSync(cwd)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);
});

describe("verify-omp-workspace: runtimeChecks decisions (omp not started)", () => {
  const proof = { origin: "", entrySha: true, bundled: 4, bundledShaNonNull: 4 };
  function harness(options: { observedFor: (cwd: string) => unknown; excluded: boolean }) {
    const exclusionCalls: Array<{ dir: string; homeDir: unknown }> = [];
    const probed: string[] = []; const removed: string[] = [];
    const scratch = mkdtempSync(join(tmpdir(), "runtime-checks-scratch-"));
    const fake = {
      ...runtime,
      probeRpc: async (cwd: string) => { probed.push(cwd); return options.observedFor(cwd); },
      makeScratchCwd: () => scratch,
      removeScratchCwd: (dir: string) => { removed.push(dir); rmSync(dir, { recursive: true, force: true }); },
    };
    const resolver = { resolveTypeSafeProjectExclusion: (dir: string, opts?: { homeDir?: unknown }) => { exclusionCalls.push({ dir, homeDir: opts?.homeDir }); return { excluded: options.excluded }; } };
    return { probed, removed, scratch, exclusionCalls, run: (loaderOk = true, homeDir?: string) => cli.runtimeChecks(root, "C:/Users/x/Projects/omp_extension", { loaderOk, homeDir, deps: { runtime: fake, resolver } }) };
  }
  const ok = (dir: string) => ({ finished: true, proofs: [{ ...proof, origin: runtime.plannerOrigin(dir) }], loaderErrors: [], extensionErrors: [] });
  const zero = { finished: true, proofs: [], loaderErrors: [], extensionErrors: [] };
  const byId = (checks: Array<{ id: string; status: string }>) => Object.fromEntries(checks.map(c => [c.id, c.status]));

  it("zero origins are FAIL when the project is not excluded (kills 'every project is excluded')", async () => {
    const h = harness({ observedFor: () => zero, excluded: false });
    expect(byId(await h.run())).toEqual({ "runtime-workspace-origin": "FAIL", "runtime-target-origin": "FAIL" });
  });
  it("zero origins are EXCLUDED for an excluded workspace, but an excluded scratch cwd cannot prove the deployed gate: FAIL", async () => {
    const h = harness({ observedFor: () => zero, excluded: true });
    const checks = await h.run();
    expect(byId(checks)).toEqual({ "runtime-workspace-origin": "EXCLUDED", "runtime-target-origin": "FAIL" });
    expect(checks[1].detail).toContain("cannot prove deployed gate: scratch cwd excluded");
  });
  it("an excluded scratch cwd that still emitted a matching target proof stays PASS (the proof is real)", async () => {
    const target = { finished: true, proofs: [{ ...proof, origin: "file:///C:/Users/x/Projects/omp_extension/typesafe-planner.ts" }], loaderErrors: [], extensionErrors: [] };
    const h = harness({ observedFor: (cwd) => (cwd === root ? ok(root) : target), excluded: true });
    expect(byId(await h.run())["runtime-target-origin"]).toBe("PASS");
  });
  it("exclusion is resolved against the same home dir as the rest of the script (OMP_HOME_DIR), not os.homedir()", async () => {
    const h = harness({ observedFor: () => zero, excluded: false });
    await h.run(true, "C:/custom/home");
    expect(h.exclusionCalls.map(call => call.homeDir)).toEqual(["C:/custom/home", "C:/custom/home"]);
    expect(h.exclusionCalls.map(call => call.dir)).toEqual([root, h.scratch]);
  });
  it("an unusable loader makes the workspace check FAIL even for an excluded project", async () => {
    const h = harness({ observedFor: () => zero, excluded: true });
    expect(byId(await h.run(false))["runtime-workspace-origin"]).toBe("FAIL");
  });
  it("probes the repo root, then a scratch cwd, and removes the scratch cwd after its probe", async () => {
    const h = harness({ observedFor: (cwd) => (cwd === root ? ok(root) : { finished: true, proofs: [{ ...proof, origin: "file:///C:/Users/x/Projects/omp_extension/typesafe-planner.ts" }], loaderErrors: [], extensionErrors: [] }), excluded: false });
    const checks = await h.run();
    expect(byId(checks)).toEqual({ "runtime-workspace-origin": "PASS", "runtime-target-origin": "PASS" });
    expect(h.probed).toEqual([root, h.scratch]);
    expect(h.removed).toEqual([h.scratch]);
    expect(existsSync(h.scratch)).toBe(false);
  });
  it("the workspace probe passing with the TARGET origin is a FAIL (kills 'default export loads the deployed target')", async () => {
    const target = { finished: true, proofs: [{ ...proof, origin: "file:///C:/Users/x/Projects/omp_extension/typesafe-planner.ts" }], loaderErrors: [], extensionErrors: [] };
    const h = harness({ observedFor: () => target, excluded: false });
    const checks = byId(await h.run());
    expect(checks["runtime-workspace-origin"]).toBe("FAIL");
    expect(checks["runtime-target-origin"]).toBe("PASS");
  });
});

describe("verify-omp-workspace: CLI (offline, fixtures only)", () => {
  async function runCli(argv: string[], fixtureRoot: string, env: Record<string, string> = {}) {
    const lines: string[] = [];
    const code = await cli.run({ argv, root: fixtureRoot, env: { ...process.env, ...env }, out: (line: string) => lines.push(line) });
    return { code, text: lines.join("\n") };
  }
  function fixture(withConfig: boolean, withLoader = false) {
    const dir = mkdtempSync(join(tmpdir(), "verify-workspace-"));
    mkdirSync(join(dir, ".omp"), { recursive: true });
    if (withConfig) writeFileSync(join(dir, ".omp", "config.yml"), lib.EXPECTED_CONFIG);
    if (withLoader) { mkdirSync(join(dir, "tools"), { recursive: true }); copyFileSync(join(root, "tools", "omp-workspace-loader.ts"), join(dir, "tools", "omp-workspace-loader.ts")); }
    return dir;
  }

  it("exits 2 on unknown arguments and 0 on --help, and the help describes the loader check", async () => {
    const dir = fixture(true);
    try {
      expect((await runCli(["--bogus"], dir)).code).toBe(2);
      const help = await runCli(["--help"], dir);
      expect(help.code).toBe(0);
      expect(help.text).toContain("HTTP health call");
      expect(help.text).toContain("omp-workspace-loader.ts");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("refuses to run without .omp/config.yml (deploy target) and from the target path", async () => {
    const bare = fixture(false);
    const withConfig = fixture(true);
    try {
      const refused = await runCli([], bare, { OMP_HOME_DIR: bare });
      expect(refused.code).toBe(2);
      expect(refused.text).toContain("refusing to run");
      const sameAsTarget = await runCli(["--json"], withConfig, { OMP_HOME_DIR: bare, OMP_TARGET_DIR: withConfig });
      expect(sameAsTarget.code).toBe(2);
      expect(JSON.parse(sameAsTarget.text).ok).toBe(false);
    } finally { rmSync(bare, { recursive: true, force: true }); rmSync(withConfig, { recursive: true, force: true }); }
  });

  it("reports CONFLICT and exits 1 when the dry-run cannot succeed, and honors --json", async () => {
    const dir = fixture(true, true);
    const home = mkdtempSync(join(tmpdir(), "verify-workspace-home-"));
    try {
      const result = await runCli(["--json"], dir, { OMP_HOME_DIR: home });
      expect(result.code).toBe(1);
      const report = JSON.parse(result.text);
      expect(report.mode).toBe("offline");
      expect(report.ok).toBe(false);
      const byId = Object.fromEntries(report.checks.map((c: { id: string; status: string }) => [c.id, c.status]));
      expect(byId["config-bytes"]).toBe("PASS");
      expect(byId["loader-file"]).toBe("PASS");
      expect(byId["baseline-diff"]).toBe("CONFLICT");
      expect(byId["global-config-masking"]).toBe("INFO");
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); }
  });

  it("a missing loader file fails the offline run (exit 1) on its own", async () => {
    const dir = fixture(true, false);
    try {
      const result = await runCli([], dir, { OMP_HOME_DIR: dir });
      expect(result.code).toBe(1);
      expect(result.text).toContain("[FAIL] loader-file");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("fails the byte check on a drifted config", async () => {
    const dir = fixture(true, true);
    writeFileSync(join(dir, ".omp", "config.yml"), "extensions: []\n");
    try {
      const result = await runCli([], dir, { OMP_HOME_DIR: dir });
      expect(result.code).toBe(1);
      expect(result.text).toContain("[FAIL] config-bytes");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
