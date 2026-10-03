import { describe, expect, test } from "bun:test";
import {
  runTaskMicroCheck,
  runPhaseMacroCheck,
  evaluateScopeArbiter,
  evaluateDriftGuard,
  generateVerificationScorecard,
  type ExpertJudgeClient,
  type MicroCheckEvidence,
  type MacroCheckContext,
} from "../src/cook-expert-judge";
import { preparePayloadSafe } from "../src/payload-safety";

describe("Phase 4: Adversarial Stress Test Matrix & Critical Verification", () => {
  test("Attack 1 (Superficial Completion): Stubs exit 0 but unmet plan requirements are blocked by Gate 2", async () => {
    // Agent wrote stubs, tests exit 0, but judge evaluates criteria as unmet (0.42 < 0.70)
    const microEvidence: MicroCheckEvidence = {
      gitStatus: "M src/feature.ts",
      gitDiff: "+ function scaffold() { /* TODO */ }",
      testExitCode: 0,
      testOutput: "PASS 1 test (empty stub)",
      cleanWorkingTree: false,
    };

    const g1 = await runTaskMicroCheck(microEvidence);
    expect(g1.passed).toBe(true);

    const mockJudge: ExpertJudgeClient = {
      evaluate: async () => ({
        answers: {
          meets_criteria: { noul: 0.42, confidence: 0.95 },
          architectural_drift: { choice: "no_drift" },
          scope_mode: { choice: "HOLD" },
        },
      }),
    };

    const ctx: MacroCheckContext = {
      phaseTitle: "Feature Implementation",
      planRequirements: ["Implement real business logic", "Handle edge cases"],
      diffSummary: "1 file changed, +1 -0",
      unifiedDiff: "+ function scaffold() { /* TODO */ }",
      testSummary: "PASS 1 test",
    };

    const g2 = await runPhaseMacroCheck(ctx, mockJudge);
    expect(g2.approved).toBe(false);
    expect(g2.reasons.some((r) => r.includes("0.70"))).toBe(true);
  });

  test("Attack 2 (Unauthorized Scope Reduction): Scope reduction is rejected by Scope Arbiter", async () => {
    const mockJudge: ExpertJudgeClient = {
      evaluate: async () => ({
        answers: {
          scope_arbiter: { choice: "REDUCTION" },
        },
      }),
    };

    const res = await evaluateScopeArbiter(
      "Original: Full DB migration with rollback capability",
      "Submitted: DB migration without rollback",
      mockJudge
    );

    expect(res.approved).toBe(false);
    expect(res.choice).toBe("REDUCTION");
    expect(res.reason).toContain("Scope reduction");
  });

  test("Attack 3 (Architectural Contract Drift): Drift Guard detects unapproved deviations", async () => {
    const mockJudge: ExpertJudgeClient = {
      evaluate: async () => ({
        answers: {
          architectural_drift_guard: { choice: "unapproved_deviation" },
        },
      }),
    };

    const res = await evaluateDriftGuard(
      "diff --git a/unrelated-core.ts b/unrelated-core.ts\n+ modifiedUnrelatedCore();",
      ["Target: Only modify user feature component"],
      mockJudge
    );

    expect(res.approved).toBe(false);
    expect(res.choice).toBe("unapproved_deviation");
  });

  test("Attack 4 (Network Outage / 503 Drop): Fails closed and triggers user escalation", async () => {
    const failingJudge: ExpertJudgeClient = {
      evaluate: async () => ({
        error: "HTTP 503 Service Unavailable: TypeSafe System One offline",
      }),
    };

    const ctx: MacroCheckContext = {
      phaseTitle: "Critical Security Phase",
      planRequirements: ["Enforce auth tokens"],
      diffSummary: "diff",
      unifiedDiff: "+ secureAuth();",
      testSummary: "PASS",
    };

    const res = await runPhaseMacroCheck(ctx, failingJudge);
    expect(res.approved).toBe(false);
    expect(res.escalateToUser).toBe(true);
    expect(res.error).toContain("503");
  });

  test("Attack 5 (Credential Injection): State payload redacts Anthropic tokens prior to egress", () => {
    const leakyPayload = {
      state: JSON.stringify({
        token: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890",
        message: "Attempting credential forwarding",
      }),
      questions: {
        check: {
          type: "noul" as const,
          instructions: "Validate safety",
        },
      },
    };

    const sanitized = preparePayloadSafe(leakyPayload);
    expect(sanitized.state).not.toContain("sk-ant-api03-");
    expect(sanitized.state).toMatch(/\[REDACTED:(?:token|anthropic-key)\]/);
  });

  test("Attack 6 (Loop Exhaustion): On 3rd attempt, autonomous retry halts and escalates to user", async () => {
    const mockJudge: ExpertJudgeClient = {
      evaluate: async () => ({
        answers: {
          meets_criteria: { noul: 0.5 },
          architectural_drift: { choice: "no_drift" },
          scope_mode: { choice: "HOLD" },
        },
      }),
    };

    const ctx: MacroCheckContext = {
      phaseTitle: "Struggling Phase",
      planRequirements: ["Complex invariant"],
      diffSummary: "changes",
      unifiedDiff: "+ attempted fix",
      testSummary: "FAIL",
      attemptCount: 3,
    };

    const res = await runPhaseMacroCheck(ctx, mockJudge);
    expect(res.approved).toBe(false);
    expect(res.escalateToUser).toBe(true);
    expect(res.reasons.some((r) => r.includes("3") || r.includes("consecutive") || r.includes("revision"))).toBe(true);
  });

  test("Full Lifecycle Simulation: Plan -> Micro-Check -> Macro-Check -> Scorecard -> Approval", async () => {
    // 1. Scope Arbiter approves plan
    const scopeMock: ExpertJudgeClient = {
      evaluate: async () => ({ answers: { scope_arbiter: { choice: "HOLD" } } }),
    };
    const scopeRes = await evaluateScopeArbiter("Plan A", "Prompt A", scopeMock);
    expect(scopeRes.approved).toBe(true);

    // 2. Implementation micro-check passes
    const microEvidence: MicroCheckEvidence = {
      gitStatus: "M src/core.ts",
      gitDiff: "+ realImplementation();",
      testExitCode: 0,
      testOutput: "PASS 10 tests",
      cleanWorkingTree: false,
    };
    const g1 = await runTaskMicroCheck(microEvidence);
    expect(g1.passed).toBe(true);

    // 3. Macro-check passes with flying colors
    const macroMock: ExpertJudgeClient = {
      evaluate: async () => ({
        answers: {
          meets_criteria: { noul: 0.98, confidence: 0.96 },
          architectural_drift: { choice: "no_drift" },
          scope_mode: { choice: "HOLD" },
          risk_score: { score: 3.0 },
        },
      }),
    };
    const macroCtx: MacroCheckContext = {
      phaseTitle: "Completed Phase",
      planRequirements: ["Req 1", "Req 2"],
      diffSummary: "10 files changed",
      unifiedDiff: "+ fullWorkingCode();",
      testSummary: "10 passed, 0 failed",
    };
    const g2 = await runPhaseMacroCheck(macroCtx, macroMock);
    expect(g2.approved).toBe(true);
    expect(g2.meetsCriteriaNoul).toBe(0.98);

    // 4. Scorecard generated for review gate
    const scorecard = generateVerificationScorecard({
      meetsCriteriaNoul: g2.meetsCriteriaNoul!,
      driftChoice: g2.driftChoice!,
      scopeChoice: g2.scopeChoice!,
      expertConfidence: g2.expertConfidence!,
    });
    expect(scorecard).toContain("TypeSafe System One Verification Scorecard");
    expect(scorecard).toContain("P = 0.98");
    expect(scorecard).toContain("None (Strict adherence)");
    expect(scorecard).toContain("HOLD");
  });
});
