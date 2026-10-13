---
phase: 1
title: "Decision Contract & Categorical Verdict Refactoring"
status: completed
priority: P1
effort: "6h"
dependencies: []
---

# Phase 1: Decision Contract & Categorical Verdict Refactoring

## Overview
Refactor the TypeSafe JEV System One judgment contracts in `src/cook-expert-judge.ts` and `src/verification-gate.ts` from fragile client-side numerical thresholds (`0.80`, `0.30`) to native categorical verdict primitives (`choice: ["APPROVE", "REJECT", "NEXT_ACTION_REQUIRED"]`).

## Requirements
- Functional:
  - Transition `runDropJustificationCheck` from `noul` probability checking to a categorical choice question (`drop_verdict: "APPROVE" | "REJECT" | "ESCALATE"`).
  - Transition `runPhaseMacroCheck` and `verifyTaskCompletion` from `meetsCriteriaNoul < threshold` checks to categorical deliverable assessments (`deliverables_verdict: "APPROVE" | "REJECT" | "NEXT_ACTION_REQUIRED"`).
  - Deprecate `resolveAutoApprovalThreshold` and `DROP_REJECT_FLOOR` without breaking backwards-compatibility exports.
  - Update `generateVerificationScorecard` to format categorical verdicts directly instead of displaying `(Threshold >= 0.80)`.
- Non-functional:
  - Strict TDD: Write failing tests in `tests/cook-expert-judge.test.ts` and `tests/verification-gate.test.ts` before modifying implementation.
  - Zero performance regression: JEV question structure remains single-flight JSON payload $\le 32\text{KB}$.

## Architecture
```
[Client State Payload] ──► JEV System One (/v1/systemone)
                                │
               Categorical Choice Evaluation
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
     "APPROVE"              "REJECT"        "NEXT_ACTION_REQUIRED"
  Deliverables Met /     Evading Work /      Partial Work / Missing
  Obsolete Task Drops    Malicious Action    Tests / Needs Plan Delta
```

## Related Code Files
- Modify: `src/cook-expert-judge.ts`
- Modify: `src/verification-gate.ts`
- Modify: `tests/cook-expert-judge.test.ts`
- Modify: `tests/verification-gate.test.ts`
- Modify: `tests/cook-verification-adversarial.test.ts`

## Implementation Steps
1. **TDD Test Suite Refactoring**:
   - Update `tests/cook-expert-judge.test.ts` to assert categorical verdict states (`verdict: "APPROVE"` vs `"REJECT"` vs `"ESCALATE"`).
   - Update `tests/verification-gate.test.ts` to mock JEV categorical answers and verify that rejection triggers when JEV returns `"REJECT"` or `"NEXT_ACTION_REQUIRED"`, completely decoupled from numerical `0.80`.
   - Update `tests/cook-verification-adversarial.test.ts` Attack 1 to assert that JEV's categorical verdict rejects stubs.
2. **Refactor `src/cook-expert-judge.ts`**:
   - Define `export type JevVerdict = "APPROVE" | "REJECT" | "NEXT_ACTION_REQUIRED" | "ESCALATE"`.
   - Update `runDropJustificationCheck` to ask `drop_verdict` with options `["APPROVE", "REJECT", "ESCALATE"]`.
   - Update `runPhaseMacroCheck` to ask `deliverables_verdict` with options `["APPROVE", "REJECT", "NEXT_ACTION_REQUIRED"]`.
   - Refactor scorecard formatting to output:
     `│ Meets Plan Deliverables: VERDICT: APPROVED (JEV Confidence 0.95) │`
3. **Refactor `src/verification-gate.ts`**:
   - Update `verifyTaskCompletion` to consume `deliverables_verdict` and map it to `gate2.passed`.
   - Deprecate `resolveAutoApprovalThreshold()` as a backwards-compatible pass-through.
4. **Verification**:
   - Run `bun test tests/cook-expert-judge.test.ts`.
   - Run `bun test tests/verification-gate.test.ts`.
   - Run `bun test tests/cook-verification-adversarial.test.ts`.

## Success Criteria
- [ ] No occurrences of `0.80`, `0.70`, or `0.30` numerical gates controlling gate decisions in `cook-expert-judge.ts` or `verification-gate.ts`.
- [ ] JEV questions use typed `choice` primitives returning definitive categorical verdicts.
- [ ] 100% tests in `cook-expert-judge.test.ts`, `verification-gate.test.ts`, and `cook-verification-adversarial.test.ts` pass cleanly.

## Risk Assessment
- Risk: JEV returns unexpected string choice not in options array.
  - Mitigation: Strict validation schema in client; any out-of-bounds choice fails closed to `unavailable` and escalates to human.
