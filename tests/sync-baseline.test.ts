import { expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import type { WorkspaceFileIdentity } from "../src/typesafe-evidence-file.cjs";

const scriptPath = path.resolve(import.meta.dir, "../tools/sync-baseline.cjs");
setDefaultTimeout(60_000);


interface Fixture {
  root: string;
  workspace: string;
  target: string;
  home: string;
  pointer: string;
  backup: string;
}

interface FileSnapshot {
  target: string;
  pointer: string;
  configExists: boolean;
  backupExists: boolean;
}

function writeFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function createFixture(): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), "sync-baseline-"));
  const workspace = path.join(root, "workspace");
  const target = path.join(root, "target");
  const home = path.join(root, "home");
  const pointer = path.join(home, ".omp", "agent", "extensions", "typesafe-planner.ts");
  const backup = path.join(root, "backup");

  mkdirSync(target, { recursive: true });
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  mkdirSync(path.join(home, ".omp", "agent", "agents"), { recursive: true });
  writeFile(path.join(workspace, "typesafe-planner.ts"), "export default {};\n");
  writeFile(path.join(workspace, "package.json"), "{}\n");
  writeFile(path.join(workspace, ".gitignore"), "node_modules\n");
  for (const name of [
    "typesafe-enabled-resolver.cjs",
    "typesafe-api-client.cjs",
    "typesafe-redact.cjs",
    "typesafe-redact-patterns.cjs",
    "typesafe-policy-client.cjs",
  ]) {
    writeFile(path.join(workspace, "src", name), "module.exports = {};\n");
  }
  for (const name of ["typesafe-child-env.cjs", "typesafe-child-env.d.cts", "typesafe-evidence-file.cjs", "typesafe-evidence-file.d.cts"]) {
    writeFile(path.join(workspace, "src", name), readFileSync(path.resolve(import.meta.dir, "../src", name), "utf8"));
  }
  writeFile(path.join(workspace, "obsolete.md"), "managed document\n");
  writeFile(path.join(workspace, "agents", "advisor.md"), "owned advisor\n");
  writeFile(path.join(workspace, "tests", "sanitized.test.ts"), [
    'import { expect, test } from "bun:test";',
    'const { buildChildEnvironment } = require("../src/typesafe-child-env.cjs");',
    'const { readWorkspaceFile } = require("../src/typesafe-evidence-file.cjs");',
    'test("deployed helper and sanitized verifier process", () => {',
    '  for (const name of ["TYPESAFE_API_KEY", "FOREIGN_CUSTOM", "NODE_OPTIONS", "HTTPS_PROXY", "OMP_FAULT_INJECT", "OMP_SKIP_VERIFY_TESTS", "OMP_WORKSPACE_DIR", "OMP_HOME_DIR", "OMP_BUN_BIN"]) expect(process.env[name]).toBeUndefined();',
    '  expect(process.env.HOME).toContain("typesafe-verification-home-");',
    '  expect(buildChildEnvironment("verification").HOME).toBeUndefined();',
    '  expect(readWorkspaceFile(process.cwd(), "package.json", {maxBytes:1024}).bytes.toString()).toBe("{}\\n");',
    '});',
    "",
  ].join("\n"));
  writeFile(pointer, `export { default } from "${path.join(target, "typesafe-planner.ts").replace(/\\/g, "/")}";\n`);

  return { root, workspace, target, home, pointer, backup };
}

function runSync(fixture: Fixture, extraEnv: Record<string, string | undefined> = {}, args = ["--dry-run"]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      OMP_WORKSPACE_DIR: fixture.workspace,
      OMP_TARGET_DIR: fixture.target,
      OMP_HOME_DIR: fixture.home,
      OMP_EXTENSION_POINTER: fixture.pointer,
      OMP_BACKUP_DIR: fixture.backup,
      OMP_BUN_BIN: "this-command-must-not-run-in-dry-run",
      ...extraEnv,
    },
  });
}

function snapshot(fixture: Fixture): FileSnapshot {
  return {
    target: readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8"),
    pointer: readFileSync(fixture.pointer, "utf8"),
    configExists: existsSync(path.join(fixture.home, ".claude", ".ck.json")),
    backupExists: existsSync(fixture.backup),
  };
}

