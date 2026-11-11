"use strict";
// Pure helpers for tools/verify-omp-workspace.cjs (no I/O except path normalization), kept separate so tests can drive them with fixtures.
const path = require("node:path");

/** Exact expected bytes of the project-level `.omp/config.yml` (LF, trailing newline). */
const EXPECTED_CONFIG = [
  "disabledExtensions:",
  "  - extension-module:typesafe-planner",
  "extensions:",
  "  - ./tools/omp-workspace-loader.ts",
  "",
].join("\n");

const MASKING_KEYS = ["extensions", "disabledExtensions"];

function normalizePath(value) {
  const normalized = path.resolve(String(value)).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** True when `root` is the deploy target, or lacks the workspace-only `.omp/config.yml`. */
function isDeployTarget(root, targetDir, hasProjectConfig) {
  return !hasProjectConfig || normalizePath(root) === normalizePath(targetDir);
}

/** Exact-bytes check. `actual` is a Buffer or null (missing). */
function checkConfigBytes(actual, expected = EXPECTED_CONFIG) {
  if (actual === null || actual === undefined) return { status: "FAIL", detail: "`.omp/config.yml` is missing" };
  const expectedBytes = Buffer.from(expected, "utf8");
  if (Buffer.compare(actual, expectedBytes) === 0) return { status: "PASS", detail: `exact match (${expectedBytes.length} bytes)` };
  const hints = [];
  if (actual.includes(0x0d)) hints.push("contains CR (CRLF checkout? core.autocrlf=true rewrites LF files)");
  if (actual.length >= 3 && actual[0] === 0xef && actual[1] === 0xbb && actual[2] === 0xbf) hints.push("starts with a BOM");
  return { status: "FAIL", detail: `bytes differ from expected (${actual.length} vs ${expectedBytes.length} bytes)${hints.length ? `; ${hints.join("; ")}` : ""}` };
}

/** Names of top-level keys in the parsed global config that would be masked by the project arrays. Never returns values. */
function findMaskingKeys(parsedConfig) {
  if (!parsedConfig || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) return [];
  return MASKING_KEYS.filter((key) => {
    const value = parsedConfig[key];
    if (value === undefined || value === null) return false;
    return Array.isArray(value) ? value.length > 0 : true;
  });
}

/** Parses the `Managed actions:` line of `sync-baseline.cjs --dry-run`. Paths may contain commas, so split on the next `ACTION:root/` token. */
const KNOWN_ACTIONS = new Set(["NOOP", "NOOP_PRUNED", "CREATE", "OVERWRITE", "PRUNE", "BOOTSTRAP_OVERWRITE"]);
// global_claude only appears as legacy metadata of a schema v1 manifest (never touched); any other root is unknown.
const KNOWN_ROOTS = new Set(["target", "global_omp_agents", "global_claude"]);
// Tokens are comma-separated, so a path containing ", " cannot be told apart from a stray token: it is reported invalid (fail closed).
const TOKEN = /^([A-Z][A-Z_]*):([A-Za-z0-9_]+)\/(.+)$/;

/**
 * Strictly parses the `Managed actions:` line. Returns null when the line is absent, otherwise
 * `{ actions, invalid }`: `invalid` lists every token that is not `KNOWN_ACTION:KNOWN_ROOT/path`, so the caller can
 * refuse to call an output with unrecognized content "in sync".
 */
function parseManagedActions(stdout) {
  const line = String(stdout).split(/\r?\n/).find((candidate) => candidate.startsWith("Managed actions:"));
  if (!line) return null;
  const body = line.slice("Managed actions:".length).trim();
  if (body === "none") return { actions: [], invalid: [] };
  const actions = []; const invalid = [];
  for (const part of body === "" ? [""] : body.split(", ")) {
    const match = TOKEN.exec(part);
    if (match && KNOWN_ACTIONS.has(match[1]) && KNOWN_ROOTS.has(match[2])) actions.push({ action: match[1], root: match[2], relativePath: match[3] });
    else invalid.push(part.slice(0, 120));
  }
  return { actions, invalid };
}

/** Interprets a finished dry-run. A non-zero exit or unparsable output is a CONFLICT, never "no difference". */
function classifyDryRun({ status, stdout = "", stderr = "", error }) {
  if (error) return { status: "CONFLICT", pending: [], detail: `dry-run could not start: ${String(error).slice(0, 200)}` };
  if (status !== 0) {
    const reason = String(stderr || stdout).split(/\r?\n/).find((l) => l.trim()) ?? "no output";
    return { status: "CONFLICT", pending: [], detail: `dry-run exit ${status}: ${reason.slice(0, 300)}` };
  }
  const parsed = parseManagedActions(stdout);
  if (parsed === null) return { status: "CONFLICT", pending: [], detail: "dry-run exit 0 but no `Managed actions:` line was found" };
  if (parsed.invalid.length) {
    return { status: "CONFLICT", pending: [], detail: `dry-run output not fully understood: ${parsed.invalid.length} unrecognized token(s), first: ${JSON.stringify(parsed.invalid[0])}` };
  }
  const pending = parsed.actions.filter((entry) => entry.action !== "NOOP" && entry.action !== "NOOP_PRUNED");
  return { status: pending.length ? "PENDING" : "IN_SYNC", pending, detail: `${pending.length} pending of ${parsed.actions.length} managed entries` };
}

/** Verdict for the workspace loader file facts gathered by the CLI (kept pure so it is testable with fixtures). */
function evaluateLoaderFile({ exists, isFile, defaultType, error }) {
  if (!exists) return { status: "FAIL", detail: "tools/omp-workspace-loader.ts is missing: a session at the repo root would run with NO gate" };
  if (!isFile) return { status: "FAIL", detail: "tools/omp-workspace-loader.ts is not a regular file" };
  if (error) return { status: "FAIL", detail: `tools/omp-workspace-loader.ts cannot be imported: ${String(error).slice(0, 200)}` };
  if (defaultType !== "function") return { status: "FAIL", detail: `tools/omp-workspace-loader.ts default export is ${defaultType}, expected a function` };
  return { status: "PASS", detail: "regular file with a default function export (factory not called)" };
}

module.exports = { EXPECTED_CONFIG, MASKING_KEYS, KNOWN_ACTIONS, KNOWN_ROOTS, normalizePath, isDeployTarget, checkConfigBytes, findMaskingKeys, parseManagedActions, classifyDryRun, evaluateLoaderFile };
