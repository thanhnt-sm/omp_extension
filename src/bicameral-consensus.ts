import type {
  DropCheckContext,
  MacroCheckContext,
  MacroCheckResult as PhaseMacroCheckResult,
  ExpertJudgeClient,
  ExpertJudgeQuestion,
} from "./cook-expert-judge";
import {
  runDropJustificationCheck,
  runPhaseMacroCheck,
} from "./cook-expert-judge";

export type AdvisorIntentVerdict = "ALLOW" | "DISALLOW" | "UNCERTAIN";
export type CkAdvisorVerdict = "proceed" | "revise" | "block";
export type AdvisorDecisionKind =
  | "approach"
  | "plan-review"
  | "phase-risk"
  | "stuck"
  | "pre-merge"
  | "general";

export interface AdvisorOptionCandidate {
  label: string;
  description?: string;
  preview?: string;
  recommended?: boolean;
}

export interface RankedAdvisorOption {
  option: string;
  score: number;
  rationale: string;
}

export interface AdvisorFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  claim: string;
  evidence?: string;
}

export interface AdvisorContext {
  operation: "done" | "drop" | "mutate" | "decision" | "ask";
  task: string | string[];
  decisionKind?: AdvisorDecisionKind;
  question?: string;
  options?: Array<string | AdvisorOptionCandidate>;
  recommendedIndex?: number;
  constraints?: string | string[];
  evidencePaths?: string[];
  userRequest?: string;
  agentWorkLog?: string;
  reason?: string;
  conversationHistory?: string;
  hasCleanBuildEvidence?: boolean;
  testSummary?: string;
  diffSummary?: string;
  deliverableArtifacts?: string;
  taskType?: "code_change" | "analysis_research" | "doc_specification";
}

export interface AdvisorIntentResult {
  verdict: AdvisorIntentVerdict;
  ckVerdict?: CkAdvisorVerdict;
  confidence: number;
  reason: string;
  recommendation?: string;
  recommendedOption?: string;
  recommendedIndex?: number;
  rankedOptions?: RankedAdvisorOption[];
  findings?: AdvisorFinding[];
  openQuestions?: string[];
  userIntentDetected?: boolean;
}

export type JevConsensusVerdict =
  | "APPROVE"
  | "REJECT"
  | "NEXT_ACTION_REQUIRED"
  | "ESCALATE";

export interface JevResult {
  verdict: JevConsensusVerdict;
  confidence?: number;
  reasons: string[];
}

export type ConsensusVerdict =
  | "AUTO_APPROVE"
  | "AUTO_REJECT"
  | "HUMAN_ESCALATION"
  | "RECONCILE_PLAN";

export interface BicameralConsensusDecision {
  verdict: ConsensusVerdict;
  advisor: AdvisorIntentResult;
  jev: JevResult;
  reasons: string[];
  escalationMessage?: string;
  reconciliationDirectives?: string[];
}

