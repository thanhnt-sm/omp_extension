import { describe, expect, test } from "bun:test";
import { evaluateAtomicJevStep, type AtomicEvaluationInput } from "../src/atomic-jev-evaluator";

describe("Atomic TypeSafe Jev Judge Incremental Verification", () => {
  test("approves clean diff with passing test and no drift", async () => {
    const input: AtomicEvaluationInput = {
      taskGoal: "Add helper utility function for string formatting",
      gitDiff: `
diff --git a/src/format.ts b/src/format.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/format.ts
@@ -0,0 +1,5 @@
+export function formatTitle(s: string): string {
+  return s.trim();
+}
`,
      testExitCode: 0,
      testOutput: "1 pass, 0 fail",
    };

    const result = await evaluateAtomicJevStep(input);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe("APPROVE");
    expect(result.scores.drift).toBe("no_drift");
    expect(result.scores.integrity).toBe(true);
    expect(result.scores.quality).toBeGreaterThanOrEqual(2.0);
    expect(result.reasons.length).toBe(0);
  });

  test("rejects diff when test suite fails and auto-embeds Advisor remediation descriptor", async () => {
    const input: AtomicEvaluationInput = {
      taskGoal: "Fix parser bug",
      gitDiff: `
diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -10,3 +10,3 @@
-  return a + b;
+  return a - b;
`,
      testExitCode: 1,
      testOutput: "fail: expect(received).toBe(expected) -- received -1, expected 5",
      task: "Fix parser bug",
      phase: "Pha 1",
    };

    const result = await evaluateAtomicJevStep(input);
    expect(result.passed).toBe(false);
    expect(result.verdict).toBe("REJECT");
    expect(result.reasons.some(r => r.includes("Test suite failed"))).toBe(true);
    expect(result.autoRemediation).toBeDefined();
    expect(result.autoRemediation).toContain("typesafe_prepare_advisor");
    expect(result.autoRemediation).toContain("Fix parser bug");
  });

  test("detects boundary violations when diff touches forbidden .claude directory", async () => {
    const input: AtomicEvaluationInput = {
      taskGoal: "Update configuration",
      gitDiff: `
diff --git a/.claude/settings.json b/.claude/settings.json
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -1 +1 @@
-{}
+{"modified": true}
`,
      testExitCode: 0,
    };

    const result = await evaluateAtomicJevStep(input);
    expect(result.passed).toBe(false);
    expect(result.verdict).toBe("REJECT");
    expect(result.scores.drift).toBe("severe_drift");
    expect(result.reasons.some(r => r.includes(".claude"))).toBe(true);
  });

  test("detects test evasion when test assertions are stripped", async () => {
    const input: AtomicEvaluationInput = {
      taskGoal: "Refactor test suite",
      gitDiff: `
diff --git a/tests/sample.test.ts b/tests/sample.test.ts
--- a/tests/sample.test.ts
+++ b/tests/sample.test.ts
@@ -5,4 +5,0 @@
-  expect(result).toBe(true);
-  expect(value).toBeGreaterThan(0);
`,
      testExitCode: 0,
    };

    const result = await evaluateAtomicJevStep(input);
    expect(result.passed).toBe(false);
    expect(result.scores.integrity).toBe(false);
    expect(result.reasons.some(r => r.includes("evasion") || r.includes("assertion"))).toBe(true);
  });

  test("rejects when testExitCode is null and testRequired defaults to true (fail-closed)", async () => {
    const input: AtomicEvaluationInput = {
      taskGoal: "Implement critical security patch",
      gitDiff: `
diff --git a/src/patch.ts b/src/patch.ts
--- a/src/patch.ts
+++ b/src/patch.ts
@@ -1,2 +1,3 @@
+export const patched = true;
`,
      testExitCode: null, // No test ran, but tests required by default
    };

    const result = await evaluateAtomicJevStep(input);
    expect(result.passed).toBe(false);
    expect(result.verdict).toBe("REJECT");
    expect(result.reasons.some(r => r.includes("testExitCode is null") || r.includes("no test exit code"))).toBe(true);
  });

  test("approves when testExitCode is null for research task where testRequired is explicitly false", async () => {
    const input: AtomicEvaluationInput = {
      taskGoal: "Research documentation analysis",
      gitDiff: "",
      testExitCode: null,
      testRequired: false,
    };

    const result = await evaluateAtomicJevStep(input);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe("APPROVE");
  });
});
