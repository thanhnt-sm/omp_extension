import { preparePayloadSafe, isSecretInKey, clampText } from "./payload-safety";
import { encloseUntrusted } from "./xml-enclosure";
import { resolveAutoApprovalThreshold } from "./verification-gate";

export { resolveAutoApprovalThreshold } from "./verification-gate";

export interface MicroCheckEvidence {
  gitStatus: string;
  gitDiff: string;
  testExitCode: number | null;
  testOutput: string;
  cleanWorkingTree: boolean;
  nonGitFallbackUsed?: boolean;
  taskDoneProven?: boolean;
  todoCompleted?: boolean;
  agentWorkLog?: string;
}

export interface MicroCheckResult {
  passed: boolean;
  reasons: string[];
  testPassed: boolean;
  claudeSafe: boolean;
  assertionDeleted?: boolean;
  nonGitFallbackUsed?: boolean;
}

export interface MacroCheckContext {
  todoTask: string;
  phaseTitle?: string;
  planRequirements: string[];
  planContext?: string[];
  diffSummary: string;
  unifiedDiff: string;
  testSummary: string;
  attemptCount?: number;
  taskType?: "code_change" | "analysis_research" | "doc_specification";
  deliverableArtifacts?: string;
  userRequest?: string;
  agentWorkLog?: string;
  diffScope?: string;
  testCommand?: string;
}

export type JevVerdict = "APPROVE" | "REJECT" | "NEXT_ACTION_REQUIRED" | "ESCALATE";
export type DropVerdict = "APPROVE" | "REJECT" | "ESCALATE";
export type DeliverablesVerdict = "APPROVE" | "REJECT" | "NEXT_ACTION_REQUIRED";
export type DriftChoice = "no_drift" | "unapproved_deviation" | "scope_creep";
export type ScopeChoice = "HOLD" | "EXPANSION" | "REDUCTION";

export interface MacroCheckResult {
  approved: boolean;
  reasons: string[];
  verdict?: DeliverablesVerdict;
  deliverablesVerdict?: DeliverablesVerdict;
  meetsCriteriaNoul?: number;
  driftChoice?: DriftChoice;
  scopeChoice?: ScopeChoice;
  riskScore?: number;
  expertConfidence?: number;
  escalateToUser?: boolean;
  error?: string;
}

export interface ExpertJudgeQuestion {
  type: "choice" | "score" | "noul";
  instructions: string;
  criteria?: string[] | Record<string, string>;
}

export interface ExpertJudgeResponse {
  answers?: {
    deliverables_verdict?: { choice: DeliverablesVerdict; confidence?: number };
    drop_verdict?: { choice: DropVerdict; confidence?: number };
    meets_criteria?: { noul: number; confidence?: number };
    drop_justified?: { noul: number; confidence?: number };
    architectural_drift?: { choice: DriftChoice; confidence?: number };
    architectural_drift_guard?: { choice: DriftChoice; confidence?: number };
    scope_mode?: { choice: ScopeChoice; confidence?: number };
    scope_arbiter?: { choice: ScopeChoice; confidence?: number };
    risk_score?: { score: number };
    risk_security_triage?: { score: number };
  };
  error?: string;
}

export interface ExpertJudgeClient {
  evaluate: (params: {
    state: string;
    questions: Record<string, ExpertJudgeQuestion>;
  }) => Promise<ExpertJudgeResponse>;
}

