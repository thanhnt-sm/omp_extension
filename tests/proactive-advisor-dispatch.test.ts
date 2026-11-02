import { describe, expect, test } from "bun:test";
import {
  prepareProactiveAdvisorConsultation,
  parseAdvisorStructuredResponse,
} from "../src/proactive-advisor";

describe("Proactive Advisor Dispatch & Re-planning Loop", () => {
  test("prepares valid native task parameters with decision=stuck and failure context", () => {
    const consultation = prepareProactiveAdvisorConsultation({
      task: "Fix authentication token validation",
      phase: "Pha 2: Bảo mật",
      errorLog: "TypeError: token is undefined at auth.ts:42",
      gitDiff: "+ const token = req.headers['x-token'];",
      reasons: ["Test suite failed with exit code 1"],
    });

    expect(consultation.nativeTool).toBe("task");
    expect(consultation.parameters).toBeDefined();
    expect(consultation.parameters.agent).toBe("advisor");
    expect(consultation.parameters.decision).toBe("stuck");
    expect(consultation.parameters.task).toContain("Fix authentication token validation");
    expect(consultation.parameters.question).toContain("TypeError: token is undefined");
  });

  test("parses and validates standard 6-section Advisor output", () => {
    const mockAdvisorOutput = `
## Verdict
revise

## Recommendation
Root cause: req.headers['x-token'] is undefined when headers are normalized to lowercase by Node.js http parser.
Action plan:
1. Update auth.ts:42 to check req.headers['x-token'] || req.headers['authorization'].
2. Add null guard for missing token returning 401 Unauthorized.
3. Run bun test tests/auth.test.ts to verify fix.

## Ranked options
1. Option A (Score 0.95): Check both header casing variants. Safe, direct fix.
2. Option B (Score 0.70): Global middleware normalization. Broader scope, risk of regressions.

## Findings
- High | auth.ts:42 | Header casing lookup bug | Headers in Node.js are lowercased.

## Confidence
0.95

## Open questions
None
`;

    const parsed = parseAdvisorStructuredResponse(mockAdvisorOutput);
    expect(parsed.valid).toBe(true);
    expect(parsed.verdict).toBe("revise");
    expect(parsed.confidence).toBe(0.95);
    expect(parsed.openQuestions).toBe("None");
    expect(parsed.actionItems.length).toBe(3);
    expect(parsed.actionItems[0]).toContain("Update auth.ts:42");
    expect(parsed.actionItems[1]).toContain("Add null guard");
    expect(parsed.actionItems[2]).toContain("Run bun test");
  });

  test("detects malformed Advisor output missing required sections", () => {
    const incompleteOutput = `
## Verdict
proceed

I recommend fixing the test by changing the assertion.
`;
    const parsed = parseAdvisorStructuredResponse(incompleteOutput);
    expect(parsed.valid).toBe(false);
    expect(parsed.missingSections.length).toBeGreaterThan(0);
    expect(parsed.missingSections).toContain("## Recommendation");
    expect(parsed.missingSections).toContain("## Ranked options");
    expect(parsed.missingSections).toContain("## Findings");
    expect(parsed.missingSections).toContain("## Confidence");
  });
});
