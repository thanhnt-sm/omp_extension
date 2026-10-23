import { describe, expect, test } from "bun:test";
import { collectConversationContext, formatTaskReport, sanitizeStateForTypeSafe, summarizeUnifiedDiff } from "../typesafe-planner";

describe("P3 judge input fidelity", () => {
  test("state and report helpers preserve safe structured output", () => {
    const sanitized = sanitizeStateForTypeSafe({ test_summary: "x".repeat(4000) });
    expect(String(sanitized.test_summary)).toContain("[...");
    expect(summarizeUnifiedDiff("diff --git a/a.ts b/a.ts\n+const x = 1")).toContain("const x");
    expect(formatTaskReport({ kind: "DONE", tasks: ["A"], approved: true, decidedBy: "judge", reasons: [] })).toContain("DONE");
    expect(collectConversationContext({}).userRequest).toBe("");
  });
});
