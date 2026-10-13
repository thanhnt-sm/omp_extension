import { describe, expect, test } from "bun:test";
import {
  runTaskMicroCheck,
  runPhaseMacroCheck,
  evaluateScopeArbiter,
  evaluateDriftGuard,
  evaluateRiskSecurityTriage,
  generateVerificationScorecard,
  runDropJustificationCheck,
  DROP_REJECT_FLOOR,
  resolveAutoApprovalThreshold,
  type ExpertJudgeClient,
  type MicroCheckEvidence,
  type MacroCheckContext,
  type JevVerdict,
  type DropVerdict,
  type DeliverablesVerdict,
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
    test.each([NaN, Infinity, -Infinity, -0.01, 1.01, undefined, null, "0.95"])("fails closed for invalid macro probability %s", async (score) => {
      const result = await runPhaseMacroCheck({ phaseTitle: "Verify", planRequirements: [], diffSummary: "", unifiedDiff: "", testSummary: "PASS" }, {
        evaluate: async () => ({ answers: {
          meets_criteria: { noul: score as number },
          architectural_drift: { choice: "no_drift" },
          scope_mode: { choice: "HOLD" },
        } }),
      });
      expect(result.approved).toBe(false);
      expect(result.error).toBe("unavailable");
      expect(result.escalateToUser).toBe(true);
      expect(result.meetsCriteriaNoul).toBeUndefined();
    });

    test("returns unavailable rather than throwing on judge transport failure", async () => {
      const result = await runPhaseMacroCheck({ phaseTitle: "Verify", planRequirements: [], diffSummary: "", unifiedDiff: "", testSummary: "PASS" }, {
        evaluate: async () => { throw new Error("private transport detail"); },
      });
      expect(result.approved).toBe(false);
      expect(result.error).toBe("unavailable");
      expect(result.escalateToUser).toBe(true);
      expect(result.reasons.join(" ")).not.toContain("private transport detail");
    });
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

    test("branches question rubric for analysis_research task type", async () => {
      let evaluatedState = "";
      let evaluatedQuestions: Record<string, unknown> = {};

      const mockClient: ExpertJudgeClient = {
        evaluate: async ({ state, questions }) => {
          evaluatedState = state;
          evaluatedQuestions = questions;
          return {
            answers: {
              meets_criteria: { noul: 0.90 },
              architectural_drift: { choice: "no_drift" },
              scope_mode: { choice: "HOLD" },
            },
          };
        },
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Research Phase",
        planRequirements: ["Evaluate trade-offs", "Write report"],
        diffSummary: "No unstaged changes observed",
        unifiedDiff: "No diff (unobserved)",
        testSummary: "No test output (unobserved)",
        taskType: "analysis_research",
        deliverableArtifacts: "Report content discussing architecture trade-offs",
      };

      const res = await runPhaseMacroCheck(ctx, mockClient);
      expect(res.approved).toBe(true);
      expect(evaluatedState).toContain("deliverable_artifacts");
      expect(JSON.stringify(evaluatedQuestions)).toContain("deliverable_artifacts");
      expect(JSON.stringify(evaluatedQuestions)).not.toContain("Does `unified_diff` satisfy");
    });

    test("anti-spoofing overrides taskType to code_change if code files exist in diff", async () => {
      let evaluatedQuestions: Record<string, unknown> = {};

      const mockClient: ExpertJudgeClient = {
        evaluate: async ({ questions }) => {
          evaluatedQuestions = questions;
          return {
            answers: {
              meets_criteria: { noul: 0.90 },
              architectural_drift: { choice: "no_drift" },
              scope_mode: { choice: "HOLD" },
            },
          };
        },
      };

      const ctx: MacroCheckContext = {
        phaseTitle: "Spoofed Research Phase",
        planRequirements: ["Do research"],
        diffSummary: "M src/exploit.ts",
        unifiedDiff: "+ const malicious = true;",
        testSummary: "1 passed",
        taskType: "analysis_research",
        deliverableArtifacts: "Fake report",
      };

      await runPhaseMacroCheck(ctx, mockClient);
      // Must be forced back to code_change rubric demanding unified_diff!
      expect(JSON.stringify(evaluatedQuestions)).toContain("unified_diff");
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
      expect(res.error).toBe("unavailable");
    });
  });

  describe("Cadence 3: runDropJustificationCheck & Boundary Threshold Contract", () => {
    const makeMockClient = (noul?: number, error?: string): ExpertJudgeClient => ({
      evaluate: async () => {
        if (error) return { error };
        if (noul === undefined) return { answers: {} };
        return {
          answers: {
            drop_justified: { noul, confidence: 0.95 },
          },
        };
      },
    });

    const dummyContext = {
      tasks: ["T1"],
      reason: "Obsolete task",
      remainingTasks: ["T2"],
    };

    test("score 0.29 (< 0.30) returns reject", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.29));
      expect(res.decision).toBe("reject");
      expect(res.dropJustifiedNoul).toBe(0.29);
      expect(res.reasons.some((r) => r.includes("< reject floor"))).toBe(true);
    });

    test("score 0.30 (== DROP_REJECT_FLOOR) returns undecided gray zone", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.30));
      expect(res.decision).toBe("undecided");
      expect(res.dropJustifiedNoul).toBe(0.30);
      expect(res.reasons.some((r) => r.includes("undecided gray zone"))).toBe(true);
    });

    test("score 0.35 in [0.30, 0.80) returns undecided gray zone", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.35));
      expect(res.decision).toBe("undecided");
      expect(res.dropJustifiedNoul).toBe(0.35);
      expect(res.reasons.some((r) => r.includes("undecided gray zone"))).toBe(true);
    });

    test("score 0.79 in [0.30, 0.80) returns undecided gray zone", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.79));
      expect(res.decision).toBe("undecided");
      expect(res.dropJustifiedNoul).toBe(0.79);
      expect(res.reasons.some((r) => r.includes("undecided gray zone"))).toBe(true);
    });

    test("score 0.80 (>= threshold 0.80) returns approve", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.80));
      expect(res.decision).toBe("approve");
      expect(res.dropJustifiedNoul).toBe(0.80);
      expect(res.reasons.some((r) => r.includes(">= threshold"))).toBe(true);
    });

    test("score 0.95 (>= threshold 0.80) returns approve", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.95));
      expect(res.decision).toBe("approve");
      expect(res.dropJustifiedNoul).toBe(0.95);
    });

    test("evaluation error returns unavailable", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(undefined, "HTTP 500 error"));
      expect(res.decision).toBe("unavailable");
      expect(res.error).toBe("HTTP 500 error");
      expect(res.reasons.some((r) => r.includes("unavailable"))).toBe(true);
    });

    test("missing drop_justified answer returns unavailable", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient());
      expect(res.decision).toBe("unavailable");
      expect(res.reasons.some((r) => r.includes("missing drop_justified answer"))).toBe(true);
    });
    test("malformed NaN drop_justified noul returns unavailable", async () => {
      const res = await runDropJustificationCheck(dummyContext, makeMockClient(NaN));
      expect(res.decision).toBe("unavailable");
      expect(res.reasons.some((r) => r.includes("invalid or malformed drop_justified noul"))).toBe(true);
    });

    test("malformed out-of-bounds drop_justified noul returns unavailable", async () => {
      const negativeRes = await runDropJustificationCheck(dummyContext, makeMockClient(-0.25));
      expect(negativeRes.decision).toBe("unavailable");
      expect(negativeRes.reasons.some((r) => r.includes("invalid or malformed drop_justified noul"))).toBe(true);

      const overflowRes = await runDropJustificationCheck(dummyContext, makeMockClient(1.25));
      expect(overflowRes.decision).toBe("unavailable");
      expect(overflowRes.reasons.some((r) => r.includes("invalid or malformed drop_justified noul"))).toBe(true);
    });

    test("thrown exception inside evaluate returns unavailable", async () => {
      const throwingClient: ExpertJudgeClient = {
        evaluate: async () => {
          throw new Error("Network timeout");
        },
      };
      const res = await runDropJustificationCheck(dummyContext, throwingClient);
      expect(res.decision).toBe("unavailable");
      expect(res.error).toBe("Network timeout");
      expect(res.reasons.some((r) => r.includes("unavailable"))).toBe(true);
    });

    test("dynamic threshold override via env is respected", async () => {
      const orig = process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD;
      try {
        process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD = "0.90";
        expect(resolveAutoApprovalThreshold()).toBe(0.90);
        // 0.85 would normally approve, but under 0.90 it falls into undecided
        const res = await runDropJustificationCheck(dummyContext, makeMockClient(0.85));
        expect(res.decision).toBe("undecided");
        expect(res.reasons.some((r) => r.includes("0.90"))).toBe(true);
      } finally {
        if (orig !== undefined) process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD = orig;
        else delete process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD;
      }
    });
  });

  describe("Categorical Verdict Contract & Threshold Elimination", () => {
    test("generates formatted scorecard with categorical verdict", () => {
      const scorecard = generateVerificationScorecard({
        deliverablesVerdict: "APPROVE",
        driftChoice: "no_drift",
        scopeChoice: "HOLD",
        expertConfidence: 0.95,
      });
      expect(scorecard).toContain("TypeSafe System One Verification Scorecard");
      expect(scorecard).toContain("Meets Plan Deliverables: VERDICT: APPROVED (JEV Confidence 0.95)");
    });

    test("categorical deliverables verdict APPROVE approves macro check", async () => {
      const client: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            deliverables_verdict: { choice: "APPROVE", confidence: 0.96 },
            architectural_drift: { choice: "no_drift" },
            scope_mode: { choice: "HOLD" },
          },
        }),
      };
      const res = await runPhaseMacroCheck(
        {
          phaseTitle: "Deliverable Phase",
          planRequirements: ["Req 1"],
          diffSummary: "changes",
          unifiedDiff: "+ code",
          testSummary: "pass",
        },
        client
      );
      expect(res.approved).toBe(true);
      expect(res.verdict).toBe("APPROVE");
      expect(res.deliverablesVerdict).toBe("APPROVE");
    });

    test("categorical deliverables verdict REJECT rejects macro check", async () => {
      const client: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            deliverables_verdict: { choice: "REJECT", confidence: 0.91 },
            architectural_drift: { choice: "no_drift" },
            scope_mode: { choice: "HOLD" },
          },
        }),
      };
      const res = await runPhaseMacroCheck(
        {
          phaseTitle: "Rejected Phase",
          planRequirements: ["Req 1"],
          diffSummary: "changes",
          unifiedDiff: "+ code",
          testSummary: "pass",
        },
        client
      );
      expect(res.approved).toBe(false);
      expect(res.verdict).toBe("REJECT");
      expect(res.reasons.some((r) => r.includes("rejected"))).toBe(true);
    });

    test("categorical deliverables verdict NEXT_ACTION_REQUIRED rejects macro check with next actions", async () => {
      const client: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            deliverables_verdict: { choice: "NEXT_ACTION_REQUIRED", confidence: 0.88 },
            architectural_drift: { choice: "no_drift" },
            scope_mode: { choice: "HOLD" },
          },
        }),
      };
      const res = await runPhaseMacroCheck(
        {
          phaseTitle: "Partial Phase",
          planRequirements: ["Req 1"],
          diffSummary: "changes",
          unifiedDiff: "+ code",
          testSummary: "pass",
        },
        client
      );
      expect(res.approved).toBe(false);
      expect(res.verdict).toBe("NEXT_ACTION_REQUIRED");
      expect(res.reasons.some((r) => r.includes("next actions") || r.includes("Next actions"))).toBe(true);
    });

    test("categorical drop verdict APPROVE returns approve", async () => {
      const client: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            drop_verdict: { choice: "APPROVE", confidence: 0.95 },
          },
        }),
      };
      const res = await runDropJustificationCheck(
        { tasks: ["task-1"], remainingTasks: [] },
        client
      );
      expect(res.decision).toBe("approve");
      expect(res.verdict).toBe("APPROVE");
    });

    test("categorical drop verdict REJECT returns reject", async () => {
      const client: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            drop_verdict: { choice: "REJECT", confidence: 0.95 },
          },
        }),
      };
      const res = await runDropJustificationCheck(
        { tasks: ["task-1"], remainingTasks: [] },
        client
      );
      expect(res.decision).toBe("reject");
      expect(res.verdict).toBe("REJECT");
    });

    test("categorical drop verdict ESCALATE returns undecided", async () => {
      const client: ExpertJudgeClient = {
        evaluate: async () => ({
          answers: {
            drop_verdict: { choice: "ESCALATE", confidence: 0.85 },
          },
        }),
      };
      const res = await runDropJustificationCheck(
        { tasks: ["task-1"], remainingTasks: [] },
        client
      );
      expect(res.decision).toBe("undecided");
      expect(res.verdict).toBe("ESCALATE");
    });
  });
});
