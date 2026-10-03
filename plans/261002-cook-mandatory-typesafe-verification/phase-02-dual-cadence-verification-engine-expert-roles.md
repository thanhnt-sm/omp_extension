---
phase: 2
title: "Dual-Cadence Verification Engine & Expert Roles"
status: completed
priority: P1
effort: "2.0h"
dependencies: [1]
---

# Phase 2: Dual-Cadence Verification Engine & Expert Roles

## Overview

Implements `src/cook-expert-judge.ts`, the core programmatic engine powering mandatory verification and expert triage in `ck:cook`. It operationalizes the Dual-Cadence verification architecture (fast local micro-checks per task vs remote semantic macro-checks per phase) and formalizes the Tri-Role Expert Evaluator system (Scope Arbiter, Architectural Drift Guard, Risk/Security Triage).

## Requirements

### Functional Requirements
- **Dual-Cadence Pipeline:**
  - `runTaskMicroCheck()`: Deterministic Gate 1 running in <150ms with 0 token consumption. Validates working tree cleanliness, test exit code 0, test assertion deletion detection, and Claude path isolation. Includes Non-Git Fallback (RT-2): if `git status` exits 128, falls back to filesystem mtime inspection without failing.
  - `runPhaseMacroCheck()`: Semantic Gate 2 dispatching ground-truth OS evidence to TypeSafe System One (`jev-latest`) before phase completion or review gates.
- **Tri-Role Expert Evaluator System:**
  1. **Scope Arbiter (`evaluateScopeArbiter`):** Assesses whether implementation preserves, expands, or reduces requested scope. Automatically rejects `REDUCTION`.
  2. **Architectural Drift Guard (`evaluateDriftGuard`):** Analyzes unified diffs to detect modified unrelated files, altered interfaces, or architectural contract drift.
  3. **Risk & Security Triage (`evaluateRiskSecurityTriage`):** On-demand evaluation for ambiguous technical choices, trade-offs, and critical security invariants. Enforces key safety (RT-1): validates custom question keys with `isSecretInKey()` and `preparePayloadSafe()`.
- **Scorecard Generator:** Formats TypeSafe System One evaluation metrics into a human-readable scorecard for review gates.
- **Bounded Revision Loop:** Limits automated repair attempts to 2 revisions. On the 3rd failed attempt, packages the failure diff and sets `escalateToUser = true` for `ask` dialog.
- **Fail-Closed Escrow:** If TypeSafe API is offline or returns 401/403/500, sets `escalateToUser = true` to require manual user approval rather than allowing silent pass.

### Non-Functional Requirements
- **Performance:** Micro-checks must conclude in < 150ms. Macro-checks must resolve in < 1500ms total.
- **Zero-Touch Claude Isolation:** All requests route exclusively to `api.typesafe.ai` with `TYPESAFE_API_KEY`. No Claude credentials or paths accessed.
- **Strict Typing:** 100% TypeScript type safety, zero `any` or `as any`.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        src/cook-expert-judge.ts                        │
├────────────────────────────────────────────────────────────────────────┤
│  Cadence 1: runTaskMicroCheck(taskId, testCommand, cwd)                │
│    └─> Gate 1 Deterministic Preconditions (0 Token, Local)             │
│                                                                        │
│  Cadence 2: runPhaseMacroCheck(phaseId, planPath, testCommand, cwd)    │
│    └─> Gate 2 TypeSafe System One Evaluation (Meets Criteria + Drift)  │
│                                                                        │
│  Expert Roles:                                                         │
│    ├─> evaluateScopeArbiter(plan, prompt)       -> Choice (HOLD)       │
│    ├─> evaluateDriftGuard(diff, criteria)       -> Choice (no_drift)   │
│    └─> evaluateRiskSecurityTriage(context)      -> Score (0..3)        │
│                                                                        │
│  Scorecard & Escalation:                                               │
│    ├─> generateVerificationScorecard(results)   -> Formatted String    │
│    └─> handleFailClosedEscalation(error)        -> Ask Prompt Payload  │
└────────────────────────────────────────────────────────────────────────┘
```

## Related Code Files

- Create: `src/cook-expert-judge.ts`
- Create: `tests/cook-expert-judge.test.ts`
- Import from: `src/payload-safety.ts`, `src/evidence-collector.ts`, `src/verification-gate.ts`

## Implementation Steps (TDD Flow)

1. **Step 1: Test-First Engine & Expert Evaluator Assertions (Red)**
   - Create `tests/cook-expert-judge.test.ts`.
   - Write unit tests for:
     - `runTaskMicroCheck`: Passes on clean test run; fails fast on exit code 1 or deleted assertions without remote calls.
     - `runPhaseMacroCheck`: Approves when `meets_criteria >= 0.70` and `no_drift`; rejects when criteria unmet or drift detected.
     - `evaluateScopeArbiter`: Rejects `REDUCTION` choice via tighten-only lattice.
     - `evaluateDriftGuard`: Flags `unapproved_deviation` or `scope_creep`.
     - `evaluateRiskSecurityTriage`: Evaluates score $\ge 2.0$.
     - Scorecard formatting matches `review-cycle.md` specification.
     - 3rd consecutive failed attempt triggers `escalateToUser = true`.
     - Offline / 401 returns fail-closed escalation payload.

2. **Step 2: Implement Cook Expert Judge Engine (Green & Refactor)**
   - Implement `src/cook-expert-judge.ts`.
   - Integrate with `preparePayloadSafe()` and `collectTaskEvidence()`.
   - Enforce bounded revision counter and human escalation triggers.
   - Verify all tests pass with `bun test tests/cook-expert-judge.test.ts`.

## Success Criteria

- [x] All tests in `tests/cook-expert-judge.test.ts` pass with 100% assertions.
- [x] Micro-check runs purely local with zero token overhead.
- [x] Macro-check enforces plan criteria fulfillment and anti-drift validation.
- [x] Tri-role expert evaluators provide actionable feedback and prevent scope reduction.
- [x] Zero `any` or `as any` type escapes.

## Risk Assessment

- **Risk:** TypeSafe score threshold (0.70) causes false-positive rejection on subjective tasks.
  - **Mitigation:** The prompt criteria for `meets_criteria` explicitly focuses on verifiable deliverables rather than coding style. On 3rd attempt, user escalation lets the human override with full visibility.
