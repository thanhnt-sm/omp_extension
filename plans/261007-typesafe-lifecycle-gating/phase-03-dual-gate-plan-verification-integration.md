---
phase: 3
title: "Dual Gate Plan Verification Integration (TDD Refactor)"
status: completed
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Dual Gate Plan Verification Integration (TDD Refactor)

## Overview
Plug the critical loophole identified during adversarial red-teaming:
`grep 'plan-cli'` and `grep 'status: completed'` in `typesafe-planner.ts` return **0 matches**. This proves that currently, `typesafe-planner.ts` ONLY intercepts the `todo` tool, completely ignoring plan files (`plan.md`, `phase-*.md`) and `plan-cli.cjs` execution! An AI Agent can easily bypass TypeSafe verification by never calling `todo done`, and instead directly editing `plan.md` to `status: completed` or executing `plan-cli.cjs check <phase-id>` via `bash`.

This phase introduces:
1. File Write/Edit Interception for `plans/**/plan.md` and `plans/**/phase-*.md`.
2. Bash Tool Interception for `plan-cli.cjs check` commands.
3. Enforcement that Plan/Phase closure is strictly gated by the same Dual Verification Gate (Gate 1 local tests + Gate 2 TypeSafe semantic alignment).

## Requirements
- Functional:
  - Intercept `write` and `edit` tools when modifying `plans/**/plan.md` or `plans/**/phase-*.md` if the change sets `status: completed` or changes phase status to `completed`.
  - Intercept `bash` tool calls containing `plan-cli.cjs check` or `plan-cli.cjs check <phase>`.
  - If uncompleted tasks remain in the active task list OR Gate 1 (tests) / Gate 2 (drift) fail, reject the tool call with an actionable remediation block:
    ```
    Plan closure rejected by TypeSafe Dual Verification Gate:
    - Uncompleted contracted tasks exist.
    - Test suite failed or plan drift detected.
    NEXT ACTIONS FOR AGENT:
    1. Resolve all uncompleted tasks using tests and code edits.
    2. Ensure `bun test` passes cleanly.
    3. Verify all requirements from the plan before marking completed.
    ```
  - Allow plan creation and draft modifications freely (`status: pending`, `status: in-progress`).

## Architecture & Code Changes
- In `typesafe-planner.ts`:
  - Enhance `handleTodoInterception` into `handleLifecycleInterception`.
  - In `write`/`edit` handler: Detect if target path matches `plans/**/*.md` and content contains `status:\s*completed` or status toggles.
  - In `bash` handler: Intercept commands executing `plan-cli.cjs check`.
  - Run `runTaskMicroCheck` (Gate 1) and `runPhaseMacroCheck` (Gate 2) before allowing the status change.

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `tests/typesafe-lifecycle-gating.test.ts`

## Implementation Steps (TDD Flow)
1. **Red Test:** Add tests in `tests/typesafe-lifecycle-gating.test.ts`:
   - Test that `edit` on `plans/test-plan/plan.md` setting `status: completed` throws when tests fail.
   - Test that `bash` running `plan-cli.cjs check 01` throws when tests fail.
2. **Green Implementation:**
   - Add regex detectors: `/plans\/.*\/plan\.md$/i` and `/status:\s*completed/i`.
   - Add bash command detector for `plan-cli.*check`.
   - Connect both to `runTaskMicroCheck` and `runPhaseMacroCheck`.
3. **Refactor & Hardening:**
   - Ensure clean actionable error format.
   - Verify performance impact is minimal (<100ms when not completing).

## Success Criteria
- [x] `grep 'plan-cli' typesafe-planner.ts` returns active interception matches.
- [x] `grep 'status:\s*completed' typesafe-planner.ts` returns active interception matches.
- [x] Agent cannot bypass `todo` by writing `status: completed` directly to plan files.
- [x] Agent cannot bypass `todo` by running `plan-cli.cjs check` in `bash`.
- [x] 100% tests passing in `tests/typesafe-lifecycle-gating.test.ts`.
