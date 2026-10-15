---
phase: 4
title: "Task Report Telemetry and TDD Regression Suite"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Task Report Telemetry and TDD Regression Suite

## Overview
Enrich `formatTaskReport` in `typesafe-planner.ts` to transparently display the categorical `verdict` (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED`), `meets_criteria` calibrated score, and inferred `task_type` (`code_change` | `analysis_research` | `doc_specification`), run the full regression suite across all 35+ test files, and synchronize the baseline deployment via `node tools/sync-baseline.cjs`.

## Requirements
- **Functional**:
  1. Extend `TaskReport.scores` in `typesafe-planner.ts:656-691` with optional `verdict?: string`, `confidence?: number`, and `taskType?: string`.
  2. In `formatTaskReport` (`typesafe-planner.ts:680-686`), preserve the existing substring `meets_criteria=${r.scores.meetsCriteria.toFixed(2)} | drift=${r.scores.drift || "none"} | scope=${r.scores.scope || "none"}` (required by existing tests in `tests/judge-input-fidelity.test.ts`) and append ` | verdict=${r.scores.verdict}` and ` | task_type=${r.scores.taskType}` when provided.
  3. Pass `verdict: macroResult.deliverablesVerdict` and `taskType` from `handleTodoInterception` (`typesafe-planner.ts:2048-2128`) into `formatTaskReport`.
  4. Run full `bun test` suite and deploy via `node tools/sync-baseline.cjs`.
- **Non-Functional**:
  - Preserve 100% compatibility with existing `formatTaskReport` snapshot/substring assertions in `tests/judge-input-fidelity.test.ts` and `tests/typesafe-planner.test.ts`.
  - Respect the Golden Invariant (`AGENTS.md`): never modify `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts` directly.

## Architecture
```ts
// typesafe-planner.ts
if (r.scores.meetsCriteria !== undefined) {
  const extras: string[] = [];
  if (r.scores.verdict) extras.push(`verdict=${r.scores.verdict}`);
  if (r.scores.taskType) extras.push(`task_type=${r.scores.taskType}`);
  const suffix = extras.length > 0 ? ` | ${extras.join(" | ")}` : "";
  lines.push(
    `Judge: meets_criteria=${r.scores.meetsCriteria.toFixed(2)} | drift=${r.scores.drift || "none"} | scope=${r.scores.scope || "none"}${suffix}`
  );
}
```

## Related Code Files
- Modify: `typesafe-planner.ts` (`TaskReport`, `formatTaskReport` lines `656-723`, `handleTodoInterception` lines `2048-2128`)
- Modify: `tests/judge-input-fidelity.test.ts`
- Execute: `tools/sync-baseline.cjs`

## Implementation Steps
1. **Write Failing TDD Tests (`tests/judge-input-fidelity.test.ts`)**:
   - Assert `formatTaskReport` includes `meets_criteria=`, `drift=`, `scope=`, `verdict=`, and `task_type=` when provided.
   - Add an end-to-end `handleTodoInterception` regression test covering:
     - Research task (`"Clarify requirements and brainstorm approaches"`) with zero changed files $\rightarrow$ classified as `"analysis_research"`, `agentWorkLog` passed as `deliverable_artifacts`, `meets_criteria` (`noul`) sent in questions.
     - Intermediate task after `plan-cli.cjs create` stub creation $\rightarrow$ stub `.md` files filtered out by `isPlanCliStub`.
2. **Update `formatTaskReport` & `handleTodoInterception` (`typesafe-planner.ts`)**:
   - Wire `verdict: macroResult.deliverablesVerdict` and `taskType` into `formatTaskReport`.
3. **Verify & Deploy**:
   - Run `bun test` across the entire repository.
   - Run `node tools/sync-baseline.cjs` to backup, sync to `C:/Users/thant/Projects/omp_extension`, verify the proxy trampoline, and run target tests.

## Success Criteria
- [x] `formatTaskReport` outputs `verdict=` and `task_type=` alongside `meets_criteria=`, `drift=`, and `scope=`.
- [x] Full `bun test` suite passes with 0 failures.
- [x] `node tools/sync-baseline.cjs` succeeds and verifies target runtime.

## Risk Assessment
- **Risk**: Existing regex assertions on `Judge: meets_criteria=...` line in `tests/judge-input-fidelity.test.ts` might check end-of-line `$`.
- **Mitigation**: Verified via `ScoutPlannerAndEvidence` that `tests/judge-input-fidelity.test.ts` uses `.toContain("meets_criteria=")` without end-of-line anchors; appending ` | verdict=... | task_type=...` is non-breaking.
