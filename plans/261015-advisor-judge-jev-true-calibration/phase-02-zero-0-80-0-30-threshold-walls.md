---
phase: 2
title: "Zero 0.80 & 0.30 Threshold Walls"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Zero 0.80 & 0.30 Threshold Walls

## Overview
Completely eliminate all remaining `0.80` (`resolveAutoApprovalThreshold`), `0.30` (`DROP_REJECT_FLOOR`), and `0.70` numerical threshold walls and diagnostic strings across `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, and `typesafe-planner.ts`.

## Requirements
- Functional:
  - Update `resolveAutoApprovalThreshold()` in `src/verification-gate.ts` to default to the natural Bayes midpoint `0.50` (while still honoring explicit `TYPESAFE_AUTO_APPROVAL_THRESHOLD` overrides if set in unit tests) and set `DROP_REJECT_FLOOR = 0.50` (natural Bayes boundary).
  - Remove all `"below required threshold 0.80"`, `"vs threshold 0.80"`, `"below 0.80 threshold"`, `"below 0.70 threshold"`, `"(Threshold >= 0.80)"`, `"(reject < 0.30)"`, and `"undecided gray zone [0.30, 0.80)"` strings from `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`, and `typesafe-planner.ts`.
  - In `runPhaseMacroCheck` (`src/cook-expert-judge.ts`) and `verifyTaskCompletion` (`src/verification-gate.ts`), rely on JEV's categorical `deliverables_verdict` (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED`) with natural Bayes consistency ($P < 0.50$ downgrades contradictory `APPROVE` to `NEXT_ACTION_REQUIRED`; when only `meets_criteria` noul is provided by a mock, $P \ge 0.50 \rightarrow \text{APPROVE}$, $P < 0.50 \rightarrow \text{REJECT}$ / `NEXT_ACTION_REQUIRED`).
  - In `runDropJustificationCheck` (`src/cook-expert-judge.ts`), rely on categorical `drop_verdict` (`APPROVE` | `REJECT` | `ESCALATE`) with natural Bayes fallback on `drop_justified.noul` ($P \ge 0.50 \rightarrow \text{APPROVE}$).
  - In `evaluatePlanDraft` (`src/plan-evaluator.ts`), use natural Bayes $P \ge 0.50$ for `task_actionability` and `claude_isolation_adherence` without hardcoded `0.70` / `0.80` walls.
- Non-functional:
  - Preserve full backward compatibility for exported function signatures.

## Implementation Steps
1. Modify `src/verification-gate.ts`:
   - Change `resolveAutoApprovalThreshold()` default from `0.80` to `0.50`.
   - Remove threshold-based rejection wording in `verifyTaskCompletion`; report JEV's categorical verdict and calibrated probability directly.
2. Modify `src/cook-expert-judge.ts`:
   - In `runPhaseMacroCheck`, remove `rawMeetsCriteria < threshold` (`0.80`) branches and report categorical verdict + calibrated `P=...` clearly without `"below required threshold 0.80"`.
   - In `generateVerificationScorecard`, display calibrated `P = ...` without `(Threshold >= 0.80)`.
   - In `runDropJustificationCheck`, replace the `[0.30, 0.80)` gray-zone wall with categorical `drop_verdict` + natural Bayes $P = 0.50$ fallback.
3. Modify `src/plan-evaluator.ts` and `typesafe-planner.ts`:
   - Replace `< 0.70` and `< 0.80` checks in `src/plan-evaluator.ts` with natural Bayes `< 0.50` (`resolveAutoApprovalThreshold()`).
   - Update `formatTaskReport` in `typesafe-planner.ts:774` to print `Judge: drop_justified=${r.scores.dropJustified.toFixed(2)}` without `(reject < 0.30)`.

## Success Criteria
- [ ] `grep` across `src/` and `typesafe-planner.ts` confirms zero `0.80` threshold walls or `(reject < 0.30)` strings.
- [ ] `bun test tests/cook-expert-judge.test.ts tests/verification-gate.test.ts tests/plan-evaluator.test.ts tests/todo-drop-gate.test.ts` passes with exit code 0.

## Related Files
- Modify: `src/verification-gate.ts`
- Modify: `src/cook-expert-judge.ts`
- Modify: `src/plan-evaluator.ts`
- Modify: `typesafe-planner.ts`
