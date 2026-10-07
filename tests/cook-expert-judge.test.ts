import { describe, expect, test } from "bun:test";
import {
  runTaskMicroCheck,
  runPhaseMacroCheck,
  evaluateScopeArbiter,
  evaluateDriftGuard,
  evaluateRiskSecurityTriage,
  generateVerificationScorecard,
  type ExpertJudgeClient,
  type MicroCheckEvidence,
  type MacroCheckContext,
} from "../src/cook-expert-judge";

describe("Phase 2: Cook Expert Judge & Dual-Cadence Engine", () => {
  describe("Cadence 1: runTaskMicroCheck (Local Deterministic Gate 1)", () => {
    test("passes fast on clean test run with zero tokens", async () => {
      const evidence: MicroCheckEvidence = {
        gitStatus: "M src/feature.ts",
        gitDiff: "diff --git a/src/feature.ts b/src/feature.ts\n+const x = 1;",
        testExitCode: 0,
        testOutput: "PASS 5 tests",
        cleanWorkingTree: false,
      };

      const start = performance.now();
      const res = await runTaskMicroCheck(evidence);
      const elapsed = performance.now() - start;

      expect(res.passed).toBe(true);
      expect(res.testPassed).toBe(true);
      expect(res.claudeSafe).toBe(true);
      expect(elapsed).toBeLessThan(150);
    });

    test("fails fast on nonzero test exit code without remote calls", async () => {
      const evidence: MicroCheckEvidence = {
        gitStatus: "M src/feature.ts",
        gitDiff: "diff --git a/src/feature.ts b/src/feature.ts\n+const x = 1;",
        testExitCode: 1,
        testOutput: "FAIL: Expected true but got false",
        cleanWorkingTree: false,
      };

      const res = await runTaskMicroCheck(evidence);
      expect(res.passed).toBe(false);
      expect(res.testPassed).toBe(false);
      expect(res.reasons.some((r) => r.includes("Test suite failed"))).toBe(true);
    });

    test("detects assertion deletion evasion in git diff", async () => {
      const evidence: MicroCheckEvidence = {
        gitStatus: "M tests/feature.test.ts",
        gitDiff: "--- a/tests/feature.test.ts\n+++ b/tests/feature.test.ts\n- expect(result).toBe(true);\n+ // deleted",
        testExitCode: 0,
        testOutput: "PASS 4 tests",
        cleanWorkingTree: false,
      };

      const res = await runTaskMicroCheck(evidence);
      expect(res.passed).toBe(false);
      expect(res.assertionDeleted).toBe(true);
      expect(res.reasons.some((r) => r.includes("assertion"))).toBe(true);
    });

    test("blocks modification of .claude directory or credentials", async () => {
      const evidence: MicroCheckEvidence = {
        gitStatus: "M .claude/config.json",
        gitDiff: "diff --git a/.claude/config.json b/.claude/config.json",
        testExitCode: 0,
        testOutput: "PASS",
        cleanWorkingTree: false,
      };

      const res = await runTaskMicroCheck(evidence);
      expect(res.passed).toBe(false);
      expect(res.claudeSafe).toBe(false);
      expect(res.reasons.some((r) => r.includes("Claude boundary"))).toBe(true);
    });

    test("handles non-git directory gracefully via fallback inspection", async () => {
      const evidence: MicroCheckEvidence = {
        gitStatus: "",
        gitDiff: "",
        testExitCode: 0,
        testOutput: "PASS",
        cleanWorkingTree: true,
        nonGitFallbackUsed: true,
      };

      const res = await runTaskMicroCheck(evidence);
      expect(res.passed).toBe(true);
      expect(res.nonGitFallbackUsed).toBe(true);
    });
  });

  describe("Cadence 2: runPhaseMacroCheck & Tri-Role Evaluation", () => {
    test("approves phase when criteria met (>=0.80) and no drift", async () => {
      const mockClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            meets_criteria: { noul: 0.95 },
            architectural_drift: { choice: "no_drift" },
            scope_mode: { choice: "HOLD" },
            risk_score: { score: 2.8 },
          },
        }),
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Phase 1: Implement Core Logic",
        planRequirements: ["Requirement A", "Requirement B"],
        diffSummary: "10 files changed, +100 -20",
        unifiedDiff: "+ function test() { return true; }",
        testSummary: "10 passed, 0 failed",
      };

      const res = await runPhaseMacroCheck(ctx, mockClient);
      expect(res.approved).toBe(true);
      expect(res.meetsCriteriaNoul).toBe(0.95);
      expect(res.driftChoice).toBe("no_drift");
      expect(res.scopeChoice).toBe("HOLD");
    });

    test("rejects phase when meets_criteria < 0.80", async () => {
      const mockClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            meets_criteria: { noul: 0.42 },
            architectural_drift: { choice: "no_drift" },
            scope_mode: { choice: "HOLD" },
          },
        }),
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Phase 1: Stub Only",
        planRequirements: ["Requirement A", "Requirement B"],
        diffSummary: "1 file changed",
        unifiedDiff: "+ // TODO: Implement A and B",
        testSummary: "0 tests",
      };

      const res = await runPhaseMacroCheck(ctx, mockClient);
      expect(res.approved).toBe(false);
      expect(res.reasons.some((r) => r.includes("0.80") || r.includes("threshold"))).toBe(true);
    });

    test("rejects phase when architectural drift is detected", async () => {
      const mockClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            meets_criteria: { noul: 0.85 },
            architectural_drift: { choice: "unapproved_deviation" },
            scope_mode: { choice: "HOLD" },
          },
        }),
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Phase 2: Drifted",
        planRequirements: ["Req A"],
        diffSummary: "modified unrelated files",
        unifiedDiff: "+ import axios from 'axios';",
        testSummary: "PASS",
      };

      const res = await runPhaseMacroCheck(ctx, mockClient);
      expect(res.approved).toBe(false);
      expect(res.driftChoice).toBe("unapproved_deviation");
    });
  });

  describe("Tri-Role Expert Evaluators", () => {
    test("evaluateScopeArbiter rejects REDUCTION choice", async () => {
      const mockClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            scope_arbiter: { choice: "REDUCTION" },
          },
        }),
      };

      const res = await evaluateScopeArbiter("Plan: Do A, B, C", "Prompt: Implement", mockClient);
      expect(res.approved).toBe(false);
      expect(res.choice).toBe("REDUCTION");
      expect(res.reason).toContain("Scope reduction");
    });

    test("evaluateScopeArbiter approves HOLD and EXPANSION", async () => {
      const mockHold: ExpertJudgeClient = {
        evaluate: async () => ({ answers: { scope_arbiter: { choice: "HOLD" } } }),
      };
      const holdRes = await evaluateScopeArbiter("Plan A", "Prompt A", mockHold);
      expect(holdRes.approved).toBe(true);
      expect(holdRes.choice).toBe("HOLD");

      const mockExp: ExpertJudgeClient = {
        evaluate: async () => ({ answers: { scope_arbiter: { choice: "EXPANSION" } } }),
      };
      const expRes = await evaluateScopeArbiter("Plan A", "Prompt A", mockExp);
      expect(expRes.approved).toBe(true);
      expect(expRes.choice).toBe("EXPANSION");
    });

    test("evaluateDriftGuard flags unapproved deviation or scope creep", async () => {
      const mockDeviation: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: { architectural_drift_guard: { choice: "unapproved_deviation" } },
        }),
      };
      const devRes = await evaluateDriftGuard("diff", ["req"], mockDeviation);
      expect(devRes.approved).toBe(false);
      expect(devRes.choice).toBe("unapproved_deviation");

      const mockCreep: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: { architectural_drift_guard: { choice: "scope_creep" } },
        }),
      };
      const creepRes = await evaluateDriftGuard("diff", ["req"], mockCreep);
      expect(creepRes.approved).toBe(false);
      expect(creepRes.choice).toBe("scope_creep");

      const mockNoDrift: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: { architectural_drift_guard: { choice: "no_drift" } },
        }),
      };
      const cleanRes = await evaluateDriftGuard("diff", ["req"], mockNoDrift);
      expect(cleanRes.approved).toBe(true);
      expect(cleanRes.choice).toBe("no_drift");
    });

    test("evaluateRiskSecurityTriage rates technical risks", async () => {
      const mockClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: { risk_security_triage: { score: 1.0 } },
        }),
      };

      const res = await evaluateRiskSecurityTriage("Context about auth tokens", mockClient);
      expect(res.score).toBe(1.0);
      expect(res.acceptable).toBe(true);

      const mockFailClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: { risk_security_triage: { score: 2.5 } },
        }),
      };
      const failRes = await evaluateRiskSecurityTriage("Context about auth tokens", mockFailClient);
      expect(failRes.score).toBe(2.5);
      expect(failRes.acceptable).toBe(false);
    });
  });

  describe("Scorecard Generator & Escalation", () => {
    test("generates formatted scorecard matching review-cycle.md template", () => {
      const scorecard = generateVerificationScorecard({
        meetsCriteriaNoul: 0.95,
        driftChoice: "no_drift",
        scopeChoice: "HOLD",
        expertConfidence: 0.92,
      });

      expect(scorecard).toContain("TypeSafe System One Verification Scorecard");
      expect(scorecard).toContain("Meets Plan Deliverables: P = 0.95 (Threshold >= 0.80)");
      expect(scorecard).toContain("Architectural Drift:     None (Strict adherence)");
      expect(scorecard).toContain("Scope Mode:              HOLD (All requirements covered)");
      expect(scorecard).toContain("Expert Evaluator:        Approved (Confidence 0.92)");
    });

    test("bounded revision loop escalates to user on 3rd failed attempt", async () => {
      const mockClient: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            meets_criteria: { noul: 0.3 },
            architectural_drift: { choice: "no_drift" },
            scope_mode: { choice: "HOLD" },
          },
        }),
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Attempt 3 Phase",
        planRequirements: ["Req 1"],
        diffSummary: "changes",
        unifiedDiff: "+ bad code",
        testSummary: "FAIL",
        attemptCount: 3,
      };

      const res = await runPhaseMacroCheck(ctx, mockClient);
      expect(res.approved).toBe(false);
      expect(res.escalateToUser).toBe(true);
      expect(res.reasons.some((r) => r.includes("3") || r.includes("revision") || r.includes("escalat"))).toBe(true);
    });

    test("fail-closed escrow escalates to user on network/offline errors", async () => {
      const offlineClient: ExpertJudgeClient = {
        evaluate: async () => ({
          error: "Connection refused: api.typesafe.ai offline (503)",
        }),
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Network Drop Phase",
        planRequirements: ["Req 1"],
        diffSummary: "changes",
        unifiedDiff: "+ code",
        testSummary: "PASS",
      };

      const res = await runPhaseMacroCheck(ctx, offlineClient);
      expect(res.approved).toBe(false);
      expect(res.escalateToUser).toBe(true);
      expect(res.error).toContain("api.typesafe.ai offline");
    });
  });
});
