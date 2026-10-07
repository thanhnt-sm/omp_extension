---
phase: 2
title: "Lifecycle Invariant Relaxation & Guidance (TDD Green)"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Lifecycle Invariant Relaxation & Guidance (TDD Green)

## Overview
Implement the minimal code changes in `typesafe-planner.ts` to allow initial todo/plan creation when no active contracted tasks exist, while keeping invariant protection active when tasks are in flight, and appending actionable next-step guidance to all rejection errors.

## Requirements
- Functional:
  - If current contracted task count is 0, allow `op: "init"` without throwing invariant violation.
  - If contracted tasks exist and are uncompleted, block `op: "init"` or `op: "drop"` unless human authorized.
  - Enrich invariant violation error message with `NEXT ACTIONS FOR AGENT` directing to `ask` or `append`.
  - Enrich Gate 1 test failure message with `NEXT ACTIONS FOR AGENT` directing to test fixing.
  - Enrich Gate 2 semantic drift message with `NEXT ACTIONS FOR AGENT` directing to requirement alignment.

## Architecture
- Track contracted active task count or inspect registered todo state.
- In `handleTodoInterception`, differentiate empty bootstrap from mutative reset.
- Format structured error templates with remediation sections.

## Related Code Files
- Modify: `typesafe-planner.ts`

## Implementation Steps
1. Add state tracking for active contracted tasks or check session todo state in `typesafe-planner.ts`.
2. Relax `dropOrInit` invariant check: only trigger if active contracted tasks exist and no human auth is present.
3. Update error messages to include markdown instructions for the AI Agent.
4. Run `bun test tests/typesafe-lifecycle-gating.test.ts` to verify tests turn Green.

## Success Criteria
- [x] Initial `todo init` succeeds when starting fresh.
- [x] Mid-flow `todo init` or `drop` is blocked with actionable guidance.
- [x] Gate 1 & Gate 2 rejections contain actionable next steps.
- [x] All reproduction tests in Phase 1 pass cleanly.
