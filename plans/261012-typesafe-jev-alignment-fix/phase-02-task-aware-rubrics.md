---
phase: 2
title: "Task-Aware Rubrics"
status: complete
priority: P1
effort: "4h"
dependencies: ["1"]
---

# Phase 2: Task-Aware Rubrics

## Overview
Deliver Tier 2 Task-Aware Multi-Label Rubrics (Option C). This refactors the monolithic 0.80 pass/fail threshold in `cook-expert-judge.ts`. Research and documentation tasks will be evaluated based on the thoroughness of their deliverables instead of punishing them for lacking git diffs.

## Requirements
- **Functional:** `runPhaseMacroCheck` MUST branch its `meets_criteria` question generation based on `taskType`.
- **Functional:** For `analysis_research` and `doc_specification`, the rubrics MUST NOT demand `unified_diff` completeness.
- **Functional:** For `code_change`, the rubrics MUST retain the strict 0.80 threshold and zero-drift requirement.
- **TDD Requirement:** Unit tests MUST cover rubric branching logic.

## Architecture
- `src/cook-expert-judge.ts`: Refactor `runPhaseMacroCheck` to conditionally build the `GateQuestion` object. 
  - If `taskType === "analysis_research"`, evaluate `deliverableArtifacts` against `planRequirements`.
  - Add deterministic override: If `git status` contains modified `.ts`/`.cjs`/`.js` files, forcefully downgrade/override `taskType` to `code_change` to prevent agent spoofing.

## Related Code Files
- Modify: `src/cook-expert-judge.ts`
- Modify: `tests/cook-expert-judge.test.ts`
- Modify: `tests/adversarial-compliance.test.ts`

## Implementation Steps
1. **TDD:** Add unit tests in `tests/cook-expert-judge.test.ts` asserting that the `meets_criteria` prompt text changes depending on `taskType`.
2. **TDD:** Add test in `tests/adversarial-compliance.test.ts` asserting that an agent attempting to label a code change as `analysis_research` is overridden to `code_change`.
3. Refactor `runPhaseMacroCheck` to support dynamic question schemas.
4. Add the anti-spoofing heuristic in `cook-expert-judge.ts` (or `typesafe-planner.ts`) by inspecting the `diffSummary`.
5. Calibrate the passing criteria prompt to ensure high ROC-AUC.

## Success Criteria
- [x] Research tasks with no code diff pass Gate 2 if `deliverableArtifacts` fulfill the criteria.
- [x] Code modifications masquerading as research tasks are caught and evaluated under `code_change` rubrics.
- [x] All TDD unit tests pass.

## Risk Assessment
- **False Positives on Weak Deliverables:** If the dynamic rubric is too loose, agents might pass Gate 2 with incomplete markdown files.
  - *Mitigation:* Explicitly prompt JEV to evaluate `deliverable_thoroughness` strictly against the provided `planRequirements`.