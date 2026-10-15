#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_FILES = ["typesafe-planner.ts", "package.json", ".gitignore"];
const REQUIRED_RUNTIME_FILES = [
  "typesafe-enabled-resolver.cjs",
  "typesafe-api-client.cjs",
  "typesafe-redact.cjs",
  "typesafe-redact-patterns.cjs",
  "typesafe-policy-client.cjs",
];
const RECURSIVE_ROOTS = ["agents", ".omp/agents", "docs", "src", "tests", "plans", "scripts", "tools"];
const MANIFEST_NAME = ".sync-manifest.json";
const JOURNAL_NAME = ".sync-journal.json";
const MANIFEST_SCHEMA_VERSION = 1;
const ROOT_TARGET = "target";
const ROOT_CLAUDE = "global_claude";
const ROOT_AGENTS = "global_omp_agents";
const ALLOWED_GLOBAL_COPIES = [
  [ROOT_CLAUDE, "hooks/lib/typesafe-enabled-resolver.cjs", "src/typesafe-enabled-resolver.cjs"],
  [ROOT_CLAUDE, "mcp/typesafe/typesafe-api-client.cjs", "src/typesafe-api-client.cjs"],
  [ROOT_CLAUDE, "mcp/typesafe/typesafe-redact.cjs", "src/typesafe-redact.cjs"],
  [ROOT_CLAUDE, "mcp/typesafe/typesafe-redact-patterns.cjs", "src/typesafe-redact-patterns.cjs"],
  [ROOT_CLAUDE, "mcp/typesafe/typesafe-policy-client.cjs", "src/typesafe-policy-client.cjs"],
  [ROOT_AGENTS, "advisor.md", "agents/advisor.md"],
  [ROOT_AGENTS, "ck-advisor.md", "agents/ck-advisor.md"],
];
const ALLOWED_GLOBAL_DESTINATIONS = new Set(ALLOWED_GLOBAL_COPIES.map(([root, relativePath]) => `${root}:${relativePath}`));

function fail(message) { throw new Error(message); }
function sha256File(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function normalizeForComparison(value) { const normalized = path.normalize(value); return process.platform === "win32" ? normalized.toLowerCase() : normalized; }
function isSameOrNested(candidate, root) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function isSafeRelative(relativePath) {
  return typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath)
    && !relativePath.includes("\\") && relativePath.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function assertNoExistingLinks(absolutePath, label) {
  const resolved = path.resolve(absolutePath); const root = path.parse(resolved).root;
  let current = root;
  for (const segment of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) fail(`${label} contains a symbolic link or junction: ${current}`);
  }
}
function canonicalPath(absolutePath, label) {
  const resolved = path.resolve(absolutePath); assertNoExistingLinks(resolved, label);
  const missing = []; let existing = resolved;
  while (!fs.existsSync(existing)) { const parent = path.dirname(existing); if (parent === existing) fail(`${label} has no existing ancestor: ${resolved}`); missing.unshift(path.basename(existing)); existing = parent; }
  return path.join(fs.realpathSync.native(existing), ...missing);
}
function assertRealDirectory(absolutePath, label) {
  const resolved = path.resolve(absolutePath); if (!fs.existsSync(resolved)) fail(`${label} does not exist: ${resolved}`);
  assertNoExistingLinks(resolved, label); const entry = fs.lstatSync(resolved);
  if (!entry.isDirectory() || entry.isSymbolicLink()) fail(`${label} must be a real directory: ${resolved}`);
  return fs.realpathSync.native(resolved);
}
function assertRegularFile(absolutePath, label, { rejectHardlinks = false } = {}) {
  if (!fs.existsSync(absolutePath)) fail(`${label} does not exist: ${absolutePath}`);
  assertNoExistingLinks(absolutePath, label); const entry = fs.lstatSync(absolutePath);
  if (!entry.isFile() || entry.isSymbolicLink()) fail(`${label} must be a regular file: ${absolutePath}`);
  if (rejectHardlinks && entry.nlink > 1) fail(`${label} must not be a hardlink: ${absolutePath}`);
}
function assertTreeSafe(directory, label) {
  assertRealDirectory(directory, label);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name); const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) fail(`${label} contains a symbolic link or junction: ${entryPath}`);
    if (stat.isDirectory()) assertTreeSafe(entryPath, label);
  }
}
function listRegularFiles(directory, relativePrefix = "") {
  if (!fs.existsSync(directory)) return [];
  assertTreeSafe(directory, `source directory ${directory}`); const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name); const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listRegularFiles(entryPath, relativePath)); else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}
