import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import {
  assertPathIsClaudeSafe,
  collectTaskEvidence,
  executeTestCommand,
  extractCriteriaFromPlan,
  sanitizeEnvironment,
  SecurityViolationError,
  captureWorkspaceSnapshot,
  diffSnapshots,
  isPlanCliStub,
} from "../src/evidence-collector";
import { collectDeliverableArtifacts } from "../typesafe-planner";

describe("Phase 1: Deterministic Evidence Collector & Claude Isolation", () => {
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

  test("sanitizeEnvironment strips all ANTHROPIC_ and CLAUDE_ environment variables", () => {
    const dirtyEnv = {
      PATH: "/usr/bin",
      NODE_ENV: "test",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      CLAUDE_CODE_TOKEN: "claude-token-val",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      TYPESAFE_API_KEY: "valid-typesafe-key",
    };

    const cleanEnv = sanitizeEnvironment(dirtyEnv);
    expect(cleanEnv.PATH).toBe("/usr/bin");
    expect(cleanEnv.TYPESAFE_API_KEY).toBe("valid-typesafe-key");
    expect(cleanEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(cleanEnv.CLAUDE_CODE_TOKEN).toBeUndefined();
    expect(cleanEnv.ANTHROPIC_BASE_URL).toBeUndefined();
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
