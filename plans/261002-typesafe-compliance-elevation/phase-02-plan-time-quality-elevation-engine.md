---
phase: 2
title: "Plan-Time Quality Elevation Engine"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Plan-Time Quality Elevation Engine

## Overview

Implements the 3-question evaluation engine that vets implementation plans before they can be persisted to disk or hydrated into execution tasks. By evaluating draft plans through TypeSafe System One against calibrated rubrics for Scope & Boundary, Algorithm & Edge-Cases, and Task Actionability, this phase eliminates vague, superficial, or incomplete plans at the source.

Additionally, this engine enforces the **Claude Policy & Account Boundary**: any plan proposing modifications to `~/.claude/**` configuration, touching Anthropic credentials, or routing automated traffic through Claude Code auth is rejected immediately.

## Requirements

### Functional Requirements
- **Plan Interception:** Intercept draft plan generation prior to finalizing `plan.md` and phase files.
- **Tri-Criteria Evaluation Rubric:**
  1. **`scope_mode` (Choice):** Evaluates if the plan expands beyond requirements, holds true to scope, or reduces requested features (`EXPANSION`, `HOLD`, `REDUCTION`). Enforce tighten-only: `REDUCTION` is never accepted as justification to drop requirements.
  2. **`algorithm_depth` (Score):** Rates the plan along 4 ordered levels:
     - Level 0: Superficial/No edge cases ("implement feature X").
     - Level 1: Basic happy-path only; lacks error handling or concurrency handling.
     - Level 2: Well-structured; covers error recovery, edge cases, and data validation.
     - Level 3: Production-grade; comprehensive boundary invariants, rollback plans, and telemetry.
     - **Threshold:** Requires continuous `score >= 2.0` to pass.
  3. **`task_actionability` (Noul):** Probability that every task in the plan has measurable, test-verifiable acceptance criteria with concrete file paths ($P(\text{actionable}) \ge 0.70$).
- **Claude Zero-Touch Plan Filter:**
  - Automated check: If the plan files prescribe modifying, deleting, or referencing `~/.claude/` files or Anthropic OAuth/token mechanics, reject the plan with `claude_isolation_adherence` failure.
- **Structured Feedback Injection:** When a draft fails any threshold, parse the distribution details and return actionable remediation instructions to the agent.
- **Bounded Retry Loop:** Allow at most 2 automated revisions. If the 3rd attempt fails, halt autonomous loop and escalate to the user with a structured diff via the `ask` tool.
- **Graceful Fail-Safe:** If TypeSafe API is completely unavailable, trigger user confirmation rather than allowing an unvetted plan to pass silently.

### Non-Functional Requirements
- **Latency:** Single multi-question judgment must resolve in < 600ms.
- **Wire Parity:** Strictly conform to TypeSafe System One wire format (criteria dict for choice/noul, ordered array for score).

## Architecture

```
Draft Plan Generated
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                 src/plan-evaluator.ts                       │
│              `evaluatePlanDraft(draftMarkdown)`             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                Dispatches to `typesafe_judge`
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeSafe System One                      │
│  - scope_mode (choice: EXPANSION / HOLD / REDUCTION)        │
│  - algorithm_depth (score: 4 levels, threshold >= 2.0)     │
│  - task_actionability (noul: threshold >= 0.70)             │
│  - claude_isolation_adherence (noul: threshold >= 0.99)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
            Evaluates Results against Decision Lattice
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
   [ALL PASS]                                  [ANY FAIL]
  score >= 2.0                                score < 2.0
  noul >= 0.70                                or noul < 0.70
  claude_isolation >= 0.99                    or isolation fail
  no unapproved reduction                            │
         │                                           ▼
         │                             Check Retry Counter (N <= 2)
         │                                    │               │
         ▼                                    ▼ (N <= 2)      ▼ (N > 2)
Approve Draft & Write Files              Inject Feedback   Escalate to User
                                         for Revision      via `ask` tool
```

