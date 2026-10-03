---
phase: 3
title: "OMP Extension Interception & Bridge Integration"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: OMP Extension Interception & Bridge Integration

## Overview

Bridges the Cook workflow runtime with the OMP native extension layer in `typesafe-planner.ts`. It registers the dedicated `typesafe_expert_review` tool to allow on-demand expert evaluations (Scope Arbiter, Drift Guard, Risk Triage) and enhances the runtime interception hook (`handleTodoInterception`) so that every task finalization (`todo: done`) or phase wrap-up enforces dual-cadence compliance with structured rollback messaging.

## Requirements

### Functional Requirements
- **Dedicated Expert Review Tool:**
  - Register `typesafe_expert_review` in `typesafe-planner.ts`.
  - Parameters:
    - `role`: enum (`"scope_arbiter"`, `"drift_guard"`, `"risk_security_triage"`).
    - `context`: string or object containing draft plan, git diff, or technical dilemma.
    - `criteria`: optional custom criteria array.
  - Returns: TypeSafe System One expert adjudication with score, choice, or probability and remediation feedback.
- **Enhanced Runtime Interception Hook:**
  - Intercept `tool_call` and `before_tool_call` for `tool === "todo"`.
  - When `op === "done"`:
    1. Run `runTaskMicroCheck()` (Gate 1 local deterministic). If tests fail, assertions deleted, or `.claude` touched, abort immediately with concrete reason.
    2. If task indicates phase completion or review gate: invoke `runPhaseMacroCheck()` (Gate 2 TypeSafe semantic verification).
    3. If verification fails: call `event.cancel()`, send structured remediation report via `pi.sendMessage`, and revert task state.
  - **Direct File Bypass Defense (RT-3):** Intercept `tool === "write"` and `tool === "edit"` targeting `todo.json` or `.todo*`. Disallow direct bypass of the verification gate via file modification.
- **Fail-Closed Human Escalation Delivery:**
  - If TypeSafe is offline or unauthenticated when completing a gated task, deliver an escalation message formatted for the `ask` tool to allow human override.

### Non-Functional Requirements
- **Zero Token Overhead on Broken Code:** If unit tests fail locally, zero calls leave the machine.
- **Safe Payload Bounding:** Payloads through `typesafe_expert_review` pass through `preparePayloadSafe()` ensuring $\le 32,768$ bytes.
- **Strict Typing:** No `any` or `as any` across registrations and handlers.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        typesafe-planner.ts                             │
├────────────────────────────────────────────────────────────────────────┤
│  Tool Registration:                                                    │
│    └─> typesafe_expert_review (scope_arbiter / drift_guard / triage)   │
│                                                                        │
│  Event Hooks:                                                          │
│    └─> pi.on("tool_call", handleTodoInterception)                      │
│        └─> Cadence 1: runTaskMicroCheck()                              │
│            └─> Fail? -> Cancel tool call + Send rejection diff         │
│            └─> Pass? -> (Phase Boundary?) -> Cadence 2 Macro-Check     │
│                         └─> Fail? -> Cancel tool call + Require fix    │
│                         └─> Offline? -> Escalate via ask dialog        │
└────────────────────────────────────────────────────────────────────────┘
```

## Related Code Files

- Modify: `typesafe-planner.ts`
- Create: `tests/cook-interception-bridge.test.ts`
- Import: `src/cook-expert-judge.ts`

## Implementation Steps (TDD Flow)

1. **Step 1: Test-First Bridge & Hook Integration (Red)**
   - Create `tests/cook-interception-bridge.test.ts`.
   - Write tests simulating:
     - `typesafe_expert_review` called with `role: "scope_arbiter"` -> returns structured scope assessment.
     - `typesafe_expert_review` called with `role: "drift_guard"` -> detects modified unrelated files.
     - `typesafe_expert_review` called with `role: "risk_security_triage"` -> scores implementation risk.
     - `todo: done` intercepted and blocked when unit tests fail.
     - `todo: done` intercepted and blocked when TypeSafe reports `meets_criteria < 0.70`.
     - `todo: done` approved when both Gate 1 and Gate 2 pass cleanly.
     - Network failure on `todo: done` triggers fail-closed escalation message.

2. **Step 2: Update typesafe-planner.ts (Green & Refactor)**
   - Register `typesafe_expert_review` with Zod validation.
   - Wire `src/cook-expert-judge.ts` functions into `handleTodoInterception`.
   - Verify tests pass with `bun test tests/cook-interception-bridge.test.ts`.

## Success Criteria

- [x] All tests in `tests/cook-interception-bridge.test.ts` pass with 100% assertions.
- [x] `typesafe_expert_review` tool registered and functional.
- [x] Task completion cannot bypass deterministic test passes or semantic criteria checks.
- [x] Fail-closed escalation notifies user via `ask` on network outages.

## Risk Assessment

- **Risk:** Interception hook slows down non-completion `todo` calls (e.g. `todo: view`, `todo: start`).
  - **Mitigation:** The hook inspects `op` immediately and early-returns for any operation other than `"done"` or `"rm"`, incurring zero overhead (<0.1ms).
