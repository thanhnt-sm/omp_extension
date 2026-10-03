---
phase: 1
title: "Workflow Specification & Review Gate Upgrade"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Workflow Specification & Review Gate Upgrade

## Overview

Upgrades the reference documentation and contractual specifications of the `ck:cook` skill to make TypeSafe System One verification mandatory rather than optional across all execution modes (`interactive`, `code`, `fast`, `parallel`, `auto`). It codifies the Dual-Cadence Verification Pipeline and specifies the exact rubric for the Tri-Role Expert Evaluator system (Scope Arbiter, Architectural Drift Guard, Risk/Security Triage).

## Requirements

### Functional Requirements
- **Mandatory Gate Specification:** Update `references/typesafe-judgments.md` to specify that post-implementation quality checks are required for all workflows prior to review gates.
- **Tri-Role Expert Evaluator Schemas:**
  1. `scope_arbiter` (Choice): `HOLD` (matches requirements), `EXPANSION` (justified additions), `REDUCTION` (drops requirements - strictly rejected).
  2. `architectural_drift_guard` (Choice): `no_drift`, `unapproved_deviation`, `scope_creep`.
  3. `risk_security_triage` (Score): 4-level rating on technical trade-offs, security invariants, and edge cases.
- **Workflow Steps Enforcement:** Update `references/workflow-steps.md` (Step 3.V, Step 4, Step 5) to require Gate 2 semantic verification before presenting `[Review Gate 3]` or `[Review Gate 4]`.
- **Review Gate Scorecard:** Standardize the display format in `references/review-cycle.md`:
  ```
  ┌─────────────────────────────────────────────────────────┐
  │ TypeSafe System One Verification Scorecard              │
  ├─────────────────────────────────────────────────────────┤
  │ Meets Plan Deliverables: P = 0.95 (Threshold >= 0.70)   │
  │ Architectural Drift:     None (Strict adherence)        │
  │ Scope Mode:              HOLD (All requirements covered)│
  │ Expert Evaluator:        Approved (Confidence 0.92)     │
  └─────────────────────────────────────────────────────────┘
  ```
- **Fail-Closed Human Escalation:** Define the escalation escape hatch when TypeSafe is unreachable or errors: prompt the user via `ask` tool rather than allowing silent self-approval.

### Non-Functional Requirements
- **Claude Zero-Touch Invariant:** Specifications must forbid sending Anthropic keys, tokens, or modifying `~/.claude/**`.
- **Payload Safety Invariant:** Specifications must mandate `preparePayloadSafe()` bounding to $\le 32,768$ bytes.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   COOK WORKFLOW SPECIFICATION UPGRADE                  │
├───────────────────────────────────┬────────────────────────────────────┤
│ references/typesafe-judgments.md  │ references/workflow-steps.md       │
│ - Mandatory post-impl gate        │ - Dual-cadence gating (Step 3.V, 5)│
│ - Scope Arbiter schema            │ - Human escalation on network drop │
│ - Drift Guard schema              │                                    │
│ - Risk/Security Triage schema     │ references/review-cycle.md         │
│                                   │ - Verification scorecard format    │
└───────────────────────────────────┴────────────────────────────────────┘
```

## Related Code Files

- Modify: `C:/Users/thant/.claude/skills/cook/references/typesafe-judgments.md`
- Modify: `C:/Users/thant/.claude/skills/cook/references/workflow-steps.md`
- Modify: `C:/Users/thant/.claude/skills/cook/references/review-cycle.md`
- Create: `tests/cook-workflow-specs.test.ts`

## Implementation Steps (TDD Flow)

1. **Step 1: Test-First Specification Assertions (Red)**
   - Create `tests/cook-workflow-specs.test.ts`.
   - Write tests asserting:
     - `typesafe-judgments.md` defines mandatory gate and 3 expert schemas (`scope_arbiter`, `architectural_drift_guard`, `risk_security_triage`).
     - `workflow-steps.md` requires Gate 2 semantic check before Review Gate 3 & 4.
     - `review-cycle.md` contains the TypeSafe verification scorecard template.
     - Zero references to Anthropic account tokens.

2. **Step 2: Update Reference Specifications (Green & Refactor)**
   - Update `cook/references/typesafe-judgments.md` with new sections 3e and 3f.
   - Update `cook/references/workflow-steps.md` Step 3.V and Step 5.
   - Update `cook/references/review-cycle.md` with the scorecard and human escalation rules.
   - Verify tests pass with `bun test tests/cook-workflow-specs.test.ts`.

## Success Criteria

- [x] `bun test tests/cook-workflow-specs.test.ts` passes with 100% assertions.
- [x] TypeSafe verification is specified as mandatory across all cook modes.
- [x] 3 Expert Evaluator question rubrics fully codified.
- [x] Review Gate scorecard and fail-closed human escalation rules documented.

## Risk Assessment

- **Risk:** Existing cook workflows break if TypeSafe is not installed.
  - **Mitigation:** Specifications preserve the fail-closed human escalation: if TypeSafe is offline or uninstalled, the workflow prompts the user via `ask` to manually approve instead of crashing or silently bypassing.
