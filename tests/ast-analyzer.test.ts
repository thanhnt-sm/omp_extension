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
});