const CANCELLATION_PATTERNS = [
  /\b(?:cancel|cancelled|cancelling)\b/i,
  /\b(?:drop|dropped|dropping)\b/i,
  /\b(?:skip|skipped|skipping)\b/i,
  /\b(?:remove|removed|removing|delete|deleted)\b/i,
  /\b(?:omit|omitted|ignore|ignored)\b/i,
  /\b(?:deprecate|deprecated|supersede|superseded)\b/i,
  /\b(?:don't need|no longer need|not needed|not required)\b/i,
  /\b(?:bỏ qua|hủy|không cần|xóa)\b/i,
];

const CLEAN_BUILD_PATTERNS = [
  /\bclean build\b/i,
  /\bbuilt successfully\b/i,
  /\bbuild succeeded\b/i,
  /\bzero errors\b/i,
  /\bno errors\b/i,
  /\b0 errors\b/i,
  /\bmsbuild success\b/i,
  /\ball tests pass\b/i,
  /\btests pass\b/i,
  /\b100% pass\b/i,
];

const UNSAFE_DECISION_PATTERNS = [
  /\.omp[\/\\]agent[\/\\]extensions[\/\\]typesafe-planner\.ts/i,
  /~\s*[\/\\]\.claude[\/\\]/i,
  /\b(?:rm\s+-rf\s+\/|drop\s+database|skip\s+all\s+tests|disable\s+verification\s+gate)\b/i,
];

function normalizeOptions(
  options?: Array<string | AdvisorOptionCandidate>,
  recommendedIndex?: number
): AdvisorOptionCandidate[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((item, idx) => {
      if (typeof item === "string") {
        return {
          label: item.trim(),
          recommended: recommendedIndex === idx || /\(recommended\)/i.test(item),
        };
      }
      if (item && typeof item === "object" && typeof item.label === "string") {
        return {
          label: item.label.trim(),
          description: typeof item.description === "string" ? item.description.trim() : undefined,
          preview: typeof item.preview === "string" ? item.preview.trim() : undefined,
          recommended:
            item.recommended === true ||
            recommendedIndex === idx ||
            /\(recommended\)/i.test(item.label),
        };
      }
      return { label: "" };
    })
    .filter((o) => o.label.length > 0);
}

function evaluateAdvisorDecision(ctx: AdvisorContext): AdvisorIntentResult {
  const userReq = (ctx.userRequest || "").trim();
  const workLog = (ctx.agentWorkLog || "").trim();
  const taskText = Array.isArray(ctx.task) ? ctx.task.join(", ") : (ctx.task || "");
  const questionText = (ctx.question || taskText || "").trim();
  const constraintsText = Array.isArray(ctx.constraints)
    ? ctx.constraints.join("\n")
    : (ctx.constraints || "");
  const combinedContext = `${userReq}\n${workLog}\n${ctx.reason || ""}\n${ctx.conversationHistory || ""}\n${constraintsText}`;
  const normalizedOptions = normalizeOptions(ctx.options, ctx.recommendedIndex);
  const findings: AdvisorFinding[] = [];

  if (normalizedOptions.length > 0) {
    const userReqLower = userReq.toLowerCase();
    const workLogLower = `${workLog}\n${ctx.reason || ""}\n${ctx.conversationHistory || ""}`.toLowerCase();
    const scored = normalizedOptions.map((opt, idx) => {
      let score = 0.50;
      const rationales: string[] = [];
      const optFullText = `${opt.label} ${opt.description || ""} ${opt.preview || ""}`;
      const optWords = optFullText
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u1EF9\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);

      if (UNSAFE_DECISION_PATTERNS.some((p) => p.test(optFullText))) {
        score -= 0.40;
        rationales.push("Violates workspace safety or isolation constraints");
        findings.push({
          severity: "high",
          claim: `Option "${opt.label}" touches protected boundaries or unsafe operations`,
        });
      }

      if (opt.recommended) {
        score += 0.25;
        rationales.push("Marked as recommended default");
      }

      if (userReqLower.length > 0 && optWords.some((w) => userReqLower.includes(w))) {
        score += 0.25;
        rationales.push("Directly aligns with user request");
      }

      if (workLogLower.length > 0 && optWords.some((w) => workLogLower.includes(w))) {
        score += 0.15;
        rationales.push("Supported by codebase and work-log evidence");
      }

      if (
        /\b(?:autonomous|auto|standard|safe|test|verify|root\s*cause|bicameral|consensus|keep|preserve|non-blocking|incremental|recommended)\b/i.test(
          optFullText
        )
      ) {
        score += 0.12;
        rationales.push("Follows safe, maintainable engineering practice");
      }

      if (/\b(?:skip\s*test|bypass|force\s*delete|ignore\s*error|hardcode)\b/i.test(optFullText)) {
        score -= 0.25;
        rationales.push("Introduces avoidable verification or maintenance risk");
      }

      const clampedScore = Math.max(0.05, Math.min(0.98, Number(score.toFixed(2))));
      return {
        option: opt.label,
        originalIndex: idx,
        score: clampedScore,
        rationale:
          rationales.length > 0
            ? rationales.join("; ")
            : idx === 0
            ? "Primary conservative candidate option"
            : "Alternative candidate option",
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.originalIndex - b.originalIndex;
    });

    const top = scored[0];
    const second = scored[1];
    const rankedOptions: RankedAdvisorOption[] = scored.map((s) => ({
      option: s.option,
      score: s.score,
      rationale: s.rationale,
    }));

    if (top.score < 0.30) {
      return {
        verdict: "DISALLOW",
        ckVerdict: "block",
        confidence: 0.90,
        reason: `All candidate options violate constraints (${top.rationale})`,
        recommendation: `Reject unsafe options and revise approach to respect workspace constraints.`,
        rankedOptions,
        findings,
        userIntentDetected: userReq.length > 0,
      };
    }

    const hasDifferentiation =
      normalizedOptions.length === 1 ||
      top.score > 0.50 ||
      (second !== undefined && top.score > second.score);

    if (hasDifferentiation) {
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: Math.max(0.75, top.score),
        reason: `Advisor recommends "${top.option}" (${top.rationale})`,
        recommendation: `Select "${top.option}" — ${top.rationale}.`,
        recommendedOption: top.option,
        recommendedIndex: top.originalIndex,
        rankedOptions,
        findings,
        openQuestions: [],
        userIntentDetected: userReq.length > 0,
      };
    }

    return {
      verdict: "ALLOW",
      ckVerdict: "proceed",
      confidence: 0.72,
      reason: `Advisor defaults to conservative first option "${top.option}" (${top.rationale})`,
      recommendation: `Select "${top.option}" (${top.rationale}).`,
      recommendedOption: top.option,
      recommendedIndex: top.originalIndex,
      rankedOptions,
      findings,
      openQuestions: [],
      userIntentDetected: userReq.length > 0,
    };
  }

  // Open-ended decision / consultation without explicit option array
  if (UNSAFE_DECISION_PATTERNS.some((p) => p.test(`${questionText}\n${combinedContext}`))) {
    findings.push({
      severity: "critical",
      claim: "Proposal references protected global extension or unsafe command",
    });
    return {
      verdict: "DISALLOW",
      ckVerdict: "block",
      confidence: 0.92,
      reason: "Proposed action violates workspace safety or isolation invariants",
      recommendation: "Block the unsafe mutation and restrict changes to the local development workspace.",
      findings,
      openQuestions: [],
      userIntentDetected: userReq.length > 0,
    };
  }

  if (questionText.length > 0 || userReq.length > 0 || workLog.length > 0) {
    const kind = ctx.decisionKind || "general";
    let recommendation: string;
    if (kind === "plan-review") {
      recommendation =
        "Proceed with the plan; ensure each phase has concrete file ownership and deterministic test verification.";
    } else if (kind === "phase-risk" || kind === "pre-merge") {
      recommendation =
        "Proceed with execution while enforcing regression test suites and workspace boundary guards.";
    } else if (kind === "stuck") {
      recommendation =
        "Trace the failing invariant from first-hand logs/tests, fix the root cause in-place, and verify before retrying task completion.";
    } else {
      recommendation =
        "Proceed with the conservative, evidence-backed implementation aligned with user intent and project conventions.";
    }

    return {
      verdict: "ALLOW",
      ckVerdict: "proceed",
      confidence: 0.85,
      reason: recommendation,
      recommendation,
      recommendedOption: "proceed",
      findings,
      openQuestions: [],
      userIntentDetected: userReq.length > 0,
    };
  }

  return {
    verdict: "UNCERTAIN",
    ckVerdict: "revise",
    confidence: 0.50,
    reason: "Insufficient context provided for advisor decision; provide question or candidate options",
    recommendation: "Supply explicit decision question, options, or evidence before proceeding.",
    findings,
    openQuestions: ["What are the specific candidate options and constraints for this decision?"],
    userIntentDetected: false,
  };
}