function buildInventory(workspaceDir) {
  for (const relativePath of ROOT_FILES) assertRegularFile(path.join(workspaceDir, relativePath), `required source file ${relativePath}`);
  for (const name of REQUIRED_RUNTIME_FILES) assertRegularFile(path.join(workspaceDir, "src", name), `required runtime file src/${name}`);
  const discovered = new Set(ROOT_FILES);
  for (const entry of fs.readdirSync(workspaceDir, { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith(".md")) discovered.add(entry.name);
  for (const root of RECURSIVE_ROOTS) for (const relativePath of listRegularFiles(path.join(workspaceDir, root), root)) discovered.add(relativePath.replace(/\\/g, "/"));
  return [...discovered].sort();
}
function assertStrictPointer(pointerPath, targetDir) {
  assertRegularFile(pointerPath, "OMP extension pointer"); const content = fs.readFileSync(pointerPath);
  if (content.includes(0)) fail("OMP extension pointer must not contain null bytes");
  if (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) fail("OMP extension pointer must not start with a BOM");
  const expected = `export { default } from "${path.join(targetDir, "typesafe-planner.ts").replace(/\\/g, "/")}";`;
  const text = content.toString("utf8");
  if (text !== expected && text !== `${expected}\n` && text !== `${expected}\r\n`) fail("OMP extension pointer must contain exactly one immutable export statement for the target planner");
}
function assertDisjoint(items) {
  for (let left = 0; left < items.length; left += 1) for (let right = left + 1; right < items.length; right += 1) {
    const a = normalizeForComparison(items[left].value); const b = normalizeForComparison(items[right].value);
    if (a === b || isSameOrNested(a, b) || isSameOrNested(b, a)) fail(`${items[left].label} and ${items[right].label} must not overlap`);
  }
}
function assertDestinationSafety(destinationPath) {
  assertNoExistingLinks(destinationPath, `destination ${destinationPath}`);
  if (fs.existsSync(destinationPath)) assertRegularFile(destinationPath, `destination ${destinationPath}`, { rejectHardlinks: true });
}
function parseArgs(argv) {
  const supported = new Set(["--dry-run", "--bootstrap"]);
  const unsupported = argv.find((argument) => !supported.has(argument));
  if (unsupported) fail(`unknown argument: ${unsupported}`);
  return { dryRun: argv.includes("--dry-run"), bootstrap: argv.includes("--bootstrap") };
}
function rootDestination(roots, root, relativePath) {
  if (!isSafeRelative(relativePath) || !Object.prototype.hasOwnProperty.call(roots, root)) fail(`unsafe manifest destination: ${root}/${relativePath}`);
  const destination = path.resolve(roots[root], ...relativePath.split("/"));
  if (!isSameOrNested(destination, roots[root]) || destination === roots[root]) fail(`manifest destination escapes root: ${root}/${relativePath}`);
  return destination;
}
function manifestKey(root, relativePath) { return `${root}:${relativePath}`; }
function assertManifestEntryAllowed(entry, roots) {
  rootDestination(roots, entry.root, entry.relativePath);
  if (entry.root !== ROOT_TARGET && !ALLOWED_GLOBAL_DESTINATIONS.has(manifestKey(entry.root, entry.relativePath))) {
    fail(`sync manifest references a non-allowlisted global destination: ${entry.root}/${entry.relativePath}`);
  }
}
function validateManifest(value, roots) {
  if (value === null) return { schemaVersion: MANIFEST_SCHEMA_VERSION, entries: [] };
  if (!value || typeof value !== "object" || value.schemaVersion !== MANIFEST_SCHEMA_VERSION || !Array.isArray(value.entries)) fail("sync manifest is malformed");
  const seen = new Set(); const entries = value.entries.map((entry) => {
    if (!entry || typeof entry !== "object" || ![ROOT_TARGET, ROOT_CLAUDE, ROOT_AGENTS].includes(entry.root) || !isSafeRelative(entry.relativePath) || !/^[a-f0-9]{64}$/.test(entry.deployedHash)) fail("sync manifest has an invalid entry");
    assertManifestEntryAllowed(entry, roots);
    const key = manifestKey(entry.root, entry.relativePath);
    if (seen.has(key)) fail("sync manifest has duplicate destinations"); seen.add(key);
    return { root: entry.root, relativePath: entry.relativePath, deployedHash: entry.deployedHash };
  });
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, entries: entries.sort((a, b) => manifestKey(a.root, a.relativePath).localeCompare(manifestKey(b.root, b.relativePath))) };
}
function readManifest(targetDir, roots) {
  const manifestPath = path.join(targetDir, MANIFEST_NAME); if (!fs.existsSync(manifestPath)) return validateManifest(null, roots);
  assertRegularFile(manifestPath, "sync manifest", { rejectHardlinks: true });
  try { return validateManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")), roots); } catch (error) { fail(`sync manifest is malformed: ${error instanceof Error ? error.message : String(error)}`); }
}
function buildDesiredEntries(workspaceDir, inventory) {
  const entries = inventory.map((relativePath) => ({ root: ROOT_TARGET, relativePath, source: path.join(workspaceDir, relativePath) }));
  for (const [root, relativePath, sourceRelative] of ALLOWED_GLOBAL_COPIES) {
    const source = path.join(workspaceDir, sourceRelative);
    if (fs.existsSync(source)) entries.push({ root, relativePath, source });
  }
  for (const entry of entries) assertRegularFile(entry.source, `managed source ${entry.source}`);
  return entries.sort((a, b) => manifestKey(a.root, a.relativePath).localeCompare(manifestKey(b.root, b.relativePath)));
}
function preflight(config) {
  const workspaceDir = assertRealDirectory(config.workspaceDir, "workspace directory"); const targetDir = assertRealDirectory(config.targetDir, "target directory"); assertTreeSafe(targetDir, "target directory");
  if (fs.existsSync(config.backupDir)) fail(`backup directory must not exist: ${config.backupDir}`);
  const backupDir = canonicalPath(config.backupDir, "backup directory"); const homeDir = assertRealDirectory(config.homeDir, "OMP home directory");
  const claudeRoot = canonicalPath(path.join(homeDir, ".claude"), "global Claude root"); const agentsRoot = canonicalPath(path.join(homeDir, ".omp", "agent", "agents"), "global OMP agents root"); const pointerPath = canonicalPath(config.pointerPath, "OMP extension pointer");
  assertDisjoint([{ label: "workspace directory", value: workspaceDir }, { label: "target directory", value: targetDir }, { label: "backup directory", value: backupDir }, { label: "global Claude root", value: claudeRoot }, { label: "global OMP agents root", value: agentsRoot }]);
  for (const mutableRoot of [workspaceDir, targetDir, backupDir, claudeRoot, agentsRoot]) if (isSameOrNested(pointerPath, mutableRoot)) fail("OMP extension pointer must be outside every mutable root");
  assertStrictPointer(pointerPath, targetDir); const roots = { [ROOT_TARGET]: targetDir, [ROOT_CLAUDE]: claudeRoot, [ROOT_AGENTS]: agentsRoot };
  const inventory = buildInventory(workspaceDir); const desired = buildDesiredEntries(workspaceDir, inventory);
  for (const entry of desired) assertDestinationSafety(rootDestination(roots, entry.root, entry.relativePath));
  return { workspaceDir, targetDir, backupDir, roots, inventory, desired };
}
function createPlan(preflightPlan, config) {
  const manifestPath = path.join(preflightPlan.targetDir, MANIFEST_NAME);
  if (config.bootstrap && fs.existsSync(manifestPath)) {
    fail("bootstrap is allowed only when the target has no sync manifest");
  }
  const previous = readManifest(preflightPlan.targetDir, preflightPlan.roots); const priorByKey = new Map(previous.entries.map((entry) => [manifestKey(entry.root, entry.relativePath), entry]));
  const desiredKeys = new Set(); const actions = []; const conflicts = [];
  for (const desired of preflightPlan.desired) {
    const key = manifestKey(desired.root, desired.relativePath); desiredKeys.add(key); const destination = rootDestination(preflightPlan.roots, desired.root, desired.relativePath); const sourceHash = sha256File(desired.source); const prior = priorByKey.get(key);
    if (!fs.existsSync(destination)) actions.push({ action: "CREATE", ...desired, destination, sourceHash });
    else { assertDestinationSafety(destination); const currentHash = sha256File(destination);
      if (currentHash === sourceHash) actions.push({ action: "NOOP", ...desired, destination, sourceHash });
      else if (prior && prior.deployedHash === currentHash) actions.push({ action: "OVERWRITE", ...desired, destination, sourceHash, priorHash: currentHash });
      else if (config.bootstrap) actions.push({ action: "OVERWRITE", ...desired, destination, sourceHash, priorHash: currentHash, bootstrap: true });
      else conflicts.push(`${desired.root}/${desired.relativePath}`);
    }
  }
  for (const prior of previous.entries) if (!desiredKeys.has(manifestKey(prior.root, prior.relativePath))) {
    const destination = rootDestination(preflightPlan.roots, prior.root, prior.relativePath);
    if (!fs.existsSync(destination)) actions.push({ action: "NOOP_PRUNED", root: prior.root, relativePath: prior.relativePath, destination, priorHash: prior.deployedHash });
    else { assertDestinationSafety(destination); const currentHash = sha256File(destination);
      if (currentHash === prior.deployedHash) actions.push({ action: "PRUNE", root: prior.root, relativePath: prior.relativePath, destination, priorHash: currentHash }); else conflicts.push(`${prior.root}/${prior.relativePath}`);
    }
  }
  if (conflicts.length) fail(`managed deployment conflicts: ${conflicts.sort().join(", ")}`);
  const entries = actions.filter((action) => !action.action.startsWith("NOOP")).filter((action) => action.action !== "PRUNE").map((action) => ({ root: action.root, relativePath: action.relativePath, deployedHash: action.sourceHash }));
  for (const action of actions) if (action.action === "NOOP") entries.push({ root: action.root, relativePath: action.relativePath, deployedHash: action.sourceHash });
  return { ...preflightPlan, previous, actions, manifest: validateManifest({ schemaVersion: MANIFEST_SCHEMA_VERSION, entries }, preflightPlan.roots) };
}
function acquireLock(plan) {
  const lockPath = path.join(path.dirname(plan.targetDir), `.omp-sync-${path.basename(plan.targetDir)}.lock`); assertNoExistingLinks(lockPath, "deployment lock");
  if (isSameOrNested(lockPath, plan.targetDir) || isSameOrNested(lockPath, plan.workspaceDir) || isSameOrNested(lockPath, plan.backupDir)) fail("deployment lock overlaps a managed root");
  try { return { path: lockPath, fd: fs.openSync(lockPath, "wx", 0o600) }; } catch (error) { if (error && error.code === "EEXIST") fail(`deployment lock already exists: ${lockPath}; operator recovery is required`); throw error; }
}
function releaseLock(lock) { if (!lock) return; try { fs.closeSync(lock.fd); } finally { try { fs.unlinkSync(lock.path); } catch {} } }
function assertBackupParentSecure(backupDir) {
  const parent = path.dirname(backupDir); if (process.platform !== "win32") { if ((fs.statSync(parent).mode & 0o022) !== 0) fail(`backup parent must not be group/world writable: ${parent}`); return; }
  const acl = execFileSync("icacls", [parent], { encoding: "utf8", windowsHide: true });
  if (/Everyone:.*\((?:F|M|W)\)/i.test(acl)) fail(`backup parent has permissive inherited ACL: ${parent}`);
}
function mkdirSecure(directory) { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); if (process.platform !== "win32") fs.chmodSync(directory, 0o700); }
function writeJsonAtomic(filePath, value) { const temp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temp, filePath); }
function fault(point) { if (process.env.OMP_FAULT_INJECT === point) fail(`fault injected at ${point}`); }
function stageFiles(plan) {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-sync-stage-")); const staged = new Map();
  try { for (const action of plan.actions) if (action.action === "CREATE" || action.action === "OVERWRITE") {
    const stagePath = path.join(stageDir, String(staged.size)); fs.copyFileSync(action.source, stagePath); if (sha256File(stagePath) !== action.sourceHash) fail(`staging hash mismatch: ${action.source}`); staged.set(action.destination, stagePath);
  } return { stageDir, staged }; } catch (error) { fs.rmSync(stageDir, { recursive: true, force: true }); throw error; }
}
function capturePreimage(destination, backupDir, ordinal) {
  const backupPath = path.join(backupDir, "preimages", String(ordinal));
  const priorExists = fs.existsSync(destination);
  if (!priorExists) return { priorExists: false, backupPath: null, priorHash: null };
  assertDestinationSafety(destination);
  mkdirSecure(path.dirname(backupPath));
  fs.copyFileSync(destination, backupPath);
  const priorHash = sha256File(destination);
  if (sha256File(backupPath) !== priorHash) fail(`backup hash mismatch: ${destination}`);
  if (process.platform !== "win32") fs.chmodSync(backupPath, 0o600);
  return { priorExists: true, backupPath, priorHash };
}
function plannedDirectories(destination, root) {
  const parent = path.dirname(destination);
  if (!isSameOrNested(parent, root)) fail(`destination parent escapes root: ${destination}`);
  const missing = []; let cursor = parent;
  while (!fs.existsSync(cursor) && normalizeForComparison(cursor) !== normalizeForComparison(root)) {
    missing.push(cursor);
    cursor = path.dirname(cursor);
  }
  if (!fs.existsSync(root)) missing.push(root);
  return missing.reverse();
}
function createDirectories(directories) {
  for (const directory of directories) fs.mkdirSync(directory, { mode: 0o700 });
}
function restoreEntry(entry, unresolved) {
  const exists = fs.existsSync(entry.destination);
  try {
    if (entry.priorExists) {
      if (exists && sha256File(entry.destination) === entry.priorHash) return;
      if (entry.action === "PRUNE" && exists) {
        unresolved.push(entry.destination);
        return;
      }
      mkdirSecure(path.dirname(entry.destination));
      fs.copyFileSync(entry.backupPath, entry.destination);
      if (sha256File(entry.destination) !== entry.priorHash) throw new Error("restored hash mismatch");
    } else if (exists) {
      if (entry.newHash && sha256File(entry.destination) !== entry.newHash && !entry.applied) {
        unresolved.push(entry.destination);
        return;
      }
      fs.unlinkSync(entry.destination);
    }
    for (const directory of [...entry.createdDirectories].reverse()) { try { fs.rmdirSync(directory); } catch {} }
  } catch { unresolved.push(entry.destination); }
}
function rollback(journal, journalPath) {
  const unresolved = []; let injected = false;
  const entries = [...journal.entries];
  if (journal.manifest && journal.manifest.intent) entries.push(journal.manifest);
  for (const entry of entries.reverse()) {
    if (!entry.intent) continue;
    restoreEntry(entry, unresolved);
    if (!injected && process.env.OMP_FAULT_INJECT === "during_rollback") {
      unresolved.push(entry.destination);
      injected = true;
    }
  }
  journal.status = unresolved.length ? "rollback_incomplete" : "recovered";
  journal.unresolved = [...new Set(unresolved)].sort();
  writeJsonAtomic(journalPath, journal);
  return journal.unresolved;
}
function applyTransaction(plan, config) {
  assertBackupParentSecure(plan.backupDir);
  mkdirSecure(plan.backupDir);
  const journalPath = path.join(plan.backupDir, JOURNAL_NAME);
  const staging = stageFiles(plan);
  const changes = plan.actions.filter((action) => action.action === "CREATE" || action.action === "OVERWRITE" || action.action === "PRUNE");
  const manifestPath = path.join(plan.targetDir, MANIFEST_NAME);
  const journal = { schemaVersion: 1, status: "intent", entries: [], manifest: null, unresolved: [] };
  let journalPersisted = false;
  try {
    changes.forEach((action, index) => {
      const image = capturePreimage(action.destination, plan.backupDir, index);
      journal.entries.push({ destination: action.destination, root: action.root, relativePath: action.relativePath, action: action.action, ...image, newHash: action.sourceHash || null, createdDirectories: [], intent: false, applied: false });
    });
    journal.manifest = { destination: manifestPath, ...capturePreimage(manifestPath, plan.backupDir, changes.length), newHash: sha256Text(`${JSON.stringify(plan.manifest, null, 2)}\n`), createdDirectories: [], intent: false, applied: false };
    writeJsonAtomic(journalPath, journal);
    journalPersisted = true;
    for (let index = 0; index < changes.length; index += 1) {
      const action = changes[index];
      const entry = journal.entries[index];
      if (action.action !== "PRUNE") entry.createdDirectories = plannedDirectories(action.destination, plan.roots[action.root]);
      entry.intent = true;
      writeJsonAtomic(journalPath, journal);
      if (action.action === "PRUNE") {
        if (!fs.existsSync(action.destination) || sha256File(action.destination) !== entry.priorHash) fail(`destination changed before prune: ${action.destination}`);
        fs.unlinkSync(action.destination);
      } else {
        const currentHash = fs.existsSync(action.destination) ? sha256File(action.destination) : null;
        if (currentHash !== entry.priorHash) fail(`destination changed before write: ${action.destination}`);
        createDirectories(entry.createdDirectories);
        fs.copyFileSync(staging.staged.get(action.destination), action.destination);
        fault("after_copy_write");
        if (sha256File(action.destination) !== entry.newHash) fail(`destination hash mismatch: ${action.destination}`);
      }
      entry.applied = true;
      writeJsonAtomic(journalPath, journal);
      if (action.root === ROOT_TARGET) fault("after_target_copy");
      else fault("after_global_write");
      if (action.action === "PRUNE") fault("after_prune");
    }
    journal.manifest.createdDirectories = plannedDirectories(manifestPath, plan.targetDir);
    journal.manifest.intent = true;
    writeJsonAtomic(journalPath, journal);
    createDirectories(journal.manifest.createdDirectories);
    writeJsonAtomic(manifestPath, plan.manifest);
    fault("after_manifest_write");
    if (sha256File(manifestPath) !== journal.manifest.newHash) fail("sync manifest hash mismatch");
    journal.manifest.applied = true;
    writeJsonAtomic(journalPath, journal);
    fault("before_verify");
    if (config.skipVerifyTests) {
      journal.status = "deployed_unverified";
      writeJsonAtomic(journalPath, journal);
      return "DEPLOYED_UNVERIFIED";
    }
    execFileSync(config.bunBin, ["test"], { cwd: plan.targetDir, stdio: "inherit", env: { ...process.env, OMP_SKIP_VERIFY_TESTS: "" } });
    journal.status = "verified";
    writeJsonAtomic(journalPath, journal);
    return "DEPLOYED_VERIFIED";
  } catch (error) {
    if (!journalPersisted) {
      const wrapped = new Error(`BACKUP_INCOMPLETE: ${error instanceof Error ? error.message : String(error)}`);
      wrapped.exitCode = 1;
      throw wrapped;
    }
    const unresolved = rollback(journal, journalPath);
    const status = unresolved.length ? "RECOVERY_INCOMPLETE" : "RECOVERED";
    const wrapped = new Error(`${status}: ${error instanceof Error ? error.message : String(error)}${unresolved.length ? `; unresolved: ${unresolved.join(", ")}` : ""}`);
    wrapped.exitCode = unresolved.length ? 2 : 1;
    throw wrapped;
  } finally {
    fs.rmSync(staging.stageDir, { recursive: true, force: true });
  }
}
function sha256Text(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function main() {
  const { dryRun, bootstrap } = parseArgs(process.argv.slice(2)); const workspaceDir = process.env.OMP_WORKSPACE_DIR ? path.resolve(process.env.OMP_WORKSPACE_DIR) : path.resolve(__dirname, ".."); const homeDir = process.env.OMP_HOME_DIR ? path.resolve(process.env.OMP_HOME_DIR) : os.homedir(); const targetDir = process.env.OMP_TARGET_DIR ? path.resolve(process.env.OMP_TARGET_DIR) : path.normalize("C:/Users/thant/Projects/omp_extension"); const pointerPath = process.env.OMP_EXTENSION_POINTER ? path.resolve(process.env.OMP_EXTENSION_POINTER) : path.join(homeDir, ".omp", "agent", "extensions", "typesafe-planner.ts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); const backupDir = process.env.OMP_BACKUP_DIR ? path.resolve(process.env.OMP_BACKUP_DIR) : path.join(path.dirname(targetDir), `${path.basename(targetDir)}_backup_${timestamp}`); const config = { workspaceDir, targetDir, homeDir, pointerPath, backupDir, bunBin: process.env.OMP_BUN_BIN || "bun", skipVerifyTests: process.env.OMP_SKIP_VERIFY_TESTS === "1", bootstrap };
  const preflightPlan = preflight(config); const initialPlan = createPlan(preflightPlan, config); console.log(`Preflight succeeded for ${initialPlan.inventory.length} baseline files.`); console.log(`Managed actions: ${initialPlan.actions.map((action) => `${action.bootstrap ? "BOOTSTRAP_OVERWRITE" : action.action}:${action.root}/${action.relativePath}`).join(", ") || "none"}`);
  if (dryRun) { console.log("Dry run completed; no lock, backup, staging, journal, or filesystem mutation was performed."); return; }
  let lock; try { lock = acquireLock(initialPlan); const plan = createPlan(preflight(config), config); const status = applyTransaction(plan, config); console.log(`${status}. Backup and journal retained: ${plan.backupDir}`); } finally { releaseLock(lock); }
}
try { main(); } catch (error) { console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = error && error.exitCode === 2 ? 2 : 1; }