## Atomic Micro-Evaluation Checkpoints (TypeSafe System One)

| Micro-Check | Target Invariant | Question Key | Question Type | Pass Threshold | Fail Action |
|---|---|---|---|---|---|
| **MC-2.1** | Scope Integrity | `scope_mode` | `choice` | `HOLD` or `EXPANSION` | Reject plan if `REDUCTION`. Tighten-only forbids dropping user tasks. |
| **MC-2.2** | Algorithmic Rigor | `algorithm_depth` | `score` | Continuous score $\ge 2.0$ | Reject draft. Return rubric feedback highlighting missing error cases. |
| **MC-2.3** | Task Actionability | `task_actionability` | `noul` | P(actionable) $\ge 0.70$ | Reject draft. Demand explicit test commands and file paths per task. |
| **MC-2.4** | Claude Zero-Touch | `claude_isolation_adherence` | `noul` | P(isolated) $\ge 0.99$ | Immediate Hard Rejection: plan cannot propose changes to Claude/Anthropic. |
| **MC-2.5** | Rollback Readiness | `rollback_strategy_defined` | `noul` | P(rollback) $\ge 0.80$ | Warn and request explicit rollback steps in Phase 3/4. |

## Related Code Files

- Create: `src/plan-evaluator.ts`
- Create: `tests/plan-evaluator.test.ts`
- Modify: `typesafe-planner.ts`

## Implementation Steps (TDD Flow)

1. **Step 1: Test-First Plan Evaluation & Isolation Guards (Red)**
   - Create `tests/plan-evaluator.test.ts`.
   - Write tests for:
     - High-quality plan draft $\rightarrow$ returns `{ approved: true, score: 2.6, noul: 0.88, claudeIsolation: 1.0 }`.
     - Vague plan (lacks edge cases, score 1.2) $\rightarrow$ returns `{ approved: false, reason: "algorithm_depth below 2.0" }`.
     - Plan with untestable tasks (actionability noul 0.42) $\rightarrow$ returns `{ approved: false, reason: "task_actionability below 0.70" }`.
     - Plan attempting unauthorized REDUCTION $\rightarrow$ rejected by tighten-only lattice.
     - Plan proposing edits to `~/.claude/settings.json` $\rightarrow$ rejected by `claude_isolation_adherence`.
     - Exceeding retry count (3rd rejection) $\rightarrow$ triggers escalation payload for `ask` tool.

2. **Step 2: Implement Plan Evaluator (Green & Refactor)**
   - Implement `src/plan-evaluator.ts`.
   - Build `constructPlanQuestions()` with precise rubric descriptions for `jev-latest`.
   - Implement decision lattice and retry state tracking.
   - Run `bun test tests/plan-evaluator.test.ts` to confirm Green.

3. **Step 3: Integrate with Extension Lifecycle**
   - Wire evaluator into `typesafe-planner.ts`.
   - Add hook intercepting plan creation commands.
   - Verify integration tests pass.

## Success Criteria

- [x] All tests in `tests/plan-evaluator.test.ts` pass without failure.
- [x] Vague/untested plan drafts are systematically rejected with actionable feedback.
- [x] Plans attempting to touch Claude configs or drop requirements are blocked cold.
- [x] High-quality plans with explicit error boundaries pass cleanly.
- [x] Retry ceiling prevents runaway token consumption.

## Risk Assessment

- **Risk:** Agent gets frustrated and repeatedly submits identical bad drafts.
  - **Mitigation:** The feedback injected into the session explicitly highlights the lowest scoring criteria (e.g. "Add error handling for network timeouts in Phase 2 Step 3").
- **Risk:** TypeSafe API temporary 503 during plan creation.
  - **Mitigation:** On transient failure, prompt user via `ask`: "TypeSafe judge currently offline. Proceed with manual plan review? [Approve Plan / Edit Plan / Retry Judge]".
