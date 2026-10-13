import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { verifyTaskCompletion, type TaskVerificationContext, type GateJudgeClient } from "../src/verification-gate";

export async function verifyInIsolatedWorkspace(context: TaskVerificationContext, judge?: GateJudgeClient) {
  const cwd = mkdtempSync(join(tmpdir(), "typesafe-gate-"));
  try {
    execFileSync("git", ["init", "--quiet", cwd]);
    writeFileSync(join(cwd, "fixture.test.ts"), 'import { expect, test } from "bun:test"; test("fixture behavior", () => expect([1, 2].map(n => n * 2)).toEqual([2, 4]));');
    execFileSync("git", ["-C", cwd, "add", "fixture.test.ts"]);
    execFileSync("git", ["-C", cwd, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture baseline"]);
    return await verifyTaskCompletion({ ...context, cwd, testCommand: context.testCommand ?? "bun test fixture.test.ts" }, judge);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
