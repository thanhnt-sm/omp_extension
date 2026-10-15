---
phase: 1
title: "Dual-Primitive JEV Calibration"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Dual-Primitive JEV Calibration

## Overview
Update `runPhaseMacroCheck` in `src/cook-expert-judge.ts` to send both `deliverables_verdict` (`type: "choice"`) and `meets_criteria` (`type: "noul"`) in the same parallel TypeSafe System One request, eliminating the hardcoded `0.00` score quantization and replacing the static accusatory rejection message with calibrated, task-type-aware diagnostics.

## Requirements
- **Functional**:
  1. Add `meets_criteria` (`type: "noul"`) to `questions` in `runPhaseMacroCheck` (`src/cook-expert-judge.ts:253-277`) with task-type-appropriate instructions and `criteria: { true: "...", false: "..." }`.
  2. Validate `rawMeetsCriteria` (`answers.meets_criteria?.noul`) whenever present: if non-numeric, non-finite, or outside `[0, 1]`, fail closed with `error: "unavailable"` (preserving `tests/cook-expert-judge.test.ts` boundary tests).
  3. Compute `meetsCriteriaNoul` using `rawMeetsCriteria` first, falling back to `deliverablesVerdict` mapping (`APPROVE -> answers.deliverables_verdict?.confidence ?? 1.0`, `NEXT_ACTION_REQUIRED -> 0.5`, `REJECT -> 0.0`) only when unit test mocks omit `meets_criteria`.
  4. Format `REJECT` and `NEXT_ACTION_REQUIRED` reasons with calibrated probability `P=${rawMeetsCriteria.toFixed(2)}` and `effectiveTaskType` context while keeping the substring `"rejected"` on `REJECT` (`tests/cook-expert-judge.test.ts:590`, `tests/cook-verification-adversarial.test.ts:243`).
  5. In `src/plan-evaluator.ts:345`, align `claude_isolation_adherence` `noul` threshold from the uncalibrated `0.95` ceiling to `resolveAutoApprovalThreshold()` (`0.80`, while preserving the deterministic `checkClaudePlanIsolation()` Gate 1 regex check at line `265`).
- **Non-Functional**:
  - Single HTTP POST request to `https://api.typesafe.ai/v1/systemone` (zero additional network round-trips).
  - 100% backward compatibility with all 16 existing `runPhaseMacroCheck` mock test cases across `tests/`.

## Architecture
```ts
// src/cook-expert-judge.ts
const questions: Record<string, ExpertJudgeQuestion> = {
  deliverables_verdict: deliverablesQuestion,
  meets_criteria: {
    type: "noul",
    instructions:
      effectiveTaskType === "analysis_research" || effectiveTaskType === "doc_specification"
        ? "Does the research or specification evidence in `deliverable_artifacts` and `agent_work_log` satisfy `todo_task` and `task_requirements`?"
        : "Does the implementation in `unified_diff`, `test_summary`, and `agent_work_log` satisfy `todo_task` and `task_requirements`?",
    criteria: {
      true: "Deliverables and evidence satisfy the task requirements",
      false: "Deliverables are incomplete, missing required evidence, or fail task criteria",
    },
  },
  architectural_drift: { ... },
  scope_mode: { ... },
};
```

## Related Code Files
- Modify: `src/cook-expert-judge.ts` (`runPhaseMacroCheck`, lines `253-370`)
- Modify: `src/plan-evaluator.ts` (`evaluatePlanDraft`, line `345`)
- Modify: `tests/cook-expert-judge.test.ts` and `tests/plan-evaluator.test.ts`

## Implementation Steps
1. **Write Failing TDD Tests (`tests/cook-expert-judge.test.ts`)**:
   - Assert that `runPhaseMacroCheck` sends both `deliverables_verdict` (`type: "choice"`) and `meets_criteria` (`type: "noul"`) in `questions`.
   - Assert that when JEV returns `{ deliverables_verdict: { choice: "REJECT", confidence: 0.85 }, meets_criteria: { noul: 0.42 }, architectural_drift: { choice: "no_drift" }, scope_mode: { choice: "HOLD" } }`, `result.meetsCriteriaNoul` is `0.42` (not `0.00`) and `result.reasons[0]` includes `"rejected"` and `"P=0.42"`.
2. **Update `runPhaseMacroCheck` (`src/cook-expert-judge.ts`)**:
   - Add `meets_criteria` to `questions`.
   - Validate `rawMeetsCriteria` in `[0, 1]` whenever `rawMeetsCriteria !== undefined`.
   - Update `meetsCriteriaNoul` and diagnostic rejection messages for `REJECT` and `NEXT_ACTION_REQUIRED`.
3. **Run Targeted Test Suite**:
   - Execute `bun test tests/cook-expert-judge.test.ts tests/cook-verification-adversarial.test.ts`.

## Success Criteria
- [x] `runPhaseMacroCheck` includes `meets_criteria` (`type: "noul"`) in `questions` payload.
- [x] `meetsCriteriaNoul` reflects `answers.meets_criteria.noul` instead of hardcoded `0.00` when JEV returns both primitives.
- [x] All existing mock tests in `tests/cook-expert-judge.test.ts` and `tests/cook-verification-adversarial.test.ts` pass.

## Risk Assessment
- **Risk**: Existing tests mocking only `deliverables_verdict` or only `meets_criteria` could fail if both are strictly required in the response.
- **Mitigation**: Keep `if (rawDeliverablesVerdict ...) ... else if (rawMeetsCriteria !== undefined) ...` resolution logic so either or both response fields work seamlessly.
