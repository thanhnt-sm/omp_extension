"use strict";
// Runtime half of tools/verify-omp-workspace.cjs: starts `omp --mode rpc` in a cwd and reads the `typesafe-health`
// runtime-origin proof the extension emits on session_start. May trigger the extension's single HTTP health probe.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DEFAULT_ARGS = ["--mode", "rpc", "--no-ui", "--no-session"];
const sameOrigin = (left, right) => (process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right);

/**
 * Pure verdict for one RPC start. `observed` = { finished, exitCode?, spawnError?, proofs[], loaderErrors[], extensionErrors[] }.
 * `loaderOk === false` (workspace loader file unusable) makes the workspace verdict FAIL: an exclusion can never mask it.
 */
function evaluateRuntime({ role, expectedOrigin, observed, excluded, loaderOk = true }) {
  if (role === "workspace" && loaderOk === false) return { status: "FAIL", detail: "workspace loader file is unusable; this cannot be masked by an exclusion or any runtime result" };
  if (observed.spawnError) return { status: "FAIL", detail: `could not start omp: ${observed.spawnError}` };
  if (!observed.finished) {
    return observed.exitCode !== undefined
      ? { status: "FAIL", detail: `omp rpc exited before it became ready (exit ${observed.exitCode})` }
      : { status: "FAIL", detail: "omp rpc did not become ready before the timeout" };
  }
  if (observed.loaderErrors.length) return { status: "FAIL", detail: `workspace loader degraded (fail-closed): ${observed.loaderErrors[0]}` };
  const { proofs } = observed;
  if (proofs.length === 0) {
    if (excluded && observed.extensionErrors.length === 0) return { status: "EXCLUDED", detail: "project is explicitly excluded from TypeSafe; no origin proof is expected (not a failure)" };
    const extra = observed.extensionErrors.length ? `; ${observed.extensionErrors.length} extension_error frame(s)` : "";
    const exit = observed.exitCode !== undefined ? `; omp exited (${observed.exitCode}) before the proof arrived` : "";
    return { status: "FAIL", detail: `zero origins: no TypeSafe gate proved loaded${extra}${exit}` };
  }
  if (proofs.length > 1) return { status: "FAIL", detail: `${proofs.length} origins loaded (expected exactly one): ${proofs.map((p) => p.origin).join(" | ")}` };
  const [proof] = proofs;
  if (/[?#]/.test(proof.origin)) return { status: "FAIL", detail: `origin carries a query/hash (breaks relative requires): ${proof.origin}` };
  if (!sameOrigin(proof.origin, expectedOrigin)) return { status: "FAIL", detail: `expected ${role} origin ${expectedOrigin} but loaded ${proof.origin}` };
  if (!proof.entrySha || proof.bundledShaNonNull !== proof.bundled || proof.bundled === 0) {
    return { status: "FAIL", detail: `origin ok but sha256 proof incomplete (entry=${proof.entrySha}, bundled ${proof.bundledShaNonNull}/${proof.bundled})` };
  }
  return { status: "PASS", detail: `${role} origin ${proof.origin} (sha256 proofs complete, no query)` };
}

function summarizeProof(text) {
  try {
    const proof = JSON.parse(text);
    const bundled = Array.isArray(proof.bundledModules) ? proof.bundledModules : [];
    return { origin: String(proof.entrypoint.origin), entrySha: Boolean(proof.entrypoint.sha256), bundled: bundled.length, bundledShaNonNull: bundled.filter((m) => m && m.sha256).length };
  } catch { return null; }
}

/** Walks a parsed RPC frame and records runtime-origin proofs and loader-failure notices into `observed`. */
function scan(value, observed) {
  if (typeof value === "string") {
    if (value.includes('"runtime-origin"')) { const proof = summarizeProof(value); if (proof && !observed.proofs.some((p) => p.origin === proof.origin)) observed.proofs.push(proof); }
    else if (value.includes("TypeSafe workspace loader FAILED")) observed.loaderErrors.push(value.slice(0, 300));
  } else if (Array.isArray(value)) value.forEach((item) => scan(item, observed));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => scan(item, observed));
}

/**
 * Starts omp (or `command` + `args`, for tests) in RPC mode in `cwd` and collects origin proofs. Never prints message bodies.
 * Resolves only after the child has exited, so callers may delete `cwd` right afterwards.
 */
function probeRpc(cwd, { timeoutMs = 90_000, command = "omp", args = DEFAULT_ARGS, graceMs = 3000 } = {}) {
  return new Promise((resolve) => {
    const observed = { finished: false, proofs: [], loaderErrors: [], extensionErrors: [] };
    let child;
    try { child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }); }
    catch (error) { return resolve({ ...observed, spawnError: String(error).slice(0, 200) }); }
    let buffer = ""; let settled = false; let exited = false; let attempts = 0; let killTimer; let hardTimer; let resolved = false;
    const done = () => { if (resolved) return; resolved = true; clearTimeout(killTimer); clearTimeout(hardTimer); clearTimeout(timer); resolve({ ...observed }); };
    const askEntries = () => { try { child.stdin.write(`${JSON.stringify({ id: "entries", type: "get_entries" })}\n`); } catch { finish(); } };
    function finish() {
      if (settled) return; settled = true; clearTimeout(timer);
      if (exited) return done();
      try { child.stdin.end(); } catch { /* already closed */ }
      killTimer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, graceMs);
      hardTimer = setTimeout(done, graceMs + 7000);
    }
    const timer = setTimeout(finish, timeoutMs);
    child.on("error", (error) => { observed.spawnError = String(error).slice(0, 200); exited = true; finish(); done(); });
    // A crash (or an immediate exit) must fail fast instead of waiting for the timeout.
    child.on("exit", (code, signal) => { exited = true; observed.exitCode = code ?? signal; finish(); });
    child.on("close", () => { exited = true; finish(); done(); });
    child.stderr.on("data", () => { /* drained, never printed: may contain environment details */ });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let frame; try { frame = JSON.parse(line); } catch { continue; }
        if (frame.type === "extension_error") observed.extensionErrors.push(String(frame.error ?? frame.message ?? "").slice(0, 200));
        scan(frame, observed);
        if (frame.type === "ready") child.stdin.write(`${JSON.stringify({ id: "cmds", type: "get_available_commands" })}\n`);
        if (frame.id === "cmds") { observed.finished = true; askEntries(); }
        // The origin proof is a session custom message: it is only visible through get_entries, and session_start is async.
        if (frame.id === "entries") {
          attempts += 1;
          if (observed.proofs.length || observed.loaderErrors.length || attempts >= 4) finish();
          else setTimeout(askEntries, 1000);
        }
      }
    });
  });
}

function makeScratchCwd() { return fs.mkdtempSync(path.join(os.tmpdir(), "omp-verify-workspace-")); }
/** Call only after the child exited (probeRpc guarantees that). Retries because Windows releases directory handles lazily. */
function removeScratchCwd(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* tmp is disposable; a lingering handle must not fail verification */ }
}
const plannerOrigin = (dir) => pathToFileURL(path.join(dir, "typesafe-planner.ts")).href;

module.exports = { evaluateRuntime, probeRpc, scan, summarizeProof, makeScratchCwd, removeScratchCwd, plannerOrigin };
