---
phase: 2
title: "Cognitive Task Classifier and Work-Log Fallback"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Cognitive Task Classifier and Work-Log Fallback

## Overview
Expand `inferTaskType` in `typesafe-planner.ts` and `evaluateAdvisorIntent` in `src/bicameral-consensus.ts` so cognitive, research, brainstorming, and planning tasks without code modifications are accurately classified as `"analysis_research"` (or `"doc_specification"`) and automatically supply `convo.agentWorkLog` when file artifacts are empty, while strictly preserving the anti-spoofing `"code_change"` override whenever code files are modified.

## Requirements
- **Functional**:
  1. Update `inferTaskType` (`typesafe-planner.ts:336-385`) to match cognitive/workflow verbs anywhere in `taskDescription` when `hasCodeFiles` is `false` and `hasDocFiles` is `false`:
     `/\b(?:scout|diagnos\w*|investigat\w*|research\w*|analy[sz]\w*|explor\w*|find|audit\w*|review\w*|check\w*|trac\w*|inspect\w*|read\w*|clarif\w*|brainstorm\w*|plan|planning|design\w*|synthesi[sz]\w*|consult\w*|evaluat\w*|assess\w*|document\w*|journal\w*|organi[sz]\w*|verif\w*|ask\w*|propos\w*|validat\w*|compar\w*|summariz\w*|kiểm tra|phân tích|tìm|nghiên cứu|lập kế hoạch)\b/i`
  2. Update `handleTodoInterception` (`typesafe-planner.ts:1981-1985`) so that whenever `rawDeliverableArtifacts` is empty and `taskType !== "code_change"` (or `evidence.changedFiles.length === 0` on a non-code task), `deliverableArtifacts` falls back to `convo.agentWorkLog`.
  3. Synchronize the same cognitive verb pattern in `evaluateAdvisorIntent` (`src/bicameral-consensus.ts:497-501`).
- **Non-Functional**:
  - Must NEVER weaken the anti-spoofing check in `inferTaskType` (`hasCodeFiles` at lines `344-351`) or `runPhaseMacroCheck` (`containsCodeChanges` at `src/cook-expert-judge.ts:194-201`).

## Architecture
```ts
// typesafe-planner.ts
export const COGNITIVE_TASK_PATTERN =
  /\b(?:scout\w*|diagnos\w*|investigat\w*|research\w*|analy[sz]\w*|explor\w*|find|audit\w*|review\w*|check\w*|trac\w*|inspect\w*|read\w*|clarif\w*|brainstorm\w*|plan|planning|design\w*|synthesi[sz]\w*|consult\w*|evaluat\w*|assess\w*|document\w*|journal\w*|organi[sz]\w*|verif\w*|ask\w*|propos\w*|validat\w*|compar\w*|summariz\w*|kiểm tra|phân tích|tìm|nghiên cứu|lập kế hoạch)\b/i;
```

## Related Code Files
- Modify: `typesafe-planner.ts` (`inferTaskType` lines `336-385`, `handleTodoInterception` lines `1981-1986`)
- Modify: `src/bicameral-consensus.ts` (`evaluateAdvisorIntent` lines `496-511`)
- Modify: `tests/typesafe-planner.test.ts` and `tests/adversarial-compliance.test.ts`

## Implementation Steps
1. **Write Failing TDD Tests (`tests/typesafe-planner.test.ts`)**:
   - Test `inferTaskType("", "", "Read relevant ck:* skills and inspect codebase")` $\rightarrow$ `"analysis_research"`.
   - Test `inferTaskType("", "", "Clarify requirements and brainstorm 3 approaches")` $\rightarrow$ `"analysis_research"`.
   - Test `inferTaskType(" M src/index.ts", "", "Brainstorm auth architecture")` $\rightarrow$ `"code_change"` (anti-spoofing preserved).
2. **Implement Classifier & Work-Log Fallback (`typesafe-planner.ts`, `src/bicameral-consensus.ts`)**:
   - Update `inferTaskType` and `evaluateAdvisorIntent` to use `COGNITIVE_TASK_PATTERN`.
   - Ensure `deliverableArtifacts` in `handleTodoInterception` includes `convo.agentWorkLog` when `rawDeliverableArtifacts` is empty on non-code tasks.
3. **Run Targeted Tests**:
   - Execute `bun test tests/typesafe-planner.test.ts tests/adversarial-compliance.test.ts tests/bicameral-consensus.test.ts`.

## Success Criteria
- [x] Tasks starting with `Read`, `Clarify`, `Brainstorm`, `Plan`, `Synthesize`, `Consult`, `Document`, `Journal`, `Organize` with no modified code files return `"analysis_research"`.
- [x] Tasks modifying any `.ts`/`.js`/`.cjs`/`.json` file return `"code_change"` regardless of task title.
- [x] All unit and adversarial spoofing tests pass.

## Risk Assessment
- **Risk**: Overly broad verb matching could classify an implementation task like `"Implement plan execution"` as `"analysis_research"` when `gitStatus` is empty.
- **Mitigation**: Exclude tasks starting with implementation verbs (`/^\s*(?:step\s*\d+\s*[:.-]\s*)?(?:implement|fix|build|add|create\s+src|refactor|patch|deploy)\b/i`) from the cognitive fallback when `gitStatus` is empty.
