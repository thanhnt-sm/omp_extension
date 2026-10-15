import type { ASTAnalysisResult } from "./types/security";

export function analyzeDiffForTestEvasion(diff: string): ASTAnalysisResult {
  const result: ASTAnalysisResult = {
    isSafe: true,
    issues: [],
    deletedAssertions: [],
    modifiedSuites: [],
  };

  if (!diff || diff.trim() === "") {
    return result;
  }

  // Identify deleted assertions (net reduction in assertion count)
  const deletedAssertionRegex = /(?:^|\n)-[ \t]*(?:expect\(|assert\(|assert\.[a-zA-Z]+\()/g;
  const addedAssertionRegex = /(?:^|\n)\+[ \t]*(?:expect\(|assert\(|assert\.[a-zA-Z]+\()/g;
  const removedAssertions: string[] = [];
  let match;
  while ((match = deletedAssertionRegex.exec(diff)) !== null) {
    removedAssertions.push(match[0].trim());
  }
  let addedAssertionCount = 0;
  while (addedAssertionRegex.exec(diff) !== null) {
    addedAssertionCount++;
  }
  if (removedAssertions.length > addedAssertionCount) {
    result.deletedAssertions.push(...removedAssertions.slice(addedAssertionCount));
    result.issues.push("Test evasion detected: git diff contains deleted assertions (expect/assert). Deleting tests to fake completion is prohibited.");
  }

  // Identify deleted test blocks (net reduction in test block count)
  const deletedTestBlockRegex = /(?:^|\n)-[ \t]*(?:it\(|test\(|describe\()/g;
  const addedTestBlockRegex = /(?:^|\n)\+[ \t]*(?:it\(|test\(|describe\()/g;
  const removedBlocks: string[] = [];
  while ((match = deletedTestBlockRegex.exec(diff)) !== null) {
    removedBlocks.push(match[0].trim());
  }
  let addedBlockCount = 0;
  while (addedTestBlockRegex.exec(diff) !== null) {
    addedBlockCount++;
  }
  if (removedBlocks.length > addedBlockCount) {
    result.modifiedSuites.push(...removedBlocks.slice(addedBlockCount));
    result.issues.push("Detected deletion of test block or suite.");
  }

  // Identify commented out assertions in additions
  const commentedAssertionRegex = /(?:^|\n)\+[ \t]*(?:\/\/|\/\*)[ \t]*(?:expect\(|assert\()/g;
  if (commentedAssertionRegex.test(diff)) {
    result.issues.push("Detected commented-out test assertion in additions.");
  }

  // Identify trivial tautologies
  const tautologyRegex = /(?:^|\n)\+[ \t]*expect\((?:true|false|1|0)\)\.toBe\((?:true|false|1|0)\)/g;
  if (tautologyRegex.test(diff)) {
    result.issues.push("Detected trivial tautology assertion (e.g., expect(true).toBe(true)).");
  }

  if (result.issues.length > 0) {
    result.isSafe = false;
  }

  return result;
}
