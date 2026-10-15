---
phase: 3
title: "Plan-CLI Stub Filter and Phase Matching Guard"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Plan-CLI Stub Filter and Phase Matching Guard

## Overview
Prevent newly scaffolded `plan-cli.cjs create` stub files (`TBD.`, `Brief description of scope and deliverables.`, `- [ ] Verifiable acceptance criteria`) from triggering false-positive JEV rejections or overwriting task requirements, fix substring collisions in `phaseIdentifier` matching (`src/evidence-collector.ts`), and narrow `isPlanFile` / `isClosingPlan` in `typesafe-planner.ts` so standalone reports under `plans/reports/*.md` are not blocked.

## Requirements
- **Functional**:
  1. Export `isPlanCliStub(content: string): boolean` in `src/evidence-collector.ts` (and re-use in `typesafe-planner.ts`): returns `true` when markdown content contains `plan-cli.cjs` boilerplate markers (`/\bBrief description of scope and deliverables\./i`, `/^TBD\.?\s*$/m` under `## Overview`, or both `- [ ] Verifiable acceptance criteria` and `- [ ] Test validation commands`).
  2. In `collectDeliverableArtifacts` (`typesafe-planner.ts:421-441`), skip files where `isPlanCliStub(rawContent)` is `true` so intermediate tasks completed right after `plan-cli.cjs create` do not feed unfilled `TBD.` stubs to JEV as completed deliverables.
  3. In `extractCriteriaFromPlan` (`src/evidence-collector.ts:159-186`), ignore `plan-cli.cjs` placeholder checkboxes (`Verifiable acceptance criteria`, `Test validation commands`) and return `[]` if `isPlanCliStub(planContent)` is `true`.
  4. In `collectTaskEvidence` (`src/evidence-collector.ts:389-395`), replace `options.taskId.includes(phaseIdentifier)` with a strict word-boundary regex (`new RegExp(\`\\\\bphase[-_\\\\s]*0*\${escapedId}\\\\b\`, "i")`) so task titles containing `"1"`..`"5"` do not collide with `phase-01..05.md` unless they explicitly reference `Phase 1` or `phase-01`.
  5. In `typesafe-planner.ts:1228-1233`, narrow `isPlanFile` to exclude `plans/reports/` (`!normalizedPath.includes("plans/reports/")`) and anchor `isClosingPlan` to YAML frontmatter (`/^---[\s\S]*?^status:\s*complete(?:d)?\b[\s\S]*?^---/im`).
- **Non-Functional**:
  - Deterministic, zero-allocation regex checks (<1ms overhead).

## Architecture
```ts
// src/evidence-collector.ts
export function isPlanCliStub(content: string): boolean {
  if (!content || !content.trim()) return false;
  const hasPhaseStubOverview = /Brief description of scope and deliverables\./i.test(content);
  const hasStubCheckboxes =
    /-\s*\[\s*\]\s*Verifiable acceptance criteria/i.test(content) &&
    /-\s*\[\s*\]\s*Test validation commands/i.test(content);
  const hasOverviewTbd = /##\s+Overview\s*\r?\n+\s*TBD\.?\s*(?:\r?\n|$)/i.test(content);
  return hasPhaseStubOverview || hasStubCheckboxes || hasOverviewTbd;
}
```

## Related Code Files
- Modify: `src/evidence-collector.ts` (`isPlanCliStub`, `extractCriteriaFromPlan`, `collectTaskEvidence` lines `159-186, 383-415`)
- Modify: `typesafe-planner.ts` (`collectDeliverableArtifacts` lines `421-441`, `isPlanFile`/`isClosingPlan` lines `1227-1233`)
- Modify: `tests/evidence-collector.test.ts` and `tests/typesafe-lifecycle-gating.test.ts`

## Implementation Steps
1. **Write Failing TDD Tests (`tests/evidence-collector.test.ts`, `tests/typesafe-lifecycle-gating.test.ts`)**:
   - Test `isPlanCliStub` on `plan-cli.cjs create` `plan.md` (`## Overview\n\nTBD.`) and `phase-01-*.md` (`Brief description of scope and deliverables.`) $\rightarrow$ `true`, and on populated phase files $\rightarrow$ `false`.
   - Test `collectTaskEvidence` with `taskId: "Step 1: Research API"` against a plan with `| 1 | [Phase 1](./phase-01-foo.md) |` $\rightarrow$ does NOT match `phase-01-foo.md` unless `taskId` explicitly mentions `Phase 1` or `phase-01`.
   - Test writing a report to `plans/reports/foo.md` while `activeContractedTasks` is non-empty $\rightarrow$ allowed without triggering Plan Closure Guard.
2. **Implement Stub Filter, Word-Boundary Phase Matching, and Scoped Plan Closure Guard**:
   - Update `src/evidence-collector.ts` and `typesafe-planner.ts`.
3. **Run Targeted Tests**:
   - Execute `bun test tests/evidence-collector.test.ts tests/typesafe-lifecycle-gating.test.ts`.

## Success Criteria
- [x] `isPlanCliStub` accurately identifies `plan-cli.cjs create` boilerplate and ignores populated plans/phases.
- [x] `collectDeliverableArtifacts` excludes unfilled `plan-cli.cjs` stubs from `deliverable_artifacts`.
- [x] `collectTaskEvidence` no longer matches arbitrary digits in `taskId` against `phaseIdentifier`.
- [x] `plans/reports/*.md` writes never trigger false Plan Closure Guard errors.

## Risk Assessment
- **Risk**: A real completed plan might legitimately contain the acronym `TBD` in a risk table.
- **Mitigation**: `hasOverviewTbd` only matches when `## Overview` is immediately followed by a standalone `TBD.` line (`plan-cli.cjs` exact template), not arbitrary occurrences of `TBD` in prose.