/**
 * Lobe 1: Evaluates user intent, conversation context, agent claims, and decision options.
 */
export function evaluateAdvisorIntent(ctx: AdvisorContext): AdvisorIntentResult {
  const userReq = (ctx.userRequest || "").trim();
  const workLog = (ctx.agentWorkLog || "").trim();
  const taskText = Array.isArray(ctx.task) ? ctx.task.join(", ") : (ctx.task || "");
  const combinedContext = `${userReq}\n${workLog}\n${ctx.reason || ""}\n${ctx.conversationHistory || ""}`;

  if (
    ctx.operation === "decision" ||
    ctx.operation === "ask" ||
    (Array.isArray(ctx.options) && ctx.options.length > 0)
  ) {
    return evaluateAdvisorDecision(ctx);
  }

  if (ctx.operation === "drop") {
    // 1. Explicit user cancellation detected in user request
    const userWantsCancel = CANCELLATION_PATTERNS.some((p) => p.test(userReq));
    if (userWantsCancel) {
      const reason = "User explicitly authorized or requested dropping the task in context";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.95,
        reason,
        recommendation: reason,
        userIntentDetected: true,
      };
    }

    // 2. Clean build or verified test success obsolescence
    const hasBuildEvidence =
      ctx.hasCleanBuildEvidence === true ||
      CLEAN_BUILD_PATTERNS.some((p) => p.test(combinedContext));

    if (hasBuildEvidence) {
      const reason = "Clean build or verified test success confirms task is obsolete or already satisfied";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.90,
        reason,
        recommendation: reason,
        userIntentDetected: false,
      };
    }

    // 3. User explicitly requested this task and no cancellation was expressed
    if (userReq.length > 0) {
      const taskWords = taskText
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u1EF9\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const matchesUserRequest = taskWords.some((w) => userReq.toLowerCase().includes(w));
      if (matchesUserRequest) {
        const reason = "User requested task implementation and no valid cancellation or obsolescence evidence exists";
        return {
          verdict: "DISALLOW",
          ckVerdict: "block",
          confidence: 0.85,
          reason,
          recommendation: reason,
          userIntentDetected: true,
        };
      }
    }

    // 4. Ambiguous intent
    const reason = "Ambiguous / uncertain user intent; task drop requires sovereign human confirmation";
    return {
      verdict: "UNCERTAIN",
      ckVerdict: "revise",
      confidence: 0.50,
      reason,
      recommendation: reason,
      userIntentDetected: false,
    };
  }

  if (ctx.operation === "done") {
    const combinedDoneEvidence = `${workLog}\n${ctx.reason || ""}\n${ctx.testSummary || ""}\n${ctx.diffSummary || ""}\n${ctx.deliverableArtifacts || ""}`;

    if (
      workLog.length > 0 &&
      /pass|implement|added|completed|fixed|moved|organized|refactor|verified|updated|tested|scout|diagnos|analy[sz]|investigat|identif|found|trace|review|plan|document|sync|deploy|check|resolv|root\s*cause|deliver|wrote|creat|built|\[Advisor\]:|hoàn thành|đã sửa|đã kiểm tra|thành công|đã xong|xác minh|báo cáo/i.test(
        workLog
      )
    ) {
      const reason = "Agent work log documents concrete implementation and passing verification";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.90,
        reason,
        recommendation: reason,
        userIntentDetected: userReq.length > 0,
      };
    }

    if (
      ctx.hasCleanBuildEvidence === true ||
      CLEAN_BUILD_PATTERNS.some((p) => p.test(combinedDoneEvidence)) ||
      /\bexit\s+0\b|\b0\s+fail\b/i.test(ctx.testSummary || "")
    ) {
      const reason = "Verified test or build evidence confirms task completion";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.90,
        reason,
        recommendation: reason,
        userIntentDetected: userReq.length > 0,
      };
    }

    if (
      (ctx.diffSummary &&
        ctx.diffSummary !== "No unstaged changes observed" &&
        ctx.diffSummary.trim().length > 0) ||
      (ctx.deliverableArtifacts && ctx.deliverableArtifacts.trim().length > 0)
    ) {
      const reason = "Concrete deliverable artifacts or workspace changes observed for task completion";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.85,
        reason,
        recommendation: reason,
        userIntentDetected: userReq.length > 0,
      };
    }

    const isImplLead =
      /^\s*(?:(?:step|task|phase)\s*\d+\s*[:.-]\s*)?(?:implement\w*|fix\w*|build\w*|add\w*|create\s+src|refactor\w*|patch\w*|deploy\w*)\b/i.test(
        taskText
      );
    const isCognitiveTask =
      /\b(?:scout\w*|diagnos\w*|investigat\w*|research\w*|analy[sz]\w*|explor\w*|find|audit\w*|review\w*|check\w*|trac\w*|inspect\w*|read\w*|clarif\w*|brainstorm\w*|plan|planning|design\w*|synthesi[sz]\w*|consult\w*|evaluat\w*|assess\w*|document\w*|journal\w*|organi[sz]\w*|verif\w*|ask\w*|propos\w*|validat\w*|compar\w*|summariz\w*|kiểm tra|phân tích|tìm|nghiên cứu|lập kế hoạch)\b/i.test(
        taskText
      );
    if (ctx.taskType === "analysis_research" || (!isImplLead && isCognitiveTask)) {
      const reason = "Investigation or analysis task completed within active session context";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.85,
        reason,
        recommendation: reason,
        userIntentDetected: userReq.length > 0,
      };
    }

    const reason = "Agent work log is incomplete or unverified; deferring to JEV code diff analysis";
    return {
      verdict: "UNCERTAIN",
      ckVerdict: "revise",
      confidence: 0.60,
      reason,
      recommendation: reason,
      userIntentDetected: userReq.length > 0,
    };
  }

  if (ctx.operation === "mutate") {
    if (ctx.question || (Array.isArray(ctx.options) && ctx.options.length > 0)) {
      return evaluateAdvisorDecision(ctx);
    }
    if (workLog.length > 0 || userReq.length > 0 || (ctx.reason && ctx.reason.trim().length > 0)) {
      const reason = "Task state mutation aligns with active workflow context";
      return {
        verdict: "ALLOW",
        ckVerdict: "proceed",
        confidence: 0.80,
        reason,
        recommendation: reason,
        userIntentDetected: userReq.length > 0,
      };
    }
  }

  return {
    verdict: "UNCERTAIN",
    ckVerdict: "revise",
    confidence: 0.50,
    reason: "Unrecognized mutation operation; defaulting to uncertain",
  };
}

