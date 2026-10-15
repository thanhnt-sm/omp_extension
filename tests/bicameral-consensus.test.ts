import { describe, expect, test } from "bun:test";
import {
  evaluateAdvisorIntent,
  arbitrateConsensus,
  formatConsensusEscalation,
  formatCkAdvisorReport,
  evaluateBicameralDoneConsensus,
  runBicameralMacroCheck,
  runBicameralDecisionCheck,
  type AdvisorContext,
  type AdvisorIntentResult,
  type JevResult,
  type BicameralConsensusDecision,
} from "../src/bicameral-consensus";
import { collectConversationContext } from "../typesafe-planner";

describe("Phase 2: Bicameral Consensus Engine & Advisor Intent Evaluator", () => {
  describe("Lobe 1: evaluateAdvisorIntent", () => {
    test("detects explicit user cancellation for drop operation", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Fix MSBuild error in target project",
        userRequest: "The build succeeded. Please drop the error fix and rerun tasks.",
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("ALLOW");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.userIntentDetected).toBe(true);
      expect(result.reason.toLowerCase()).toContain("explicit");
    });

    test("does not authorize dropping an unrelated task from a scoped cancellation", () => {
      const result = evaluateAdvisorIntent({
        operation: "drop",
        task: "Implement OAuth2 login flow",
        userRequest: "Please drop task A because it is superseded.",
      });

      expect(result.verdict).toBe("UNCERTAIN");
    });

    test("does not let cancellation of task A authorize dropping task B", () => {
      const result = evaluateAdvisorIntent({
        operation: "drop",
        task: "Implement OAuth2 login flow",
        userRequest: "Drop the crash investigation. Implement OAuth2 login flow.",
      });

      expect(result.verdict).toBe("DISALLOW");
    });

    test("detects clean build / test success obsolescence", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Investigate crash dump",
        agentWorkLog: "The project extensions built successfully without any MSBuild errors. Clean build confirmed.",
        hasCleanBuildEvidence: true,
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("ALLOW");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.reason.toLowerCase()).toContain("clean build");
    });

    test("does not let clean-build inference override an active user task request", () => {
      const result = evaluateAdvisorIntent({
        operation: "drop",
        task: "Implement OAuth2 login flow",
        userRequest: "Please implement OAuth2 login flow and add security unit tests.",
        agentWorkLog: "Clean build succeeded.",
        hasCleanBuildEvidence: true,
      });

      expect(result.verdict).toBe("DISALLOW");
      expect(result.reason.toLowerCase()).toContain("requested");
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

    test("allows cognitive and brainstorming tasks on done operation without code diff", () => {
      const ctx: AdvisorContext = {
        operation: "done",
        task: "Clarify requirements and brainstorm 3 architectural approaches",
        userRequest: "Help me design the new auth flow.",
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

  describe("Advisor & ck:advisor Decision Answering (runBicameralDecisionCheck & evaluateAdvisorIntent)", () => {
    test("evaluateAdvisorIntent(operation: 'decision') ranks options and returns concrete recommendation", () => {
      const res = evaluateAdvisorIntent({
        operation: "decision",
        task: "Select database engine",
        question: "Which database should we use for local state storage?",
        options: [
          { label: "Postgres", description: "External relational cluster" },
          { label: "SQLite", description: "Embedded local file database aligned with standard convention", recommended: true },
        ],
        userRequest: "Use a lightweight local SQLite database",
      });

      expect(res.verdict).toBe("ALLOW");
      expect(res.ckVerdict).toBe("proceed");
      expect(res.recommendedOption).toBe("SQLite");
      expect(res.recommendedIndex).toBe(1);
      expect(res.recommendation).toContain("SQLite");
      expect(res.rankedOptions?.length).toBe(2);
      expect(res.rankedOptions?.[0].option).toBe("SQLite");
    });

    test("evaluateAdvisorIntent blocks options that violate workspace safety boundaries", () => {
      const res = evaluateAdvisorIntent({
        operation: "decision",
        task: "Modify global extension",
        question: "Should we edit .omp/agent/extensions/typesafe-planner.ts directly?",
        options: [
          { label: "Edit .omp/agent/extensions/typesafe-planner.ts directly" },
        ],
      });

      expect(res.verdict).toBe("DISALLOW");
      expect(res.ckVerdict).toBe("block");
      expect(res.findings?.some((f) => f.severity === "high" || f.severity === "critical")).toBe(true);
    });

    test("runBicameralDecisionCheck returns full 6-section ck:advisor contract and JEV consensus", async () => {
      const mockClient = {
        evaluate: async () => ({
          answers: {
            risk_posture: { score: 0.5, confidence: 0.95 },
            decision_clarity: { noul: 0.92, confidence: 0.90 },
            recommended_option: { choice: "Fix root cause in bicameral-consensus.ts", confidence: 0.94 },
          },
        }),
      };

      const decision = await runBicameralDecisionCheck(
        {
          decision: "approach",
          question: "How should we resolve the missing advisor decision output?",
          options: [
            { label: "Suppress warnings", description: "Ignore uncertain state" },
            { label: "Fix root cause in bicameral-consensus.ts", description: "Implement option ranking and ck:advisor contract", recommended: true },
          ],
          userRequest: "tim xem rootcause o dau, sua dung rootcause",
          agentWorkLog: "Traced evaluateAdvisorIntent and collectConversationContext in typesafe-planner.ts",
        },
        mockClient
      );

      expect(decision.verdict).toBe("AUTO_APPROVE");
      expect(decision.ckVerdict).toBe("proceed");
      expect(decision.recommendedOption).toBe("Fix root cause in bicameral-consensus.ts");
      expect(decision.recommendedIndex).toBe(1);
      expect(decision.report).toContain("## Verdict\nproceed");
      expect(decision.report).toContain("## Recommendation");
      expect(decision.report).toContain("## Ranked options");
      expect(decision.report).toContain("## Findings");
      expect(decision.report).toContain("## Confidence");
      expect(decision.report).toContain("## Open questions");
    });

    test("collectConversationContext extracts skill-prompt user request, advisor notes, thinking, toolCall, and toolResult", () => {
      const convo = collectConversationContext({
        sessionManager: {
          getBranch: () => [
            {
              type: "custom_message",
              customType: "skill-prompt",
              content: "[IMPORTANT: User invoked the \"ck:fix\" skill]\nUser: kiem tra fix loi advisor khong tra ra cau tra loi",
            },
            {
              type: "message",
              message: {
                role: "assistant",
                content: [
                  { type: "thinking", thinking: "Root cause traced to collectConversationContext and evaluateAdvisorIntent." },
                  { type: "toolCall", name: "grep", arguments: { i: "Search for advisor in src" } },
                ],
              },
            },
            {
              type: "message",
              message: {
                role: "toolResult",
                toolName: "bash",
                isError: false,
                content: [{ type: "text", text: "280 pass, 0 fail" }],
              },
            },
            {
              type: "custom_message",
              customType: "advisor",
              content: "<advisory severity=\"nit\">Proceed with root cause fix.</advisory>",
            },
          ],
        },
      });

      expect(convo.userRequest).toContain("kiem tra fix loi advisor khong tra ra cau tra loi");
      expect(convo.agentWorkLog).toContain("Root cause traced");
      expect(convo.agentWorkLog).toContain("[toolCall: grep (Search for advisor in src)]");
      expect(convo.agentWorkLog).toContain("[toolResult:bash]: 280 pass, 0 fail");
      expect(convo.agentWorkLog).toContain("[Advisor]: <advisory");
    });

    test("formatConsensusEscalation preserves full reason strings beyond 35 characters", () => {
      const longAdvisorReason = "User explicitly indicated MSBuild succeeded across all 12 projects without any linker errors";
      const longJevReason = "Deliverable verification rejected (code_change): JEV verdict is REJECT (score P=0.13).";
      const decision: BicameralConsensusDecision = {
        verdict: "HUMAN_ESCALATION",
        advisor: {
          verdict: "ALLOW",
          confidence: 0.91,
          reason: longAdvisorReason,
        },
        jev: {
          verdict: "REJECT",
          confidence: 0.85,
          reasons: [longJevReason],
        },
        reasons: ["Lobe conflict"],
      };

      const formatted = formatConsensusEscalation(decision);
      expect(formatted).toContain(longAdvisorReason);
      expect(formatted).toContain(longJevReason);
    });

    test("runBicameralMacroCheck returns AUTO_REJECT (not HUMAN_ESCALATION) when JEV returns REJECT without passing test proof", async () => {
      const mockClient = {
        evaluate: async () => ({
          answers: {
            deliverables_verdict: { choice: "REJECT" as const, confidence: 0.92 },
            meets_criteria: { noul: 0.13 },
            architectural_drift: { choice: "no_drift" as const },
            scope_mode: { choice: "HOLD" as const },
          },
        }),
      };

      const res = await runBicameralMacroCheck(
        {
          todoTask: "Implement feature X",
          phaseTitle: "Phase 1",
          planRequirements: ["Implement feature X"],
          userRequest: "Implement feature X",
          agentWorkLog: "Implemented feature X and updated handler.",
          diffSummary: "1 file changed",
          unifiedDiff: "+ // stub",
          testSummary: "No testCommand provided for this task; test evidence not collected.",
        },
        mockClient
      );

      expect(res.verdict).toBe("AUTO_REJECT");
      expect(res.advisor.verdict).toBe("DISALLOW");
      expect(res.jev.verdict).toBe("REJECT");
    });

    test("runBicameralDecisionCheck adopts JEV recommended_option even when Lobe 1 heuristic scored another option > 0.75", async () => {
      const mockClient = {
        evaluate: async () => ({
          answers: {
            risk_posture: { score: 0.5, confidence: 0.95 },
            decision_clarity: { noul: 0.94, confidence: 0.92 },
            recommended_option: { choice: "Option B: Event-driven queue", confidence: 0.96 },
          },
        }),
      };

      // Option A is marked recommended: true and matches userRequest words so Lobe 1 scores it > 0.75
      const decision = await runBicameralDecisionCheck(
        {
          decision: "approach",
          question: "Which architecture should we select?",
          options: [
            {
              label: "Option A: Synchronous polling",
              description: "Standard safe incremental polling aligned with request",
              recommended: true,
            },
            {
              label: "Option B: Event-driven queue",
              description: "Decoupled async worker queue",
            },
          ],
          userRequest: "Select a standard safe incremental polling architecture",
        },
        mockClient
      );

      expect(decision.verdict).toBe("AUTO_APPROVE");
      expect(decision.ckVerdict).toBe("proceed");
      expect(decision.recommendedOption).toBe("Option B: Event-driven queue");
      expect(decision.recommendedIndex).toBe(1);
      expect(decision.rankedOptions[0]?.option).toBe("Option B: Event-driven queue");
      expect(decision.rankedOptions[0]?.score).toBeGreaterThanOrEqual(0.96);
    });

    test("evaluateAdvisorIntent(operation: 'done') returns first-class DISALLOW on explicit test failures and varies confidence continuously (not fixed 0.90)", () => {
      const failDone = evaluateAdvisorIntent({
        operation: "done",
        task: "Implement rate limiter",
        userRequest: "Add rate limiter with unit tests",
        agentWorkLog: "Updated src/rate-limiter.ts and ran test suite.",
        testSummary: "$ bun test\nexit 1\n2 pass, 3 fail\nAssertionError: expected 429",
      });
      expect(failDone.verdict).toBe("DISALLOW");
      expect(failDone.ckVerdict).toBe("block");

      const minimalDone = evaluateAdvisorIntent({
        operation: "done",
        task: "Update README badge",
        diffSummary: "M README.md",
      });
      const richDone = evaluateAdvisorIntent({
        operation: "done",
        task: "Implement OAuth2 token refresh and PKCE validation",
        userRequest: "Implement OAuth2 token refresh and PKCE validation with full unit tests",
        agentWorkLog: "Implemented OAuth2 token refresh and PKCE validation in src/oauth.ts. Ran 24 tests, 24 pass, 0 fail.",
        diffSummary: "M src/oauth.ts\nM tests/oauth.test.ts",
        testSummary: "exit 0\n24 pass, 0 fail",
      });
      expect(minimalDone.verdict).toBe("ALLOW");
      expect(richDone.verdict).toBe("ALLOW");
      expect(richDone.confidence).toBeGreaterThan(minimalDone.confidence);
      expect(minimalDone.confidence).not.toBe(0.90);
    });

    test("runBicameralMacroCheck routes drift or scope reduction with APPROVE deliverables to RECONCILE_PLAN instead of HUMAN_ESCALATION on attempt 1", async () => {
      const mockClient = {
        evaluate: async () => ({
          answers: {
            deliverables_verdict: { choice: "APPROVE" as const, confidence: 0.91 },
            meets_criteria: { noul: 0.88 },
            architectural_drift: { choice: "scope_creep" as const, confidence: 0.84 },
            scope_mode: { choice: "HOLD" as const, confidence: 0.90 },
          },
        }),
      };

      const res = await runBicameralMacroCheck(
        {
          todoTask: "Update parser",
          planRequirements: ["Update parser"],
          diffSummary: "M src/parser.ts\nM src/unrelated.ts",
          unifiedDiff: "+ parser change",
          testSummary: "PASS",
          attemptCount: 0,
        },
        mockClient
      );

      expect(res.macroResult.approved).toBe(false);
      expect(res.verdict).toBe("RECONCILE_PLAN");
      expect(res.jev.verdict).toBe("NEXT_ACTION_REQUIRED");
    });
  });
});
