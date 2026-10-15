---
phase: 4
title: "TDD Suite & Baseline Sync"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: TDD Suite & Baseline Sync

## Overview
Update and expand unit, integration, and adversarial test suites in `tests/*.test.ts`, run the full `bun test` suite, verify live `xd://typesafe_judge`, `xd://typesafe_advisor`, `xd://typesafe_elevate_plan`, and `xd://typesafe_verify_completion` calls, deploy to `C:/Users/thant/Projects/omp_extension` via `node tools/sync-baseline.cjs`, and write the technical journal entry.

## Requirements
- Functional:
  - Add regression tests in `tests/bicameral-consensus.test.ts`, `tests/cook-expert-judge.test.ts`, `tests/verification-gate.test.ts`, `tests/judge-input-fidelity.test.ts`, and `tests/evidence-collector.test.ts` covering:
    1. Advisor non-0.90 calibrated confidence and `DISALLOW` on failing tests / empty code diff.
    2. Complete absence of `0.80` / `0.30` / `0.70` threshold walls in Gate 2, Drop Gate, and Plan Evaluator.
    3. Task-scoped criteria extraction in `extractCriteriaFromPlan`, dict `criteria` in `constructGateQuestions`, non-destructive diff summarization in `summarizeUnifiedDiff`, and no double-clamping in `sanitizeStateForTypeSafe`.
  - Run `bun test` across all test files with 0 failures.
  - Run `node tools/sync-baseline.cjs` to synchronize and verify the deployment target `C:/Users/thant/Projects/omp_extension`.
  - Record a technical journal entry in `docs/journals/2026-10-15-advisor-judge-jev-true-calibration.md`.

## Implementation Steps
1. Update existing tests in `tests/*.test.ts` that asserted legacy `0.80` / `0.30` threshold strings or hardcoded `0.90` Advisor confidences, and add new regression tests for all 3 phases.
2. Run `bun test` and verify 100% pass rate.
3. Smoke-test `xd://typesafe_advisor`, `xd://typesafe_judge`, `xd://typesafe_elevate_plan`, and `xd://typesafe_verify_completion`.
4. Execute `node tools/sync-baseline.cjs` and verify deployment target tests pass.
5. Mark all phases checked via `plan-cli.cjs check` and write `docs/journals/2026-10-15-advisor-judge-jev-true-calibration.md`.

## Success Criteria
- [ ] `bun test` passes 100% of test suites with 0 failures.
- [ ] `node tools/sync-baseline.cjs` succeeds and verifies `C:/Users/thant/Projects/omp_extension`.
- [ ] Live TypeSafe tools return calibrated verdicts without hardcoded `0.90` or `0.80` walls.

## Related Files
- Modify: `tests/bicameral-consensus.test.ts`
- Modify: `tests/cook-expert-judge.test.ts`
- Modify: `tests/verification-gate.test.ts`
- Modify: `tests/plan-evaluator.test.ts`
- Modify: `tests/todo-drop-gate.test.ts`
- Modify: `tests/judge-input-fidelity.test.ts`
- Create: `docs/journals/2026-10-15-advisor-judge-jev-true-calibration.md`
