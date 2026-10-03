import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";

describe("Phase 1: Cook Workflow Specification & Review Gate Upgrade", () => {
  const cookSkillDir = path.join(process.env.USERPROFILE || "C:/Users/thant", ".claude", "skills", "cook");
  const judgmentsPath = path.join(cookSkillDir, "references", "typesafe-judgments.md");
  const workflowStepsPath = path.join(cookSkillDir, "references", "workflow-steps.md");

  test("typesafe-judgments.md defines section 3e for Tri-Role Expert Evaluation", async () => {
    const content = await fs.readFile(judgmentsPath, "utf8");
    expect(content).toContain("## 3e. Tri-Role Expert Evaluator & Phase Semantic Verification");
    expect(content).toContain("QUESTIONS_TRI_ROLE_EVALUATION");
    expect(content).toContain("meets_criteria");
    expect(content).toContain("scope_arbiter");
    expect(content).toContain("architectural_drift_guard");
    expect(content).toContain("risk_security_triage");
  });

  test("typesafe-judgments.md defines section 3f for Fail-Closed Human Escalation", async () => {
    const content = await fs.readFile(judgmentsPath, "utf8");
    expect(content).toContain("## 3f. Fail-Closed Human Escalation");
    expect(content).toContain("In non-auto modes, do NOT silently bypass the check");
    expect(content).toContain("ask");
  });

  test("workflow-steps.md mandates Gate 2 semantic verification before Review Gates 3 and 4", async () => {
    const content = await fs.readFile(workflowStepsPath, "utf8");
    expect(content).toContain("Requires successful Gate 2 semantic verification before presenting [Review Gate 3] or [Review Gate 4]");
    expect(content).toContain("In all modes, Gate 2 semantic verification is required before presenting [Review Gate 3] or [Review Gate 4]");
  });

  test("specifications enforce zero-touch isolation from Anthropic account credentials", async () => {
    const content = await fs.readFile(judgmentsPath, "utf8");
    expect(content).not.toContain("ANTHROPIC_API_KEY");
    expect(content).not.toContain("sk-ant-");
  });
});
