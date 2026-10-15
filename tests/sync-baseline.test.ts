import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";

const scriptPath = path.resolve(import.meta.dir, "../tools/sync-baseline.cjs");

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
  writeFile(path.join(workspace, "obsolete.md"), "managed document\n");
  writeFile(path.join(workspace, "tests", "sanitized.test.ts"), [
    'import { expect, test } from "bun:test";',
    'test("sanitized fixture", () => expect(true).toBe(true));',
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