/**
 * Arbitrates between Lobe 1 (Advisor Intent) and Lobe 2 (TypeSafe JEV Judge).
 */
export function arbitrateConsensus(
  advisor: AdvisorIntentResult,
  jev: JevResult
): BicameralConsensusDecision {
  const reasons: string[] = [];

  // 1. Next Action Required -> Adaptive Plan Reconciliation (never a fatal throw)
  if (jev.verdict === "NEXT_ACTION_REQUIRED") {
    const directives = jev.reasons.length > 0
      ? jev.reasons
      : ["Review missing acceptance criteria and adapt plan deliverables"];
    return {
      verdict: "RECONCILE_PLAN",
      advisor,
      jev,
      reasons: [
        "Lobe 2 (JEV) identified incomplete deliverables or failing criteria requiring plan adaptation.",
        ...jev.reasons,
      ],
      reconciliationDirectives: directives,
    };
  }

  // 2. Both Lobes Agree: Consensus
  if (advisor.verdict === "ALLOW" && jev.verdict === "APPROVE") {
    return {
      verdict: "AUTO_APPROVE",
      advisor,
      jev,
      reasons: [
        "Bicameral consensus achieved: Advisor Intent (ALLOW) and JEV Judge (APPROVE) both agree.",
        advisor.reason,
        ...jev.reasons,
      ],
    };
  }

  if (advisor.verdict === "DISALLOW" && jev.verdict === "REJECT") {
    return {
      verdict: "AUTO_REJECT",
      advisor,
      jev,
      reasons: [
        "Bicameral consensus achieved: Advisor Intent (DISALLOW) and JEV Judge (REJECT) both reject action.",
        advisor.reason,
        ...jev.reasons,
      ],
    };
  }

  // 3. Conflict or Uncertainty -> Sovereign Human Escalation
  let escalationMessage: string;
  if (advisor.verdict === "ALLOW" && jev.verdict === "REJECT") {
    escalationMessage = `Conflict detected: Advisor permits action (${advisor.reason}), but JEV Judge rejected (${jev.reasons.join("; ")}).`;
    reasons.push(escalationMessage);
  } else if (advisor.verdict === "DISALLOW" && jev.verdict === "APPROVE") {
    escalationMessage = `Conflict detected: JEV Judge approved code evidence, but Advisor identified user intent conflict (${advisor.reason}).`;
    reasons.push(escalationMessage);
  } else if (advisor.verdict === "UNCERTAIN" || jev.verdict === "ESCALATE") {
    escalationMessage = `Escalation: Advisor (${advisor.verdict}: ${advisor.reason}) or JEV (${jev.verdict}) requires sovereign human confirmation.`;
    reasons.push(escalationMessage);
  } else {
    escalationMessage = "Bicameral evaluation unresolved; escalating to human authority.";
    reasons.push(escalationMessage);
  }

  return {
    verdict: "HUMAN_ESCALATION",
    advisor,
    jev,
    reasons,
    escalationMessage,
  };
}