function expectUnchanged(fixture: Fixture, before: FileSnapshot): void {
  expect(readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8")).toBe(before.target);
  expect(readFileSync(fixture.pointer, "utf8")).toBe(before.pointer);
  expect(existsSync(path.join(fixture.home, ".claude", ".ck.json"))).toBe(before.configExists);
  expect(existsSync(fixture.backup)).toBe(before.backupExists);
}

test("sync baseline dry-run accepts explicit workspace, home, and bun overrides without mutation", () => {
  const fixture = createFixture();
  writeFile(path.join(fixture.target, "typesafe-planner.ts"), "export default {};\n");
  const before = snapshot(fixture);
  try {
    const result = runSync(fixture);
    expect(result.status, result.stderr).toBe(0);
    expectUnchanged(fixture, before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("sync baseline rejects missing, BOM-prefixed, and extra-statement immutable pointers before any mutation", () => {
  const pointerContents: Array<(fixture: Fixture) => string> = [
    () => "",
    (fixture) => `\uFEFFexport { default } from "${path.join(fixture.target, "typesafe-planner.ts").replace(/\\/g, "/")}";\n`,
    (fixture) => [
      `export { default } from "${path.join(fixture.target, "typesafe-planner.ts").replace(/\\/g, "/")}";`,
      "export {};",
      "",
    ].join("\n"),
  ];

  for (const makePointerContent of pointerContents) {
    const fixture = createFixture();
    writeFile(path.join(fixture.target, "typesafe-planner.ts"), "old target\n");
    writeFile(fixture.pointer, makePointerContent(fixture));
    const before = snapshot(fixture);
    try {
      const result = runSync(fixture);
      expect(result.status).not.toBe(0);
      expectUnchanged(fixture, before);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("sync baseline rejects a missing immutable pointer before creating a backup", () => {
  const fixture = createFixture();
  writeFile(path.join(fixture.target, "typesafe-planner.ts"), "old target\n");
  const targetBefore = readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8");
  try {
    rmSync(fixture.pointer);
    const result = runSync(fixture);
    expect(result.status).not.toBe(0);
    expect(readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8")).toBe(targetBefore);
    expect(existsSync(fixture.pointer)).toBe(false);
    expect(existsSync(fixture.backup)).toBe(false);
    expect(existsSync(path.join(fixture.home, ".claude", ".ck.json"))).toBe(false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("sync baseline rejects missing source, overlapping roots, existing backup, and linked target paths before mutation", () => {
  const cases: Array<(fixture: Fixture) => void> = [
    (fixture) => { fixture.workspace = path.join(fixture.root, "missing-workspace"); },
    (fixture) => { fixture.backup = path.join(fixture.target, "nested-backup"); },
    (fixture) => { mkdirSync(fixture.backup); },
    (fixture) => {
      const linkedTarget = path.join(fixture.root, "elsewhere");
      mkdirSync(linkedTarget);
      symlinkSync(linkedTarget, path.join(fixture.target, "src"), process.platform === "win32" ? "junction" : "dir");
    },
  ];

  for (const arrange of cases) {
    const fixture = createFixture();
    writeFile(path.join(fixture.target, "typesafe-planner.ts"), "old target\n");
    arrange(fixture);
    const before = snapshot(fixture);
    try {
      const result = runSync(fixture);
      expect(result.status).not.toBe(0);
      expectUnchanged(fixture, before);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("managed deployment enrolls identical files, refuses unowned conflicts, and prunes only unchanged owned files", () => {
  const fixture = createFixture();
  const planner = path.join(fixture.target, "typesafe-planner.ts");
  writeFile(planner, "export default {};\n");
  try {
    let result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
    expect(result.status).toBe(0);
    expect(existsSync(path.join(fixture.target, ".sync-manifest.json"))).toBe(true);

    writeFile(planner, "operator modification\n");
    fixture.backup = path.join(fixture.root, "backup-conflict");
    result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
    expect(result.status).not.toBe(0);
    expect(readFileSync(planner, "utf8")).toBe("operator modification\n");

    writeFile(planner, "export default {};\n");
    rmSync(path.join(fixture.workspace, "obsolete.md"));
    fixture.backup = path.join(fixture.root, "backup-prune");
    result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
    expect(result.status).toBe(0);
    expect(existsSync(path.join(fixture.target, "obsolete.md"))).toBe(false);
    expect(existsSync(path.join(fixture.target, ".gitignore"))).toBe(true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function enrollThenChangeSources(fixture: Fixture, backupName: string) {
  const enrollment = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
  expect(enrollment.status, enrollment.stderr).toBe(0);
  const resolver = path.join(fixture.home, ".claude", "hooks", "lib", "typesafe-enabled-resolver.cjs");
  const before = {
    planner: readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8"),
    resolver: readFileSync(resolver, "utf8"),
    manifest: readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8"),
    pointer: readFileSync(fixture.pointer, "utf8"),
  };
  fixture.backup = path.join(fixture.root, backupName);
  writeFile(path.join(fixture.workspace, "typesafe-planner.ts"), "export default { revised: true };\n");
  writeFile(path.join(fixture.workspace, "src", "typesafe-enabled-resolver.cjs"), "module.exports = { revised: true };\n");
  return { before, resolver };
}

function expectRecoveredBoundaries(fixture: Fixture, resolver: string, before: { planner: string; resolver: string; manifest: string; pointer: string }) {
  expect(readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8")).toBe(before.planner);
  expect(readFileSync(resolver, "utf8")).toBe(before.resolver);
  expect(readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8")).toBe(before.manifest);
  expect(readFileSync(fixture.pointer, "utf8")).toBe(before.pointer);
  expect(existsSync(path.join(fixture.home, ".claude", ".ck.json"))).toBe(false);
}

test("after_target_copy rolls back enrolled target and global writes", () => {
  const fixture = createFixture();
  try {
    const { before, resolver } = enrollThenChangeSources(fixture, "backup-after-target");
    const result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1", OMP_FAULT_INJECT: "after_target_copy" }, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("RECOVERED: fault injected at after_target_copy");
    expectRecoveredBoundaries(fixture, resolver, before);
    const journal = JSON.parse(readFileSync(path.join(fixture.backup, ".sync-journal.json"), "utf8"));
    expect(journal.status).toBe("recovered");
    expect(journal.entries.some((entry: { applied: boolean }) => entry.applied)).toBe(true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("managed deployment rejects malformed manifests and held locks before mutation", () => {
  const fixture = createFixture();
  const planner = path.join(fixture.target, "typesafe-planner.ts");
  writeFile(planner, "old planner\n");
  writeFile(path.join(fixture.target, ".sync-manifest.json"), "{\"schemaVersion\":2}\n");
  try {
    let result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
    expect(result.status).not.toBe(0);
    expect(readFileSync(planner, "utf8")).toBe("old planner\n");

    writeFile(path.join(fixture.target, ".sync-manifest.json"), "{\"schemaVersion\":1,\"entries\":[]}\n");
    const lock = path.join(path.dirname(fixture.target), `.omp-sync-${path.basename(fixture.target)}.lock`);
    writeFile(lock, "held\n");
    result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
    expect(result.status).not.toBe(0);
    expect(readFileSync(planner, "utf8")).toBe("old planner\n");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("isolated real Bun verification produces deterministic manifest on repeat deployment", () => {
  const fixture = createFixture();
  try {
    let result = runSync(fixture, { OMP_BUN_BIN: process.execPath }, []);
    expect(result.status, result.stderr).toBe(0);
    const manifest = readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8");
    fixture.backup = path.join(fixture.root, "backup-repeat");
    result = runSync(fixture, { OMP_BUN_BIN: process.execPath }, []);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8")).toBe(manifest);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("fault checkpoints recover enrolled writes and retain journal evidence", () => {
  for (const checkpoint of ["after_global_write", "after_copy_write", "after_manifest_write", "before_verify"]) {
    const fixture = createFixture();
    try {
      const { before, resolver } = enrollThenChangeSources(fixture, `backup-${checkpoint}`);
      const result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1", OMP_FAULT_INJECT: checkpoint }, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`RECOVERED: fault injected at ${checkpoint}`);
      expectRecoveredBoundaries(fixture, resolver, before);
      const journal = JSON.parse(readFileSync(path.join(fixture.backup, ".sync-journal.json"), "utf8"));
      expect(journal.status).toBe("recovered");
      expect(journal.entries.some((entry: { intent?: boolean }) => entry.intent === true)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("after_prune restores enrolled files and its manifest", () => {
  const fixture = createFixture();
  try {
    const enrollment = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
    expect(enrollment.status, enrollment.stderr).toBe(0);
    const manifest = readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8");
    rmSync(path.join(fixture.workspace, "obsolete.md"));
    fixture.backup = path.join(fixture.root, "backup-prune-fault");
    const result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1", OMP_FAULT_INJECT: "after_prune" }, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("RECOVERED: fault injected at after_prune");
    expect(readFileSync(path.join(fixture.target, "obsolete.md"), "utf8")).toBe("managed document\n");
    expect(readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8")).toBe(manifest);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("verifier failure with during_rollback retains incomplete recovery evidence", () => {
  const fixture = createFixture();
  try {
    const { before, resolver } = enrollThenChangeSources(fixture, "backup-during-rollback");
    const result = runSync(fixture, {
      OMP_BUN_BIN: "this-command-must-fail",
      OMP_FAULT_INJECT: "during_rollback",
    }, []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("RECOVERY_INCOMPLETE");
    expectRecoveredBoundaries(fixture, resolver, before);
    const journal = JSON.parse(readFileSync(path.join(fixture.backup, ".sync-journal.json"), "utf8"));
    expect(journal.status).toBe("rollback_incomplete");
    expect(journal.unresolved.length).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.root, ".omp-sync-target.lock"))).toBe(true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("manifest rejects protected and non-allowlisted global destinations before planning", () => {
  const cases = [
    { root: "global_claude", relativePath: ".ck.json", pathParts: [".claude", ".ck.json"] },
    { root: "global_claude", relativePath: "skills/unmanaged.md", pathParts: [".claude", "skills", "unmanaged.md"] },
    { root: "global_omp_agents", relativePath: "unmanaged.md", pathParts: [".omp", "agent", "agents", "unmanaged.md"] },
  ];
  for (const entry of cases) {
    const fixture = createFixture();
    const protectedPath = path.join(fixture.home, ...entry.pathParts);
    const protectedBytes = `protected ${entry.relativePath}\n`;
    writeFile(protectedPath, protectedBytes);
    const deployedHash = createHash("sha256").update(protectedBytes).digest("hex");
    writeFile(path.join(fixture.target, "typesafe-planner.ts"), "target baseline\n");
    writeFile(path.join(fixture.target, ".sync-manifest.json"), `${JSON.stringify({ schemaVersion: 1, entries: [{ root: entry.root, relativePath: entry.relativePath, deployedHash }] })}\n`);
    const targetBefore = readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8");
    const pointerBefore = readFileSync(fixture.pointer, "utf8");
    try {
      const result = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, []);
      expect(result.status).not.toBe(0);
      expect(readFileSync(protectedPath, "utf8")).toBe(protectedBytes);
      expect(readFileSync(path.join(fixture.target, "typesafe-planner.ts"), "utf8")).toBe(targetBefore);
      expect(readFileSync(fixture.pointer, "utf8")).toBe(pointerBefore);
      expect(existsSync(fixture.backup)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("explicit bootstrap adopts only an unmanifested managed baseline", () => {
  const fixture = createFixture();
  const targetPlanner = path.join(fixture.target, "typesafe-planner.ts");
  const globalResolver = path.join(fixture.home, ".claude", "hooks", "lib", "typesafe-enabled-resolver.cjs");
  try {
    writeFile(targetPlanner, "unowned target planner\n");
    writeFile(globalResolver, "unowned global resolver\n");

    const preview = runSync(fixture, {}, ["--dry-run", "--bootstrap"]);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain("BOOTSTRAP_OVERWRITE:target/typesafe-planner.ts");
    expect(readFileSync(targetPlanner, "utf8")).toBe("unowned target planner\n");

    const deployed = runSync(fixture, { OMP_SKIP_VERIFY_TESTS: "1" }, ["--bootstrap"]);
    expect(deployed.status, deployed.stderr).toBe(0);
    expect(readFileSync(targetPlanner, "utf8")).toBe("export default {};\n");
    expect(readFileSync(globalResolver, "utf8")).toBe("module.exports = {};\n");
    expect(existsSync(path.join(fixture.target, ".sync-manifest.json"))).toBe(true);

    fixture.backup = path.join(fixture.root, "repeat-bootstrap-backup");
    const repeated = runSync(fixture, {}, ["--dry-run", "--bootstrap"]);
    expect(repeated.status).not.toBe(0);
    expect(repeated.stderr).toContain("bootstrap is allowed only when the target has no sync manifest");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

interface RecoveryEntry {
  destination: string;
  backupPath: string | null;
  postimage: { sha256: string; identity: WorkspaceFileIdentity } | null;
}
interface RecoveryJournal {
  status: string;
  entries: RecoveryEntry[];
  unresolved: Array<{ path: string; reason: string }>;
}

const interferenceCases = ["rewrite", "same-content-replacement", "metadata", "deletion", "created-mutation", "created-deletion", "prune-recreation", "manifest", "backup-corruption", "backup-replacement", "backup-directory-replacement", "lock-replacement", "journal-replacement", "global-rewrite", "global-same-content-replacement", "global-deletion", "global-created-mutation", "global-prune-recreation"] as const;
for (const mode of interferenceCases) {
  test(`managed rollback preserves external ${mode} and compensates unaffected owned entries`, () => {
    const fixture = createFixture();
    try {
      const { before, resolver } = enrollThenChangeSources(fixture, `backup-${mode}`);
      const planner = path.join(fixture.target, "typesafe-planner.ts");
      const created = path.join(fixture.target, "src", "new-managed.txt");
      const pruned = path.join(fixture.target, "obsolete.md");
      const manifest = path.join(fixture.target, ".sync-manifest.json");
      const lock = path.join(fixture.root, ".omp-sync-target.lock");
      const journalPath = path.join(fixture.backup, ".sync-journal.json");
      if (mode.startsWith("created-")) writeFile(path.join(fixture.workspace, "src", "new-managed.txt"), "owned new file\n");
      if (mode === "prune-recreation") rmSync(path.join(fixture.workspace, "obsolete.md"));
      const globalCreated = path.join(fixture.home, ".omp", "agent", "agents", "ck-advisor.md");
      const globalPruned = path.join(fixture.home, ".omp", "agent", "agents", "advisor.md");
      if (mode === "global-created-mutation") writeFile(path.join(fixture.workspace, "agents", "ck-advisor.md"), "owned new advisor\n");
      if (mode === "global-prune-recreation") rmSync(path.join(fixture.workspace, "agents", "advisor.md"));
      const paths = { planner, created, pruned, manifest, lock, journalPath, resolver, globalCreated, globalPruned, backup: fixture.backup };
      // The deployed verifier itself performs the interference, after promotion and before rollback.
      // No sleeps, network, live installation or new production fault-control surface is involved.
      writeFile(path.join(fixture.workspace, "tests", "interference.test.ts"), [
        'import { test } from "bun:test";',
        'import fs from "node:fs";',
        `const paths = ${JSON.stringify(paths)}; const mode = ${JSON.stringify(mode)};`,
        'test("external write before verifier failure", () => {',
        '  const journal: {entries:Array<{destination:string;backupPath:string|null}>} = JSON.parse(fs.readFileSync(paths.journalPath, "utf8"));',
        '  const entry = journal.entries.find((item) => item.destination === paths.planner);',
        '  if (!entry || !entry.backupPath) throw new Error("Missing expected sandbox preimage");',
        '  if (mode === "rewrite") fs.writeFileSync(paths.planner, "external ordinary prose\\n");',
        '  if (mode === "global-rewrite") fs.writeFileSync(paths.resolver, "external ordinary prose\\n");',
        '  if (mode === "global-same-content-replacement") { const bytes = fs.readFileSync(paths.resolver); fs.writeFileSync(paths.resolver + ".external", bytes); fs.renameSync(paths.resolver + ".external", paths.resolver); }',
        '  if (mode === "global-deletion") fs.unlinkSync(paths.resolver);',
        '  if (mode === "global-created-mutation") fs.writeFileSync(paths.globalCreated, "external ordinary prose\\n");',
        '  if (mode === "global-prune-recreation") fs.writeFileSync(paths.globalPruned, "external ordinary prose\\n");',
        '  if (mode === "same-content-replacement") { const bytes = fs.readFileSync(paths.planner); fs.writeFileSync(paths.planner + ".external", bytes); fs.renameSync(paths.planner + ".external", paths.planner); }',
        '  if (mode === "metadata") fs.utimesSync(paths.planner, new Date(100000), new Date(200000));',
        '  if (mode === "deletion") fs.unlinkSync(paths.planner);',
        '  if (mode === "created-mutation") fs.writeFileSync(paths.created, "external ordinary prose\\n");',
        '  if (mode === "created-deletion") fs.unlinkSync(paths.created);',
        '  if (mode === "prune-recreation") fs.writeFileSync(paths.pruned, "external ordinary prose\\n");',
        '  if (mode === "manifest") fs.writeFileSync(paths.manifest, "external manifest prose\\n");',
        '  if (mode === "backup-corruption") fs.writeFileSync(entry.backupPath, "external backup prose\\n");',
        '  if (mode === "backup-replacement") { const bytes = fs.readFileSync(entry.backupPath); fs.writeFileSync(entry.backupPath + ".external", bytes); fs.renameSync(entry.backupPath + ".external", entry.backupPath); }',
        '  if (mode === "backup-directory-replacement") { fs.renameSync(paths.backup, paths.backup + ".retained"); fs.mkdirSync(paths.backup); fs.writeFileSync(paths.backup + "/external.txt", "external backup directory prose\\n"); }',
        '  if (mode === "lock-replacement") { fs.unlinkSync(paths.lock); fs.writeFileSync(paths.lock, "external lock prose\\n"); }',
        '  if (mode === "journal-replacement") { fs.writeFileSync(paths.journalPath + ".external", "external journal prose\\n"); fs.renameSync(paths.journalPath + ".external", paths.journalPath); }',
        '  throw new Error("intentional verifier failure");',
        '});',
      ].join("\n"));
      const result = runSync(fixture, { OMP_BUN_BIN: process.execPath, TYPESAFE_API_KEY: "sandbox-active-credential", FOREIGN_CUSTOM: "sandbox-private-config" }, []);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stderr).toContain("RECOVERY_INCOMPLETE");
      expect(existsSync(fixture.backup)).toBe(true);
      expect(existsSync(lock)).toBe(true);
      const recoveryFile = ["journal-replacement", "backup-directory-replacement"].includes(mode)
        ? path.join(fixture.root, readdirSync(fixture.root).find((name) => name.startsWith(`backup-${mode}.recovery-`)) || "missing-recovery")
        : journalPath;
      const journal: RecoveryJournal = JSON.parse(readFileSync(recoveryFile, "utf8"));
      expect(journal.status).toBe("rollback_incomplete");
      expect(journal.unresolved.length).toBeGreaterThan(0);
      if (mode === "backup-directory-replacement") {
        expect(readFileSync(path.join(fixture.backup, "external.txt"), "utf8")).toBe("external backup directory prose\n");
        expect(existsSync(`${fixture.backup}.retained`)).toBe(true);
        expect(existsSync(path.join(fixture.target, "tests", "interference.test.ts"))).toBe(false);
        expect(readFileSync(fixture.pointer, "utf8")).toBe(before.pointer);
        return;
      }
      if (["global-rewrite", "global-same-content-replacement", "global-deletion"].includes(mode)) {
        if (mode === "global-deletion") expect(existsSync(resolver)).toBe(false);
        else if (mode === "global-rewrite") expect(readFileSync(resolver, "utf8")).toBe("external ordinary prose\n");
        else {
          expect(readFileSync(resolver, "utf8")).toBe("module.exports = { revised: true };\n");
          const entry = journal.entries.find((item) => item.destination === resolver)!;
          expect(String(statSync(resolver, { bigint: true }).ino)).not.toBe(entry.postimage!.identity.ino);
        }
        expect(readFileSync(planner, "utf8")).toBe(before.planner);
      } else {
        expect(readFileSync(resolver, "utf8")).toBe(before.resolver);
        if (mode === "rewrite") expect(readFileSync(planner, "utf8")).toBe("external ordinary prose\n");
        else if (mode === "deletion") expect(existsSync(planner)).toBe(false);
        else if (["same-content-replacement", "metadata", "backup-corruption", "backup-replacement"].includes(mode)) {
          expect(readFileSync(planner, "utf8")).toBe("export default { revised: true };\n");
          const entry = journal.entries.find((item) => item.destination === planner)!;
          if (mode === "same-content-replacement") expect(String(statSync(planner, { bigint: true }).ino)).not.toBe(entry.postimage!.identity.ino);
          if (mode === "metadata") expect(statSync(planner).mtimeMs).toBe(200000);
          if (mode === "backup-corruption") expect(readFileSync(entry.backupPath!, "utf8")).toBe("external backup prose\n");
        } else expect(readFileSync(planner, "utf8")).toBe(before.planner);
      }
      if (mode === "created-mutation") expect(readFileSync(created, "utf8")).toBe("external ordinary prose\n");
      if (mode === "created-deletion") expect(existsSync(created)).toBe(false);
      if (mode === "global-created-mutation") expect(readFileSync(globalCreated, "utf8")).toBe("external ordinary prose\n");
      if (mode === "global-prune-recreation") expect(readFileSync(globalPruned, "utf8")).toBe("external ordinary prose\n");
      if (mode === "prune-recreation") expect(readFileSync(pruned, "utf8")).toBe("external ordinary prose\n");
      if (mode === "manifest") expect(readFileSync(manifest, "utf8")).toBe("external manifest prose\n");
      else expect(readFileSync(manifest, "utf8")).toBe(before.manifest);
      if (mode === "lock-replacement") expect(readFileSync(lock, "utf8")).toBe("external lock prose\n");
      if (mode === "journal-replacement") expect(readFileSync(journalPath, "utf8")).toBe("external journal prose\n");
      expect(readFileSync(fixture.pointer, "utf8")).toBe(before.pointer);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }, 30_000);
}

test.skipIf(process.platform !== "win32")("PowerShell bootstraps policy with empty env then launches sanitized real Node dry-run", () => {
  const fixture = createFixture();
  try {
    const tools = path.join(fixture.workspace, "tools");
    const promotion = path.join(tools, "promote-omp-global.ps1");
    writeFile(promotion, readFileSync(path.resolve(import.meta.dir, "../tools/promote-omp-global.ps1"), "utf8"));
    const names = ["TYPESAFE_API_KEY", "FOREIGN_CUSTOM", "NODE_OPTIONS", "HTTPS_PROXY", "HOME", "USERPROFILE", "OMP_FAULT_INJECT"];
    writeFile(path.join(tools, "sync-baseline.cjs"), `console.log("CHILD_PROBE:"+JSON.stringify(${JSON.stringify(names)}.map(name=>Object.hasOwn(process.env,name))));require(${JSON.stringify(scriptPath)});\n`);
    const startup = path.join(fixture.root, "private-startup.cjs");
    const marker = path.join(fixture.root, "startup-leaked");
    writeFile(startup, `require("node:fs").writeFileSync(${JSON.stringify(marker)},"unsafe inherited hook");`);
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", promotion, "-DryRun"], {
      encoding: "utf8",
      env: { ...process.env, OMP_WORKSPACE_DIR: fixture.workspace, OMP_TARGET_DIR: fixture.target, OMP_HOME_DIR: fixture.home, OMP_EXTENSION_POINTER: fixture.pointer, OMP_BACKUP_DIR: fixture.backup, OMP_BUN_BIN: process.execPath, TYPESAFE_API_KEY: "ps-active-secret", FOREIGN_CUSTOM: "foreign-value", OMP_FAULT_INJECT: "before_verify", NODE_OPTIONS: `--require=\"${startup}\"` },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`CHILD_PROBE:${JSON.stringify(names.map(() => false))}`);
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(fixture.backup)).toBe(false);
    expect(existsSync(path.join(fixture.root, ".omp-sync-target.lock"))).toBe(false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

for (const mode of ["rewrite", "delete", "same-content-replace", "metadata"] as const) {
  test(`successful verifier cannot silently ${mode} an unchanged managed file`, () => {
    const fixture = createFixture();
    try {
      const { before, resolver } = enrollThenChangeSources(fixture, `backup-noop-${mode}`);
      const untouched = path.join(fixture.target, ".gitignore");
      const original = readFileSync(untouched, "utf8");
      const originalInode = statSync(untouched, { bigint: true }).ino;
      writeFile(path.join(fixture.workspace, "tests", "noop-interference.test.ts"), [
        'import { test } from "bun:test"; import fs from "node:fs";',
        `const destination=${JSON.stringify(untouched)},mode=${JSON.stringify(mode)};`,
        'test("verifier succeeds after changing an unchanged managed path", () => {',
        '  if (mode === "rewrite") fs.writeFileSync(destination, "external unchanged-path prose\\n");',
        '  if (mode === "delete") fs.unlinkSync(destination);',
        '  if (mode === "same-content-replace") { const bytes=fs.readFileSync(destination); fs.writeFileSync(destination+".external",bytes); fs.renameSync(destination+".external",destination); }',
        '  if (mode === "metadata") fs.utimesSync(destination,new Date(100000),new Date(200000));',
        '});',
      ].join("\n"));
      const result = runSync(fixture, { OMP_BUN_BIN: process.execPath }, []);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stderr).toContain("UNCHANGED_PATH_CHANGED");
      expect(result.stdout).not.toContain("DEPLOYED_VERIFIED");
      if (mode === "delete") expect(existsSync(untouched)).toBe(false);
      else if (mode === "rewrite") expect(readFileSync(untouched, "utf8")).toBe("external unchanged-path prose\n");
      else {
        expect(readFileSync(untouched, "utf8")).toBe(original);
        if (mode === "same-content-replace") expect(statSync(untouched, { bigint: true }).ino).not.toBe(originalInode);
        if (mode === "metadata") expect(statSync(untouched).mtimeMs).toBe(200000);
      }
      expectRecoveredBoundaries(fixture, resolver, before);
      const journal: RecoveryJournal = JSON.parse(readFileSync(path.join(fixture.backup, ".sync-journal.json"), "utf8"));
      expect(journal.status).toBe("rollback_incomplete");
      expect(journal.unresolved.some((entry) => entry.path === untouched && entry.reason === "UNCHANGED_PATH_CHANGED")).toBe(true);
      expect(existsSync(path.join(fixture.root, ".omp-sync-target.lock"))).toBe(true);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }, 30_000);
}

test("managed inventory deploys real paired runtime modules but not custodian inputs or generated runs", () => {
  const fixture = createFixture();
  try {
    const sourceTools = path.resolve(import.meta.dir, "../tools");
    const modules = readdirSync(sourceTools).filter((name) => /^jev-paired-[^/]+\.ts$/.test(name) && !/(?:\.(?:test|spec)|[-.]fixtures?)\.ts$/.test(name));
    expect(modules).toContain("jev-paired-statistics.ts");
    expect(modules).toContain("jev-paired-eval.ts");
    for (const name of modules) writeFile(path.join(fixture.workspace, "tools", name), readFileSync(path.join(sourceTools, name), "utf8"));
    const excluded = [
      "plans/261019-jev-atomic-review/evaluation/private-gold.jsonl",
      "plans/261019-jev-atomic-review/reports/paired/private-run/receipts.jsonl",
      "tools/jev-paired-corpus.jsonl",
      "tools/jev-paired-generated/private.ts",
      "tools/jev-paired-unbundled.test.ts",
    ];
    for (const relative of excluded) writeFile(path.join(fixture.workspace, relative), "custodian-only private artifact\n");
    const synthetic = "tests/fixtures/jev-paired-evaluation/public-synthetic.json";
    writeFile(path.join(fixture.workspace, synthetic), '{"synthetic":true}\n');
    writeFile(path.join(fixture.workspace, "tests", "deployed-paired.test.ts"), [
      'import { expect, test } from "bun:test";',
      'import { binomialTail } from "../tools/jev-paired-statistics";',
      'import { readFileSync } from "node:fs";',
      'test("deployed paired helper executes real calculation with synthetic fixture", () => {',
      '  expect(binomialTail(2, .5, 1, 2)).toBeCloseTo(.75, 12);',
      '  expect(JSON.parse(readFileSync(new URL("./fixtures/jev-paired-evaluation/public-synthetic.json", import.meta.url), "utf8"))).toEqual({synthetic:true});',
      '});',
    ].join("\n"));
    const result = runSync(fixture, { OMP_BUN_BIN: process.execPath }, []);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("DEPLOYED_VERIFIED");
    const manifest: { entries: Array<{ root: string; relativePath: string; deployedHash: string }> } = JSON.parse(readFileSync(path.join(fixture.target, ".sync-manifest.json"), "utf8"));
    for (const name of modules) {
      const relativePath = `tools/${name}`;
      const expected = createHash("sha256").update(readFileSync(path.join(sourceTools, name))).digest("hex");
      expect(manifest.entries.find((entry) => entry.root === "target" && entry.relativePath === relativePath)?.deployedHash).toBe(expected);
      expect(createHash("sha256").update(readFileSync(path.join(fixture.target, relativePath))).digest("hex")).toBe(expected);
    }
    expect(existsSync(path.join(fixture.target, synthetic))).toBe(true);
    for (const relative of excluded) {
      expect(existsSync(path.join(fixture.target, relative))).toBe(false);
      expect(manifest.entries.some((entry) => entry.relativePath === relative)).toBe(false);
      expect(readFileSync(path.join(fixture.workspace, relative), "utf8")).toBe("custodian-only private artifact\n");
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 30_000);
