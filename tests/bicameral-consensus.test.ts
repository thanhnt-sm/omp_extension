import { describe, expect, test } from "bun:test";
import {
  evaluateAdvisorIntent,
  arbitrateConsensus,
  formatConsensusEscalation,
  evaluateBicameralDoneConsensus,
  type AdvisorContext,
  type AdvisorIntentResult,
  type JevResult,
  type BicameralConsensusDecision,
} from "../src/bicameral-consensus";

describe("Phase 2: Bicameral Consensus Engine & Advisor Intent Evaluator", () => {
  describe("Lobe 1: evaluateAdvisorIntent", () => {
    test("detects explicit user cancellation for drop operation", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Fix MSBuild error in DataGuard",
        userRequest: "The build succeeded. Please drop the error fix and rerun tasks.",
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("ALLOW");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.userIntentDetected).toBe(true);
      expect(result.reason.toLowerCase()).toContain("explicit");
    });

    test("detects clean build / test success obsolescence (DataGuard scenario)", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Investigate crash dump",
        agentWorkLog: "The DataGuard extensions built successfully without any MSBuild errors. Clean build confirmed.",
        hasCleanBuildEvidence: true,
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("ALLOW");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.reason.toLowerCase()).toContain("clean build");
    });

    test("disallows unauthorized drop when user asked for the task and no cancel exists", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Implement OAuth2 login flow",
        userRequest: "Please implement OAuth2 login flow and add security unit tests.",
        reason: "Taking too long to complete",
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("DISALLOW");
      expect(result.confidence).toBeGreaterThanOrEqual(0.80);
      expect(result.reason.toLowerCase()).toContain("requested");
    });

    test("returns UNCERTAIN for ambiguous conversational phrasing", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Optimize query indexing",
        userRequest: "What should we do next about the queries?",
        agentWorkLog: "Maybe we can skip indexing for now.",
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("UNCERTAIN");
      expect(result.reason.toLowerCase()).toContain("uncertain");
    });

    test("allows task completion when work log shows verified deliverables", () => {
      const ctx: AdvisorContext = {
        operation: "done",
        task: "Add unit tests for payment webhook",
        userRequest: "Write tests for webhook payload verification.",
        agentWorkLog: "Added 12 unit tests in tests/webhook.test.ts. All 12 passing.",
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("ALLOW");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe("Consensus Matrix Arbitration (arbitrateConsensus)", () => {
    test("Consensus Approval: ALLOW + APPROVE yields AUTO_APPROVE (zero prompts)", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "ALLOW",
        confidence: 0.95,
        reason: "User explicitly authorized drop",
      };
      const jev: JevResult = {
        verdict: "APPROVE",
        confidence: 0.92,
        reasons: ["No active code dependencies rely on dropped task"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("AUTO_APPROVE");
      expect(decision.escalationMessage).toBeUndefined();
    });

    test("Consensus Rejection: DISALLOW + REJECT yields AUTO_REJECT with remediation", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "DISALLOW",
        confidence: 0.90,
        reason: "User requested task; drop unauthorized",
      };
      const jev: JevResult = {
        verdict: "REJECT",
        confidence: 0.94,
        reasons: ["Critical planned acceptance criteria unfulfilled"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("AUTO_REJECT");
      expect(decision.reasons.some((r) => r.includes("criteria"))).toBe(true);
    });

    test("Conflict Escalation: ALLOW + REJECT yields HUMAN_ESCALATION with both viewpoints", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "ALLOW",
        confidence: 0.90,
        reason: "Agent reported clean build evidence",
      };
      const jev: JevResult = {
        verdict: "REJECT",
        confidence: 0.85,
        reasons: ["Diff contains empty scaffolds without implementation"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("HUMAN_ESCALATION");
      expect(decision.escalationMessage).toBeDefined();
      expect(decision.escalationMessage).toContain("clean build");
      expect(decision.escalationMessage).toContain("scaffolds");
    });

    test("Conflict Escalation: DISALLOW + APPROVE yields HUMAN_ESCALATION", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "DISALLOW",
        confidence: 0.85,
        reason: "User steer requested feature deferral",
      };
      const jev: JevResult = {
        verdict: "APPROVE",
        confidence: 0.90,
        reasons: ["Passing tests and clean diff"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("HUMAN_ESCALATION");
      expect(decision.escalationMessage).toBeDefined();
    });

    test("Adaptive Plan Reconciliation: NEXT_ACTION_REQUIRED yields RECONCILE_PLAN", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "ALLOW",
        confidence: 0.90,
        reason: "Task implementation attempted",
      };
      const jev: JevResult = {
        verdict: "NEXT_ACTION_REQUIRED",
        confidence: 0.88,
        reasons: ["Missing integration test coverage for error paths"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("RECONCILE_PLAN");
      expect(decision.reconciliationDirectives).toBeDefined();
      expect(decision.reconciliationDirectives?.length).toBeGreaterThan(0);
    });

    test("Uncertain Escalation: UNCERTAIN + APPROVE yields HUMAN_ESCALATION", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "UNCERTAIN",
        confidence: 0.50,
        reason: "User intent could not be verified",
      };
      const jev: JevResult = {
        verdict: "APPROVE",
        confidence: 0.95,
        reasons: ["Clean test pass"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("HUMAN_ESCALATION");
    });

    test("JEV Escalation: ALLOW + ESCALATE yields HUMAN_ESCALATION", () => {
      const advisor: AdvisorIntentResult = {
        verdict: "ALLOW",
        confidence: 0.90,
        reason: "User asked to drop",
      };
      const jev: JevResult = {
        verdict: "ESCALATE",
        confidence: 0.70,
        reasons: ["Conflicting test and diff signals"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.verdict).toBe("HUMAN_ESCALATION");
    });
  });

  describe("formatConsensusEscalation", () => {
    test("formats clear dual-perspective message for UI confirmation", () => {
      const decision: BicameralConsensusDecision = {
        verdict: "HUMAN_ESCALATION",
        advisor: {
          verdict: "ALLOW",
          confidence: 0.90,
          reason: "User indicated MSBuild succeeded without errors",
        },
        jev: {
          verdict: "REJECT",
          confidence: 0.85,
          reasons: ["Code diff dropped 3 planned tasks without direct commit proof"],
        },
        reasons: ["Lobe conflict between user intent and code evidence"],
        escalationMessage: "Conflict detected",
      };

      const formatted = formatConsensusEscalation(decision);
      expect(formatted).toContain("Bicameral Consensus Escalation");
      expect(formatted).toContain("Lobe 1 (Advisor Intent): ALLOW");
      expect(formatted).toContain("Lobe 2 (TypeSafe JEV Judge): REJECT");
      expect(formatted).toContain("Sovereign human confirmation");
    });
  });

  describe("evaluateBicameralDoneConsensus", () => {
    test("yields AUTO_APPROVE when advisor intent (ALLOW) and JEV macro (APPROVE) align", async () => {
      const decision = await evaluateBicameralDoneConsensus({
        todoTask: "Reorganize test and plan files",
        userRequest: "Quy hoạch lại các file plan .md và test",
        agentWorkLog: "Moved files to standard plans/ and tests/ locations. Full test suite passing with 278 pass.",
        evidence: {
          gitStatus: "clean",
          gitDiff: "diff --git",
          testExitCode: 0,
          testOutput: "278 pass",
          criteria: ["Organize files"],
          cleanWorkingTree: true,
          timestamp: new Date().toISOString(),
        },
        macroResult: {
          approved: true,
          verdict: "APPROVE",
          meetsCriteriaNoul: 1.0,
          driftChoice: "no_drift",
          scopeChoice: "HOLD",
          expertConfidence: 0.95,
          reasons: ["All deliverables organized into standard directories and verified by tests."],
        },
      });

      expect(decision.verdict).toBe("AUTO_APPROVE");
      expect(decision.advisor.verdict).toBe("ALLOW");
      expect(decision.jev.verdict).toBe("APPROVE");
    });

    test("yields RECONCILE_PLAN when JEV macro returns NEXT_ACTION_REQUIRED", async () => {
      const decision = await evaluateBicameralDoneConsensus({
        todoTask: "Implement auth middleware",
        userRequest: "Add JWT authentication",
        agentWorkLog: "Implemented handler, tests pending",
        evidence: {
          gitStatus: "M auth.ts",
          gitDiff: "+auth",
          testExitCode: 0,
          testOutput: "ok",
          criteria: ["JWT auth"],
          cleanWorkingTree: false,
          timestamp: new Date().toISOString(),
        },
        macroResult: {
          approved: false,
          verdict: "NEXT_ACTION_REQUIRED",
          meetsCriteriaNoul: 0.5,
          driftChoice: "no_drift",
          scopeChoice: "HOLD",
          expertConfidence: 0.85,
          reasons: ["Missing token expiration verification test"],
        },
      });

      expect(decision.verdict).toBe("RECONCILE_PLAN");
      expect(decision.reasons.some((r) => r.includes("token expiration"))).toBe(true);
    });
  });
});
