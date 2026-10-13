---
phase: 3
title: "Todo enforcement and agent guidance"
status: pending
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Todo enforcement and agent guidance

## Overview
Close the lifecycle completion gap where plans can be marked complete while active contracted tasks remain unfulfilled, and replace dead-end rejection strings with structured, machine-actionable prompt injections that direct the agent toward resolution.

## Requirements
- Functional:
  - Enforce the completion invariant across all plan closure surfaces:
    - Direct tool call to `plan-cli.cjs check <phase-id>`.
    - Direct file modification via `write` or `edit` writing `status: complete` or `status: completed` to plan files.
    - Todo completion operations (`op: "done"`).
  - Inject structured remediation prompt into agent context on rejection:
    - Current task name and contracted status.
    - Rejection category (e.g. `TESTS_FAILED`, `SEMANTIC_ALIGNMENT_LOW`, `UNAUTHORIZED_DROP`, `UNDECIDED_HUMAN_REJECTED`).
    - Exact evaluated evidence summary (tests run, diff summary, missing deliverables).
    - Prescribed next actions formatted as an imperative checklist.
- Non-functional:
  - Strict prevention of agent self-authorization: strip `params.isHuman`, `params.authorized`, `params.allowJudgeModification` from non-human execution contexts.
  - Mitigate prompt injection: escape and enclose untrusted file paths and agent arguments inside XML blocks.

## Architecture
```
                  Agent Attempts Plan Closure or Task Completion
                                        │
                                        ▼
                  [Plan & Task Completion Invariant Check]
                                        │
                   ┌────────────────────┴────────────────────┐
                   ▼                                         ▼
      activeContractedTasks.size > 0           activeContractedTasks.size === 0
                   │                                         │
                   ▼                                         ▼
            REJECT & INJECT                           ALLOW & ADVANCE
       Actionable Agent Guidance                      Execute Mutation
                   │
                   ▼
  Prompt Injection Format:
  ┌────────────────────────────────────────────────────────┐
  │ 🛑 [TypeSafe Verification Invariant Violation]         │
  │ Task: Stage all files and run security checks          │
  │ Reason: Drop rejected (gray-zone human rejected or     │
  │         unmet criteria).                              │
  │                                                        │
  │ NEXT ACTIONS REQUIRED FOR AGENT:                       │
  │ 1. Complete work for: "Stage all files..."             │
  │ 2. Run verification: "bun test <target>"              │
  │ 3. Execute `todo(op="done", task="...")`               │
  │ DO NOT attempt to mark plan complete until resolved.   │
  └────────────────────────────────────────────────────────┘
```

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `src/verification-gate.ts`
- Modify: `tests/typesafe-lifecycle-gating.test.ts`
- Modify: `tests/adversarial-compliance.test.ts`

## Implementation Steps
1. In `typesafe-planner.ts` (`handleTodoInterception` & tool call hook for `bash` / `write` / `edit`):
   - Unify the active task validation helper `assertNoActiveContractedTasks(actionName: string)`.
   - Intercept both `plan-cli.cjs check` invocations and direct plan file edits (`plan.md`, `phase-*.md`) attempting to write `status: completed` while `activeContractedTasks` is non-empty.
2. In `handleTodoInterception`:
   - Replace generic error strings with `buildActionableAgentGuidance(context)`.
   - For rejected drops, inject:
     ```text
     TypeSafe drop gate rejected dropping contracted tasks: [Task List].
     - Reason: [Evaluated JEV rationale]
     NEXT ACTIONS FOR AGENT:
     1. Complete the task(s) and mark them done with evidence, OR
     2. Provide explicit rationale in session chat if task was superseded, OR
     3. Ask the human explicitly via `ask` tool with specific tradeoff options.
     ```
3. Ensure the agent cannot bypass this check by re-initializing the todo list with `op: "init"` omitting active tasks unless human-authorized.

## Success Criteria
- [ ] Attempting `plan-cli check` with active contracted tasks throws an invariant violation and blocks.
- [ ] Direct file write of `status: complete` to `plan.md` is rejected while tasks remain active.
- [ ] Rejection messages contain deterministic, actionable step-by-step instructions.

## Risk Assessment
- Risk: Rejection loop if agent fails to parse or follow instructions.
  - Mitigation: Limit consecutive failures via the stall ratchet and force an escalation to human if the agent retries without modifying code or test commands.
