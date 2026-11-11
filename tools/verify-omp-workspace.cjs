"use strict";
// Verifies the workspace -> global OMP layering (`.omp/config.yml` + `tools/omp-workspace-loader.ts`).
// Default mode is offline and read-only. `--runtime` additionally starts omp twice (RPC) and may trigger the
// extension's single HTTP health call per start. Never syncs and never prints credentials or config values; it writes nothing in
// the repo or ~/.omp (--runtime only creates, then removes, one temp directory).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const lib = require("./verify-omp-workspace-lib.cjs");

const USAGE = `Usage: bun tools/verify-omp-workspace.cjs [--runtime] [--json] [--help]

Offline (default, no network): exact bytes of .omp/config.yml; tools/omp-workspace-loader.ts exists, is a regular file
and exports a default function (imported, factory never called; failure = exit 1); warns when the global
~/.omp/agent/config.yml has non-empty top-level extensions/disabledExtensions (project arrays would mask them);
lists what the workspace has that global lacks (non-NOOP actions of sync-baseline --dry-run; a non-zero dry-run
exit is CONFLICT, never "no difference"); prints the git dirty count (sync ships the working tree, not a commit).

--runtime  Also starts \`omp --mode rpc\` at the repo root (must prove only the workspace origin, no query) and in a
           fresh temp cwd (must prove only the deployed target origin). Zero origins = FAIL; an explicitly excluded
           project is reported as EXCLUDED, not FAIL (never for the workspace when the loader check fails). NOTE: each start may make ONE HTTP health call (extension
           session_start probe) and takes several seconds.
--json     Machine-readable output.
Exit codes: 0 ok, 1 failed check, 2 usage / refused (run from the deploy target).`;

const FAILING = new Set(["FAIL", "CONFLICT"]);

