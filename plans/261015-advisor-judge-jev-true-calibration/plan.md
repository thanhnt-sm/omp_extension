---
title: "Advisor 0.90 Calibration, Zero 0.80 Thresholds, and JEV State Fidelity"
description: "Eliminate hardcoded 0.90 Advisor rubber-stamp confidences, purge all remaining 0.80/0.30/0.70 threshold walls and messages, and overhaul the TypeSafe JEV state & criteria fidelity pipeline."
status: in-progress
priority: P1
effort: "4h"
branch: master
tags: [typesafe, jev-latest, bicameral-consensus, advisor, calibration, tdd]
blockedBy: []
blocks: []
created: 2026-10-15
---

# Advisor 0.90 Calibration, Zero 0.80 Thresholds, and JEV State Fidelity

## Overview

End-to-end architectural and implementation overhaul (`ADR-20261015`) resolving the three core defects identified across recent `oh-my-pi` sessions:
1. **Advisor Fixed `0.90` Pathology (`src/bicameral-consensus.ts`)**: Replaces the overbroad 36-verb regex in `evaluateAdvisorIntent("done")` and the `0.50 + 0.25 + 0.15 = 0.90` bag-of-words formula in `evaluateAdvisorDecision` with continuous multi-signal evidence calibration, first-class `DISALLOW` paths when tests fail or code changes are absent, and live JEV confidence binding in `runBicameralDecisionCheck`, `runBicameralMacroCheck`, and `runBicameralDropCheck`.
2. **Complete `0.80` / `0.30` / `0.70` Threshold Elimination (`src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `typesafe-planner.ts`)**: Purges all `0.80` (`resolveAutoApprovalThreshold`) and `0.30` (`DROP_REJECT_FLOOR`) walls and error strings, governing Gate 2 and Drop Gate via categorical `choice` verdicts (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED` / `ESCALATE`) with natural Bayes consistency ($P = 0.50$).
3. **JEV State & Criteria Fidelity Pipeline (`src/evidence-collector.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/payload-safety.ts`, `typesafe-planner.ts`)**: Makes `extractCriteriaFromPlan` task-aware so sub-tasks are not judged against unstarted checkboxes of the entire plan, fixes `constructGateQuestions` dict `criteria` schema, aligns field budgets in `sanitizeStateForTypeSafe` without 950-char cliff amputation, preserves implementation lines in `summarizeUnifiedDiff`, broadens test-runner detection in `collectConversationContext`, and prevents `"at "` / `"# "` line scrambling in `truncatePayloadState`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Advisor JEV & Multi-Signal Calibration](./phase-01-advisor-jev-multi-signal-calibration.md) | Completed |
| 2 | [Zero 0.80 & 0.30 Threshold Walls](./phase-02-zero-0-80-0-30-threshold-walls.md) | Completed |
| 3 | [JEV State & Criteria Fidelity Pipeline](./phase-03-jev-state-criteria-fidelity-pipeline.md) | Completed |
| 4 | [TDD Suite & Baseline Sync](./phase-04-tdd-suite-baseline-sync.md) | Completed |

## Success Criteria
- [ ] Advisor (`evaluateAdvisorIntent`, `evaluateAdvisorDecision`, `runBicameralDecisionCheck`, `runBicameralMacroCheck`, `runBicameralDropCheck`) computes continuous multi-signal and JEV-backed confidence instead of hardcoded `0.90` constants, and emits `DISALLOW` when tests fail or required code evidence is missing.
- [ ] Zero `0.80`, `0.30`, or `0.70` threshold walls or messages remain in `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, or `typesafe-planner.ts`.
- [ ] `extractCriteriaFromPlan`, `constructGateQuestions`, `sanitizeStateForTypeSafe`, `summarizeUnifiedDiff`, `collectConversationContext`, and `truncatePayloadState` deliver clean, task-scoped state and valid dict `criteria` to TypeSafe System One (`jev-latest`).
- [ ] All unit and integration test suites pass (`bun test` exit code 0) and baseline is synchronized via `node tools/sync-baseline.cjs`.
