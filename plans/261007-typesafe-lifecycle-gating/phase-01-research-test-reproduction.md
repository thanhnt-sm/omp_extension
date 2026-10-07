---
phase: 1
title: "Research & Test Reproduction (TDD Red)"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Research & Test Reproduction (TDD Red)

## Overview
Author comprehensive test coverage in `tests/typesafe-lifecycle-gating.test.ts` to eliminate the **Zero Test Coverage Void** discovered during red-teaming:
- `grep 'handleTodoInterception'` $\rightarrow$ **0 matches** in `typesafe-planner.test.ts`
- `grep 'invariant violation'` $\rightarrow$ **0 matches** in `typesafe-planner.test.ts` and `tests/`
- `grep 'dropping or resetting'` $\rightarrow$ **0 matches** in `tests/`

This phase writes failing (TDD Red) tests exercising the exact behavior before any production code is touched.

## Requirements
- Functional:
  1. Reproduce false-positive invariant violation when `todo op: "init"` is invoked on an empty task list.
  2. Test invariant violation when `todo op: "init"` or `drop` is invoked on an active/uncompleted task list without human authorization.
  3. Verify that human authorization (`ctx.isHuman: true`, `ctx.authorized: true`, or `allowJudgeModification: true`) permits resetting tasks.
  4. Test Gate 1 test failure rejection format with `NEXT ACTIONS FOR AGENT` actionable remediation block.
  5. Test Gate 2 macro-check plan drift rejection format with `NEXT ACTIONS FOR AGENT` actionable remediation block.
  6. Test Plan completion loophole: attempting to edit `plan.md` to `status: completed` or running `plan-cli.cjs check` while tasks are pending/failed must be intercepted and rejected.

## Architecture
- Use `bun:test` harness mocking `pi.on("tool_call")` and `pi.sendMessage`.
- Ensure hermetic environment isolation using `createEnvScope`.
- Mock file system and execution context cleanly without polluting production state.

## Related Code Files
- Create: `tests/typesafe-lifecycle-gating.test.ts`
- Read: `typesafe-planner.ts`

## Implementation Steps (TDD Red)
1. Create `tests/typesafe-lifecycle-gating.test.ts`.
2. Implement Suite 1: Invariant Violation Edge Cases (Empty vs. Active lists).
3. Implement Suite 2: Actionable Remediation Guidance Structure.
4. Implement Suite 3: Dual-Gate Plan Closure Interception (`status: completed` and `plan-cli.cjs check`).
5. Run `bun test tests/typesafe-lifecycle-gating.test.ts` and confirm all 6 test cases fail cleanly against current baseline (TDD Red).

## Success Criteria
- [x] `tests/typesafe-lifecycle-gating.test.ts` exists and runs via `bun test`.
- [x] `grep 'invariant violation' tests/` returns >0 matches.
- [x] `grep 'dropping or resetting' tests/` returns >0 matches.
- [x] All new tests fail as expected on the unfixed codebase (Red verification confirmed).
