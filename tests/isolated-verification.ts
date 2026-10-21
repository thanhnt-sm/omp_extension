import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileChildSync } from "../src/typesafe-child-env.cjs";
import { verifyTaskCompletion } from "../src/verification-gate";
import type { TaskVerificationContext, GateJudgeClient, DualGateVerificationResult } from "../src/verification-gate";
import type { SemanticApprovalOptions } from "../src/semantic-approval-policy";

export async function verifyInIsolatedWorkspace(context: TaskVerificationContext, judge?: GateJudgeClient, options?: SemanticApprovalOptions): Promise<DualGateVerificationResult> {
  const cwd = mkdtempSync(join(tmpdir(), "typesafe-gate-"));
  try {
    execFileChildSync("evidence-git", "git", ["init", "--quiet", cwd]);
    writeFileSync(join(cwd, "fixture.test.ts"), 'import { expect, test } from "bun:test"; test("fixture behavior", () => expect([1, 2].map(n => n * 2)).toEqual([2, 4]));');
    execFileChildSync("evidence-git", "git", ["-C", cwd, "add", "fixture.test.ts"]);
    execFileChildSync("evidence-git", "git", ["-C", cwd, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture baseline"]);
    return await verifyTaskCompletion({ ...context, cwd, testCommand: context.testCommand ?? "bun test fixture.test.ts" }, judge, options);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
