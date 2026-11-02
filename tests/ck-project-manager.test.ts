import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Import the module under test
import {
  parsePlan,
  scanAllPlans,
  reconcilePlan,
  generateLedger,
  auditProjectState,
  isQuotedCheckboxText,
} from "../tools/ck-project-manager.cjs";

describe("ClaudeKit Project Management & Organization Engine (ck-project-manager)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-pm-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test("isQuotedCheckboxText correctly distinguishes functional checkboxes from quoted boilerplate", () => {
    expect(isQuotedCheckboxText("- [ ] Real task to implement")).toBe(false);
    expect(isQuotedCheckboxText("` - [ ] Verifiable acceptance criteria `")).toBe(true);
    expect(isQuotedCheckboxText("- [ ] Verifiable acceptance criteria`, `TBD.`")).toBe(true);
    expect(isQuotedCheckboxText("when an agent completes Sub-Task 1: - [ ]` and `- [x]`")).toBe(true);
    expect(isQuotedCheckboxText("- [ ] Test validation commands`")).toBe(true);
  });

  test("parsePlan extracts YAML frontmatter, phase files, and counts functional checkboxes", async () => {
    const planDir = path.join(tmpDir, "plans", "261101-sample-plan");
    await fs.mkdir(planDir, { recursive: true });

    const planContent = `---
title: "Sample Plan"
status: in-progress
priority: P1
effort: "2 phases"
branch: master
tags: [sample, test]
---
# Sample Plan
## Overview
Some description.
- [ ] Plan level task 1
- [x] Plan level task 2
`;
    await fs.writeFile(path.join(planDir, "plan.md"), planContent, "utf8");

    const phase1Content = `---
phase: 1
---
# Phase 1
- [x] Phase 1 task A
- [ ] Phase 1 task B
- [ ] Verifiable acceptance criteria\`
`;
    await fs.writeFile(path.join(planDir, "phase-01-setup.md"), phase1Content, "utf8");

    const parsed = parsePlan(path.join(planDir, "plan.md"), tmpDir);
    expect(parsed.title).toBe("Sample Plan");
    expect(parsed.status).toBe("in-progress");
    expect(parsed.priority).toBe("P1");
    expect(parsed.planCheckboxes.checked).toBe(1);
    expect(parsed.planCheckboxes.unchecked).toBe(1);
    expect(parsed.phaseCheckboxes.checked).toBe(1);
    expect(parsed.phaseCheckboxes.unchecked).toBe(1); // The stub is excluded
    expect(parsed.phaseFiles.length).toBe(1);
  });

  test("reconcilePlan backfills phase checkboxes and updates frontmatter status to completed (Sync-Back Guard)", async () => {
    const planDir = path.join(tmpDir, "plans", "261101-reconcile-test");
    await fs.mkdir(planDir, { recursive: true });

    const planContent = `---
title: "Reconcile Plan"
status: pending
---
# Reconcile Plan
- [ ] Task 1
- [ ] Task 2
`;
    const phaseContent = `# Phase 1
- [ ] Subtask 1
- [ ] Subtask 2
`;
    await fs.writeFile(path.join(planDir, "plan.md"), planContent, "utf8");
    await fs.writeFile(path.join(planDir, "phase-01-work.md"), phaseContent, "utf8");

    const result = reconcilePlan(path.join(planDir, "plan.md"), {
      status: "completed",
      lineage: {
        completedInCycle: "2026-11-02",
        verificationSuite: "tests/sample.test.ts",
      },
    });

    expect(result.success).toBe(true);

    const updatedPlan = await fs.readFile(path.join(planDir, "plan.md"), "utf8");
    expect(updatedPlan).toContain("status: completed");
    expect(updatedPlan).toContain("- [x] Task 1");
    expect(updatedPlan).toContain("- [x] Task 2");

    const updatedPhase = await fs.readFile(path.join(planDir, "phase-01-work.md"), "utf8");
    expect(updatedPhase).toContain("- [x] Subtask 1");
    expect(updatedPhase).toContain("- [x] Subtask 2");
  });

  test("generateLedger produces a comprehensive JSON and Markdown summary of all plans", async () => {
    const planDirA = path.join(tmpDir, "plans", "261001-plan-a");
    const planDirB = path.join(tmpDir, "plans", "261102-plan-b");
    await fs.mkdir(planDirA, { recursive: true });
    await fs.mkdir(planDirB, { recursive: true });

    await fs.writeFile(
      path.join(planDirA, "plan.md"),
      `---\ntitle: "Plan A"\nstatus: completed\n---\n# Plan A\n- [x] Done\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(planDirB, "plan.md"),
      `---\ntitle: "Plan B"\nstatus: in-progress\n---\n# Plan B\n- [ ] Pending\n`,
      "utf8"
    );

    const ledger = generateLedger(tmpDir);
    expect(ledger.totalPlans).toBe(2);
    expect(ledger.completedCount).toBe(1);
    expect(ledger.inProgressCount).toBe(1);
    expect(ledger.plans.length).toBe(2);

    const ledgerJson = await fs.readFile(path.join(tmpDir, "plans", "plan-ledger.json"), "utf8");
    expect(ledgerJson).toContain("Plan A");
    expect(ledgerJson).toContain("Plan B");

    const ledgerMd = await fs.readFile(path.join(tmpDir, "plans", "README.md"), "utf8");
    expect(ledgerMd).toContain("# Bảng Theo Dõi Kế Hoạch & Tiến Độ");
  });

  test("auditProjectState detects pending items and produces actionable inheritance recommendations", async () => {
    const planDir = path.join(tmpDir, "plans", "261019-pending-plan");
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(
      path.join(planDir, "plan.md"),
      `---\ntitle: "Pending Plan"\nstatus: pending\n---\n# Pending\n- [ ] Work\n`,
      "utf8"
    );

    const audit = auditProjectState(tmpDir);
    expect(audit.isClean).toBe(false);
    expect(audit.incompletePlans.length).toBe(1);
    expect(audit.incompletePlans[0].id).toBe("261019-pending-plan");
  });
});