/**
 * Formats a clear dual-perspective message for UI confirmation.
 */
export function formatConsensusEscalation(decision: BicameralConsensusDecision): string {
  const jevReasons = decision.jev.reasons.length > 0 ? decision.jev.reasons.join("; ") : "No specific reasons provided";
  return [
    "Bicameral Consensus Escalation (Sovereign Human Review)",
    "─────────────────────────────────────────────────────────────",
    `Lobe 1 (Advisor Intent): ${decision.advisor.verdict} (Confidence ${decision.advisor.confidence.toFixed(2)})`,
    `Intent Rationale:        ${decision.advisor.reason.slice(0, 500)}`,
    `Lobe 2 (TypeSafe JEV Judge): ${decision.jev.verdict}`,
    `Evidence Findings:       ${jevReasons.slice(0, 500)}`,
    "─────────────────────────────────────────────────────────────",
    "Sovereign human confirmation needed: Approve or reject.",
  ].join("\n");
}

/**
 * Evaluates a drop request through the Bicameral Consensus Engine.
 */
export async function runBicameralDropCheck(
  ctx: DropCheckContext,
  client?: ExpertJudgeClient
): Promise<BicameralConsensusDecision> {
  const advisor = evaluateAdvisorIntent({
    operation: "drop",
    task: ctx.tasks,
    userRequest: ctx.userRequest,
    agentWorkLog: ctx.agentWorkLog,
    reason: ctx.reason,
    conversationHistory: (ctx.planContext || []).join("\n"),
  });

  const jevDrop = await runDropJustificationCheck(ctx, client);
  let jevVerdict: JevConsensusVerdict;
  if (jevDrop.decision === "approve") {
    jevVerdict = "APPROVE";
  } else if (jevDrop.decision === "reject") {
    jevVerdict = "REJECT";
  } else {
    jevVerdict = "ESCALATE";
  }

  const jev: JevResult = {
    verdict: jevVerdict,
    confidence: jevDrop.dropJustifiedNoul,
    reasons: jevDrop.reasons,
  };

  return arbitrateConsensus(advisor, jev);
}

