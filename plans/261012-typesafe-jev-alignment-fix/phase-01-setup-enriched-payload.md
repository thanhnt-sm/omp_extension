---
phase: 1
title: "Setup Enriched Payload"
status: complete
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Setup Enriched Payload

## Overview
Deliver Tier 1 Contextual Injection (Option A) to close the information asymmetry gap in Gate 2. This phase updates `evidence-collector.ts` to correctly resolve criteria from `phase-*.md` files (instead of falling back to `[taskId]`), infers `taskType` based on git status, and packages non-git deliverables (like generated reports or configs) into the `MacroCheckContext`.

## Requirements
- **Functional:** `evidence-collector.ts` MUST extract criteria from the specific `phase-*.md` file matching the current task.
- **Functional:** Infer `taskType` (`code_change`, `analysis_research`, `doc_specification`) automatically.
- **Functional:** Extract uncommitted textual artifacts (e.g., markdown files, JSON) as `deliverableArtifacts`.
- **TDD Requirement:** Unit tests MUST be written before implementation.

## Architecture
- `src/evidence-collector.ts`: Update `extractCriteriaFromPlan` to locate and parse the correct phase file.
- `src/typesafe-planner.ts`: Analyze `gitStatus` in `handleTodoInterception`. If modified files are purely non-code (like `.md`), set `taskType = "doc_specification"`. If no diff but artifact exists, `analysis_research`. Otherwise, fallback to `code_change`.
- `src/cook-expert-judge.ts`: Extend `MacroCheckContext` to include `taskType` and `deliverableArtifacts`.

## Related Code Files
- Modify: `src/evidence-collector.ts`
- Modify: `src/typesafe-planner.ts`
- Modify: `src/cook-expert-judge.ts`
- Modify: `tests/evidence-collector.test.ts`
- Modify: `tests/typesafe-planner.test.ts`

## Implementation Steps
1. **TDD:** Write tests in `tests/evidence-collector.test.ts` to assert that criteria are successfully extracted from `phase-XX-*.md` files when `plan.md` delegates phases.
2. **TDD:** Write tests in `tests/typesafe-planner.test.ts` to assert correct `taskType` inference based on mock git status.
3. Update `src/evidence-collector.ts` to support reading associated phase files.
4. Update `src/typesafe-planner.ts` to determine `taskType` and capture new text artifacts as `deliverableArtifacts`.
5. Update `MacroCheckContext` interface in `src/cook-expert-judge.ts`.
6. Pass the enriched context from `typesafe-planner.ts` into `runPhaseMacroCheck`.

## Success Criteria
- [x] `evidence.criteria` correctly populates from `phase-*.md` files instead of defaulting to `[taskId]`.
- [x] `MacroCheckContext` successfully receives `taskType` and `deliverableArtifacts`.
- [x] All TDD unit tests pass.

## Risk Assessment
- **Token Bloat:** Extracting artifacts might exceed JEV context limits.
  - *Mitigation:* Cap `deliverableArtifacts` extraction at 8KB total text and truncate if necessary.