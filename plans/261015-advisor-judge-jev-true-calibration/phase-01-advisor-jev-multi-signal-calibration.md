---
phase: 1
title: "Advisor JEV & Multi-Signal Calibration"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Advisor JEV & Multi-Signal Calibration

## Overview
Replace hardcoded `0.90` / `0.85` / `0.95` confidence literals and rubber-stamp `ALLOW` regexes in `src/bicameral-consensus.ts` with genuine multi-signal evidence calibration, first-class `DISALLOW` negative-evidence detection, and live JEV confidence binding.

## Requirements
- Functional:
  - `evaluateAdvisorIntent("done")` must detect negative evidence (failing test exit codes, `FAIL` output, or empty diff on `code_change` tasks without passing build/test proof) and return `DISALLOW` (`block`), eliminating the need for post-hoc monkey-patching in `runBicameralMacroCheck`.
  - Compute continuous, non-constant confidence scores from actual evidence signals (task token overlap, test verification proof, diff/artifact breadth, user request alignment) rather than fixed `0.90` literals.
  - `evaluateAdvisorDecision` must compute proportional word-overlap ratios rather than flat `+0.25` / `+0.15` step jumps that always sum to `0.90`.
  - `runBicameralDecisionCheck` must bind `advisor.confidence` and option scores directly to JEV's `recommended_option.confidence`, `decision_clarity.noul`, and `risk_posture.score` when `client` returns answers.
  - `runBicameralMacroCheck` must map `driftChoice !== "no_drift"` or `scopeChoice === "REDUCTION"` (when `deliverables_verdict === "APPROVE"`) to `NEXT_ACTION_REQUIRED` instead of `ESCALATE` so the agent receives actionable remediation on Attempt 1.
  - `typesafe-planner.ts` drop interception must route through `runBicameralDropCheck` (or unified bicameral arbitration).
- Non-functional:
  - Maintain sub-millisecond synchronous execution for `evaluateAdvisorIntent` and zero extra HTTP round-trips on `todo(op="done")`.

## Implementation Steps
1. Update `src/bicameral-consensus.ts`:
   - Add helper `computeTokenOverlapRatio(source, target)` and `computeDoneEvidenceConfidence(ctx)` to produce calibrated confidence scores based on real evidence density instead of hardcoded `0.90`.
   - Add negative-signal checks in `evaluateAdvisorIntent("done")` (e.g., failing test output / non-zero exit code $\rightarrow$ `DISALLOW`; `code_change` task with empty diff, no artifacts, and no test/build proof $\rightarrow$ `UNCERTAIN` or `DISALLOW`).
   - Scope `CANCELLATION_PATTERNS` in `evaluateAdvisorIntent("drop")` so generic technical prompts (e.g., `"remove 0.80 threshold"`) do not false-positive as task cancellation unless they reference dropping/skipping tasks or match the task tokens.
   - In `runBicameralDecisionCheck`, update `advisor.confidence` from JEV's calibrated `recConf` and `clarity` instead of leaving the local heuristic value untouched.
   - In `runBicameralMacroCheck` and `evaluateBicameralDoneConsensus`, route drift/scope violations (`!jevMacro.approved && jevMacro.verdict === "APPROVE"`) to `NEXT_ACTION_REQUIRED` (`RECONCILE_PLAN`) when `!jevMacro.escalateToUser`, so Attempt 1 does not trigger a false `ESCALATE` popup.

## Success Criteria
- [ ] `evaluateAdvisorIntent` no longer returns a flat `0.90` on every `done` call and returns `DISALLOW` when tests fail.
- [ ] `runBicameralDecisionCheck` reflects JEV's `decision_clarity` and `recommended_option.confidence` in `advisor.confidence` and `report`.
- [ ] `bun test tests/bicameral-consensus.test.ts` passes with exit code 0.

## Related Files
- Modify: `src/bicameral-consensus.ts`
- Modify: `typesafe-planner.ts`
- Modify: `tests/bicameral-consensus.test.ts`