/**
 * Evaluates a phase/task macro completion through the Bicameral Consensus Engine.
 */
export async function runBicameralMacroCheck(
  ctx: MacroCheckContext,
  client?: ExpertJudgeClient
): Promise<BicameralConsensusDecision & { macroResult: PhaseMacroCheckResult }> {
  let advisor = evaluateAdvisorIntent({
    operation: "done",
    task: ctx.todoTask || ctx.phaseTitle || "",
    userRequest: ctx.userRequest,
    agentWorkLog: ctx.agentWorkLog,
    conversationHistory: (ctx.planContext || []).join("\n"),
    testSummary: ctx.testSummary,
    diffSummary: ctx.diffSummary,
    deliverableArtifacts: ctx.deliverableArtifacts,
    taskType: ctx.taskType,
  });

  const jevMacro = await runPhaseMacroCheck(ctx, client);
  if (!jevMacro.approved && jevMacro.verdict === "REJECT" && !jevMacro.escalateToUser) {
    advisor = {
      ...advisor,
      verdict: "DISALLOW",
      ckVerdict: "block",
      reason: "Deliverable verification rejected by JEV; agent remediation required before human escalation",
    };
  }
  let jevVerdict: JevConsensusVerdict;
  if (jevMacro.approved) {
    jevVerdict = "APPROVE";
  } else if (jevMacro.verdict === "NEXT_ACTION_REQUIRED") {
    jevVerdict = "NEXT_ACTION_REQUIRED";
  } else if (jevMacro.verdict === "REJECT") {
    jevVerdict = "REJECT";
  } else {
    jevVerdict = "ESCALATE";
  }

  const jev: JevResult = {
    verdict: jevVerdict,
    confidence: jevMacro.expertConfidence,
    reasons: jevMacro.reasons,
  };

  const decision = arbitrateConsensus(advisor, jev);
  return { ...decision, macroResult: jevMacro };
}

/**
 * Evaluates bicameral consensus for task completion given an existing PhaseMacroCheckResult.
 */
export async function evaluateBicameralDoneConsensus(ctx: {
  todoTask: string;
  phaseTitle?: string;
  userRequest?: string;
  agentWorkLog?: string;
  evidence?: unknown;
  macroResult: PhaseMacroCheckResult;
}): Promise<BicameralConsensusDecision> {
  const evObj =
    ctx.evidence && typeof ctx.evidence === "object"
      ? (ctx.evidence as Record<string, unknown>)
      : undefined;
  const testSummary = typeof evObj?.testOutput === "string" ? evObj.testOutput : undefined;
  let advisor = evaluateAdvisorIntent({
    operation: "done",
    task: ctx.todoTask || ctx.phaseTitle || "",
    userRequest: ctx.userRequest,
    agentWorkLog: ctx.agentWorkLog,
    testSummary,
    diffSummary: typeof evObj?.gitStatus === "string" ? evObj.gitStatus : undefined,
  });

  let jevVerdict: JevConsensusVerdict;
  const jevMacro = ctx.macroResult;
  if (!jevMacro.approved && jevMacro.verdict === "REJECT" && !jevMacro.escalateToUser) {
    advisor = {
      ...advisor,
      verdict: "DISALLOW",
      ckVerdict: "block",
      reason: "Deliverable verification rejected by JEV; agent remediation required before human escalation",
    };
  }
  if (jevMacro.approved) {
    jevVerdict = "APPROVE";
  } else if (jevMacro.verdict === "NEXT_ACTION_REQUIRED") {
    jevVerdict = "NEXT_ACTION_REQUIRED";
  } else if (jevMacro.verdict === "REJECT") {
    jevVerdict = "REJECT";
  } else {
    jevVerdict = "ESCALATE";
  }

  const jev: JevResult = {
    verdict: jevVerdict,
    confidence: jevMacro.expertConfidence,
    reasons: jevMacro.reasons,
  };

  return arbitrateConsensus(advisor, jev);
}

export interface DecisionCheckContext {
  decision?: AdvisorDecisionKind;
  question: string;
  options?: Array<string | AdvisorOptionCandidate>;
  recommendedIndex?: number;
  constraints?: string | string[];
  evidencePaths?: string[];
  userRequest?: string;
  agentWorkLog?: string;
  context?: string | Record<string, unknown>;
}