function parseArgs(argv) {
  const flags = { runtime: false, json: false, help: false };
  for (const arg of argv) {
    if (arg === "--runtime") flags.runtime = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  return { flags };
}

function readIfExists(file) { try { return fs.readFileSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }

function checkGlobalMasking(homeDir) {
  const file = path.join(homeDir, ".omp", "agent", "config.yml");
  const raw = readIfExists(file);
  if (raw === null) return { id: "global-config-masking", status: "INFO", detail: "global config.yml absent; nothing to mask" };
  if (typeof Bun === "undefined" || !Bun.YAML) return { id: "global-config-masking", status: "WARN", detail: "cannot parse YAML outside bun; run with `bun`" };
  try {
    const masked = lib.findMaskingKeys(Bun.YAML.parse(raw.toString("utf8")));
    return masked.length
      ? { id: "global-config-masking", status: "WARN", detail: `global config has non-empty top-level ${masked.join(", ")}; the project arrays replace them (arrays do not merge)` }
      : { id: "global-config-masking", status: "PASS", detail: "global config has no top-level extensions/disabledExtensions to mask" };
  } catch { return { id: "global-config-masking", status: "WARN", detail: "global config.yml could not be parsed (contents not shown)" }; }
}

function checkBaselineDiff(root, spawn = spawnSync) {
  const bun = process.versions.bun ? process.execPath : "bun";
  const result = spawn(bun, [path.join(root, "tools", "sync-baseline.cjs"), "--dry-run"], { cwd: root, encoding: "utf8", timeout: 180_000, windowsHide: true });
  const verdict = lib.classifyDryRun({ status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error });
  const items = verdict.pending.map((entry) => `${entry.action} ${entry.root}/${entry.relativePath}`);
  const status = verdict.status === "CONFLICT" ? "CONFLICT" : verdict.status === "PENDING" ? "INFO" : "PASS";
  return { id: "baseline-diff", status, detail: verdict.status === "PENDING" ? `workspace has changes global lacks: ${verdict.detail}` : verdict.detail, items };
}

function checkGitDirty(root) {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return { id: "git-dirty", status: "WARN", detail: "git status failed; dirty count unknown (sync ships the working tree, not a commit)" };
  const count = result.stdout.split(/\r?\n/).filter(Boolean).length;
  return { id: "git-dirty", status: "INFO", detail: `${count} dirty path(s); sync ships the working tree, not a commit` };
}

/** Loader facts without calling the factory: existence, regular file, default export type. */
async function checkLoaderFile(root) {
  const file = path.join(root, "tools", "omp-workspace-loader.ts");
  let stat = null;
  try { stat = fs.lstatSync(file); } catch { /* missing */ }
  const facts = { exists: stat !== null, isFile: stat !== null && stat.isFile() };
  if (facts.exists && facts.isFile) {
    try { facts.defaultType = typeof (await import(pathToFileURL(file).href)).default; } catch (error) { facts.error = error instanceof Error ? error.message : String(error); }
  }
  return { id: "loader-file", ...lib.evaluateLoaderFile(facts) };
}

/** `deps` is injectable so tests can drive the verdict logic without starting omp. */
async function runtimeChecks(root, targetDir, { loaderOk = true, deps = {}, homeDir = os.homedir() } = {}) {
  const runtime = deps.runtime ?? require("./verify-omp-workspace-runtime.cjs");
  const resolver = deps.resolver ?? require(path.join(root, "src", "typesafe-enabled-resolver.cjs"));
  // Same home dir as the rest of the script (OMP_HOME_DIR), so the exclusion list read here is the one the probed omp would honor in tests.
  const excludedAt = (dir) => { try { return resolver.resolveTypeSafeProjectExclusion(dir, { homeDir }).excluded === true; } catch { return false; } };
  const checks = [];
  const workspace = await runtime.probeRpc(root);
  checks.push({ id: "runtime-workspace-origin", ...runtime.evaluateRuntime({ role: "workspace", expectedOrigin: runtime.plannerOrigin(root), observed: workspace, excluded: excludedAt(root), loaderOk }) });
  const scratch = runtime.makeScratchCwd();
  try {
    const target = await runtime.probeRpc(scratch); // resolves only after the child exited, so the directory can be removed below
    const verdict = runtime.evaluateRuntime({ role: "target", expectedOrigin: runtime.plannerOrigin(targetDir), observed: target, excluded: excludedAt(scratch) });
    // The scratch cwd is only a vehicle to start the deployed gate: if the global config excludes it, no proof is expected and nothing was verified.
    checks.push({ id: "runtime-target-origin", ...(verdict.status === "EXCLUDED"
      ? { status: "FAIL", detail: "cannot prove deployed gate: scratch cwd excluded by the global TypeSafe excludeProjects list; remove the exclusion for the temp directory or verify the target manually" }
      : verdict) });
  } finally { runtime.removeScratchCwd(scratch); }
  return checks;
}

function render(report) {
  const lines = [`omp workspace verification (${report.mode}) root=${report.root}`];
  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.id} - ${check.detail}`);
    for (const item of (check.items ?? []).slice(0, 40)) lines.push(`    ${item}`);
    if ((check.items ?? []).length > 40) lines.push(`    ... ${check.items.length - 40} more`);
  }
  lines.push(report.ok ? "RESULT: OK" : "RESULT: FAILED");
  return lines.join("\n");
}

/** Testable entry: returns the exit code and writes through `out`. */
async function run({ argv, env = process.env, root = path.resolve(__dirname, ".."), out = console.log } = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) { out(`${parsed.error}\n${USAGE}`); return 2; }
  if (parsed.flags.help) { out(USAGE); return 0; }
  const homeDir = env.OMP_HOME_DIR || os.homedir();
  const targetDir = env.OMP_TARGET_DIR || path.join(homeDir, "Projects", "omp_extension");
  const configFile = path.join(root, ".omp", "config.yml");
  if (lib.isDeployTarget(root, targetDir, fs.existsSync(configFile))) {
    const message = "refusing to run: this is the deploy target or has no `.omp/config.yml`; run it from the development workspace";
    out(parsed.flags.json ? JSON.stringify({ ok: false, error: message }) : message);
    return 2;
  }
  const loader = await checkLoaderFile(root);
  const checks = [{ id: "config-bytes", ...lib.checkConfigBytes(readIfExists(configFile)) }, loader, checkGlobalMasking(homeDir), checkBaselineDiff(root), checkGitDirty(root)];
  if (parsed.flags.runtime) checks.push(...await runtimeChecks(root, targetDir, { loaderOk: loader.status === "PASS", homeDir }));
  const report = { mode: parsed.flags.runtime ? "runtime" : "offline", root, ok: !checks.some((check) => FAILING.has(check.status)), checks };
  out(parsed.flags.json ? JSON.stringify(report, null, 2) : render(report));
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  run({ argv: process.argv.slice(2) }).then((code) => { process.exitCode = code; }, (error) => { console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
module.exports = { run, parseArgs, USAGE, checkBaselineDiff, checkLoaderFile, runtimeChecks };
