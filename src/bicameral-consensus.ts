import type {
  DropCheckContext,
  MacroCheckContext,
  ExpertJudgeClient,
} from "./cook-expert-judge";
import {
  runDropJustificationCheck,
  runPhaseMacroCheck,
} from "./cook-expert-judge";

export type AdvisorIntentVerdict = "ALLOW" | "DISALLOW" | "UNCERTAIN";

export interface AdvisorContext {
  operation: "done" | "drop" | "mutate";
  task: string | string[];
  userRequest?: string;
  agentWorkLog?: string;
  reason?: string;
  conversationHistory?: string;
  hasCleanBuildEvidence?: boolean;
}

export interface AdvisorIntentResult {
  verdict: AdvisorIntentVerdict;
  confidence: number;
  reason: string;
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

/**
 * Lobe 1: Evaluates user intent, conversation context, and agent claims.
 */
export function evaluateAdvisorIntent(ctx: AdvisorContext): AdvisorIntentResult {
  const userReq = (ctx.userRequest || "").trim();
  const workLog = (ctx.agentWorkLog || "").trim();
  const taskText = Array.isArray(ctx.task) ? ctx.task.join(", ") : ctx.task;
  const combinedContext = `${userReq}\n${workLog}\n${ctx.reason || ""}\n${ctx.conversationHistory || ""}`;

  if (ctx.operation === "drop") {
    // 1. Explicit user cancellation detected in user request
    const userWantsCancel = CANCELLATION_PATTERNS.some((p) => p.test(userReq));
    if (userWantsCancel) {
      return {
        verdict: "ALLOW",
        confidence: 0.95,
        reason: "User explicitly authorized or requested dropping the task in context",
        userIntentDetected: true,
      };
    }

    // 2. Clean build / pre-existing satisfaction obsolescence (DataGuard pattern)
    const hasBuildEvidence =
      ctx.hasCleanBuildEvidence === true ||
      CLEAN_BUILD_PATTERNS.some((p) => p.test(combinedContext));

    if (hasBuildEvidence) {
      return {
        verdict: "ALLOW",
        confidence: 0.90,
        reason: "Clean build or verified test success confirms task is obsolete or already satisfied",
        userIntentDetected: false,
      };
    }

    // 3. User explicitly requested this task and no cancellation was expressed
    if (userReq.length > 0) {
      const taskWords = taskText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const matchesUserRequest = taskWords.some((w) => userReq.toLowerCase().includes(w));
      if (matchesUserRequest) {
        return {
          verdict: "DISALLOW",
          confidence: 0.85,
          reason: "User requested task implementation and no valid cancellation or obsolescence evidence exists",
          userIntentDetected: true,
        };
      }
    }

    // 4. Ambiguous intent
    return {
      verdict: "UNCERTAIN",
      confidence: 0.50,
      reason: "Ambiguous / uncertain user intent; task drop requires sovereign human confirmation",
      userIntentDetected: false,
    };
  }

  // Operation === "done" or "mutate"
  if (ctx.operation === "done") {
    if (workLog.length > 0 && /pass|implement|added|completed|fixed/i.test(workLog)) {
      return {
        verdict: "ALLOW",
        confidence: 0.90,
        reason: "Agent work log documents concrete implementation and passing verification",
        userIntentDetected: userReq.length > 0,
      };
    }

    return {
      verdict: "UNCERTAIN",
      confidence: 0.60,
      reason: "Agent work log is incomplete or unverified; deferring to JEV code diff analysis",
      userIntentDetected: userReq.length > 0,
    };
  }

  return {
    verdict: "UNCERTAIN",
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
    "┌─────────────────────────────────────────────────────────────┐",
    "│ Bicameral Consensus Escalation (Sovereign Human Review)    │",
    "├─────────────────────────────────────────────────────────────┤",
    `│ Lobe 1 (Advisor Intent): ${decision.advisor.verdict} (Confidence ${decision.advisor.confidence.toFixed(2)})`.padEnd(61) + "│",
    `│ Intent Rationale:        ${decision.advisor.reason.slice(0, 35)}`.padEnd(61) + "│",
    `│ Lobe 2 (TypeSafe JEV Judge): ${decision.jev.verdict}`.padEnd(61) + "│",
    `│ Evidence Findings:       ${jevReasons.slice(0, 35)}`.padEnd(61) + "│",
    "├─────────────────────────────────────────────────────────────┤",
    "│ Sovereign human confirmation needed: Approve or reject.    │",
    "└─────────────────────────────────────────────────────────────┘",
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
): Promise<BicameralConsensusDecision> {
  const advisor = evaluateAdvisorIntent({
    operation: "done",
    task: ctx.todoTask || ctx.phaseTitle || "",
    userRequest: ctx.userRequest,
    agentWorkLog: ctx.agentWorkLog,
    conversationHistory: (ctx.planContext || []).join("\n"),
  });

  const jevMacro = await runPhaseMacroCheck(ctx, client);
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

  return arbitrateConsensus(advisor, jev);
}
