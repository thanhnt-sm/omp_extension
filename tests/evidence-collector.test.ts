import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import {
  assertPathIsClaudeSafe,
  collectTaskEvidence,
  executeTestCommand,
  extractCriteriaFromPlan,
  SecurityViolationError,
  captureWorkspaceSnapshot,
  diffSnapshots,
  isPlanCliStub,
  validateEvidenceFreshness,
  hasProductCodeChanges,
} from "../src/evidence-collector";
import { collectDeliverableArtifacts } from "../typesafe-planner";
import type { TaskContract } from "../src/types/verification";
const { buildChildEnvironment } = createRequire(import.meta.url)("../src/typesafe-child-env.cjs");

describe("Phase 1: Deterministic Evidence Collector & Claude Isolation", () => {
  test("an unchanged valid task baseline excludes unrelated protected WIP", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-empty-baseline-"));
    try {
      execSync("git init", { cwd, stdio: "ignore" });
      await fs.mkdir(path.join(cwd, ".claude"));
      await fs.writeFile(path.join(cwd, ".claude", "settings.json"), '{"preexisting":true}');
      const baseline = await captureWorkspaceSnapshot(cwd);
      const evidence = await collectTaskEvidence({ cwd, baseline });
      expect(evidence.diffScope).toBe("task-baseline");
      expect(evidence.changedFiles).toEqual([]);
      expect(evidence.gitStatus).toBe("");
      expect(evidence.gitDiff).toBe("");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  test("missing or truncated baseline never labels recent commits as task scoped", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-fallback-scope-"));
    try {
      execSync('git init && git config user.name Test && git config user.email test@example.com', { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(cwd, "report.md"), "initial");
      execSync("git add . && git commit -m initial", { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(cwd, "report.md"), "second");
      execSync("git add . && git commit -m second", { cwd, stdio: "ignore" });
      for (const baseline of [undefined, { files: new Map<string, string>(), truncated: true }]) {
        const evidence = await collectTaskEvidence({ cwd, baseline });
        expect(evidence.diffScope).toBe("full-working-tree");
        expect(evidence.changedFiles).toEqual([]);
        expect(evidence.counterevidence).toContain("No host-owned task baseline: current worktree is advisory, not task-relative proof.");
        if (baseline) expect(evidence.omissions?.some((item) => item.reason === "HISTORICAL_PREIMAGE_REQUIRED")).toBe(true);
      }
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
  test("assertPathIsClaudeSafe throws SecurityViolationError for ~/.claude paths", () => {
    const claudeDir = path.join(os.homedir(), ".claude", "settings.json");
    expect(() => assertPathIsClaudeSafe(claudeDir)).toThrow(SecurityViolationError);

    const dotClaude = path.resolve("./.claude/hooks/lib/something.cjs");
    expect(() => assertPathIsClaudeSafe(dotClaude)).toThrow(SecurityViolationError);

    const claudeJson = path.join(os.homedir(), ".claude.json");
    expect(() => assertPathIsClaudeSafe(claudeJson)).toThrow(SecurityViolationError);
  });

  test("assertPathIsClaudeSafe permits regular project paths", () => {
    const normalPath = path.resolve("./src/evidence-collector.ts");
    expect(() => assertPathIsClaudeSafe(normalPath)).not.toThrow();
  });

  test("central verification environment omits arbitrary hooks and all provider credentials", () => {
    const cleanEnv = buildChildEnvironment("verification", {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      ANTHROPIC_API_KEY: "provider-sentinel", CLAUDE_CODE_TOKEN: "private-sentinel",
      TYPESAFE_API_KEY: "typesafe-sentinel", NODE_OPTIONS: "--require malicious",
      HTTP_PROXY: "http://unsafe", FOREIGN_CONFIGURATION: "unsafe-but-not-secret",
    });
    expect(cleanEnv.PATH).toBe(process.env.PATH);
    for (const name of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_TOKEN", "TYPESAFE_API_KEY", "NODE_OPTIONS", "HTTP_PROXY", "FOREIGN_CONFIGURATION"]) expect(cleanEnv[name]).toBeUndefined();
  });

  test("extractCriteriaFromPlan parses task and acceptance criteria from markdown", () => {
    const samplePlan = `
# Implementation Plan

## Acceptance & Definition of Done
- [ ] All 4 phase test suites pass under bun test.
- [ ] Plan creation rejects plans scoring < 2.0.
- [x] Zero occurrence of any type escapes.

### Task 1.1
- [ ] Enforce strict payload size under 32KB.
`;

    const criteria = extractCriteriaFromPlan(samplePlan);
    expect(criteria.length).toBeGreaterThanOrEqual(3);
    expect(criteria).toContain("All 4 phase test suites pass under bun test.");
    expect(criteria).toContain("Plan creation rejects plans scoring < 2.0.");
    expect(criteria).toContain("Enforce strict payload size under 32KB.");
  });

  test("extractCriteriaFromPlan extracts criteria from a phase file reference when taskId is provided", async () => {
    const samplePlan = [
      "# Main Plan",
      "## Phases",
      "| Phase | Name | Status |",
      "|-------|------|--------|",
      "| 1 | [Setup Enriched Payload](./phase-01-setup.md) | Pending |",
      "| 2 | [Task-Aware Rubrics](./phase-02-task.md) | Pending |"
    ].join("\n");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-evidence-"));
    const planPath = path.join(tmpDir, "plan.md");
    const phasePath = path.join(tmpDir, "phase-01-setup.md");
    await fs.writeFile(planPath, samplePlan);
    await fs.writeFile(phasePath, [
      "## Requirements",
      "- [ ] PhaseCriteriaAlpha",
      "- [ ] PhaseCriteriaBeta"
    ].join("\n"));
    
    try {
      const evidence = await collectTaskEvidence({
        cwd: tmpDir,
        planPath: planPath,
        taskId: "1",
      });
      expect(evidence.criteria).toContain("PhaseCriteriaAlpha");
      expect(evidence.criteria).toContain("PhaseCriteriaBeta");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("collectTaskEvidence captures real Git diff and ignores untrusted agent text", async () => {
    const untrustedAgentClaim = "AGENT CLAIM: I verified all 50 tests pass and code is 100% complete.";
    const evidence = await collectTaskEvidence({
      cwd: os.tmpdir(),
      testCommand: "bun --version",
      untrustedAgentState: untrustedAgentClaim,
    });

    // Evidence must contain real OS data, not agent text
    expect(evidence.testExitCode).toBe(0);
    expect(evidence.testOutput).toContain("1."); // Bun version output
    expect(evidence.gitStatus).toBeDefined();
    expect(JSON.stringify(evidence)).not.toContain("AGENT CLAIM: I verified all 50 tests pass");
  });

  test("collectTaskEvidence records test failure exit code and output", async () => {
    const evidence = await collectTaskEvidence({
      cwd: process.cwd(),
      testCommand: "bun -e \"process.exit(1)\"",
    });

    expect(evidence.testExitCode).toBe(1);
  });

  test("collectTaskEvidence rejects plan path pointing inside ~/.claude", async () => {
    const dangerousPlan = path.join(os.homedir(), ".claude", "plan.md");
    expect(
      collectTaskEvidence({
        cwd: process.cwd(),
        planPath: dangerousPlan,
      })
    ).rejects.toThrow(SecurityViolationError);
  });

  test("captureWorkspaceSnapshot + diffSnapshots detects modified, added, and reverted files", async () => {
    const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-snapshot-test-"));
    try {
      const { execSync } = await import("node:child_process");
      execSync("git init", { cwd: tempRepo, stdio: "ignore" });
      execSync('git config user.name "Test"', { cwd: tempRepo, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: tempRepo, stdio: "ignore" });

      await fs.writeFile(path.join(tempRepo, "committed.txt"), "v1\n");
      await fs.writeFile(path.join(tempRepo, "to-revert.txt"), "orig\n");
      await fs.writeFile(path.join(tempRepo, "unchanged.txt"), "stay\n");
      execSync("git add . && git commit -m 'init'", { cwd: tempRepo, stdio: "ignore" });

      // Modify committed.txt before snapshot
      await fs.writeFile(path.join(tempRepo, "committed.txt"), "v2\n");
      // Modify to-revert.txt before snapshot
      await fs.writeFile(path.join(tempRepo, "to-revert.txt"), "temp\n");

      const snapshotBefore = await captureWorkspaceSnapshot(tempRepo);

      // Now perform changes during task:
      // 1. Modify committed.txt again
      await fs.writeFile(path.join(tempRepo, "committed.txt"), "v3\n");
      // 2. Add new untracked file
      await fs.writeFile(path.join(tempRepo, "untracked.txt"), "brand new\n");
      // 3. Revert to-revert.txt to HEAD
      execSync("git checkout -- to-revert.txt", { cwd: tempRepo, stdio: "ignore" });

      const snapshotAfter = await captureWorkspaceSnapshot(tempRepo);
      const changed = diffSnapshots(snapshotBefore, snapshotAfter);

      expect(changed).toContain("committed.txt");
      expect(changed).toContain("untracked.txt");
      expect(changed).toContain("to-revert.txt");
      expect(changed).not.toContain("unchanged.txt");
    } finally {
      await fs.rm(tempRepo, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("isPlanCliStub identifies plan-cli.cjs boilerplate templates and filters them in extractCriteriaFromPlan and collectDeliverableArtifacts", async () => {
    const stubPlan = `# Sample Plan\n\n## Overview\n\nTBD.\n\n## Phases\n`;
    const stubPhase = `# Phase 1: Setup\n\n## Overview\n\nBrief description of scope and deliverables.\n\n## Success Criteria\n\n- [ ] Verifiable acceptance criteria\n- [ ] Test validation commands\n`;
    const populatedPhase = `# Phase 1: Dual-Primitive JEV Calibration\n\n## Overview\n\nUpdate runPhaseMacroCheck in src/cook-expert-judge.ts.\n\n## Success Criteria\n\n- [ ] runPhaseMacroCheck includes meets_criteria noul\n`;

    expect(isPlanCliStub(stubPlan)).toBe(true);
    expect(isPlanCliStub(stubPhase)).toBe(true);
    expect(isPlanCliStub(populatedPhase)).toBe(false);

    expect(extractCriteriaFromPlan(stubPhase)).toEqual([]);
    expect(extractCriteriaFromPlan(populatedPhase)).toContain("runPhaseMacroCheck includes meets_criteria noul");

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-stub-filter-"));
    try {
      await fs.writeFile(path.join(tmpDir, "plan.md"), stubPlan, "utf8");
      await fs.writeFile(path.join(tmpDir, "phase-01-setup.md"), stubPhase, "utf8");
      await fs.writeFile(path.join(tmpDir, "report.md"), populatedPhase, "utf8");

      const artifacts = await collectDeliverableArtifacts(tmpDir, [
        "plan.md",
        "phase-01-setup.md",
        "report.md",
      ]);
      expect(artifacts).not.toContain("Brief description of scope and deliverables.");
      expect(artifacts).not.toContain("--- Deliverable: plan.md ---");
      expect(artifacts).toContain("--- Deliverable: report.md ---");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("collectTaskEvidence enforces word-boundary phase matching and avoids digit substring collisions", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-phase-boundary-"));
    try {
      const planPath = path.join(tmpDir, "plan.md");
      const phasePath = path.join(tmpDir, "phase-01-core.md");
      await fs.writeFile(
        planPath,
        [
          "# Main Plan",
          "## Phases",
          "| Phase | Name | Status |",
          "|-------|------|--------|",
          "| 1 | [Core Setup](./phase-01-core.md) | Pending |",
          "## Tasks",
          "- [ ] PlanLevelCriterion",
        ].join("\n"),
        "utf8"
      );
      await fs.writeFile(
        phasePath,
        ["# Phase 1", "## Success Criteria", "- [ ] PhaseOneSpecificCriterion"].join("\n"),
        "utf8"
      );

      // Digit "1" in "Step 1: Research API" must NOT collide with phase-01-core.md
      const nonPhaseEvidence = await collectTaskEvidence({
        cwd: tmpDir,
        planPath,
        taskId: "Step 1: Research API and clarify 3 options",
      });
      expect(nonPhaseEvidence.criteriaSource).toBe("plan");
      expect(nonPhaseEvidence.criteria).toContain("PlanLevelCriterion");
      expect(nonPhaseEvidence.criteria).not.toContain("PhaseOneSpecificCriterion");

      // Explicit "Phase 1" reference MUST match phase-01-core.md
      const phaseEvidence = await collectTaskEvidence({
        cwd: tmpDir,
        planPath,
        taskId: "Phase 1: Core Setup",
      });
      expect(phaseEvidence.criteriaSource).toBe("phase");
      expect(phaseEvidence.criteria).toContain("PhaseOneSpecificCriterion");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("isPlanCliStub returns false for long reports (> 1500 chars) that quote stub strings", () => {
    const longReport = [
      "# Comprehensive Architecture Report",
      "## Overview",
      "TBD.",
      "When `plan-cli.cjs` creates a scaffold, it inserts `Brief description of scope and deliverables.`",
      "and `- [ ] Verifiable acceptance criteria` alongside `- [ ] Test validation commands`.",
      "A".repeat(1600),
    ].join("\n\n");

    expect(longReport.length).toBeGreaterThan(1500);
    expect(isPlanCliStub(longReport)).toBe(false);
  });

  test("collectTaskEvidence without baseline synthesizes diff --git content for untracked (??) files", async () => {
    const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-untracked-nobaseline-"));
    try {
      execSync("git init", { cwd: tempRepo, stdio: "ignore" });
      execSync('git config user.name "Test"', { cwd: tempRepo, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: tempRepo, stdio: "ignore" });

      await fs.writeFile(path.join(tempRepo, "tracked.ts"), "export const a = 1;\n", "utf8");
      execSync("git add . && git commit -m 'init'", { cwd: tempRepo, stdio: "ignore" });

      // Create an untracked file inside a subdirectory without providing a baseline snapshot
      const subDir = path.join(tempRepo, "src");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, "new-feature.ts"), "export const feature = true;\n", "utf8");

      const evidence = await collectTaskEvidence({
        cwd: tempRepo,
      });

      expect(evidence.changedFiles).toContain("src/new-feature.ts");
      expect(evidence.gitDiff).toContain("diff --git a/src/new-feature.ts b/src/new-feature.ts");
      expect(evidence.gitDiff).toContain("+export const feature = true;");
    } finally {
      await fs.rm(tempRepo, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("collectTaskEvidence reuses same-operation snapshot and test result without executing the test command", async () => {
    const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-evidence-shared-"));
    try {
      execSync("git init", { cwd: tempRepo, stdio: "ignore" });
      await fs.writeFile(path.join(tempRepo, "changed.ts"), "export const changed = true;\n", "utf8");
      const afterSnapshot = await captureWorkspaceSnapshot(tempRepo);
      const evidence = await collectTaskEvidence({
        cwd: tempRepo,
        baseline: { files: new Map(), truncated: false },
        testCommand: "bun -e \"process.exit(99)\"",
        afterSnapshot,
        testResult: { exitCode: 0, output: "shared test result" },
      });
      expect(evidence.testExitCode).toBe(0);
      expect(evidence.testOutput).toBe("shared test result");
      expect(evidence.changedFiles).toContain("changed.ts");
    } finally {
      await fs.rm(tempRepo, { recursive: true, force: true });
    }
  });

  test("executeTestCommand rejects an already-aborted signal before spawning work", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await executeTestCommand(
      'bun -e "process.exit(99)"',
      process.cwd(),
      15000,
      controller.signal
    );
    expect(result.exitCode).toBe(130);
    expect(result.output).toContain("aborted");
  });
});

function evidenceContract(kind: TaskContract["taskKind"] = "implementation"): TaskContract {
  const source = { path: "plan.md", digest: "approved-source", startLine: 1, endLine: 2, text: "Preserve every task-relative change and relevant proof." };
  const user = { sessionId: "session", entryId: "user-entry", digest: "original-request", kind: "user_request" as const };
  return {
    schemaVersion: 1, contractId: "contract", revision: 1, revisionId: "revision", incarnationId: "incarnation",
    creation: { sessionId: "session", branchId: "branch", entryId: "native-result", callId: "native-call" },
    target: { phase: "Evidence", phaseOrdinal: 0, content: "Evaluate evidence", ordinal: 0 }, taskKind: kind,
    allowedMutationScope: { paths: ["src/**", "report.md", "check.cjs"], operations: ["read", "modify", "create", "delete", "execute"] },
    approvedSource: { kind: "plan", path: "plan.md", digest: source.digest, approval: user, spans: [source] },
    originalUserRequest: user, amendments: [], criteria: [{ id: "criterion-1", kind: "acceptance", text: source.text, source }],
    approvedCommandIds: [], parentRequirements: [], policyDigest: "policy",
  };
}

describe("Task-relative snapshot fidelity", () => {
  test("a missing non-Git workspace is unavailable rather than a clean all-deleted snapshot", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-missing-root-"));
    try {
      const cwd = path.join(parent, "absent");
      const contract = evidenceContract("research");
      const baseline = await captureWorkspaceSnapshot(cwd, { contract });
      expect(baseline.complete).toBe(false);
      expect(baseline.omissions?.some((item) => item.required)).toBe(true);
      const evidence = await collectTaskEvidence({ cwd, contract, baseline });
      expect(evidence.evidenceStatus).toBe("EVIDENCE_REQUIRED");
      expect(evidence.cleanWorkingTree).toBe(false);
    } finally { await fs.rm(parent, { recursive: true, force: true }); }
  });

  test("an unborn valid baseline covers the first complete commit interval without invented history", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-unborn-interval-"));
    try {
      execSync("git init && git config user.name Test && git config user.email test@example.com", { cwd, stdio: "ignore" });
      const contract = evidenceContract("research");
      const baseline = await captureWorkspaceSnapshot(cwd, { contract });
      expect(baseline.headSha).toBeUndefined();
      expect(baseline.complete).toBe(true);
      await fs.writeFile(path.join(cwd, "report.md"), "first actual task commit\n");
      execSync("git add . && git commit -qm first", { cwd, stdio: "ignore" });
      await fs.appendFile(path.join(cwd, "report.md"), "second actual task commit\n");
      execSync("git add . && git commit -qm second", { cwd, stdio: "ignore" });
      const evidence = await collectTaskEvidence({ cwd, contract, baseline });
      expect(evidence.commitInterval?.from).toBeUndefined();
      expect(evidence.commitInterval?.commits).toHaveLength(2);
      expect(evidence.commitInterval?.patch).toContain("+first actual task commit");
      expect(evidence.changedFiles).toEqual(["report.md"]);
      expect(evidence.evidenceStatus).toBe("READY");
    } finally { await fs.rm(cwd, { recursive: true, force: true }); }
  });

  test("historical missing preimages and byte budgets are mandatory omissions, never fabricated clean proof", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-preimage-budget-"));
    try {
      execSync("git init", { cwd, stdio: "ignore" });
      const contract = evidenceContract();
      await fs.mkdir(path.join(cwd, "src"));
      await fs.writeFile(path.join(cwd, "src", "large.ts"), "x".repeat(1024 * 1024 + 1));
      const snapshot = await captureWorkspaceSnapshot(cwd, { contract });
      expect(snapshot.complete).toBe(false);
      expect(snapshot.omissions?.some((item) => item.path === "src/large.ts" && item.required)).toBe(true);
      const oldBaseline = { files: new Map([["src/large.ts", "historical-hash-only"]]), truncated: false };
      const evidence = await collectTaskEvidence({ cwd, contract, baseline: oldBaseline });
      expect(evidence.evidenceStatus).toBe("EVIDENCE_REQUIRED");
      expect(evidence.omissions?.some((item) => item.reason === "HISTORICAL_PREIMAGE_REQUIRED")).toBe(true);
      expect(evidence.cleanWorkingTree).toBe(false);
    } finally { await fs.rm(cwd, { recursive: true, force: true }); }
  });
  test("dirty same-file WIP stays out of endpoint patch while both task commits remain", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-task-interval-"));
    try {
      execSync("git init && git config user.name Test && git config user.email test@example.com", { cwd, stdio: "ignore" });
      await fs.mkdir(path.join(cwd, "src"));
      await fs.writeFile(path.join(cwd, "src", "service.ts"), "export const preexisting = 0;\nexport const first = 0;\nexport const second = 0;\n");
      execSync("git add . && git commit -qm initial", { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(cwd, "src", "service.ts"), "export const preexisting = 7;\nexport const first = 0;\nexport const second = 0;\n");
      const contract = evidenceContract();
      const baseline = await captureWorkspaceSnapshot(cwd, { contract });
      await fs.writeFile(path.join(cwd, "src", "service.ts"), "export const preexisting = 7;\nexport const first = 1;\nexport const second = 0;\n");
      execSync("git add . && git commit -qm first", { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(cwd, "src", "service.ts"), "export const preexisting = 7;\nexport const first = 1;\nexport const second = 2;\n");
      execSync("git add . && git commit -qm second", { cwd, stdio: "ignore" });
      const evidence = await collectTaskEvidence({ cwd, contract, baseline });
      expect(evidence.gitDiff).toContain("+export const first = 1;");
      expect(evidence.gitDiff).toContain("+export const second = 2;");
      expect(evidence.gitDiff).not.toContain("+export const preexisting = 7;");
      expect(evidence.commitInterval?.commits).toHaveLength(2);
      expect(evidence.commitInterval?.patch).toContain("+export const first = 1;");
      expect(evidence.sourceEvidence?.[0].content).toContain("preexisting = 7");
      expect(evidence.evidenceStatus).toBe("READY");
    } finally { await fs.rm(cwd, { recursive: true, force: true }); }
  });

  test("deletion, untracked removal, quoted Unicode rename endpoints and binary content survive", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-task-boundaries-"));
    try {
      execSync("git init && git config user.name Test && git config user.email test@example.com", { cwd, stdio: "ignore" });
      await fs.mkdir(path.join(cwd, "src"));
      await fs.writeFile(path.join(cwd, "src", "cũ name.ts"), "export const renamed = true;\n");
      await fs.writeFile(path.join(cwd, "src", "deleted.ts"), "export const removed = true;\n");
      await fs.writeFile(path.join(cwd, "src", "binary.dat"), Buffer.from([0, 1, 2, 3]));
      execSync("git add . && git commit -qm initial", { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(cwd, "src", "temporary.txt"), "pre-task untracked bytes");
      const baseline = await captureWorkspaceSnapshot(cwd);
      await fs.rename(path.join(cwd, "src", "cũ name.ts"), path.join(cwd, "src", "mới name.ts"));
      await fs.unlink(path.join(cwd, "src", "deleted.ts"));
      await fs.unlink(path.join(cwd, "src", "temporary.txt"));
      await fs.writeFile(path.join(cwd, "src", "binary.dat"), Buffer.from([0, 1, 8, 9]));
      const evidence = await collectTaskEvidence({ cwd, baseline });
      for (const file of ["src/cũ name.ts", "src/mới name.ts", "src/deleted.ts", "src/temporary.txt", "src/binary.dat"]) expect(evidence.changedFiles).toContain(file);
      expect(evidence.gitDiff).toContain("-export const removed = true;");
      expect(evidence.gitDiff).toContain("pre-task untracked bytes");
      expect(evidence.gitDiff).toContain("GIT binary patch");
      expect(evidence.omissions).toEqual([]);
    } finally { await fs.rm(cwd, { recursive: true, force: true }); }
  });

  test("a command changing a second tracked file is collected after the command and invalidates later freshness", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-post-command-"));
    try {
      execSync("git init && git config user.name Test && git config user.email test@example.com", { cwd, stdio: "ignore" });
      await fs.mkdir(path.join(cwd, "src"));
      await fs.writeFile(path.join(cwd, "src", "first.ts"), "old\n");
      await fs.writeFile(path.join(cwd, "src", "second.ts"), "old\n");
      await fs.writeFile(path.join(cwd, "check.cjs"), "require('node:fs').writeFileSync('src/second.ts', 'test mutation\\n');");
      execSync("git add . && git commit -qm initial", { cwd, stdio: "ignore" });
      const baseline = await captureWorkspaceSnapshot(cwd);
      await fs.writeFile(path.join(cwd, "src", "first.ts"), "task change\n");
      const earlierSnapshot = await captureWorkspaceSnapshot(cwd);
      const evidence = await collectTaskEvidence({ cwd, baseline, afterSnapshot: earlierSnapshot, testCommand: `"${process.execPath}" check.cjs` });
      expect(evidence.changedFiles).toEqual(["src/first.ts", "src/second.ts"]);
      expect(evidence.gitDiff).toContain("+test mutation");
      await fs.writeFile(path.join(cwd, "src", "late.ts"), "late mutation\n");
      expect((await validateEvidenceFreshness(evidence, cwd)).ok).toBe(false);
    } finally { await fs.rm(cwd, { recursive: true, force: true }); }
  });

  test("genuine non-Git research uses scoped artifacts without invented commands or clean Git claims", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-nongit-research-"));
    try {
      const contract = evidenceContract("research");
      await fs.mkdir(path.join(cwd, ".claude"));
      await fs.writeFile(path.join(cwd, ".claude", "private.txt"), "Unrelated private pre-task non-Git prose");
      const baseline = await captureWorkspaceSnapshot(cwd, { contract });
      await fs.writeFile(path.join(cwd, "report.md"), "Actual research with tail proof.");
      const evidence = await collectTaskEvidence({ cwd, contract, baseline });
      expect(JSON.stringify(evidence)).not.toContain("Unrelated private pre-task non-Git prose");
      expect(evidence.snapshot?.mode).toBe("non-git");
      expect(evidence.cleanWorkingTree).toBe(false);
      expect(evidence.testExitCode).toBeNull();
      expect(evidence.testOutput).toBe("");
      expect(evidence.sourceEvidence?.find((item) => item.path === "report.md")?.content).toContain("tail proof");
      expect(evidence.criteria).toEqual(contract.criteria.map((criterion) => criterion.text));
      expect(evidence.evidenceStatus).toBe("READY");
      expect(hasProductCodeChanges(" M src/inspected.ts", "Review source", contract)).toBe(false);
    } finally { await fs.rm(cwd, { recursive: true, force: true }); }
  });

  test("unsafe hardlinked snapshot and untracked proof never become accepted content or a clean empty tree", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-unsafe-snapshot-"));
    const external = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-private-bytes-"));
    try {
      execSync("git init", { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(external, "private.txt"), "ordinary confidential external sentinel");
      const baseline = await captureWorkspaceSnapshot(cwd);
      await fs.link(path.join(external, "private.txt"), path.join(cwd, "report.md"));
      for (const options of [{ cwd, baseline }, { cwd }]) {
        const evidence = await collectTaskEvidence(options);
        expect(evidence.evidenceStatus).toBe("EVIDENCE_REQUIRED");
        expect(evidence.cleanWorkingTree).toBe(false);
        expect(evidence.snapshot?.files.has("report.md")).toBe(false);
        expect(JSON.stringify(evidence)).not.toContain("ordinary confidential external sentinel");
        expect(evidence.omissions?.some((item) => item.kind === "security")).toBe(true);
      }
    } finally { await fs.rm(cwd, { recursive: true, force: true }); await fs.rm(external, { recursive: true, force: true }); }
  });

  test("same-text task incarnation cannot borrow a baseline, and unsafe criterion reads are explicit", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-foreign-baseline-"));
    const external = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-private-plan-"));
    try {
      execSync("git init", { cwd, stdio: "ignore" });
      const first = evidenceContract("review"); const baseline = await captureWorkspaceSnapshot(cwd, { contract: first });
      const next = { ...first, incarnationId: "reappended-incarnation" };
      expect((await collectTaskEvidence({ cwd, contract: next, baseline })).evidenceStatus).toBe("EVIDENCE_REQUIRED");
      await fs.writeFile(path.join(external, "plan.md"), "- [ ] confidential other-task criterion");
      await fs.link(path.join(external, "plan.md"), path.join(cwd, "plan.md"));
      const evidence = await collectTaskEvidence({ cwd, planPath: path.join(cwd, "plan.md") });
      expect(evidence.criteria).toEqual([]);
      expect(evidence.omissions?.some((item) => item.reason === "CRITERIA_SOURCE_UNAVAILABLE")).toBe(true);
      expect(JSON.stringify(evidence)).not.toContain("confidential other-task criterion");
    } finally { await fs.rm(cwd, { recursive: true, force: true }); await fs.rm(external, { recursive: true, force: true }); }
  });
});
