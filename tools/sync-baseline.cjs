#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildChildEnvironment, execFileChildSync, createVerificationHome } = require("../src/typesafe-child-env.cjs");
const { readWorkspaceFile } = require("../src/typesafe-evidence-file.cjs");

const ROOT_FILES = ["typesafe-planner.ts", "package.json", ".gitignore"];
const REQUIRED_RUNTIME_FILES = [
  "typesafe-enabled-resolver.cjs",
  "typesafe-api-client.cjs",
  "typesafe-redact.cjs",
  "typesafe-redact-patterns.cjs",
  "typesafe-policy-client.cjs",
  "typesafe-child-env.cjs",
  "typesafe-evidence-file.cjs",
];
const RECURSIVE_ROOTS = ["agents", ".omp/agents", "docs", "src", "tests", "plans", "scripts", "tools"];
const PRIVATE_EVALUATION_ROOTS = [
  "plans/261019-jev-atomic-review/evaluation",
  "plans/261019-jev-atomic-review/reports/paired",
];
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
function readImage(filePath) { return readWorkspaceFile(path.dirname(filePath), path.basename(filePath), { maxBytes: 64 * 1024 * 1024 }); }
function sha256File(filePath) { return readImage(filePath).sha256; }
function imageMetadata(image) { return image ? { sha256: image.sha256, identity: image.identity } : null; }
function equalImage(left, right) { return left === null || right === null ? left === right : left.sha256 === right.sha256 && JSON.stringify(left.identity) === JSON.stringify(right.identity); }
function currentImage(filePath) { try { return imageMetadata(readImage(filePath)); } catch (error) { if (error.code === "FILE_MISSING") return null; throw error; } }
function assertImage(filePath, expected) { if (!equalImage(currentImage(filePath), expected)) fail("managed file identity changed"); }
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
function isPackagedSource(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const comparison = process.platform === "win32" ? normalized.toLowerCase() : normalized;
  if (PRIVATE_EVALUATION_ROOTS.some((root) => comparison === root || comparison.startsWith(`${root}/`))) return false;
  // Runtime imports use the real direct helper modules, not copied data or generated runs.
  if (comparison.startsWith("tools/jev-paired-")) return /^tools\/jev-paired-[^/]+\.ts$/.test(comparison) && !/(?:\.(?:test|spec)|[-.]fixtures?)\.ts$/.test(comparison);
  return true;
}
function listRegularFiles(directory, relativePrefix = "") {
  try { fs.lstatSync(directory); } catch (error) { if (error && error.code === "ENOENT") return []; throw error; }
  assertRealDirectory(directory, `source directory ${directory}`); const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name); const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (!isPackagedSource(relativePath)) continue;
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) fail("packaged source contains a symbolic link or junction");
    if (stat.isDirectory()) files.push(...listRegularFiles(entryPath, relativePath)); else if (stat.isFile()) files.push(relativePath);
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
  assertRegularFile(pointerPath, "OMP extension pointer"); const content = readImage(pointerPath).bytes;
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
  try { return validateManifest(JSON.parse(readImage(manifestPath).bytes.toString("utf8")), roots); } catch { fail("sync manifest is malformed or unavailable"); }
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
  const manifestImage = currentImage(manifestPath);
  if (config.bootstrap && fs.existsSync(manifestPath)) {
    fail("bootstrap is allowed only when the target has no sync manifest");
  }
  const previous = readManifest(preflightPlan.targetDir, preflightPlan.roots); const priorByKey = new Map(previous.entries.map((entry) => [manifestKey(entry.root, entry.relativePath), entry]));
  const desiredKeys = new Set(); const actions = []; const conflicts = [];
  for (const desired of preflightPlan.desired) {
    const key = manifestKey(desired.root, desired.relativePath); desiredKeys.add(key); const destination = rootDestination(preflightPlan.roots, desired.root, desired.relativePath); const sourceImage = imageMetadata(readImage(desired.source)); const sourceHash = sourceImage.sha256; const prior = priorByKey.get(key);
    desired.sourceImage = sourceImage;
    if (!fs.existsSync(destination)) actions.push({ action: "CREATE", ...desired, destination, sourceHash, destinationImage: null });
    else { assertDestinationSafety(destination); const destinationImage = currentImage(destination); const currentHash = destinationImage.sha256;
      if (currentHash === sourceHash) actions.push({ action: "NOOP", ...desired, destination, sourceHash, destinationImage });
      else if (prior && prior.deployedHash === currentHash) actions.push({ action: "OVERWRITE", ...desired, destination, sourceHash, priorHash: currentHash, destinationImage });
      else if (config.bootstrap) actions.push({ action: "OVERWRITE", ...desired, destination, sourceHash, priorHash: currentHash, destinationImage, bootstrap: true });
      else conflicts.push(`${desired.root}/${desired.relativePath}`);
    }
  }
  for (const prior of previous.entries) if (!desiredKeys.has(manifestKey(prior.root, prior.relativePath))) {
    const destination = rootDestination(preflightPlan.roots, prior.root, prior.relativePath);
    if (!fs.existsSync(destination)) actions.push({ action: "NOOP_PRUNED", root: prior.root, relativePath: prior.relativePath, destination, priorHash: prior.deployedHash });
    else { assertDestinationSafety(destination); const destinationImage = currentImage(destination); const currentHash = destinationImage.sha256;
      if (currentHash === prior.deployedHash) actions.push({ action: "PRUNE", root: prior.root, relativePath: prior.relativePath, destination, priorHash: currentHash, destinationImage }); else conflicts.push(`${prior.root}/${prior.relativePath}`);
    }
  }
  if (conflicts.length) fail(`managed deployment conflicts: ${conflicts.sort().join(", ")}`);
  const entries = actions.filter((action) => !action.action.startsWith("NOOP")).filter((action) => action.action !== "PRUNE").map((action) => ({ root: action.root, relativePath: action.relativePath, deployedHash: action.sourceHash }));
  for (const action of actions) if (action.action === "NOOP") entries.push({ root: action.root, relativePath: action.relativePath, deployedHash: action.sourceHash });
  assertImage(manifestPath, manifestImage);
  for (const action of actions) {
    action.destinationParents = captureParents(action.destination);
    if (action.source) action.sourceParents = captureParents(action.source);
  }
  return { ...preflightPlan, previous, actions, manifestImage, manifestParents: captureParents(manifestPath), manifest: validateManifest({ schemaVersion: MANIFEST_SCHEMA_VERSION, entries }, preflightPlan.roots) };
}
function acquireLock(plan) {
  const lockPath = path.join(path.dirname(plan.targetDir), `.omp-sync-${path.basename(plan.targetDir)}.lock`); assertNoExistingLinks(lockPath, "deployment lock");
  if (isSameOrNested(lockPath, plan.targetDir) || isSameOrNested(lockPath, plan.workspaceDir) || isSameOrNested(lockPath, plan.backupDir)) fail("deployment lock overlaps a managed root");
  let fd;
  try {
    fd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(fd, crypto.randomBytes(24).toString("hex")); fs.fsyncSync(fd);
    const image = currentImage(lockPath); const descriptor = fs.fstatSync(fd, { bigint: true });
    if (!image || Object.entries(image.identity).some(([key, value]) => String(descriptor[key]) !== value)) fail("deployment lock identity changed");
    return { path: lockPath, fd, image, parents: captureParents(lockPath) };
  } catch (error) { if (fd !== undefined) fs.closeSync(fd); if (error && error.code === "EEXIST") fail(`deployment lock already exists: ${lockPath}; operator recovery is required`); throw error; }
}
function ownsLock(lock) {
  try {
    assertParents(lock.parents);
    const descriptor = fs.fstatSync(lock.fd, { bigint: true });
    return Object.entries(lock.image.identity).every(([key, value]) => String(descriptor[key]) === value) && equalImage(currentImage(lock.path), lock.image);
  } catch { return false; }
}
function releaseLock(lock, retain = false) {
  if (!lock) return;
  try { if (!retain && ownsLock(lock)) fs.unlinkSync(lock.path); } finally { fs.closeSync(lock.fd); }
}
function assertBackupParentSecure(backupDir) {
  const parent = path.dirname(backupDir); if (process.platform !== "win32") { if ((fs.statSync(parent).mode & 0o022) !== 0) fail(`backup parent must not be group/world writable: ${parent}`); return; }
  const acl = execFileChildSync("deployment-acl", "icacls", [parent], { encoding: "utf8", windowsHide: true });
  if (/Everyone:.*\((?:F|M|W)\)/i.test(acl)) fail(`backup parent has permissive inherited ACL: ${parent}`);
}
function mkdirSecure(directory) { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); if (process.platform !== "win32") fs.chmodSync(directory, 0o700); }
function writeOwnedFile(filePath, bytes, mode, expectedHash) {
  const fd = fs.openSync(filePath, "wx", mode);
  let produced;
  try {
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
    const descriptor = fs.fstatSync(fd, { bigint: true }); const image = currentImage(filePath);
    if (!image || image.sha256 !== expectedHash || Object.entries(image.identity).some(([key, value]) => String(descriptor[key]) !== value)) fail("owned staging identity changed");
    const after = fs.fstatSync(fd, { bigint: true });
    if (Object.entries(image.identity).some(([key, value]) => String(after[key]) !== value)) fail("owned descriptor identity changed");
    produced = image;
  } finally { fs.closeSync(fd); }
  // Windows may finalize write timestamps on close; provenance still requires our exact node.
  const closed = currentImage(filePath);
  if (!closed || closed.sha256 !== produced.sha256 || ["dev", "ino", "mode", "nlink", "size", "birthtimeNs"].some((key) => closed.identity[key] !== produced.identity[key])) fail("closed staging identity changed");
  return closed;
}
function samePromotedImage(image, staged) {
  return image && staged && image.sha256 === staged.sha256 && ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "birthtimeNs"].every((key) => image.identity[key] === staged.identity[key]);
}
function writeJsonAtomic(filePath, value, guard) {
  const temp = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const staged = writeOwnedFile(temp, bytes, 0o600, sha256Text(bytes));
  guard(); assertImage(temp, staged);
  fs.renameSync(temp, filePath);
  const promoted = currentImage(filePath);
  if (!samePromotedImage(promoted, staged)) fail("journal promotion identity changed");
  return promoted;
}
function fault(point) { if (process.env.OMP_FAULT_INJECT === point) fail(`fault injected at ${point}`); }
function stageFiles(plan) {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-sync-stage-")); const staged = new Map();
  const staging = { stageDir, staged, parents: captureParents(path.join(stageDir, "entry")) };
  try { for (const action of plan.actions) if (action.action === "CREATE" || action.action === "OVERWRITE") {
    assertParents(action.sourceParents);
    assertParents(staging.parents);
    const image = readImage(action.source);
    if (!equalImage(imageMetadata(image), action.sourceImage)) fail("source changed before staging");
    const stagePath = path.join(stageDir, String(staged.size));
    const stageImage = writeOwnedFile(stagePath, image.bytes, 0o600, image.sha256);
    staged.set(action.destination, { path: stagePath, image: stageImage });
  } return staging; } catch (error) { cleanupStaging(staging); throw error; }
}
function capturePreimage(destination, backupDir, ordinal, expected) {
  const backupPath = path.join(backupDir, "preimages", String(ordinal));
  const image = currentImage(destination);
  if (expected !== undefined && !equalImage(image, expected)) fail("destination changed before backup");
  if (!image) return { priorExists: false, backupPath: null, priorHash: null, preimage: null, backupImage: null };
  const accepted = readImage(destination);
  if (!equalImage(imageMetadata(accepted), image)) fail("preimage changed during backup");
  mkdirSecure(path.dirname(backupPath));
  const backupImage = writeOwnedFile(backupPath, accepted.bytes, 0o600, accepted.sha256);
  return { priorExists: true, backupPath, priorHash: accepted.sha256, preimage: image, backupImage, backupParents: captureParents(backupPath) };
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
function directoryIdentity(directory) {
  assertRealDirectory(directory, "transaction directory");
  const stat = fs.lstatSync(directory, { bigint: true });
  if (stat.ino === 0n) fail("directory identity unavailable");
  return { dev: String(stat.dev), ino: String(stat.ino), mode: String(stat.mode) };
}
function sameDirectory(directory, expected) { try { return JSON.stringify(directoryIdentity(directory)) === JSON.stringify(expected); } catch { return false; } }
function captureParents(filePath) {
  const parents = []; let cursor = path.dirname(filePath);
  while (true) {
    if (fs.existsSync(cursor)) parents.push({ path: cursor, identity: directoryIdentity(cursor) });
    const next = path.dirname(cursor); if (next === cursor) break; cursor = next;
  }
  return parents;
}
function assertParents(parents) { for (const entry of parents) if (!sameDirectory(entry.path, entry.identity)) fail("transaction parent identity changed"); }
function cleanupStaging(staging) {
  try {
    assertParents(staging.parents);
    for (const staged of staging.staged.values()) { try { assertImage(staged.path, staged.image); fs.unlinkSync(staged.path); } catch {} }
    fs.rmdirSync(staging.stageDir);
  } catch {}
}
function ownedWrite(entry, bytes, persist) {
  assertParents(entry.parentChain);
  const parentChain = captureParents(entry.destination);
  assertParents(entry.parentChain);
  entry.parentChain = parentChain;
  persist();
  const temporary = path.join(path.dirname(entry.destination), `.omp-sync-write-${crypto.randomBytes(12).toString("hex")}`);
  const stagedImage = writeOwnedFile(temporary, bytes, entry.preimage ? Number(entry.preimage.identity.mode) & 0o777 : 0o600, entry.newHash);
  entry.staging = { path: temporary, image: stagedImage };
  persist();
  assertParents(entry.parentChain);
  assertImage(temporary, entry.staging.image);
  assertImage(entry.destination, entry.preimage);
  fs.renameSync(temporary, entry.destination);
  entry.postimage = currentImage(entry.destination);
  if (!samePromotedImage(entry.postimage, entry.staging.image)) fail("promoted file identity changed");
  persist();
}
function restoreEntry(entry, unresolved, backupOwned) {
  try {
    assertParents(entry.parentChain);
    const observed = currentImage(entry.destination);
    if ((entry.priorExists && equalImage(observed, entry.preimage)) || (!entry.postimageKnown && equalImage(observed, entry.preimage)) || (entry.restoredImage && equalImage(observed, entry.restoredImage))) return;
    if (!entry.postimageKnown || !equalImage(observed, entry.postimage)) {
      unresolved.push({ path: entry.destination, reason: "POSTIMAGE_NOT_OWNED", expected: entry.postimage || null, observed }); return;
    }
    if (entry.priorExists) {
      if (!backupOwned()) throw new Error("BACKUP_DIRECTORY_CHANGED");
      assertParents(entry.backupParents);
      const backup = readImage(entry.backupPath);
      if (!equalImage(imageMetadata(backup), entry.backupImage) || backup.sha256 !== entry.priorHash) throw new Error("BACKUP_IDENTITY_CHANGED");
      const temporary = path.join(path.dirname(entry.destination), `.omp-sync-restore-${crypto.randomBytes(12).toString("hex")}`);
      const stagedImage = writeOwnedFile(temporary, backup.bytes, Number(entry.preimage.identity.mode) & 0o777, backup.sha256);
      assertParents(entry.parentChain); assertParents(entry.backupParents);
      assertImage(temporary, stagedImage);
      assertImage(entry.destination, observed);
      fs.renameSync(temporary, entry.destination);
      entry.restoredImage = currentImage(entry.destination);
      if (!samePromotedImage(entry.restoredImage, stagedImage)) throw new Error("RESTORE_HASH_CHANGED");
    } else if (observed) {
      assertParents(entry.parentChain);
      assertImage(entry.destination, entry.postimage);
      fs.unlinkSync(entry.destination);
      entry.restoredImage = null;
    }
  } catch (error) {
    unresolved.push({ path: entry.destination, reason: ["BACKUP_DIRECTORY_CHANGED", "BACKUP_IDENTITY_CHANGED", "RESTORE_HASH_CHANGED"].includes(error.message) ? error.message : "RESTORE_IDENTITY_UNAVAILABLE" });
  }
}
function rollback(journal, persist, backupOwned, lock) {
  const unresolved = []; let injected = false;
  const entries = [...journal.entries];
  if (journal.manifest && journal.manifest.intent) entries.push(journal.manifest);
  for (const entry of entries.reverse()) {
    if (!entry.intent) continue;
    restoreEntry(entry, unresolved, backupOwned);
    if (!injected && process.env.OMP_FAULT_INJECT === "during_rollback") {
      unresolved.push({ path: entry.destination, reason: "INJECTED_ROLLBACK_FAILURE" }); injected = true;
    }
  }
  for (const entry of journal.unchanged) {
    try { assertParents(entry.parents); assertImage(entry.destination, entry.image); }
    catch { unresolved.push({ path: entry.destination, reason: "UNCHANGED_PATH_CHANGED", expected: entry.image }); }
  }
  if (!ownsLock(lock)) unresolved.push({ path: lock.path, reason: "LOCK_IDENTITY_CHANGED" });
  if (!backupOwned()) unresolved.push({ path: journal.backupDir, reason: "BACKUP_DIRECTORY_CHANGED" });
  journal.status = unresolved.length ? "rollback_incomplete" : "recovered";
  journal.unresolved = unresolved;
  try { persist(); } catch {
    unresolved.push({ path: journal.journalPath, reason: "JOURNAL_IDENTITY_CHANGED" });
    journal.status = "rollback_incomplete";
    // Preserve an interfering journal; retain our recovery record in an exclusive sibling.
    const recoveryPath = `${journal.backupDir}.recovery-${crypto.randomBytes(12).toString("hex")}.json`;
    journal.recoveryJournalPath = recoveryPath;
    try {
      assertParents(journal.recoveryParents);
      fs.writeFileSync(recoveryPath, `${JSON.stringify(journal, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    } catch {
      unresolved.push({ path: recoveryPath, reason: "RECOVERY_JOURNAL_UNAVAILABLE" });
      // The error must still be RECOVERY_INCOMPLETE and retain the owned lock.
    }
  }
  return journal.unresolved;
}
function applyTransaction(plan, config, lock) {
  assertBackupParentSecure(plan.backupDir);
  fs.mkdirSync(plan.backupDir, { mode: 0o700 });
  const backupIdentity = directoryIdentity(plan.backupDir);
  const backupParents = captureParents(path.join(plan.backupDir, "entry"));
  const backupOwned = () => { try { assertParents(backupParents); return sameDirectory(plan.backupDir, backupIdentity); } catch { return false; } };
  const journalPath = path.join(plan.backupDir, JOURNAL_NAME);
  const staging = stageFiles(plan);
  const changes = plan.actions.filter((action) => action.action === "CREATE" || action.action === "OVERWRITE" || action.action === "PRUNE");
  const manifestPath = path.join(plan.targetDir, MANIFEST_NAME);
  const journal = { schemaVersion: 1, status: "intent", backupDir: plan.backupDir, journalPath, recoveryParents: captureParents(plan.backupDir), lock: { path: lock.path, image: lock.image }, entries: [], manifest: null, unresolved: [] };
  journal.unchanged = plan.actions.filter((action) => action.action.startsWith("NOOP")).map((action) => ({ destination: action.destination, parents: action.destinationParents, image: action.destinationImage || null }));
  let journalPersisted = false; let journalImage = null;
  const persist = () => {
    if (!backupOwned()) fail("backup directory identity changed");
    assertImage(journalPath, journalImage);
    journalImage = writeJsonAtomic(journalPath, journal, () => {
      if (!backupOwned()) fail("backup directory identity changed");
      assertImage(journalPath, journalImage);
    });
  };
  try {
    changes.forEach((action, index) => {
      assertParents(action.destinationParents);
      const image = capturePreimage(action.destination, plan.backupDir, index, action.destinationImage);
      journal.entries.push({ destination: action.destination, parentChain: action.destinationParents, root: action.root, relativePath: action.relativePath, action: action.action, ...image, newHash: action.sourceHash || null, postimage: null, postimageKnown: false, createdDirectories: [], intent: false, applied: false });
    });
    assertParents(plan.manifestParents);
    journal.manifest = { destination: manifestPath, parentChain: plan.manifestParents, action: "MANIFEST", ...capturePreimage(manifestPath, plan.backupDir, changes.length, plan.manifestImage), newHash: sha256Text(`${JSON.stringify(plan.manifest, null, 2)}\n`), postimage: null, postimageKnown: false, createdDirectories: [], intent: false, applied: false };
    persist(); journalPersisted = true;
    for (let index = 0; index < changes.length; index += 1) {
      const action = changes[index]; const entry = journal.entries[index];
      if (action.action !== "PRUNE") entry.createdDirectories = plannedDirectories(action.destination, plan.roots[action.root]);
      entry.intent = true; persist();
      assertImage(entry.destination, entry.preimage);
      if (action.action === "PRUNE") {
        fs.unlinkSync(action.destination); entry.postimage = null;
      } else {
        createDirectories(entry.createdDirectories);
        const staged = staging.staged.get(action.destination); const accepted = readImage(staged.path);
        assertParents(staging.parents);
        if (!equalImage(imageMetadata(accepted), staged.image)) fail("staging identity changed");
        ownedWrite(entry, accepted.bytes, persist);
      }
      entry.postimageKnown = true; persist();
      if (action.action !== "PRUNE") fault("after_copy_write");
      entry.applied = true; persist();
      if (action.root === ROOT_TARGET) fault("after_target_copy"); else fault("after_global_write");
      if (action.action === "PRUNE") fault("after_prune");
    }
    journal.manifest.createdDirectories = plannedDirectories(manifestPath, plan.targetDir);
    journal.manifest.intent = true; persist();
    createDirectories(journal.manifest.createdDirectories);
    ownedWrite(journal.manifest, Buffer.from(`${JSON.stringify(plan.manifest, null, 2)}\n`), persist);
    journal.manifest.postimageKnown = true; persist();
    fault("after_manifest_write");
    journal.manifest.applied = true; persist();
    fault("before_verify");
    if (!config.skipVerifyTests) {
      const home = createVerificationHome();
      try { home.execFileSync("deployment-verify", config.bunBin, ["test"], { cwd: plan.targetDir, stdio: "inherit" }); }
      finally { home.cleanup(); }
    }
    if (!ownsLock(lock)) fail("deployment lock identity changed");
    // Verification cannot silently mutate managed postimages or recovery preimages.
    for (const entry of [...journal.entries, journal.manifest]) {
      assertParents(entry.parentChain);
      assertImage(entry.destination, entry.postimage);
      if (entry.backupImage) { assertParents(entry.backupParents); assertImage(entry.backupPath, entry.backupImage); }
    }
    for (const entry of journal.unchanged) { assertParents(entry.parents); assertImage(entry.destination, entry.image); }
    journal.status = config.skipVerifyTests ? "deployed_unverified" : "verified"; persist();
    return config.skipVerifyTests ? "DEPLOYED_UNVERIFIED" : "DEPLOYED_VERIFIED";
  } catch (error) {
    if (!journalPersisted) {
      const wrapped = new Error(`BACKUP_INCOMPLETE: ${error instanceof Error ? error.message : String(error)}`);
      wrapped.exitCode = 1; throw wrapped;
    }
    const unresolved = rollback(journal, persist, backupOwned, lock);
    const details = unresolved.length ? `; reasons: ${[...new Set(unresolved.map((entry) => entry.reason))].join(", ")}; recovery evidence: ${journal.recoveryJournalPath || journalPath}` : "";
    const wrapped = new Error(`${unresolved.length ? "RECOVERY_INCOMPLETE" : "RECOVERED"}: ${error instanceof Error ? error.message : String(error)}${details}`);
    wrapped.exitCode = unresolved.length ? 2 : 1; throw wrapped;
  } finally {
    cleanupStaging(staging);
  }
}
function sha256Text(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function main() {
  const allowed = buildChildEnvironment("deployment-sync");
  const { dryRun, bootstrap } = parseArgs(process.argv.slice(2)); const workspaceDir = allowed.OMP_WORKSPACE_DIR || path.resolve(__dirname, ".."); const homeDir = allowed.OMP_HOME_DIR || os.homedir(); const targetDir = allowed.OMP_TARGET_DIR || path.normalize("C:/Users/thant/Projects/omp_extension"); const pointerPath = allowed.OMP_EXTENSION_POINTER || path.join(homeDir, ".omp", "agent", "extensions", "typesafe-planner.ts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); const backupDir = allowed.OMP_BACKUP_DIR || path.join(path.dirname(targetDir), `${path.basename(targetDir)}_backup_${timestamp}`); const config = { workspaceDir, targetDir, homeDir, pointerPath, backupDir, bunBin: allowed.OMP_BUN_BIN || "bun", skipVerifyTests: process.env.OMP_SKIP_VERIFY_TESTS === "1", bootstrap };
  const preflightPlan = preflight(config); const initialPlan = createPlan(preflightPlan, config); console.log(`Preflight succeeded for ${initialPlan.inventory.length} baseline files.`); console.log(`Managed actions: ${initialPlan.actions.map((action) => `${action.bootstrap ? "BOOTSTRAP_OVERWRITE" : action.action}:${action.root}/${action.relativePath}`).join(", ") || "none"}`);
  if (dryRun) { console.log("Dry run completed; no lock, backup, staging, journal, or filesystem mutation was performed."); return; }
  let lock; let retainLock = false;
  try { lock = acquireLock(initialPlan); const plan = createPlan(preflight(config), config); const status = applyTransaction(plan, config, lock); console.log(`${status}. Backup and journal retained: ${plan.backupDir}`); }
  catch (error) { retainLock = error.exitCode === 2; throw error; }
  finally { releaseLock(lock, retainLock); }
}
try { main(); } catch (error) { console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = error && error.exitCode === 2 ? 2 : 1; }
