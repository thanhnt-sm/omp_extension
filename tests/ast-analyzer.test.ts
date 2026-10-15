import { expect, test, describe } from "bun:test";
import { analyzeDiffForTestEvasion } from "../src/ast-analyzer";

describe("AST Analyzer - Test Evasion Prevention", () => {
  test("Safe diff passes analysis", () => {
    const safeDiff = `
@@ -10,2 +10,3 @@
 const x = 1;
+const y = 2;
     `;
    const result = analyzeDiffForTestEvasion(safeDiff);
    expect(result.isSafe).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  test("Deleted expect assertion is flagged", () => {
    const diff = `
@@ -15,3 +15,2 @@
-  expect(x).toBe(1);
   console.log(x);
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(false);
    expect(result.deletedAssertions.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.includes("Test evasion detected"))).toBe(true);
  });

  test("Deleted assert assertion is flagged", () => {
    const diff = `
@@ -15,3 +15,2 @@
-  assert.equal(a, b);
   console.log(a);
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(false);
    expect(result.deletedAssertions.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.includes("Test evasion detected"))).toBe(true);
  });

  test("Deleted test block is flagged", () => {
    const diff = `
@@ -5,4 +5,1 @@
-describe("My test suite", () => {
-  it("does something", () => {
-  });
-});
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(false);
    expect(result.modifiedSuites.length).toBeGreaterThan(0);
    expect(result.issues).toContain("Detected deletion of test block or suite.");
  });

  test("Commented out expect in additions is flagged", () => {
    const diff = `
@@ -15,2 +15,3 @@
   const x = 1;
+  // expect(x).toBe(1);
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(false);
    expect(result.issues).toContain("Detected commented-out test assertion in additions.");
  });

  test("Trivial tautology is flagged", () => {
    const diff = `
@@ -15,2 +15,3 @@
   const x = 1;
+  expect(true).toBe(true);
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(false);
    expect(result.issues).toContain("Detected trivial tautology assertion (e.g., expect(true).toBe(true)).");
  });

  test("Legitimate test additions pass", () => {
    const diff = `
@@ -15,2 +15,3 @@
 describe("New feature", () => {
+  it("works", () => {
+    expect(feature).toBeDefined();
+  });
 });
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(true);
  });
  test("classifies test-path headers per file and ignores documentation prose", () => {
    const result = analyzeDiffForTestEvasion(`
diff --git a/tests/removed.test.ts b/tests/removed.test.ts
deleted file mode 100644
--- a/tests/removed.test.ts
+++ /dev/null
- expect(subject).toBe(true);
diff --git a/docs/testing.md b/docs/testing.md
--- a/docs/testing.md
+++ b/docs/testing.md
- \`expect(subject).toBe(true)\`
`);
    expect(result.isSafe).toBe(false);
    expect(result.deletedAssertions).toHaveLength(1);
  });

  test("handles rename, untracked, and headerless snippets conservatively", () => {
    const renamed = analyzeDiffForTestEvasion(`
diff --git "a/tests/source name.test.ts" "b/docs/source name.md"
similarity index 100%
rename from tests/source.test.ts
rename to docs/source.md
`);
    const untracked = analyzeDiffForTestEvasion(`
diff --git a/tests/new.test.ts b/tests/new.test.ts
new file mode 100644
+++ b/tests/new.test.ts
+test.skip("not ready", () => {});
`);
    const headerless = analyzeDiffForTestEvasion(`- expect(value).toBe(true);`);
    expect(renamed.isSafe).toBe(true);
    expect(untracked.modifiedSuites).toHaveLength(1);
    expect(headerless.deletedAssertions).toHaveLength(1);
  });

  test("uses per-file net deletion and only flags equal literal tautologies", () => {
    const crossFileMasking = analyzeDiffForTestEvasion(`
diff --git a/tests/removed.test.ts b/tests/removed.test.ts
--- a/tests/removed.test.ts
+++ b/tests/removed.test.ts
- expect(oldValue).toBe(true);
diff --git a/tests/added.test.ts b/tests/added.test.ts
--- a/tests/added.test.ts
+++ b/tests/added.test.ts
+ expect(newValue).toBe(true);
`);
    const literals = analyzeDiffForTestEvasion(`
+ expect("same").toBe("same");
+ expect(true).toBe(false);
+ expect(0).toBe(1);
`);
    expect(crossFileMasking.deletedAssertions).toHaveLength(1);
    expect(literals.issues).toContain("Detected trivial tautology assertion (e.g., expect(true).toBe(true)).");
    expect(literals.issues).toHaveLength(1);
  });

  test("does not let separate standalone header pairs mask per-file deletion", () => {
    const result = analyzeDiffForTestEvasion(`
--- a/__tests__/removed.ts
+++ b/__tests__/removed.ts
- expect(removed).toBe(true);
--- a/tests/added.ts
+++ b/tests/added.ts
+ expect(added).toBe(true);
`);
    expect(result.deletedAssertions).toHaveLength(1);
  });

  test("flags commented assertions and skip/todo suites in test files", () => {
    const result = analyzeDiffForTestEvasion(`
--- a/tests/feature.test.ts
+++ b/tests/feature.test.ts
+ /* assert.equal(value, expected); */
+ describe.todo("coverage later", () => {});
`);
    expect(result.isSafe).toBe(false);
    expect(result.modifiedSuites).toHaveLength(1);
    expect(result.issues).toContain("Detected commented-out test assertion in additions.");
  });

  test("Modified assertion and renamed test block with equal additions pass", () => {
    const diff = `
@@ -15,4 +15,4 @@
-  test("old scenario name", () => {
-    expect(activeTasks.has("OldTask")).toBe(false);
+  test("new scenario name", () => {
+    expect(activeTasks.has("NewTask")).toBe(false);
   });
    `;
    const result = analyzeDiffForTestEvasion(diff);
    expect(result.isSafe).toBe(true);
    expect(result.deletedAssertions.length).toBe(0);
    expect(result.modifiedSuites.length).toBe(0);
  });
});
