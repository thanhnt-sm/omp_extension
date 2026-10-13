---
title: "TypeSafe Bicameral Judge Consensus, Threshold Elimination, and Adaptive Plan Reconciliation"
description: "Eliminate arbitrary client-side numerical thresholds (0.80/0.30) by establishing a Bicameral Advisor-JEV Consensus architecture with sovereign human override and non-blocking plan reconciliation."
status: completed
priority: P1
effort: "2-3d"
branch: master
tags: [typesafe, jev, bicameral-consensus, threshold-elimination, sovereign-human, adaptive-reconciliation, tdd]
blockedBy: []
blocks: [261012-judge-threshold-lifecycle-alignment]
created: 2026-10-13
---

# TypeSafe Bicameral Judge Consensus, Threshold Elimination, and Adaptive Plan Reconciliation

## Executive Summary
This implementation plan codifies and implements **ADR-20261013-typesafe-bicameral-judge-alignment**. It eliminates arbitrary client-side floating-point thresholds (`0.80`, `0.30`) and the ambiguous "gray zone" $[0.30, 0.80)$ that repeatedly paralyzed autonomous agents (`omp bị lỗi không thoát ra được`). 

In their place, it establishes a **Bicameral Consensus Engine** pairing two independent evaluation lobes:
1. **Lobe 1: Advisor Intent Evaluator** (`evaluateAdvisorIntent`): Evaluates user intent, conversation history, and agent work logs.
2. **Lobe 2: OMP TypeSafe JEV Judge** (`evaluateJevVerdict`): Categorically evaluates ground-truth Git diff, AST boundaries, and test exit codes.

When both lobes agree, operations proceed autonomously without human friction. When they conflict, the system escalates to human confirmation. Once the human confirms (or when sufficient evidence exists), the human decision is **sovereign, binding, and immediately unblocking**. When missing deliverables or next actions are identified, the system automatically adapts `todo` and `plan.md` tasks rather than terminating with a fatal exception.

---

## Architecture Overview

```
                      Agent Mutation Request (todo done, todo drop, plan status)
                                                 │
                      ┌──────────────────────────┴──────────────────────────┐
                      ▼                                                     ▼
         [Lobe 1: Advisor Intent]                               [Lobe 2: TypeSafe JEV Judge]
         - Analyzes conversation history                        - Analyzes git diff & status
         - Verifies user intent / obsolete tasks                - Verifies test exit code & output
         - Checks agent work log credibility                    - Runs AST test-evasion detector
                      │                                                     │
               ALLOW | DISALLOW                                      APPROVE | REJECT |
                  | UNCERTAIN                                       NEXT_ACTION_REQUIRED
                      │                                                     │
                      └──────────────────────────┬──────────────────────────┘
                                                 ▼
                                     [Bicameral Consensus Engine]
                                                 │
          ┌──────────────────────────────────────┼──────────────────────────────────────┐
          ▼                                      ▼                                      ▼
    CẢ HAI ĐỒNG Ý                          CÓ MÂU THUẪN                           CÓ THIẾU SÓT
     (Consensus)                            (Conflict)                        (Next Actions Req)
          │                                      │                                      │
    AUTO-EXECUTE                           HUMAN ESCALATION                       ADAPTIVE RECONCILIATION
  - Zero confirmation popup              - Present both viewpoints              - DO NOT throw fatal error
  - Instant drop or done                 - Human decision is SOVEREIGN          - Synthesize plan delta
  - Task state transitions               - Recorded as host-authorization       - Auto-update todo & plan
                                         - Downstream gates CANNOT re-block     - Present to human & continue
```

---

## Core Acceptance Invariants

1. **Zero Numerical Magic Numbers**: No client-side checks for `0.80`, `0.70`, `0.30`, or floating-point ranges. JEV answers using categorical primitives (`choice`) or calibrated Bayes polarity.
2. **Sovereign Human Invariant**: When a human approves an action (via `ui.confirm`, explicit chat message, or `isHumanAuthorized`), `typesafe-planner` assigns `host-authorization`. All subsequent gates are strictly prohibited from canceling, rejecting, or re-prompting for that action.
3. **Non-Blocking Plan & Todo Reconciliation**: Interceptions that identify missing criteria or test failures do NOT call `throw new Error(...)` to crash the agent. Instead, they format structured `nextaction` items, synthesize an updated todo/plan proposal, and prompt the human for authorization to proceed with the updated scope.
4. **100% TDD Regression Safety**: Every phase maintains and passes all 31 test suites across the repository, ensuring zero regressions in adversarial robustness, Claude boundary isolation, and payload bounds.

---

## Phases

| Phase | Name | Priority | Status | Effort |
|---|---|---|---|---|
| 1 | [Decision Contract & Categorical Verdict Refactoring](./phase-01-decision-contract-categorical-verdict-refactoring.md) | P1 | Completed | 6h |
| 2 | [Advisor Intent Evaluator & Bicameral Consensus Engine](./phase-02-advisor-intent-evaluator-bicameral-consensus-engine.md) | P1 | Completed | 8h |
| 3 | [Sovereign Human Authority & Non-Blocking Plan Reconciliation](./phase-03-sovereign-human-authority-non-blocking-plan-reconciliation.md) | P1 | Completed | 6h |
| 4 | [Red-Team Adversarial Validation & Baseline Deployment](./phase-04-red-team-adversarial-validation-baseline-deployment.md) | P1 | Completed | 4h |

---

## Verification & Execution Matrix

1. **Unit Testing (`bun test`)**:
   ```bash
   bun test tests/cook-expert-judge.test.ts
   bun test tests/verification-gate.test.ts
   bun test tests/todo-drop-gate.test.ts
   bun test tests/cook-verification-adversarial.test.ts
   bun test
   ```
2. **Synchronization to Global Runtime**:
   ```bash
   node tools/sync-baseline.cjs
   ```
3. **Execution Command for Cook**:
   ```bash
   /ck:cook D:/100.Software/Github/omp_extension/plans/261013-bicameral-judge-consensus/plan.md --auto --tdd
   ```
