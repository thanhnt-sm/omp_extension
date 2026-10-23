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
  type ConsensusReasoningInput,
} from "../src/bicameral-consensus";
import { collectConversationContext } from "../typesafe-planner";
import { canonicalDigest } from "../src/task-contract-source";
import type { AdvisorAssessment, AdvisorReceipt } from "../src/advisor-protocol";

/** Synthetic provenance exercises validation only; it is not live native/UI evidence. */
function reasoningFixture(verdict: AdvisorAssessment["verdict"] = "proceed"): ConsensusReasoningInput {
  const digest = "a".repeat(64);
  const binding: ConsensusReasoningInput["binding"] = {
    purpose: "task_review", contract: { contractId: "contract", revisionId: "revision", incarnationId: "incarnation" },
    logicalOperationId: "done:1", target: { phase: "Phase", phaseOrdinal: 0, content: "Task", ordinal: 0 },
    provenance: { sessionId: "session", branchId: "branch", requestEntryId: "entry", dispatchId: "dispatch", evidenceDigest: digest, policyDigest: digest, questionDigest: digest },
    authorizedScope: { paths: ["src/example.ts"], operations: ["read"] },
  };
  const snapshot = { contractDigest: digest, evidenceDigest: digest, treeDigest: digest, testDigest: digest, policyDigest: digest, parentDigest: digest, childDigest: digest, integrationDigest: digest };
  const assessment: AdvisorAssessment = {
    verdict, recommendation: "Independent exact-task diagnosis", confidence: 0.91,
    rankedOptions: [{ option: "Preserve scope", rationale: "Evidence-bound option", rank: 1 }],
    findings: [], openQuestions: [],
    criterionCoverage: [{ criterionId: "criterion", status: verdict === "block" ? "contradicted" : "covered", evidenceRefs: ["evidence:1"] }],
    parentIntegration: { status: "not_applicable", criterionIds: [], evidenceRefs: [] },
  };
  const body: Omit<AdvisorReceipt, "receiptId"> = {
    schemaVersion: 1, requestId: "request", binding, bindingDigest: canonicalDigest(binding), snapshot, parentRequirementIds: [],
    assessment, assessmentDigest: canonicalDigest(assessment), authority: "task_bound",
    provenance: { parentToolCallId: "parent-call", itemIndex: 0, childId: "child", sessionEpoch: "epoch", terminalDigest: digest },
  };
  return { receipt: { ...body, receiptId: `advisor-receipt:${canonicalDigest(body)}` }, binding, snapshot, criterionIds: ["criterion"] };
}

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

    test("clean build alone does not establish task obsolescence", () => {
      const ctx: AdvisorContext = {
        operation: "drop",
        task: "Investigate crash dump",
        agentWorkLog: "The project extensions built successfully without any MSBuild errors. Clean build confirmed.",
        hasCleanBuildEvidence: true,
      };

      const result = evaluateAdvisorIntent(ctx);
      expect(result.verdict).toBe("UNCERTAIN");
      expect(result.reason).toContain("task-scoped");
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
        probability: 0.92,
        reasons: ["No active code dependencies rely on dropped task"],
      };

      const decision = arbitrateConsensus(advisor, jev, reasoningFixture());
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
        probability: 0.12,
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
        probability: 0.15,
        reasons: ["Diff contains empty scaffolds without implementation"],
      };

      const decision = arbitrateConsensus(advisor, jev, reasoningFixture());
      expect(decision.verdict).toBe("HUMAN_ESCALATION");
      expect(decision.escalationMessage).toBeDefined();
      expect(decision.advisor.reason).toContain("clean build");
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
        probability: 0.90,
        reasons: ["Passing tests and clean diff"],
      };

      const decision = arbitrateConsensus(advisor, jev, reasoningFixture("block"));
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
        probability: 0.48,
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
        probability: 0.95,
        reasons: ["Clean test pass"],
      };

      const decision = arbitrateConsensus(advisor, jev);
      expect(decision.disposition.status).toBe("EVIDENCE_REQUIRED");
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
        probability: 0.70,
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
        disposition: { status: "HUMAN_REQUIRED", reasons: ["Exact-target conflict"] },
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
      expect(formatted).toContain("Local intent signal (not real Advisor): ALLOW");
      expect(formatted).toContain("Lobe 2 (TypeSafe JEV Judge): REJECT");
      expect(formatted).toContain("Sovereign human confirmation");
    });
  });

  describe("evaluateBicameralDoneConsensus", () => {
    test("raw APPROVE cannot authorize completion without a real bound Advisor receipt", async () => {
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

      expect(decision.disposition.status).toBe("EVIDENCE_REQUIRED");
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

      expect(decision.disposition.status).toBe("EVIDENCE_REQUIRED");
      expect(decision.ckVerdict).toBe("revise");
      expect(decision.recommendedOption).toBe("Fix root cause in bicameral-consensus.ts");
      expect(decision.recommendedIndex).toBe(1);
      expect(decision.report).toContain("## Verdict\nrevise");
      expect(decision.report).toContain("## Recommendation");
      expect(decision.report).toContain("## Ranked options");
      expect(decision.report).toContain("## Findings");
      expect(decision.report).toContain("## Confidence");
      expect(decision.report).toContain("## Open questions");
    });

    test("collectConversationContext exports public user, assistant, advisor and tool evidence without private thinking", () => {
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
                  { type: "thinking", thinking: "Synthetic private diagnosis must not be exported." },
                  { type: "text", text: "Public diagnosis: the advisor response was missing." },
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
      expect(convo.agentWorkLog).toContain("Public diagnosis: the advisor response was missing.");
      expect(convo.agentWorkLog).not.toContain("Synthetic private diagnosis");
      expect(convo.agentWorkLog).toContain("[toolCall: grep (Search for advisor in src)]");
      expect(convo.agentWorkLog).toContain("[toolResult:bash]: 280 pass, 0 fail");
      expect(convo.agentWorkLog).toContain("[Advisor]: <advisory");
    });

    test("formatConsensusEscalation preserves full reason strings beyond 35 characters", () => {
      const longAdvisorReason = "User explicitly indicated MSBuild succeeded across all 12 projects without any linker errors";
      const longJevReason = "Deliverable verification rejected (code_change): JEV verdict is REJECT (score P=0.13).";
      const decision: BicameralConsensusDecision = {
        verdict: "HUMAN_ESCALATION",
        disposition: { status: "HUMAN_REQUIRED", reasons: ["Lobe conflict"] },
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
      expect(res.advisor.verdict).toBe("ALLOW");
      expect(res.jev.verdict).toBe("REJECT");
    });

    test("standalone consultation preserves independent heuristic ranking and real JEV recommendation", async () => {
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

      expect(decision.disposition.status).toBe("EVIDENCE_REQUIRED");
      expect(decision.ckVerdict).toBe("revise");
      expect(decision.recommendedOption).toBe("Option A: Synchronous polling");
      expect(decision.recommendedIndex).toBe(0);
      expect(decision.rankedOptions[0]?.option).toBe("Option A: Synchronous polling");
      expect(decision.jev.reasons.join(" ")).toContain("Option B: Event-driven queue");
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

    test("macro drift veto preserves raw APPROVE and rejects the actual boundary criterion", async () => {
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
      expect(res.disposition.status).toBe("REJECTED");
      expect(res.jev.verdict).toBe("APPROVE");
    });
  });
});

describe("Authority composition integrity regressions", () => {
  const intent: AdvisorIntentResult = { verdict: "ALLOW", confidence: 0.99, reason: "Local intent signal only" };
  const approved: JevResult = { verdict: "APPROVE", probability: 0.94, confidence: 0.6, reasons: ["Task evidence supports criteria"] };

  test("missing probability cannot be manufactured from categorical confidence", () => {
    const decision = arbitrateConsensus(intent, { verdict: "APPROVE", confidence: 1, reasons: [] }, reasoningFixture());
    expect(decision.disposition.status).toBe("UNAVAILABLE");
    expect(decision.jev.probability).toBeUndefined();
  });
  test.each([NaN, Infinity, -1, 1.1, "0.9", null])("rejects invalid actual probability %s", probability => {
    const decision = arbitrateConsensus(intent, { ...approved, probability: probability as number }, reasoningFixture());
    expect(decision.disposition.status).toBe("UNAVAILABLE");
  });
  test("real bound agreement stages only and preserves independent raw confidence/probability", () => {
    const decision = arbitrateConsensus(intent, approved, reasoningFixture());
    expect(decision.disposition.status).toBe("APPROVED_PENDING_COMMIT");
    expect(decision.advisor.confidence).toBe(0.99);
    expect(decision.jev.confidence).toBe(0.6);
    expect(decision.jev.probability).toBe(0.94);
    expect(decision.advisor).not.toBe(intent);
    expect(decision.jev).not.toBe(approved);
    expect(Object.isFrozen(decision.jev.reasons)).toBe(true);
    expect(Object.isFrozen(decision.reasoning?.assessment.criterionCoverage)).toBe(true);
    expect(approved.verdict).toBe("APPROVE");
  });
  test("heuristic signals have no native authority and do not override verified task-scoped obsolescence", () => {
    const signal = evaluateAdvisorIntent({ operation: "drop", task: "Implement OAuth login", userRequest: "Implement OAuth login" });
    expect(signal.authority).toBe("none");
    expect(signal.source).toBe("heuristic");
    expect(signal.verdict).toBe("DISALLOW");
    expect(arbitrateConsensus(signal, approved).disposition.status).toBe("EVIDENCE_REQUIRED");
    expect(arbitrateConsensus(signal, approved, reasoningFixture()).disposition.status).toBe("APPROVED_PENDING_COMMIT");
  });
  test.each(["revise", "block", "human_required", "unavailable"] as const)("real Advisor %s never approves raw JEV approval", verdict => {
    const decision = arbitrateConsensus(intent, approved, reasoningFixture(verdict));
    expect(decision.disposition.status).not.toBe("APPROVED_PENDING_COMMIT");
    expect(decision.jev.verdict).toBe("APPROVE");
    expect(decision.reasoning?.assessment.verdict).toBe(verdict);
  });
  test("stale evidence or consultation receipt cannot supply native authority", () => {
    const stale = reasoningFixture();
    stale.snapshot = { ...stale.snapshot, evidenceDigest: "b".repeat(64) };
    expect(arbitrateConsensus(intent, approved, stale).disposition.status).toBe("EVIDENCE_REQUIRED");
    const consultation = reasoningFixture();
    consultation.binding = {
      purpose: "consultation",
      request: { kind: "user_request", sessionId: "session", entryId: "request", digest: "a".repeat(64) },
      provenance: consultation.binding.provenance, authorizedScope: consultation.binding.authorizedScope,
    };
    const { receiptId: previousReceiptId, ...originalBody } = consultation.receipt;
    expect(previousReceiptId).toContain("advisor-receipt:");
    const body: Omit<AdvisorReceipt, "receiptId"> = {
      ...originalBody, binding: consultation.binding, bindingDigest: canonicalDigest(consultation.binding), authority: "none",
    };
    consultation.receipt = { ...body, receiptId: `advisor-receipt:${canonicalDigest(body)}` };
    const decision = arbitrateConsensus(intent, approved, consultation);
    expect(decision.reasoning?.authority).toBe("none");
    expect(decision.disposition.status).toBe("EVIDENCE_REQUIRED");
  });
  test.each(["Do not drop the OAuth login task", "Don't skip OAuth login", "Never cancel OAuth login", "OAuth login is not obsolete"])("negated cancellation is not permission: %s", userRequest => {
    expect(evaluateAdvisorIntent({ operation: "drop", task: "OAuth login", userRequest }).verdict).not.toBe("ALLOW");
  });
  test("outage never synthesizes agreement from local decision heuristics", async () => {
    const decision = await runBicameralDecisionCheck({ question: "Which option?", options: ["Safe option", "Other option"] }, { evaluate: async () => { throw new Error("private service failure"); } });
    expect(decision.disposition.status).toBe("UNAVAILABLE");
    expect(decision.jev.verdict).toBe("UNAVAILABLE");
    expect(decision.jev.probability).toBeUndefined();
    expect(decision.report).toContain("standalone consultation only");
  });
});
