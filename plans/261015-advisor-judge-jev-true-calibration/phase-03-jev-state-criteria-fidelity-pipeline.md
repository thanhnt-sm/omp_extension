---
phase: 3
title: "JEV State & Criteria Fidelity Pipeline"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: JEV State & Criteria Fidelity Pipeline

## Overview
Fix all payload corruption, schema mismatches, and scope/criteria mismatches in `src/evidence-collector.ts`, `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/payload-safety.ts`, and `typesafe-planner.ts` so `jev-latest` receives clean, sub-task-scoped, uncorrupted evidence.

## Requirements
- Functional:
  - `extractCriteriaFromPlan(planContent, taskId)` (`src/evidence-collector.ts`) must use `taskId`: when `taskId` is provided and does not match a full phase header, filter checkboxes/numbered items that share key tokens with `taskId` (falling back to `[taskId]` as the atomic requirement while keeping full plan criteria as background context) so a single sub-task is never judged against unstarted checkboxes of other tasks/phases.
  - `constructGateQuestions` (`src/verification-gate.ts`) must use canonical dictionary `criteria: Record<string, string>` for `deliverables_verdict` (`type: "choice"`) and `meets_criteria` (`type: "noul"`), and `normalizeQuestionForTypeSafe` (`typesafe-planner.ts`) must strip redundant `"true: "` / `"false: "` prefixes when normalizing array criteria.
  - `sanitizeStateForTypeSafe` (`typesafe-planner.ts`) must preserve `3,000`-char budgets for `task_requirements`, `agent_work_log`, `test_summary`, `testOutput`, `user_request`, and `diff_summary` (accounting for any `<tag>` wrapper overhead so fields are never double-clamped with duplicate truncation markers) and replace the `> 28,000` char `950`-char cliff with proportional diff/artifact trimming that keeps `task_requirements`, `agent_work_log`, and `test_summary` intact ($\ge 2,000$ chars).
  - `summarizeUnifiedDiff` (`typesafe-planner.ts`) must preserve contiguous diff lines (`+` / `-` hunks) up to `maxChars` (`14,000` chars) before falling back to structural signature/assertion extraction on extreme diffs (e.g. 200KB diff floods), and must preserve outer `<unified_diff>` tags if present.
  - `collectConversationContext` (`typesafe-planner.ts`) must detect all common test/build runners (`bun test`, `npm test`, `vitest`, `jest`, `pytest`, `cargo test`, `go test`, `dotnet test`, `msbuild`, `node --test`, `tsc`) and `handleTodoInterception` must read `params.phase || primaryOp.phase` as well as `phaseTitle`, and provide a neutral `test_summary` when no `testCommand` was specified.
  - `truncatePayloadState` (`src/payload-safety.ts`) must not match substring `"at "` inside normal English words or treat Markdown `"# "` headings as diff headers in non-diff states.

## Implementation Steps
1. Update `src/evidence-collector.ts`:
   - Enhance `extractCriteriaFromPlan(planContent, taskId)` and `collectTaskEvidence` to match task-specific criteria when `taskId` is a sub-task description, and support matching phase files by phase title or `phase` parameter.
2. Update `src/verification-gate.ts`:
   - Fix `constructGateQuestions` to use `Record<string, string>` for `deliverables_verdict.criteria` and `meets_criteria.criteria`.
   - Enrich `verifyTaskCompletion` state with `deliverableArtifacts` and task-scoped criteria.
3. Update `src/payload-safety.ts`:
   - Replace `"at "` in `ERROR_KEYWORDS` with stack-frame pattern `/^\s*at\s+\S+/` and restrict `truncatePayloadState` line-reordering to raw unified diffs.
4. Update `typesafe-planner.ts`:
   - Fix `sanitizeStateForTypeSafe` field budgets (`3050` for 3000-char fields, `5060` for 5000-char fields) and proportional >28KB trimming.
   - Fix `summarizeUnifiedDiff` to preserve real code hunks up to budget and keep `<unified_diff>` wrapper tags intact.
   - Expand `collectConversationContext` test summary detection and read `primaryOp.phase || params.phase` in `handleTodoInterception`.
   - Strip `"true: "` / `"false: "` prefixes in `normalizeQuestionForTypeSafe`.

## Success Criteria
- [ ] Sub-tasks in multi-phase plans are evaluated against their own task requirements rather than failing because later phases are unstarted.
- [ ] `sanitizeStateForTypeSafe` never double-clamps 3000-char fields from `runPhaseMacroCheck` or crushes them to 950 chars.
- [ ] `constructGateQuestions` produces valid `Record<string, string>` criteria accepted by `typesafe-api-client.cjs:validateInput`.

## Related Files
- Modify: `src/evidence-collector.ts`
- Modify: `src/verification-gate.ts`
- Modify: `src/cook-expert-judge.ts`
- Modify: `src/payload-safety.ts`
- Modify: `typesafe-planner.ts`
