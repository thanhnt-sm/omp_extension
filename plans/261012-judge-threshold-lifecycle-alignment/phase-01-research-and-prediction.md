---
phase: 1
title: "Research and prediction"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Research and prediction

## Overview
Investigate TypeSafe System One JEV `noul` score semantics, evaluate the user hypothesis regarding range-scaled thresholds (`range * 0.8`), and document the root causes of premature plan completion when contracted tasks remain active.

## Requirements
- Functional:
  - Document the exact mathematical contract of TypeSafe JEV `noul` probabilities in `src/cook-expert-judge.ts` and `typesafe-planner.ts`.
  - Evaluate why `runDropJustificationCheck` scored `0.35` and fell into the `[0.30, 0.80)` gray zone, resulting in an interactive human confirmation prompt.
  - Trace the lifecycle mismatch where an external session completed a plan while todo tasks were neither done nor dropped.
  - Formulate structured remediation messages for blocked agents instead of generic "call ask" loops.
- Non-functional:
  - Zero modifications to production source code in this planning phase.
  - Keep security and fail-closed invariants intact: no silent auto-approvals.

## Architecture
```
[User Request / Agent Action]
       │
       ▼
[handleTodoInterception (typesafe-planner.ts)]
       │
       ├── op: "drop" / "rm" ──► runDropJustificationCheck ──► TypeSafe JEV POST /v1/systemone
       │                                                          │
       │                                     noul in [0, 1] ◄─────┘
       │                                           │
       │                    ┌──────────────────────┴──────────────────────┐
       │                    ▼                                             ▼
       │             Score >= 0.80                               Score < 0.30
       │             (Auto-approve)                               (Auto-reject)
       │                                   │
       │                                   ▼
       │                    Score in [0.30, 0.80) Gray Zone
       │                    (Interactive Human Escalation)
       │
       └── op: "done" / plan-cli check ──► Plan Completion Guard (checks activeContractedTasks)
```

## Related Code Files
- Modify: `plans/261012-judge-threshold-lifecycle-alignment/plan.md`
- Reference: `src/cook-expert-judge.ts:479-578` (`runDropJustificationCheck`, `DROP_REJECT_FLOOR`)
- Reference: `typesafe-planner.ts:1230-1390` (`handleTodoInterception`, plan-cli check guard)
- Reference: `tests/todo-drop-gate.test.ts:208-268` (gray zone unit tests)

## Implementation Steps
1. Audit TypeSafe API and SDK documentation: verify that `noul` outputs represent normalized probabilities $P \in [0, 1]$, where 1.0 indicates certainty of true and 0.0 indicates certainty of false.
2. Formally refute range-scaled thresholding: explain why multiplying an observed range $[a, b]$ by $0.8$ produces moving target criteria that violate calibration, and confirm that $0.80$ is a fixed policy confidence requirement.
3. Trace session state lifecycle: identify why `plan-cli check` or plan completion writes can succeed if `activeContractedTasks` is bypassed or not synchronized with the active plan directory.
4. Draft prompt-injection-safe guidance schemas for agent rejection notices: include task ID, failing criteria, JEV score, and exact remediations.

## Success Criteria
- [ ] Mathematical evaluation of `noul` and threshold scaling documented and reviewed.
- [ ] Root cause of plan-vs-todo completion contradiction isolated with reproduction scenarios.
- [ ] Anti-spoofing and prompt injection mitigation boundaries specified for agent error messages.

## Risk Assessment
- Risk: Confusing raw probability output with arbitrary rating scales leading to accidental threshold lowering.
  - Mitigation: Retain standard $0.80$ auto-approval threshold and require explicit environment configuration for overrides.
- Risk: Rejection messages being hijacked by malicious agent task descriptions.
  - Mitigation: Wrap all user and agent strings in delimiter XML tags (`<user_request>`, `<agent_work_log>`) and keep instructions in trusted header text.
