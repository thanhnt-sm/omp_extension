# Technical Journal: True Advisor Calibration, Complete 0.80 Threshold Purge, and TypeSafe JEV State Fidelity

- **Date**: 2026-10-15
- **Workspace**: `D:/100.Software/Github/omp_extension`
- **Plan**: `plans/261015-advisor-judge-jev-true-calibration/plan.md`
- **ADR**: `docs/decisions/ADR-20261015-advisor-judge-jev-true-calibration.md`

---

## Context & Root Causes Resolved

1. **Advisor Fixed `0.90` Pathology (`src/bicameral-consensus.ts`)**:
   - **Root Cause**: `evaluateAdvisorIntent` on `operation === "done"` used a 36-verb alternation regex (`/pass|implement|...|check|...|review|plan|.../i`) that matched ~99% of active session work logs (including `[toolCall: read (...)]` entries) and returned a hardcoded `{ verdict: "ALLOW", confidence: 0.90 }`, with zero `DISALLOW` paths. Similarly, `evaluateAdvisorDecision` added flat `+0.25` and `+0.15` step weights to base `0.50` ($0.50 + 0.25 + 0.15 = 0.90$), and `runBicameralDecisionCheck` never updated `advisor.confidence` from JEV's response.
   - **Fix**: Replaced hardcoded `0.90` literals with continuous multi-signal token-overlap and verification density scoring (`extractContentTokens`, `computeTokenOverlap`), added first-class `DISALLOW` detection when `hasExplicitTestFailure` detects non-zero exit codes or failing assertions, bound JEV's calibrated `recommended_option.confidence` and `decision_clarity.noul` into `advisor.confidence`, and routed `driftChoice !== "no_drift"` / `scopeChoice === "REDUCTION"` (when `deliverables_verdict === "APPROVE"`) to `RECONCILE_PLAN` (`NEXT_ACTION_REQUIRED`) instead of `HUMAN_ESCALATION` on Attempt 1.

2. **Residual `0.80` / `0.30` / `0.70` Threshold Leaks (`src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `typesafe-planner.ts`)**:
   - **Root Cause**: `resolveAutoApprovalThreshold()` still defaulted to `0.80`, and `runPhaseMacroCheck`, `verifyTaskCompletion`, `generateVerificationScorecard`, `evaluatePlanDraft`, and `formatTaskReport` still enforced and printed `"below required threshold 0.80"`, `"Threshold >= 0.80"`, and `"(reject < 0.30)"`.
   - **Fix**: Aligned `resolveAutoApprovalThreshold()` default with the natural Bayesian boundary (`0.50`, where $P > 0.50$ affirms and $P \le 0.50$ requires action/rejection), removed all `0.80` / `0.30` / `0.70` threshold walls and strings from rejection messages, scorecards, and task reports, and governed Gate 2 and Drop Gate by categorical `choice` verdicts + natural Bayes consistency.

3. **TypeSafe JEV (`jev-latest`) Low-Score & False-Rejection Pipeline (`src/evidence-collector.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/payload-safety.ts`, `typesafe-planner.ts`)**:
   - **Root Cause**:
     - `extractCriteriaFromPlan(planContent, taskId)` ignored `taskId`, passing all checkboxes of an entire multi-phase plan into `task_requirements` for a single sub-task.
     - `runPhaseMacroCheck` clamped fields to `3,000`/`5,000` chars and wrapped them in `<tag>`, causing `sanitizeStateForTypeSafe` to clamp them a second time to `2,000`/`5,000` chars (or crush them to `950` chars when state > 28KB).
     - `summarizeUnifiedDiff` stripped `<unified_diff>` tags and deleted all implementation body lines on diffs > 14KB.
     - `constructGateQuestions` passed `string[]` criteria on `choice` and `noul` questions instead of `Record<string, string>`.
     - `truncatePayloadState` matched substring `"at "` in normal English prose as stack traces.
   - **Fix**: Made `extractCriteriaFromPlan` task-aware, added explicit sub-task scope instructions in `runPhaseMacroCheck` (so JEV does not penalize sub-tasks for unstarted future tasks or unconfigured `testCommand`), eliminated double-clamping and the 950-char cliff in `sanitizeStateForTypeSafe`, preserved `<unified_diff>` tags and contiguous implementation code in `summarizeUnifiedDiff`, converted `constructGateQuestions` criteria to `Record<string, string>`, broadened test-runner detection in `collectConversationContext`, and fixed `truncatePayloadState`.

---

## Verification

- **Workspace Test Suite (`bun test`)**: `319 pass, 0 fail` (`1,177 expect() calls` across `33 files`).
- **Deployment Target Sync (`node tools/sync-baseline.cjs`)**: Deployed and verified in `C:/Users/thant/Projects/omp_extension`.
