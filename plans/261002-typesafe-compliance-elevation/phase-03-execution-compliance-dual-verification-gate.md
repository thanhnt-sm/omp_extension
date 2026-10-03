---
phase: 3
title: "Execution Compliance & Dual Verification Gate"
status: completed
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Execution Compliance & Dual Verification Gate

## Overview

Establishes the runtime enforcement barrier that intercepts task completion signals (e.g. `todo: done` or subagent yields). It executes a two-tier verification pipeline: **Gate 1** executes fast, zero-token deterministic checks locally (clean Git working tree, zero LSP errors, test suite exit code 0). If and only if Gate 1 succeeds, **Gate 2** transmits tamper-proof OS evidence to TypeSafe System One to verify that the implementation genuinely satisfies the plan criteria (`meets_criteria`) without introducing unapproved architectural drift (`plan_drift`).

To strictly protect the user's Anthropic account, all semantic verification traffic routes exclusively to TypeSafe's dedicated endpoint (`api.typesafe.ai`), consuming zero Claude tokens and zero Anthropic rate-limits.

## Requirements

### Functional Requirements
- **Task Interception:** Intercept the `todo` tool when called with `op: "done"` or `op: "rm"`.
- **Gate 1: Deterministic Verification (Local, Zero-Token, Fail-Fast)**
  1. **Working Tree Cleanliness:** Verify no uncommitted / unreferenced scratch files left in workspace.
  2. **Zero Compilation/LSP Errors:** Check language server diagnostics for modified files. If type errors exist, immediately reject completion.
  3. **Mandatory Test Execution:** Execute the project/task test suite. Exit code MUST be exactly `0`. If tests failed, threw exceptions, or were omitted, reject completion with error details.
  4. **Claude Zero-Touch Audit:** Verify that no files within `~/.claude/` or `.claude/` were touched or modified by the task.
- **Gate 2: Semantic Verification (TypeSafe System One)**
  1. Assemble ground-truth state via `TaskEvidenceCollector` (Phase 1).
  2. Dispatch verification questions:
     - `meets_criteria` (Noul): Probability that the unified diff and test output completely fulfill the acceptance criteria ($P \ge 0.70$).
     - `plan_drift` (Choice): `no_drift` (strictly matches plan), `unapproved_deviation` (modified unrelated files or altered design), `scope_creep` (added unrequested features).
     - `claude_account_untouched` (Noul): Probability that the implementation remains 100% isolated from Anthropic credentials ($P \ge 0.99$).
  3. **Pass Criteria:** `meets_criteria.noul >= 0.70` AND `plan_drift.choice === "no_drift"` AND `claude_account_untouched.noul >= 0.99`.
- **Enforcement Action:**
  - On Rejection: Revert the task state to `in_progress`, inject the concrete failure report into the conversation, and require agent remediation.
  - On Auth/Network Failure: Do NOT permit automatic pass. Trigger user escalation via `ask` tool to request manual review.

### Non-Functional Requirements
- **Performance:** Gate 1 deterministic checks must conclude in < 1500ms.
- **No Evasion:** Prevent the agent from circumventing Gate 2 by calling completion tools out-of-order.
- **Zero Anthropic Billing:** Verification runs entirely outside Anthropic APIs.

## Architecture

```
Agent issues `todo: done` for Task X
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                 src/verification-gate.ts                    │
│             `verifyTaskCompletion(taskId)`                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
     [GATE 1: Deterministic Local Checks]
     ├── LSP Diagnostics: 0 errors?
     ├── Git Working Tree: consistent?
     ├── Claude Zero-Touch: 0 edits to ~/.claude?
     └── Test Runner: Exit code == 0?
                 │
         ┌───────┴───────┐
      [FAIL]          [PASS]
         │               │
         ▼               ▼
   Reject `done`    [GATE 2: TypeSafe Semantic Gate]
   Zero API Cost    Assemble Evidence via `TaskEvidenceCollector`
   Demand Fix            │
                         ▼
                    Evaluate `meets_criteria`, `plan_drift`,
                    and `claude_account_untouched`
                         │
                 ┌───────┴───────┐
              [PASS]          [FAIL]
         noul >= 0.70       noul < 0.70 or drift != "no_drift"
         drift == "no_drift" or claude touchpoint failed
         untouched >= 0.99       │
                 │               ▼
                 │         Reject `done`
                 ▼         Revert task to `in_progress`
        Approve `done`     Inject remediation diff
```

