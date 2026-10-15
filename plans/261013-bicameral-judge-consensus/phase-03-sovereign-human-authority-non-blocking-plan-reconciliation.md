---
phase: 3
title: "Sovereign Human Authority & Non-Blocking Plan Reconciliation"
status: completed
priority: P1
effort: "6h"
dependencies: [2]
---

# Phase 3: Sovereign Human Authority & Non-Blocking Plan Reconciliation

## Overview
Implement the Sovereign Human Invariant in `typesafe-planner.ts` ensuring that human decisions unconditionally unblock actions, and replace terminal blocking exceptions with an Adaptive Plan Reconciliation loop that converts judge/advisor feedback into executable plan revisions.

## Requirements
- Functional:
  - **Sovereign Human Override**: When a human approves a task drop or plan status mutation (via `ui.confirm`, explicit user message in conversation, or `ctx.isHuman`), the decision is permanently recorded in `host-authorization`. Downstream verification gates are strictly forbidden from canceling or re-prompting.
  - **Non-Blocking Plan Reconciliation**:
    - When Gate 1/2 or Bicameral Consensus returns `NEXT_ACTION_REQUIRED` or rejected deliverables, the interceptor must NOT call `throw new Error(...)` to abort the agent session.
    - Instead, it formats an **Adaptive Plan Delta** (`<plan_reconciliation>`) extracting the exact missing requirements, synthesizes an updated `todo` proposal, and steers the agent/human to accept the revised plan.
    - If the human approves the reconciliation proposal, the agent proceeds immediately without terminal failure loops.
  - Eliminate the clean-build dead-end bug (`omp bị lỗi không thoát ra được`) by allowing drops of obsolete tasks when human confirms or when verified clean build evidence is provided.
- Non-functional:
  - Zero terminal crashes: Agents are guided towards plan adaptation rather than trapped in rigid exception cycles.
  - Audit logging: Every human override and plan adaptation is durably recorded in task reports.

## Architecture
```
[Agent calls: todo done / todo drop / plan status]
                         │
        Is Human Authorized (isHumanAuthorized)?
         ├── YES ──► EXECUTE IMMEDIATELY (Zero Gates, Zero Block)
         └── NO  ──► Run Bicameral Consensus Engine
                         │
                 Verdict Analysis
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
     AUTO-EXECUTE    ESCALATE        NEXT ACTIONS /
     (Both Agree)    (Conflict)      MISSING WORK
         │               │               │
      Proceed       UI Confirm      DO NOT THROW FATAL ERROR
                         │               │
                    Human Decides   Synthesize Plan Delta
                    (Sovereign)     Update Todo & Plan.md
                         │          Present to Human & Continue
                    Record Auth
```

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `src/remediation-generator.ts`
- Create: `tests/plan-reconciliation.test.ts`
- Modify: `tests/todo-drop-gate.test.ts`
- Modify: `tests/typesafe-lifecycle-gating.test.ts`

## Implementation Steps
1. **TDD Test Suite (`tests/plan-reconciliation.test.ts`)**:
   - Test: `todo drop` with human UI confirmation immediately removes tasks from `activeContractedTasks` and passes downstream tool execution without throw.
   - Test: `todo done` with missing deliverables emits structured `<plan_reconciliation>` delta and does not crash the agent runtime.
   - Test: Plan check after human drop confirmation permits `status: completed` without blocking.
2. **Refactor `handleTodoInterception` in `typesafe-planner.ts`**:
   - Check `isHumanAuthorized` upfront: if true, immediately execute mutation and update `activeContractedTasks`, bypassing remote calls.
   - Wire in `runBicameralDropCheck` and `runBicameralMacroCheck` from `src/bicameral-consensus.ts`.
   - On `HUMAN_ESCALATION`, invoke `ui.confirm` with full transparent context (Advisor reasoning, JEV reasoning, user request).
   - If human confirms, set `isHumanAuthorized = true`, record `host-authorization`, and execute immediately.
3. **Implement Adaptive Plan Reconciliation**:
   - In `src/remediation-generator.ts`, create `synthesizePlanDelta(reasons: string[], nextActions: string[])`.
   - When a task cannot be completed as-is, return actionable directives that instruct the agent to update its plan and present the amendment to the user, eliminating the unyielding `throw new Error(...)` trap.
4. **Verification**:
   - Run `bun test tests/plan-reconciliation.test.ts`.
   - Run `bun test tests/todo-drop-gate.test.ts`.

## Success Criteria
- [ ] Human approval (via UI confirm or chat) unconditionally executes the operation with zero secondary blocking.
- [ ] No unhandled terminal exceptions when a task requires next actions; structured plan adaptation allows smooth continuation.
- [ ] 100% tests in `plan-reconciliation.test.ts` and `todo-drop-gate.test.ts` pass cleanly.

## Risk Assessment
- Risk: Agent enters an infinite loop repeatedly attempting reconciliation without addressing root issues.
  - Mitigation: Bounded ratchet cap (max 2 reconciliation iterations per task before requiring direct human chat steering).
