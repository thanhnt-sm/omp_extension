#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildChildEnvironment } = require("../src/typesafe-child-env.cjs");

const { readWorkspaceFile } = require("../src/typesafe-evidence-file.cjs");

const MANIFEST_SCHEMA_VERSION = 2;
const LEGACY_MANIFEST_SCHEMA_VERSION = 1;
const ALLOWED_AGENT_DESTINATIONS = new Set(["advisor.md", "ck-advisor.md"]);

const RUNTIME_ORIGIN_BUNDLED = [
  "src/typesafe-enabled-resolver.cjs",
  "src/typesafe-redact.cjs",
  "src/typesafe-api-client.cjs",
  "src/typesafe-policy-client.cjs",
];

function readImage(filePath) {
  return readWorkspaceFile(path.dirname(path.resolve(filePath)), path.basename(filePath), { maxBytes: 64 * 1024 * 1024 });
}

function sha256File(filePath) {
  try { return readImage(filePath).sha256; }
  catch (error) { if (error.code === "FILE_MISSING") return null; throw error; }
}

function isSafeRelative(relativePath) {
  return typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath)
    && !/[\\\x00-\x1f:]/.test(relativePath)
    && relativePath.split("/").every((segment) => segment && segment !== "." && segment !== ".."
      && !/[. ]$/.test(segment) && !/^\.claude$/i.test(segment) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment));
}
function assertConfiguredAbsolutePath(value, label) {
  if (typeof value !== "string" || !value || /[\x00]/.test(value) || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  return path.resolve(value);
}
function assertNoLegacyPath(absolutePath, label) {
  const resolved = path.resolve(absolutePath);
  if (resolved.split(/[\\/]+/).some((segment) => segment.toLowerCase() === ".claude")) throw new Error(`${label} may not use the legacy Claude root`);
  return resolved;
}

function parseArgs(argv) {
  const options = { json: false, live: false, requireLive: false, help: false };
  for (const argument of argv) {
    if (argument === "--json") options.json = true;
    else if (argument === "--live") options.live = true;
    else if (argument === "--require-live") options.requireLive = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function verifyPointer(pointerPath, targetDir) {
  if (!fs.existsSync(pointerPath)) {
    return { ok: false, reason: `Pointer file missing: ${pointerPath}`, sha256: null };
  }
  const stat = fs.lstatSync(pointerPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { ok: false, reason: "Pointer must be a regular file (not symlink/directory)", sha256: null };
  }
  const { bytes, sha256 } = readImage(pointerPath);
  if (bytes.includes(0)) {
    return { ok: false, reason: "Pointer contains null bytes", sha256 };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { ok: false, reason: "Pointer starts with UTF-8 BOM", sha256 };
  }
  const expected = `export { default } from "${path.join(targetDir, "typesafe-planner.ts").replace(/\\/g, "/")}";`;
  const text = bytes.toString("utf8");
  const valid = text === expected || text === `${expected}\n` || text === `${expected}\r\n`;
  return {
    ok: valid,
    reason: valid ? "Immutable 1-line proxy trampoline verified" : `Content mismatch. Expected: ${expected}`,
    sha256,
    expected,
  };
}

function verifyManifestParity(workspaceDir, targetDir, homeDir) {
  const manifestPath = path.join(targetDir, ".sync-manifest.json");
  const invalid = (reason, status = "INVALID_MANIFEST", schemaVersion = null) => ({ ok: false, status, reason, schemaVersion, total: 0, matched: 0, mismatches: [] });
  let manifest;
  try { manifest = JSON.parse(readImage(manifestPath).bytes.toString("utf8")); }
  catch (error) {
    return invalid(error.code === "FILE_MISSING" ? `Missing sync manifest: ${manifestPath}` : "Sync manifest is malformed or unavailable");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return invalid("Sync manifest is malformed");
  const topLevelKeys = Object.keys(manifest).sort();
  if (topLevelKeys.length !== 2 || topLevelKeys.some((key) => key !== "schemaVersion" && key !== "entries") || !Array.isArray(manifest.entries)) return invalid("Sync manifest is malformed");
  if (manifest.schemaVersion === LEGACY_MANIFEST_SCHEMA_VERSION) {
    return invalid("Sync manifest schema 1 requires migration to schema 2; run the managed synchronizer. Legacy ownership is not probed.", "MIGRATION_REQUIRED", LEGACY_MANIFEST_SCHEMA_VERSION);
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) return invalid("Unsupported sync manifest schema");

  // Validate the entire metadata table before resolving or reading any entry's paths.
  const seen = new Set();
  for (const entry of manifest.entries) {
    const entryKeys = entry && typeof entry === "object" && !Array.isArray(entry) ? Object.keys(entry).sort() : [];
    if (entryKeys.length !== 3 || entryKeys.some((key) => key !== "deployedHash" && key !== "relativePath" && key !== "root") || !entry || typeof entry !== "object" || Array.isArray(entry) || !["target", "global_omp_agents"].includes(entry.root)
      || !isSafeRelative(entry.relativePath) || typeof entry.deployedHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.deployedHash)
      || (entry.root === "global_omp_agents" && !ALLOWED_AGENT_DESTINATIONS.has(entry.relativePath))) return invalid("Sync manifest has an invalid destination or hash");
    const key = `${entry.root}:${process.platform === "win32" ? entry.relativePath.toLowerCase() : entry.relativePath}`;
    if (seen.has(key)) return invalid("Sync manifest has duplicate destinations");
    seen.add(key);
  }
  const roots = {
    target: targetDir,
    global_omp_agents: path.join(homeDir, ".omp", "agent", "agents"),
  };
  const byRoot = { target: 0, global_omp_agents: 0 };
  const mismatches = [];
  let matched = 0;

  for (const entry of manifest.entries) {
    byRoot[entry.root] += 1;
    const wsRel = entry.root === "target" ? entry.relativePath : path.posix.join("agents", entry.relativePath);
    const wsPath = path.join(workspaceDir, wsRel);
    const destPath = path.join(roots[entry.root], entry.relativePath);
    const wsHash = sha256File(wsPath);
    const destHash = sha256File(destPath);
    if (wsHash && wsHash === destHash && destHash === entry.deployedHash) {
      matched += 1;
    } else {
      mismatches.push({
        root: entry.root,
        relativePath: entry.relativePath,
        manifestHash: entry.deployedHash,
        workspaceHash: wsHash,
        destinationHash: destHash,
      });
    }
  }

  return {
    ok: mismatches.length === 0 && matched > 0,
    schemaVersion: manifest.schemaVersion,
    total: manifest.entries.length,
    matched,
    byRoot,
    mismatches,
  };
}

function runDryRunPreflight(workspaceDir) {
  const syncScript = path.join(workspaceDir, "tools", "sync-baseline.cjs");
  const childEnv = buildChildEnvironment("deployment-sync");
  const result = spawnSync(process.execPath, [syncScript, "--dry-run"], {
    cwd: workspaceDir,
    env: childEnv,
    encoding: "utf8",
  });
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  const actionLine = stdout.split(/\r?\n/).find((line) => line.startsWith("Managed actions: ")) || "";
  const actions = actionLine
    ? actionLine
        .replace(/^Managed actions:\s*/, "")
        .split(/,\s*/)
        .filter(Boolean)
    : [];
  const nonNoop = actions.filter((item) => !item.startsWith("NOOP:"));
  return {
    ok: result.status === 0 && nonNoop.length === 0,
    exitCode: result.status,
    totalActions: actions.length,
    nonNoopActions: nonNoop,
    stderr: stderr || null,
  };
}

function computeRuntimeOriginDigests(targetDir) {
  const entrypointPath = path.join(targetDir, "typesafe-planner.ts");
  return {
    entrypoint: {
      origin: `file:///${entrypointPath.replace(/\\/g, "/")}`,
      sha256: sha256File(entrypointPath),
    },
    bundledModules: RUNTIME_ORIGIN_BUNDLED.map((rel) => {
      const full = path.join(targetDir, rel);
      return {
        origin: `file:///${full.replace(/\\/g, "/")}`,
        sha256: sha256File(full),
      };
    }),
  };
}

function verifyResolverAndRedactor(targetDir, workspaceDir) {
  const resolverPath = path.join(targetDir, "src", "typesafe-enabled-resolver.cjs");
  const redactPath = path.join(targetDir, "src", "typesafe-redact.cjs");
  const apiClientPath = path.join(targetDir, "src", "typesafe-api-client.cjs");
  const { resolveTypeSafeEnabled } = require(resolverPath);
  const { redactPayload } = require(redactPath);
  const { redactEvidenceState } = require(apiClientPath);

  const resolved = resolveTypeSafeEnabled(workspaceDir);
  const stateSample = redactEvidenceState({
    apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
    usage: {
      input_tokens: 128,
      output_tokens: 64,
      total_tokens: 192,
      secret_token: "should-be-redacted",
    },
  });
  const plainRedacted = redactPayload({
    token: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
  });

  const secretScrubbed =
    typeof stateSample.apiKey === "string" &&
    stateSample.apiKey.includes("[REDACTED") &&
    typeof plainRedacted.token === "string" &&
    plainRedacted.token.includes("[REDACTED");
  const telemetryPreserved =
    Boolean(stateSample.usage) &&
    stateSample.usage.input_tokens === 128 &&
    stateSample.usage.output_tokens === 64 &&
    stateSample.usage.total_tokens === 192 &&
    typeof stateSample.usage.secret_token === "string" &&
    stateSample.usage.secret_token.includes("[REDACTED");

  const isResolvedOk = Boolean(resolved && (resolved.enabled || resolved.reason === "global-excluded"));
  return {
    ok: Boolean(isResolvedOk && secretScrubbed && telemetryPreserved),
    resolver: resolved,
    reason: resolved?.reason === "global-excluded" ? `excluded=true, telemetryPreserved=${telemetryPreserved}` : undefined,
    redactor: {
      secretScrubbed,
      telemetryPreserved,
    },
  };
}

function inspectLatestBackup(targetDir) {
  const parentDir = path.dirname(targetDir);
  const prefix = `${path.basename(targetDir)}_backup_`;
  if (!fs.existsSync(parentDir)) return null;
  const backups = fs
    .readdirSync(parentDir)
    .filter((name) => name.startsWith(prefix) && !name.endsWith(".zip") && fs.existsSync(path.join(parentDir, name, ".sync-journal.json")))
    .sort();
  if (backups.length === 0) return null;
  const latest = backups[backups.length - 1];
  const journalPath = path.join(parentDir, latest, ".sync-journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return {
    directory: latest,
    status: journal.status,
    changedCount: Array.isArray(journal.entries) ? journal.entries.length : 0,
    unchangedCount: Array.isArray(journal.unchanged) ? journal.unchanged.length : 0,
  };
}

async function runLiveJevProbe(targetDir, requireLive) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: !requireLive,
      status: "skipped",
      reason: "TYPESAFE_API_KEY is not set in current process environment",
    };
  }
  const apiClientPath = path.join(targetDir, "src", "typesafe-api-client.cjs");
  const { judgeTypeSafe } = require(apiClientPath);
  const response = await judgeTypeSafe({
    apiKey,
    args: {
      state: "function add(a, b) { return a + b; }",
      model: "jev-latest",
      questions: {
        is_valid_addition: {
          type: "noul",
          instructions: "Does the function return the sum of a and b?",
        },
        implementation_category: {
          type: "choice",
          instructions: "Classify the function.",
          criteria: {
            arithmetic: "Performs arithmetic addition",
            io: "Performs disk or network IO",
          },
        },
        completeness_score: {
          type: "score",
          instructions: "Rate completeness of the addition function.",
          criteria: [
            "Does not add inputs",
            "Partially adds inputs",
            "Correctly adds inputs",
          ],
        },
      },
    },
  });
  const ok = Boolean(response && response.ok);
  return {
    ok,
    status: ok ? "online" : "failed",
    httpStatus: ok ? 200 : response ? response.code : null,
    resolvedModel: response && response.metadata ? response.metadata.resolvedModel : null,
    answers: response ? response.answers : null,
    usage: response && response.metadata ? response.metadata.usage : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node tools/verify-omp-global.cjs [--json] [--live|--require-live] [--help]\nDefault: offline installation checks. Live probes use extension HTTP, not native OMP judge. No loaded-code or semantic approval is produced.");
    return;
  }
  const workspaceDir = assertNoLegacyPath(assertConfiguredAbsolutePath(process.env.OMP_WORKSPACE_DIR || path.resolve(__dirname, ".."), "OMP workspace directory"), "OMP workspace directory");
  const homeDir = assertNoLegacyPath(assertConfiguredAbsolutePath(process.env.OMP_HOME_DIR || os.homedir(), "OMP home directory"), "OMP home directory");
  const targetDir = assertNoLegacyPath(assertConfiguredAbsolutePath(process.env.OMP_TARGET_DIR || path.join(homeDir, "Projects", "omp_extension"), "OMP target directory"), "OMP target directory");
  const pointerPath = assertNoLegacyPath(assertConfiguredAbsolutePath(
    process.env.OMP_EXTENSION_POINTER || path.join(homeDir, ".omp", "agent", "extensions", "typesafe-planner.ts"),
    "OMP extension pointer",
  ), "OMP extension pointer");

  const pointer = verifyPointer(pointerPath, targetDir);
  const manifest = verifyManifestParity(workspaceDir, targetDir, homeDir);
  const installationReady = pointer.ok && manifest.ok;
  const blockedReason = manifest.status === "MIGRATION_REQUIRED" ? manifest.reason : "Requires a valid pointer and current manifest parity";
  // Old installed helpers may still access legacy configuration; never import them before migration.
  const dryRun = installationReady ? runDryRunPreflight(workspaceDir) : { ok: false, status: "skipped", reason: blockedReason, totalActions: 0, nonNoopActions: [] };
  const runtimeOrigin = installationReady ? computeRuntimeOriginDigests(targetDir) : null;
  const runtimeSelfTest = installationReady ? verifyResolverAndRedactor(targetDir, workspaceDir) : { ok: false, status: "skipped", reason: blockedReason };
  const latestBackup = installationReady ? inspectLatestBackup(targetDir) : null;
  const liveProbe = !installationReady
    ? { ok: false, status: "skipped", reason: blockedReason }
    : options.live || options.requireLive
      ? await runLiveJevProbe(targetDir, options.requireLive)
      : { ok: true, status: "skipped", reason: "Pass --live or --require-live explicitly to run the extension HTTP probe" };

  const overallOk =
    pointer.ok && manifest.ok && dryRun.ok && runtimeSelfTest.ok && liveProbe.ok;

  const report = {
    timestamp: new Date().toISOString(),
    overallOk,
    workspaceDir,
    targetDir,
    pointerPath,
    checks: {
      pointer,
      manifest,
      dryRun,
      runtimeSelfTest,
      latestBackup,
      liveProbe,
    },
    runtimeOrigin,
    verificationScope: {
      diskChecks: pointer.ok && manifest.ok && dryRun.ok && runtimeSelfTest.ok ? "VERIFIED" : "FAILED",
      extensionHttpTransport: liveProbe.status === "online" ? "VERIFIED" : "NOT_VERIFIED",
      nativeJudge: "NOT_VERIFIED",
      loadedCode: "NOT_VERIFIED",
      semanticAuthority: "NOT_VERIFIED",
    },
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("==================================================================");
    console.log(" OMP TypeSafe Extension — Global Installation & Runtime Verifier");
    console.log("==================================================================");
    console.log(`[1] Loader Proxy (Golden Invariant): ${pointer.ok ? "PASS" : "FAIL"} (${pointer.reason})`);
    console.log(`    Path:   ${pointerPath}`);
    console.log(`    SHA256: ${pointer.sha256}`);
    console.log(
      `[2] Manifest Parity (2 Roots):       ${manifest.ok ? "PASS" : "FAIL"} (${manifest.reason || `${manifest.matched}/${manifest.total} files match SHA-256`})`
    );
    if (manifest.byRoot) {
      console.log(
        `    Breakdown: target=${manifest.byRoot.target}, global_omp_agents=${manifest.byRoot.global_omp_agents}`
      );
    }
    if (manifest.mismatches && manifest.mismatches.length > 0) {
      for (const m of manifest.mismatches.slice(0, 10)) {
        console.log(`    [!] Mismatch: ${m.root}/${m.relativePath}`);
      }
    }
    console.log(
      `[3] Sync Preflight (--dry-run):      ${dryRun.ok ? "PASS" : "FAIL"} (${dryRun.totalActions} managed actions, ${dryRun.nonNoopActions.length} pending changes)`
    );
    console.log(
      `[4] Resolver & Redactor Self-Test:   ${runtimeSelfTest.ok ? "PASS" : "FAIL"} (${runtimeSelfTest.reason || `enabled=${runtimeSelfTest.resolver?.enabled}, telemetryPreserved=${runtimeSelfTest.redactor?.telemetryPreserved}`})`
    );
    console.log(
      `[5] Latest Verified Backup:          ${latestBackup ? `${latestBackup.directory} (status=${latestBackup.status})` : "NONE"}`
    );
    console.log(
      `[6] Live TypeSafe JEV Probe:         ${liveProbe.status.toUpperCase()} ${liveProbe.resolvedModel ? `(model=${liveProbe.resolvedModel}, HTTP ${liveProbe.httpStatus})` : `(${liveProbe.reason || ""})`}`
    );
    console.log("------------------------------------------------------------------");
    console.log(" On-disk Digests (not loaded-code proof):");
    if (runtimeOrigin) {
      console.log(`   typesafe-planner.ts:          ${runtimeOrigin.entrypoint.sha256}`);
      for (const mod of runtimeOrigin.bundledModules) {
        console.log(`   ${path.basename(mod.origin).padEnd(28)} ${mod.sha256}`);
      }
    } else {
      console.log(`   NOT_VERIFIED: ${blockedReason}`);
    }
    console.log("==================================================================");
    console.log(` VERDICT: ${overallOk ? "INSTALLATION CHECKS PASSED" : "ACTION REQUIRED"}; native judge, loaded code and semantic authority NOT_VERIFIED`);
    console.log("==================================================================");
  }

  process.exitCode = overallOk ? 0 : 1;
}

main().catch((error) => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