## Atomic Micro-Evaluation Checkpoints (TypeSafe System One)

| Micro-Check | Target Invariant | Question Key | Question Type | Pass Threshold | Fail Action |
|---|---|---|---|---|---|
| **MC-3.1** | Deterministic Integrity | `deterministic_pass` | `noul` | P(pass) $\ge 0.90$ | Gate 1 blocks immediately (zero token cost). |
| **MC-3.2** | Criteria Fulfillment | `meets_criteria` | `noul` | P(fulfill) $\ge 0.70$ | Gate 2 blocks; task returned to `in_progress`. |
| **MC-3.3** | Anti-Drift Defense | `plan_drift` | `choice` | `no_drift` | Gate 2 blocks; require rollback of unauthorized changes. |
| **MC-3.4** | Claude Account Untouched | `claude_account_untouched` | `noul` | P(untouched) $\ge 0.99$ | Hard Security Block: flag potential credential leakage. |
| **MC-3.5** | Fail-Closed Escalation | `fail_closed_enforced` | `noul` | P(escalates) $\ge 0.95$ | Trigger interactive `ask` tool dialog on any API error. |

## Related Code Files

- Create: `src/verification-gate.ts`
- Create: `tests/verification-gate.test.ts`
- Modify: `typesafe-planner.ts`

## Implementation Steps (TDD Flow)

1. **Step 1: Test-First Gate Verification & Isolation (Red)**
   - Create `tests/verification-gate.test.ts`.
   - Write test scenarios:
     - Attempting `todo: done` when test suite fails (exit code 1) $\rightarrow$ Gate 1 blocks, no remote call made.
     - Attempting `todo: done` when LSP reports diagnostics errors $\rightarrow$ Gate 1 blocks.
     - Attempting `todo: done` when modified files include `.claude/config` $\rightarrow$ Gate 1 blocks immediately on boundary violation.
     - Gate 1 passes, but TypeSafe reports `meets_criteria.noul = 0.45` $\rightarrow$ Gate 2 blocks, reverts to in-progress.
     - Gate 1 passes, but TypeSafe reports `plan_drift = "unapproved_deviation"` $\rightarrow$ Gate 2 blocks.
     - Gate 1 passes and TypeSafe reports `meets_criteria.noul = 0.94` + `no_drift` + `claude_account_untouched = 1.0` $\rightarrow$ Gate approves completion.
     - TypeSafe offline/unauthorized during task completion $\rightarrow$ Escalates to `ask` tool (never auto-passes).

2. **Step 2: Implement Dual Verification Gate (Green & Refactor)**
   - Implement `src/verification-gate.ts`.
   - Implement `checkDeterministicPreconditions()`.
   - Implement `checkSemanticCompliance()`.
   - Wire with `typesafe_judge` client.
   - Verify tests pass with `bun test tests/verification-gate.test.ts`.

3. **Step 3: Hook Integration into OMP Runtime**
   - Intercept `todo` tool executions in `typesafe-planner.ts`.
   - Add rollback handlers when validation fails.
   - Verify complete test suite.

## Success Criteria

- [x] All tests in `tests/verification-gate.test.ts` pass with 100% assertions.
- [x] Tasks cannot be marked done with failing tests or broken types.
- [x] Zero Claude/Anthropic tokens consumed by the verification loop.
- [x] Agent hallucinations ("I have thoroughly verified this") without real test proof are stopped cold.
- [x] Dual-gate latency stays under 1.5s overhead.

## Risk Assessment

- **Risk:** Legitimate code refactor flagged as `unapproved_deviation`.
  - **Mitigation:** The prompt criteria for `no_drift` explicitly permits implementation details not mentioned in the plan as long as interfaces and deliverables remain intact.
- **Risk:** Test runner command not configured in plan.
  - **Mitigation:** Fall back to auto-detecting test runner (`bun test`, `npm test`, `cargo test`, `pytest`). If no runner detected, prompt user via `ask` for the verification command.