const defaultJudgeClient: ExpertJudgeClient = {
  async evaluate({ state, questions }) {
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) {
      return { error: "TYPESAFE_API_KEY environment variable is missing" };
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const sanitized = preparePayloadSafe({
        state,
        questions: questions as Record<string, { type: "choice" | "score" | "noul"; instructions: string; criteria?: string[] }>,
      });
      const res = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: "jev-latest", ...sanitized }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        return { error: `TypeSafe API returned HTTP ${res.status}: ${res.statusText}` };
      }
      return (await res.json()) as ExpertJudgeResponse;
    } catch (err) {
      return { error: `TypeSafe network error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

/**
 * Gate 1: Fast deterministic micro-check running locally in <150ms with 0 tokens.
 */
export async function runTaskMicroCheck(evidence: MicroCheckEvidence): Promise<MicroCheckResult> {
  const reasons: string[] = [];

  const touchesClaude =
    /(?:^|[\s/\\])\.claude[/\\]/i.test(evidence.gitStatus) ||
    /(?:^|[\s/\\])\.claude[/\\]/i.test(evidence.gitDiff) ||
    /\.claude\.json/i.test(evidence.gitStatus);

  const claudeSafe = !touchesClaude;
  if (!claudeSafe) {
    reasons.push("Claude boundary violation: task modified files under .claude or Claude configuration.");
  }

  const testPassed = evidence.testExitCode === null || evidence.testExitCode === 0;
  if (!testPassed) {
    reasons.push(`Test suite failed with exit code ${evidence.testExitCode}. Test failure must be resolved before completing task.`);
  }

  const deletedAssertionMatches =
    evidence.gitDiff.match(/(?:^|\n)-[ \t]*(?:expect\(|assert\(|assert\.[a-zA-Z]+\()/g) || [];
  const addedAssertionMatches =
    evidence.gitDiff.match(/(?:^|\n)\+[ \t]*(?:expect\(|assert\(|assert\.[a-zA-Z]+\()/g) || [];
  const assertionDeleted = deletedAssertionMatches.length > addedAssertionMatches.length;
  if (assertionDeleted) {
    reasons.push("Test evasion detected: git diff contains deleted assertions (expect/assert). Deleting tests to fake completion is prohibited.");
  }
  const hasGitEvidence = (evidence.gitStatus?.trim().length ?? 0) > 0 || (evidence.gitDiff?.trim().length ?? 0) > 0;
  const hasTestEvidence = evidence.testExitCode !== null || (evidence.testOutput?.trim().length ?? 0) > 0;
  const zeroEvidence = !hasGitEvidence && !hasTestEvidence && !(evidence.agentWorkLog?.trim());
  if (zeroEvidence) {
    reasons.push("Zero evidence: no test execution or git modifications observed for task completion.");
  }
  if (evidence.taskDoneProven === false || evidence.todoCompleted === false) {
    reasons.push(
      "Task completion precondition failed: agent must prove task and todo items are completed before invoking TypeSafe judge."
    );
  }

  const passed = claudeSafe && testPassed && !assertionDeleted && !zeroEvidence && evidence.taskDoneProven !== false && evidence.todoCompleted !== false;
  return {
    passed,
    reasons,
    testPassed,
    claudeSafe,
    assertionDeleted,
    nonGitFallbackUsed: evidence.nonGitFallbackUsed ?? false,
  };
}

/**
 * Gate 2: Semantic macro-check against TypeSafe System One.
 */
export async function runPhaseMacroCheck(
  ctx: MacroCheckContext,
  client: ExpertJudgeClient = defaultJudgeClient
): Promise<MacroCheckResult> {
  const reasons: string[] = [];

  // Anti-spoofing heuristic: If code files are modified in diffSummary file paths,
  // forcefully override taskType to "code_change"
  const diffLines = (ctx.diffSummary || "").split(/\r?\n/);
  const containsCodeChanges = diffLines.some((l) => {
    let p = l.slice(3).trim();
    if (p.includes(" -> ")) p = p.split(" -> ").pop()?.trim() || p;
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    return /\.(ts|tsx|js|jsx|cjs|mjs|py|go|rs|json|ya?ml|toml|sql|sh|bat|ps1)\b/i.test(p);
  });
  const effectiveTaskType = containsCodeChanges ? "code_change" : (ctx.taskType ?? "code_change");

  const statePayload: Record<string, string> = {
    todo_task: encloseUntrusted(clampText(ctx.todoTask || ctx.phaseTitle || "", 950, "head"), "todo_task"),
    task_requirements: encloseUntrusted(clampText((ctx.planRequirements || []).join("\n"), 1950, "head"), "task_requirements"),
    user_request: encloseUntrusted(clampText(ctx.userRequest || "unavailable", 1950, "tail"), "user_request"),
    agent_work_log: encloseUntrusted(clampText(ctx.agentWorkLog || "unavailable", 1950, "tail"), "agent_work_log"),
    diff_scope: encloseUntrusted(
      ctx.diffScope === "task-baseline"
        ? "task-baseline: only files changed since this task started"
        : "full-working-tree: no task-start baseline; may include unrelated pre-existing changes",
      "diff_scope"
    ),
    diff_summary: encloseUntrusted(clampText(ctx.diffSummary || "", 1950, "head"), "diff_summary"),
    unified_diff: encloseUntrusted(ctx.unifiedDiff || "", "unified_diff"),
    test_summary: encloseUntrusted(clampText(ctx.testSummary || "", 1950, "tail"), "test_summary"),
  };
  if (ctx.planContext && ctx.planContext.length > 0) {
    statePayload.plan_context = encloseUntrusted(clampText(ctx.planContext.join("\n"), 1950, "head"), "plan_context");
  }
  if (ctx.deliverableArtifacts) {
    statePayload.deliverable_artifacts = encloseUntrusted(clampText(ctx.deliverableArtifacts, 4940, "head"), "deliverable_artifacts");
  }
  const rawState = JSON.stringify(statePayload);

  const hasExplicitTestCmd = Boolean(
    ctx.testCommand &&
      ctx.testSummary &&
      !ctx.testSummary.includes("No testCommand provided")
  );
  const scopeNote =
    " Evaluate ONLY the current sub-task in `todo_task` and `task_requirements` (`user_request` and `plan_context` are background context for the broader session; do not penalize for unstarted future tasks)." +
    (effectiveTaskType === "code_change"
      ? " Note: `unified_diff` may be summarized per file for size budget; corroborate with `diff_summary`, `test_summary`, and `agent_work_log`."
      : "") +
    (hasExplicitTestCmd
      ? ""
      : " Note: No separate testCommand was configured; do not penalize for 'No testCommand provided' in `test_summary`.");

  let deliverablesQuestion: ExpertJudgeQuestion;
  if (effectiveTaskType === "analysis_research" || effectiveTaskType === "doc_specification") {
    deliverablesQuestion = {
      type: "choice",
      instructions:
        "Based on `deliverable_artifacts`, `test_summary`, and `agent_work_log`, does the completed work satisfy `todo_task` and `task_requirements`?" +
        scopeNote,
      criteria: {
        APPROVE: "Deliverables satisfy the research or documentation criteria with concrete analysis or specifications",
        REJECT: "Deliverables fail to address the task requirements or omit required analysis",
        NEXT_ACTION_REQUIRED: "Deliverables are partial and need follow-up actions",
      },
    };
  } else {
    deliverablesQuestion = {
      type: "choice",
      instructions:
        "Based on `unified_diff`, `diff_summary`, `test_summary`, and `agent_work_log`, does the completed work satisfy `todo_task` and `task_requirements`?" +
        scopeNote,
      criteria: {
        APPROVE: hasExplicitTestCmd
          ? "Implementation fulfills the task acceptance criteria with passing tests"
          : "Implementation fulfills the task acceptance criteria based on unified_diff, diff_summary, and agent_work_log",
        REJECT: "Implementation fails to address the task requirements or stubs out needed functionality",
        NEXT_ACTION_REQUIRED: "Implementation is partial, has failing tests, or needs follow-up actions",
      },
    };
  }

  const questions: Record<string, ExpertJudgeQuestion> = {
    deliverables_verdict: deliverablesQuestion,
    meets_criteria: {
      type: "noul",
      instructions:
        (effectiveTaskType === "analysis_research" || effectiveTaskType === "doc_specification"
          ? "Does the research or specification evidence in `deliverable_artifacts` and `agent_work_log` satisfy `todo_task` and `task_requirements`?"
          : "Does the implementation in `unified_diff`, `diff_summary`, `test_summary`, and `agent_work_log` satisfy `todo_task` and `task_requirements`?") +
        scopeNote,
      criteria: {
        true: "Deliverables and evidence satisfy the current sub-task requirements",
        false: "Deliverables are incomplete, missing required evidence, or fail the current sub-task criteria",
      },
    },
    architectural_drift: {
      type: "choice",
      instructions:
        "Assess whether the changes adhere to planned architecture and safety boundaries. Updating companion unit tests (`tests/*`), plans (`plans/*`), documentation/ADRs/journals (`docs/*`), or supporting `src/*` modules is standard engineering practice and is NOT drift or scope creep:",
      criteria: {
        no_drift: "Strict adherence to architecture and boundaries (including companion tests, docs, plans, and supporting modules)",
        unapproved_deviation: "Unplanned architectural deviation or broken safety contract",
        scope_creep: "Scope creep into unrelated external projects or prohibited directories",
        other: "Unrecognized architectural change",
      },
    },
    scope_mode: {
      type: "choice",
      instructions:
        "Assess whether scope was maintained, expanded, or reduced relative to `todo_task` and `task_requirements` (not the whole plan):",
      criteria: {
        HOLD: "Preserves planned requirements exactly",
        EXPANSION: "Justified addition of edge cases, tests, or documentation",
        REDUCTION: "Omits requested functionality",
        other: "Other scope modification",
      },
    },
  };
  for (const key of Object.keys(questions)) {
    if (isSecretInKey(key)) {
      throw new Error(`Security violation: secret token detected in question key "${key}"`);
    }
  }

  let response: ExpertJudgeResponse;
  try {
    response = await client.evaluate({ state: rawState, questions });
  } catch {
    return {
      approved: false,
      reasons: ["TypeSafe evaluation unavailable: judge request failed. Check connectivity and retry verification."],
      escalateToUser: true,
      error: "unavailable",
    };
  }

  if (response.error || !response.answers) {
    return {
      approved: false,
      reasons: [`TypeSafe verification error: ${response.error ?? "No answers returned"}`],
      escalateToUser: true,
      error: "unavailable",
    };
  }

  const answers = response.answers;
  const rawDeliverablesVerdict = answers.deliverables_verdict?.choice;
  const rawMeetsCriteria = answers.meets_criteria?.noul;

  if (
    rawMeetsCriteria !== undefined &&
    (typeof rawMeetsCriteria !== "number" || !Number.isFinite(rawMeetsCriteria) || rawMeetsCriteria < 0 || rawMeetsCriteria > 1)
  ) {
    return {
      approved: false,
      reasons: ["TypeSafe evaluation unavailable: meets_criteria must be a finite probability in [0,1]."],
      escalateToUser: true,
      error: "unavailable",
    };
  }

  const threshold = resolveAutoApprovalThreshold();
  const passesThreshold = (p: number) => (threshold === 0.50 ? p > 0.50 : p >= threshold);
  let deliverablesVerdict: DeliverablesVerdict | undefined;
  if (rawDeliverablesVerdict && ["APPROVE", "REJECT", "NEXT_ACTION_REQUIRED"].includes(rawDeliverablesVerdict)) {
    deliverablesVerdict = rawDeliverablesVerdict;
    if (deliverablesVerdict === "APPROVE" && rawMeetsCriteria !== undefined && !passesThreshold(rawMeetsCriteria)) {
      deliverablesVerdict = rawMeetsCriteria < 0.25 ? "REJECT" : "NEXT_ACTION_REQUIRED";
    }
  } else if (rawMeetsCriteria !== undefined) {
    deliverablesVerdict = passesThreshold(rawMeetsCriteria) ? "APPROVE" : rawMeetsCriteria < 0.25 ? "REJECT" : "NEXT_ACTION_REQUIRED";
  } else {
    return {
      approved: false,
      reasons: ["TypeSafe evaluation unavailable: deliverables_verdict must be APPROVE, REJECT, or NEXT_ACTION_REQUIRED."],
      escalateToUser: true,
      error: "unavailable",
    };
  }

  const driftChoice = (answers.architectural_drift?.choice ?? answers.architectural_drift_guard?.choice) as DriftChoice | undefined;
  const scopeChoice = (answers.scope_mode?.choice ?? answers.scope_arbiter?.choice) as ScopeChoice | undefined;
  const riskScore = answers.risk_score?.score ?? answers.risk_security_triage?.score;
  const expertConfidence = answers.deliverables_verdict?.confidence ?? answers.architectural_drift?.confidence ?? answers.scope_mode?.confidence ?? rawMeetsCriteria ?? 0.92;
  const meetsCriteriaNoul =
    rawMeetsCriteria ??
    (deliverablesVerdict === "APPROVE"
      ? (answers.deliverables_verdict?.confidence ?? 1.0)
      : deliverablesVerdict === "NEXT_ACTION_REQUIRED"
        ? 0.5
        : 0.0);

  if (!driftChoice || !scopeChoice) {
    return {
      approved: false,
      reasons: ["Incomplete TypeSafe evaluation: one or more required judgment dimensions were missing."],
      escalateToUser: true,
      error: "unavailable",
      verdict: deliverablesVerdict,
      deliverablesVerdict,
      meetsCriteriaNoul,
      driftChoice: driftChoice ?? "unapproved_deviation",
      scopeChoice: scopeChoice ?? "REDUCTION",
      riskScore,
      expertConfidence,
    };
  }

  let approved = true;
  if (deliverablesVerdict === "REJECT") {
    approved = false;
    if (rawMeetsCriteria !== undefined) {
      reasons.push(
        `Deliverable verification rejected (${effectiveTaskType}): JEV verdict is REJECT (score P=${rawMeetsCriteria.toFixed(2)}).`
      );
    } else {
      reasons.push(
        `Deliverable verification rejected (${effectiveTaskType}): deliverables are incomplete, missing required evidence, or fail task criteria.`
      );
    }
  } else if (deliverablesVerdict === "NEXT_ACTION_REQUIRED") {
    approved = false;
    if (rawMeetsCriteria !== undefined) {
      reasons.push(
        `Next actions required (${effectiveTaskType}): JEV verdict is NEXT_ACTION_REQUIRED (score P=${rawMeetsCriteria.toFixed(2)}).`
      );
    } else {
      reasons.push(
        `Next actions required (${effectiveTaskType}): deliverables are partial, has missing criteria, or requires plan adaptation.`
      );
    }
  }

  if (driftChoice !== "no_drift") {
    approved = false;
    reasons.push(`Architectural drift detected: ${driftChoice}. Must maintain strict adherence to planned boundaries.`);
  }

  if (scopeChoice === "REDUCTION") {
    approved = false;
    reasons.push("Scope reduction detected: implementation omitted planned deliverables.");
  }

  const reachedMaxAttempts = Boolean(ctx.attemptCount && ctx.attemptCount >= 3);
  if (!approved && reachedMaxAttempts) {
    reasons.push("3 consecutive failed revision attempts reached. Halting autonomous loop for user escalation.");
  }

  return {
    approved,
    reasons,
    verdict: deliverablesVerdict,
    deliverablesVerdict,
    meetsCriteriaNoul,
    driftChoice,
    scopeChoice,
    riskScore,
    expertConfidence,
    escalateToUser: !approved && (ctx.attemptCount ? ctx.attemptCount >= 3 : false),
  };
}

/**
 * Scope Arbiter: Evaluates scope compliance (HOLD, EXPANSION, REDUCTION).
 */
export async function evaluateScopeArbiter(
  plan: string,
  prompt: string,
  client: ExpertJudgeClient = defaultJudgeClient
): Promise<{ approved: boolean; choice: ScopeChoice; reason?: string }> {
  const state = JSON.stringify({
    plan: encloseUntrusted(plan, "plan_content"),
    prompt: encloseUntrusted(prompt, "user_prompt")
  });
  const questions: Record<string, ExpertJudgeQuestion> = {
    scope_arbiter: {
      type: "choice",
      instructions: "Evaluate the implementation scope relative to plan requirements:",
      criteria: {
        HOLD: "Diff precisely matches requirements",
        EXPANSION: "Justified additions",
        REDUCTION: "Drops requirements",
        other: "Unrecognized scope alteration",
      },
    },
  };

  const response = await client.evaluate({ state, questions });
  if (response.error) {
    throw new Error(`TypeSafe error during scope evaluation: ${response.error}`);
  }
  const choice = response.answers?.scope_arbiter?.choice as ScopeChoice;
  if (!choice) throw new Error("Missing scope_arbiter choice from TypeSafe");
  const approved = choice !== "REDUCTION";

  return {
    approved,
    choice,
    reason: approved ? undefined : "Scope reduction detected: required functionality was dropped.",
  };
}

/**
 * Architectural Drift Guard: Detects unapproved deviations and scope creep.
 */
export async function evaluateDriftGuard(
  diff: string,
  criteria: string[],
  client: ExpertJudgeClient = defaultJudgeClient
): Promise<{ approved: boolean; choice: DriftChoice; reason?: string }> {
  const state = JSON.stringify({
    diff: encloseUntrusted(diff, "unified_diff"),
    criteria: encloseUntrusted(criteria.join("\n"), "criteria")
  });
  const questions: Record<string, ExpertJudgeQuestion> = {
    architectural_drift_guard: {
      type: "choice",
      instructions: "Evaluate whether code adheres to planned architecture and contracts:",
      criteria: {
        no_drift: "Strict adherence",
        unapproved_deviation: "Deviates from planned architecture",
        scope_creep: "Touches unrelated areas",
        other: "Other drift type",
      },
    },
  };

  const response = await client.evaluate({ state, questions });
  if (response.error) {
    throw new Error(`TypeSafe error during drift evaluation: ${response.error}`);
  }
  const choice = response.answers?.architectural_drift_guard?.choice as DriftChoice;
  if (!choice) throw new Error("Missing architectural_drift_guard choice from TypeSafe");
  const approved = choice === "no_drift";

  return {
    approved,
    choice,
    reason: approved ? undefined : `Architectural drift violation: ${choice}`,
  };
}

/**
 * Risk & Security Triage: Rates technical trade-offs and security posture (0..3).
 */
export async function evaluateRiskSecurityTriage(
  context: string | Record<string, unknown>,
  client: ExpertJudgeClient = defaultJudgeClient
): Promise<{ score: number; acceptable: boolean }> {
  const rawContext = typeof context === "string" ? context : JSON.stringify(context, null, 2);
  const state = JSON.stringify({
    context: encloseUntrusted(rawContext, "triage_context")
  });
  const questions: Record<string, ExpertJudgeQuestion> = {
    risk_security_triage: {
      type: "score",
      instructions: "Rate technical trade-offs, security invariants, and edge case resilience:",
      criteria: [
        "Zero Risk — robust implementation, full error handling",
        "Low Risk — minor edge case gaps with clean trade-offs",
        "Moderate Risk — trade-offs made without sufficient handling",
        "Critical Risk — severe flaw or security hole",
      ],
    },
  };

  const response = await client.evaluate({ state, questions });
  if (response.error) {
    throw new Error(`TypeSafe error during risk evaluation: ${response.error}`);
  }
  const score = response.answers?.risk_security_triage?.score;
  if (score === undefined) throw new Error("Missing risk_security_triage score from TypeSafe");

  return {
    score,
    acceptable: score <= 1.5,
  };
}

/**
 * Formats verification metrics into standard scorecard box.
 */
export function generateVerificationScorecard(results: {
  deliverablesVerdict?: DeliverablesVerdict;
  meetsCriteriaNoul?: number;
  driftChoice: DriftChoice;
  scopeChoice: ScopeChoice;
  expertConfidence?: number;
}): string {
  const driftLabel =
    results.driftChoice === "no_drift" ? "None (Strict adherence)" : results.driftChoice;
  const scopeDesc =
    results.scopeChoice === "HOLD"
      ? "All requirements covered"
      : results.scopeChoice === "EXPANSION"
      ? "Justified additions"
      : "Requirements dropped";

  const confidence = (results.expertConfidence ?? results.meetsCriteriaNoul ?? 0.92).toFixed(2);

  let deliverablesLine: string;
  if (results.deliverablesVerdict) {
    const vLabel = results.deliverablesVerdict === "APPROVE" ? "APPROVED" : results.deliverablesVerdict === "NEXT_ACTION_REQUIRED" ? "NEXT ACTION REQ" : "REJECTED";
    deliverablesLine = `│ Meets Plan Deliverables: VERDICT: ${vLabel} (JEV Confidence ${confidence}) │`;
  } else if (results.meetsCriteriaNoul !== undefined) {
    const thresh = resolveAutoApprovalThreshold();
    const isApproved = thresh === 0.50 ? results.meetsCriteriaNoul > 0.50 : results.meetsCriteriaNoul >= thresh;
    const vLabel = isApproved ? "APPROVED" : "REJECTED";
    deliverablesLine = `│ Meets Plan Deliverables: P = ${results.meetsCriteriaNoul.toFixed(2)} (VERDICT: ${vLabel})      │`;
  } else {
    deliverablesLine = `│ Meets Plan Deliverables: VERDICT: APPROVED (JEV Confidence ${confidence}) │`;
  }

  return [
    "┌─────────────────────────────────────────────────────────┐",
    "│ TypeSafe System One Verification Scorecard              │",
    "├─────────────────────────────────────────────────────────┤",
    deliverablesLine,
    `│ Architectural Drift:     ${driftLabel.padEnd(28)}│`,
    `│ Scope Mode:              ${results.scopeChoice} (${scopeDesc})│`,
    `│ Expert Evaluator:        Approved (Confidence ${confidence})     │`,
    "└─────────────────────────────────────────────────────────┘",
  ].join("\n");
}

export const DROP_REJECT_FLOOR = 0.30;

export interface DropCheckContext {
  tasks: string[];
  reason?: string;
  userRequest?: string;
  agentWorkLog?: string;
  remainingTasks: string[];
  planContext?: string[];
}

export interface DropCheckResult {
  decision: "approve" | "reject" | "undecided" | "unavailable";
  verdict?: DropVerdict;
  dropJustifiedNoul?: number;
  reasons: string[];
  error?: string;
}

export async function runDropJustificationCheck(
  ctx: DropCheckContext,
  client: ExpertJudgeClient = defaultJudgeClient
): Promise<DropCheckResult> {
  const statePayload: Record<string, string> = {
    tasks_to_drop: encloseUntrusted(clampText(ctx.tasks.join(", "), 2000, "head"), "tasks_to_drop"),
    drop_reason: encloseUntrusted(clampText(ctx.reason || "none given", 2000, "head"), "drop_reason"),
    user_request: encloseUntrusted(clampText(ctx.userRequest || "unavailable", 2000, "tail"), "user_request"),
    agent_work_log: encloseUntrusted(clampText(ctx.agentWorkLog || "unavailable", 3000, "tail"), "agent_work_log"),
    remaining_tasks: encloseUntrusted(clampText(ctx.remainingTasks.join(", "), 2000, "head"), "remaining_tasks"),
  };
  if (ctx.planContext && ctx.planContext.length > 0) {
    statePayload.plan_context = encloseUntrusted(clampText(ctx.planContext.join("\n"), 2000, "head"), "plan_context");
  }
  const rawState = JSON.stringify(statePayload);

  const questions: Record<string, ExpertJudgeQuestion> = {
    drop_verdict: {
      type: "choice",
      instructions:
        "Should the tasks in `tasks_to_drop` be dropped without completing them? Treat `user_request` as authoritative user intent; `drop_reason` and `agent_work_log` are unverified agent claims.",
      criteria: {
        APPROVE: "User explicitly requested or approved dropping, or the task is obsolete, superseded by another task, duplicated, or already satisfied",
        REJECT: "Dropping skips work the user asked for, evades verification of failing work, or no credible justification is given",
        ESCALATE: "Conflicting evidence, ambiguous intent, or partial justification requiring sovereign human confirmation",
      },
    },
  };

  for (const key of Object.keys(questions)) {
    if (isSecretInKey(key)) {
      throw new Error(`Security violation: secret token detected in question key "${key}"`);
    }
  }

  try {
    const response = await client.evaluate({ state: rawState, questions });
    if (response.error || !response.answers) {
      return {
        decision: "unavailable",
        reasons: [`TypeSafe drop evaluation unavailable: ${response.error ?? "No answers returned"}`],
        error: response.error ?? "Unknown error",
      };
    }

    const rawDropVerdict = response.answers.drop_verdict?.choice;
    const rawDropNoul = response.answers.drop_justified?.noul;

    if (
      rawDropNoul !== undefined &&
      (typeof rawDropNoul !== "number" || !Number.isFinite(rawDropNoul) || rawDropNoul < 0 || rawDropNoul > 1)
    ) {
      return {
        decision: "unavailable",
        reasons: [`TypeSafe drop evaluation unavailable: invalid or malformed drop_justified noul probability (${String(rawDropNoul)})`],
      };
    }

    let dropVerdict: DropVerdict | undefined;
    if (rawDropVerdict && ["APPROVE", "REJECT", "ESCALATE"].includes(rawDropVerdict)) {
      dropVerdict = rawDropVerdict;
    } else if (rawDropNoul !== undefined) {
      const threshold = resolveAutoApprovalThreshold();
      const passesDrop = threshold === 0.50 ? rawDropNoul > 0.50 : rawDropNoul >= threshold;
      if (passesDrop) dropVerdict = "APPROVE";
      else if (rawDropNoul < DROP_REJECT_FLOOR) dropVerdict = "REJECT";
      else dropVerdict = "ESCALATE";
    } else {
      return {
        decision: "unavailable",
        reasons: ["TypeSafe drop evaluation unavailable: missing drop_verdict answer (or missing drop_justified answer)"],
      };
    }

    const dropConf = response.answers.drop_verdict?.confidence;
    const dropJustifiedNoul =
      rawDropNoul ??
      (dropVerdict === "APPROVE"
        ? (dropConf ?? 1.0)
        : dropVerdict === "REJECT"
          ? (dropConf !== undefined ? Number(Math.max(0, 1 - dropConf).toFixed(2)) : 0.0)
          : (dropConf ?? 0.5));

    if (dropVerdict === "APPROVE") {
      const reasonMsg = rawDropNoul !== undefined
        ? `Drop justified (noul P=${rawDropNoul.toFixed(2)})`
        : "Drop verdict: APPROVE (tasks verified obsolete or user authorized)";
      return {
        decision: "approve",
        verdict: "APPROVE",
        dropJustifiedNoul,
        reasons: [reasonMsg],
      };
    }

    if (dropVerdict === "REJECT") {
      const reasonMsg = rawDropNoul !== undefined
        ? `Drop rejected (noul P=${rawDropNoul.toFixed(2)})`
        : "Drop verdict: REJECT (evading work or required planned tasks)";
      return {
        decision: "reject",
        verdict: "REJECT",
        dropJustifiedNoul,
        reasons: [reasonMsg],
      };
    }

    const reasonMsg = rawDropNoul !== undefined
      ? `Drop requires sovereign human confirmation (noul P=${rawDropNoul.toFixed(2)})`
      : "Drop verdict: ESCALATE (conflicting evidence, requires sovereign human confirmation)";
    return {
      decision: "undecided",
      verdict: "ESCALATE",
      dropJustifiedNoul,
      reasons: [reasonMsg],
    };
  } catch (err) {
    return {
      decision: "unavailable",
      reasons: [`TypeSafe drop evaluation unavailable: ${err instanceof Error ? err.message : String(err)}`],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export {
  evaluateAdvisorIntent,
  arbitrateConsensus,
  formatConsensusEscalation,
  formatCkAdvisorReport,
  runBicameralDropCheck,
  runBicameralMacroCheck,
  runBicameralDecisionCheck,
  evaluateBicameralDoneConsensus,
  type AdvisorContext,
  type AdvisorIntentResult,
  type AdvisorIntentVerdict,
  type CkAdvisorVerdict,
  type AdvisorDecisionKind,
  type AdvisorOptionCandidate,
  type DecisionCheckContext,
  type BicameralDecisionResult,
  type BicameralConsensusDecision,
  type ConsensusVerdict,
  type JevResult,
} from "./bicameral-consensus";