export interface BicameralDecisionResult extends BicameralConsensusDecision {
  ckVerdict: CkAdvisorVerdict;
  recommendation: string;
  recommendedOption?: string;
  recommendedIndex?: number;
  rankedOptions: RankedAdvisorOption[];
  findings: AdvisorFinding[];
  openQuestions: string[];
  report: string;
}

/**
 * Formats the fixed 6-section ck:advisor contract:
 * Verdict, Recommendation, Ranked options, Findings, Confidence, Open questions.
 */
export function formatCkAdvisorReport(
  advisor: AdvisorIntentResult,
  jev?: JevResult
): string {
  const ckVerdict: CkAdvisorVerdict =
    advisor.ckVerdict ||
    (advisor.verdict === "ALLOW"
      ? "proceed"
      : advisor.verdict === "DISALLOW"
      ? "block"
      : "revise");
  const recommendation = advisor.recommendation || advisor.reason;
  const rankedLines =
    advisor.rankedOptions && advisor.rankedOptions.length > 0
      ? advisor.rankedOptions
          .map(
            (r, i) =>
              `${i + 1}. **${r.option}** (score: ${r.score.toFixed(2)}) — ${r.rationale}`
          )
          .join("\n")
      : `- **${advisor.recommendedOption || ckVerdict}** — ${recommendation}`;

  const findingLines: string[] = [];
  if (advisor.findings && advisor.findings.length > 0) {
    for (const f of advisor.findings) {
      findingLines.push(
        `- [${f.severity.toUpperCase()}] ${f.claim}${f.evidence ? ` (${f.evidence})` : ""}`
      );
    }
  }
  if (jev && jev.reasons.length > 0) {
    for (const r of jev.reasons) {
      findingLines.push(`- [JEV:${jev.verdict}] ${r}`);
    }
  }
  if (findingLines.length === 0) {
    findingLines.push("- [INFO] No blocking architectural or safety findings detected.");
  }

  const openQuestions =
    advisor.openQuestions && advisor.openQuestions.length > 0
      ? advisor.openQuestions.map((q) => `- ${q}`).join("\n")
      : "None";

  return [
    `## Verdict`,
    ckVerdict,
    ``,
    `## Recommendation`,
    recommendation,
    ``,
    `## Ranked options`,
    rankedLines,
    ``,
    `## Findings`,
    findingLines.join("\n"),
    ``,
    `## Confidence`,
    advisor.confidence.toFixed(2),
    ``,
    `## Open questions`,
    openQuestions,
  ].join("\n");
}

/**
 * Evaluates an agent or orchestrator decision through Both Lobes:
 * Lobe 1 (Advisor / ck:advisor) + Lobe 2 (TypeSafe JEV Judge),
 * returning a concrete decision answer and the fixed ck:advisor contract.
 */
