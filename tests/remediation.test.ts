import { expect, test, describe } from "bun:test";
import { generateRemediationBlock } from "../src/remediation-generator";
import type { RemediationDirective } from "../src/types/security";

describe("Structured Remediation Feedback Loops", () => {
  test("generates valid XML schema", () => {
    const directive: RemediationDirective = {
      instruction: "Please fix the code.",
      immutableConstraints: ["Must be TypeScript."],
      failureReasons: ["Syntax error."],
      actionItems: ["Check syntax."],
    };

    const xml = generateRemediationBlock(directive);
    
    expect(xml).toContain("<remediation>");
    expect(xml).toContain("<instruction>Please fix the code.</instruction>");
    expect(xml).toContain("<constraint>Must be TypeScript.</constraint>");
    expect(xml).toContain("<reason>Syntax error.</reason>");
    expect(xml).toContain("<action>Check syntax.</action>");
    expect(xml).toContain("</remediation>");
  });

  test("synthesizes specific test command on test failure", () => {
    const directive: RemediationDirective = {
      instruction: "Fix test failures.",
      immutableConstraints: [],
      failureReasons: ["Test suite failed in src/my-feature.test.ts with exit code 1"],
      actionItems: [],
    };

    const xml = generateRemediationBlock(directive);
    expect(xml).toContain("<action>Run tests to verify fixes: bun test my-feature.test.ts</action>");
  });

  test("synthesizes general test command on generic test failure", () => {
    const directive: RemediationDirective = {
      instruction: "Fix test failures.",
      immutableConstraints: [],
      failureReasons: ["Test suite failed with exit code 1"],
      actionItems: [],
    };

    const xml = generateRemediationBlock(directive);
    expect(xml).toContain("<action>Run full test suite to verify fixes: bun test</action>");
  });

  test("synthesizes restoration directives for test evasion", () => {
    const directive: RemediationDirective = {
      instruction: "Do not evade tests.",
      immutableConstraints: [],
      failureReasons: ["Test evasion detected: deleted assertion"],
      actionItems: [],
    };

    const xml = generateRemediationBlock(directive);
    expect(xml).toContain("<action>Restore deleted test assertions and ensure tests pass legitimately.</action>");
    expect(xml).toContain("<constraint>Do not delete existing assertions or test blocks.</constraint>");
  });

  test("synthesizes drift directives", () => {
    const directive: RemediationDirective = {
      instruction: "Fix drift.",
      immutableConstraints: [],
      failureReasons: ["Architectural drift: scope creep into other files"],
      actionItems: [],
    };

    const xml = generateRemediationBlock(directive);
    expect(xml).toContain("<action>Revert unapproved architectural changes and restrict modifications to planned boundaries.</action>");
    expect(xml).toContain("<constraint>Strictly adhere to planned architecture and boundaries.</constraint>");
  });
});
