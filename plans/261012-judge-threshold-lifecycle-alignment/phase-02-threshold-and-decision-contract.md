---
phase: 2
title: "Threshold and decision contract"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Threshold and decision contract

## Overview
Standardize TypeSafe System One judgment threshold definitions, unify gray-zone boundaries across all gates, and ensure decision contracts remain strictly fail-closed without ambiguous heuristic conversions.

## Requirements
- Functional:
  - Consolidate auto-approval threshold resolution via `resolveAutoApprovalThreshold()`.
  - Maintain `DROP_REJECT_FLOOR = 0.30` as the authoritative reject boundary for drop justifications.
  - Distinguish explicitly between an `undecided` gray-zone evaluation ($0.30 \le \text{noul} < 0.80$) and an `unavailable` / `error` evaluation (network down, bad key, malformed response).
  - Include full evaluation context (task names, drop reason, calculated score, threshold boundary, and user prompt context) in the interactive human confirmation dialog.
- Non-functional:
  - Do not introduce arbitrary floating range multipliers.
  - Keep configuration extensible via `process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD` (clamped to $[0.50, 0.99]$, default $0.80$).

## Architecture
```
                   TypeSafe Evaluation Score (noul)
       0.00                   0.30                   0.80                   1.00
         │                      │                      │                      │
         ├──────────────────────┼──────────────────────┼──────────────────────┤
         │     AUTO-REJECT      │   GRAY ZONE / ESC    │     AUTO-APPROVE     │
         │   (decision=reject)  │ (decision=undecided) │  (decision=approve)  │
         │                      │                      │                      │
         ▼                      ▼                      ▼                      ▼
  Cancel Event +          Prompt Human /         Clear Contracted       Clear Contracted
  Agent Remediation       Fallback Fail-Closed   Task Record            Task Record
  Instructions            if Non-Interactive
```

## Related Code Files
- Modify: `src/cook-expert-judge.ts`
- Modify: `typesafe-planner.ts`
- Modify: `tests/cook-expert-judge.test.ts`
- Modify: `tests/todo-drop-gate.test.ts`

## Implementation Steps
1. Refactor `runDropJustificationCheck` in `src/cook-expert-judge.ts` to use a typed `DropCheckResult` enum: `approve`, `reject`, `undecided`, and `unavailable`.
2. Ensure scorecard formatting (`generateVerificationScorecard`) reports the active threshold, the actual score, the margin to pass, and the explicit rationale.
3. Update `handleTodoInterception` in `typesafe-planner.ts` so that `undecided` displays the complete justification context to the human:
   - Task IDs requested for drop.
   - The reason given by the agent.
   - The user request from session history.
   - The exact JEV score and why it fell into the undecided window $[0.30, \text{threshold})$.
4. Ensure non-interactive execution (`hasUI === false` or `ui.confirm` missing) triggers deterministic fail-closed rejection with clear explanatory text, rather than silent hanging.

## Success Criteria
- [ ] Threshold boundaries verified at critical points: 0.29 (reject), 0.30 (undecided), 0.79 (undecided), 0.80 (approve).
- [ ] Error and network failures produce `unavailable` with distinct diagnostics, avoiding false gray-zone classification.
- [ ] UI confirmation message contains complete structured context (task, reason, score, threshold, user request).

## Risk Assessment
- Risk: Non-interactive environments (CI or headless agent runs) hanging on interactive confirmation.
  - Mitigation: Detect `hasUI` and `ui.confirm`; if unavailable, immediately fail-closed and return actionable agent remediation instructions.