export async function runBicameralDecisionCheck(
  ctx: DecisionCheckContext,
  client?: ExpertJudgeClient
): Promise<BicameralDecisionResult> {
  const contextStr =
    typeof ctx.context === "string"
      ? ctx.context
      : ctx.context
      ? JSON.stringify(ctx.context)
      : "";

  const advisor = evaluateAdvisorIntent({
    operation: "decision",
    task: ctx.question,
    decisionKind: ctx.decision || "general",
    question: ctx.question,
    options: ctx.options,
    recommendedIndex: ctx.recommendedIndex,
    constraints: ctx.constraints,
    evidencePaths: ctx.evidencePaths,
    userRequest: ctx.userRequest,
    agentWorkLog: [ctx.agentWorkLog, contextStr].filter(Boolean).join("\n"),
  });

  const normalizedOpts = normalizeOptions(ctx.options, ctx.recommendedIndex);
  let jev: JevResult = {
    verdict: advisor.verdict === "DISALLOW" ? "REJECT" : "APPROVE",
    confidence: advisor.confidence,
    reasons: [advisor.reason],
  };

  if (client) {
    try {
      const questions: Record<string, ExpertJudgeQuestion> = {
        risk_posture: {
          type: "score",
          instructions:
            "Rate the technical risk and security implications of this decision:",
          criteria: [
            "Zero Risk — routine inquiry, safe tradeoffs, fully bounded options",
            "Low Risk — minor architectural choice with manageable side effects",
            "Moderate Risk — tradeoffs involving data, architecture, or credentials",
            "Critical Risk — dangerous action, security sensitive choice, or potential data loss",
          ],
        },
        decision_clarity: {
          type: "noul",
          instructions:
            "Is this decision well-scoped with sufficient evidence to proceed safely?",
          criteria: {
            true: "Decision is clear, well-bounded, and supported by context",
            false: "Decision is ambiguous, risky, or lacks required context",
          },
        },
      };

      if (normalizedOpts.length >= 2) {
        const choiceCriteria: Record<string, string> = {};
        for (const opt of normalizedOpts) {
          choiceCriteria[opt.label] = opt.description || opt.label;
        }
        choiceCriteria["insufficient_evidence"] =
          "Evidence is insufficient to prefer any candidate option";
        questions.recommended_option = {
          type: "choice",
          instructions:
            "Judging from the context and constraints, which option is best supported?",
          criteria: choiceCriteria,
        };
      }

      const state = JSON.stringify({
        decision: ctx.decision || "general",
        question: ctx.question,
        options: normalizedOpts,
        constraints: ctx.constraints,
        user_request: ctx.userRequest,
        agent_work_log: ctx.agentWorkLog,
        context: ctx.context,
      });

      const response = await client.evaluate({ state, questions });
      if (!response.error && response.answers) {
        const riskScore = response.answers.risk_posture?.score;
        const clarity = response.answers.decision_clarity?.noul;
        const recChoice = response.answers.recommended_option?.choice;
        const recConf = response.answers.recommended_option?.confidence;

        const jevReasons: string[] = [];
        if (riskScore !== undefined) {
          const riskLabel =
            riskScore <= 1.0 ? "Low" : riskScore <= 2.0 ? "Moderate" : "High/Critical";
          jevReasons.push(`Risk: ${riskLabel} (${riskScore.toFixed(1)}/3)`);
        }
        if (clarity !== undefined) {
          jevReasons.push(`Decision Clarity: ${Math.round(clarity * 100)}%`);
        }
        if (recChoice && recChoice !== "insufficient_evidence") {
          jevReasons.push(`JEV recommended option: "${recChoice}"`);
          const matchedIdx = normalizedOpts.findIndex((o) => o.label === recChoice);
          if (matchedIdx >= 0) {
            const matchedRationale =
              advisor.rankedOptions?.find((r) => r.option === recChoice)?.rationale ||
              "Recommended by TypeSafe JEV & Advisor";
            if (advisor.rankedOptions && advisor.rankedOptions.length > 0) {
              const promotedScore = Math.max(advisor.rankedOptions[0]?.score ?? 0.90, recConf ?? 0.90);
              advisor.rankedOptions = advisor.rankedOptions
                .map((r) => (r.option === recChoice ? { ...r, score: promotedScore } : r))
                .sort((a, b) => {
                  if (a.option === recChoice) return -1;
                  if (b.option === recChoice) return 1;
                  return b.score - a.score;
                });
            }
            advisor.recommendedOption = recChoice;
            advisor.recommendedIndex = matchedIdx;
            advisor.recommendation = `Select "${recChoice}" — ${matchedRationale}.`;
            advisor.reason = advisor.recommendation;
            advisor.verdict = "ALLOW";
            advisor.ckVerdict = "proceed";
          }
        }

        if (riskScore !== undefined && riskScore > 2.0) {
          jev = {
            verdict: "REJECT",
            confidence: recConf ?? clarity ?? 0.85,
            reasons:
              jevReasons.length > 0
                ? jevReasons
                : ["High/Critical risk detected by TypeSafe JEV"],
          };
        } else {
          jev = {
            verdict: "APPROVE",
            confidence: recConf ?? clarity ?? 0.90,
            reasons:
              jevReasons.length > 0
                ? jevReasons
                : ["Decision verified by TypeSafe JEV"],
          };
        }
      }
    } catch {
      // Fallback to Lobe 1 (Advisor / ck:advisor) when JEV is unreachable
    }
  }

  const consensus = arbitrateConsensus(advisor, jev);
  const ckVerdict: CkAdvisorVerdict =
    consensus.verdict === "AUTO_APPROVE"
      ? "proceed"
      : consensus.verdict === "AUTO_REJECT"
      ? "block"
      : advisor.ckVerdict || "revise";
  const recommendation =
    advisor.recommendation ||
    (advisor.recommendedOption
      ? `Select "${advisor.recommendedOption}" — ${advisor.reason}`
      : advisor.reason);
  const report = formatCkAdvisorReport({ ...advisor, ckVerdict, recommendation }, jev);

  return {
    ...consensus,
    ckVerdict,
    recommendation,
    recommendedOption: advisor.recommendedOption,
    recommendedIndex: advisor.recommendedIndex,
    rankedOptions: advisor.rankedOptions || [],
    findings: advisor.findings || [],
    openQuestions: advisor.openQuestions || [],
    report,
  };
}
