---
title: "Technical Journal: Root-Cause Analysis & Architecture for TypeSafe Todo Done Verdict Fidelity"
date: 2026-10-14
tags: [typesafe, jev-latest, bicameral-consensus, todo-done, calibration, plan-cli-stubs, brainstorm]
skills: [ck:scout, ck:research, ck:docs-seeker, ck:advisor, ck:brainstorm, ck:plan, ck:journal, ck:project-organization]
---

# Technical Journal: TypeSafe `todo done` Verdict Fidelity & Calibration Architecture

## Context
During previous multi-stage sessions (`ck:scout` $\rightarrow$ `ck:research` $\rightarrow$ `ck:brainstorm` $\rightarrow$ `ck:plan`), the user observed two recurring anomalies in `omp_extension`:
1. `typesafe-task-report` repeatedly displayed `meets_criteria=0.00` and `"Deliverable verification rejected: implementation is evading work, malicious, or stubs out needed functionality."` on `todo(op="done")` for research, brainstorming, and intermediate planning tasks, whereas the final task (after all markdown files were populated) passed with `meets_criteria=1.00`.
2. Evaluations on `ask` and `todo` occurred inside `pi.on("tool_call")` host hooks without exposing categorical JEV verdicts (`deliverables_verdict`) or inferred `task_type` in the task report.

The user requested a complete, visible execution of the pipeline:
`ck:scout` $\rightarrow$ `ck:research` $\rightarrow$ `ck:docs-seeker` $\rightarrow$ `ck:advisor` $\rightarrow$ `xd://typesafe_*` $\rightarrow$ `ck:brainstorm` $\rightarrow$ `ck:plan` $\rightarrow$ `ck:journal` $\rightarrow$ `ck:project-organization`.

## What Happened
1. **Parallel Codebase Scouting (`ck:scout`)**:
   - Spawned `ScoutJudgeAndConsensus` and `ScoutPlannerAndEvidence` to audit `src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `src/verification-gate.ts`, `src/evidence-collector.ts`, `typesafe-planner.ts`, and all 35 test suites in `tests/`.
2. **Documentation & Best-Practices Research (`ck:docs-seeker` & `ck:research`)**:
   - Fetched TypeSafe System One live documentation (`https://docs.typesafe.ai/primitives.md` and `https://docs.typesafe.ai/confidence.md`) and researched calibrated probabilistic scoring (`noul`) vs. categorical `choice` verdicts.
   - Confirmed that TypeSafe `Choice` `confidence` ($\frac{p_{\max} - 1/n}{1 - 1/n}$) measures distribution concentration on the winning option (e.g., high confidence in `"REJECT"`), whereas `Noul` returns the calibrated probability $P(\text{yes}) \in [0, 1]$, and both can be queried in parallel in one HTTP request.
3. **Bicameral Advisor & `xd://typesafe_*` Evaluation (`ck:advisor` + `xd://typesafe_*`)**:
   - Consulted `ConsultCkAdvisor` (`ck:advisor` subagent) and explicitly executed `xd://typesafe_advisor`, `xd://typesafe_judge`, `xd://typesafe_expert_review`, `xd://typesafe_rerank`, and `xd://typesafe_evaluate_multi`.
   - While writing our first report under `plans/reports/`, we also uncovered a 6th live bug (`typesafe-planner.ts:1228-1232`): `isPlanFile` matched `/plans[\/\\].*\.(md|markdown)$/i` and `isClosingPlan` matched unanchored `/status:\s*complete(d)?\b/i`, causing standalone reports in `plans/reports/` to trigger the Plan Closure Guard whenever contracted tasks were active.
4. **Brainstorm & Plan Generation (`ck:brainstorm` & `ck:plan`)**:
   - Presented 3 architectural options to the user via `ask` (annotated live by TypeSafe System One and `ck:advisor`). The user selected **Option A (Dual-Primitive Hybrid + Task Classifier + Stub Filter)** and approved immediate `/ck:plan` generation.
   - Generated `plans/261014-typesafe-todo-done-verdict-fidelity/plan.md` and 4 detailed TDD phase files (`phase-01` through `phase-04`) with zero `TBD` placeholders.

## Key Decisions
1. **Dual-Primitive Parallel Query (`deliverables_verdict` + `meets_criteria`)**:
   - Rather than dropping `meets_criteria` (Option B, which breaks 13 existing unit tests) or bypassing Gate 2 on non-code tasks (Option C, which opens an evasion hole), `runPhaseMacroCheck` will send `meets_criteria` (`type: "noul"`) alongside `deliverables_verdict` (`type: "choice"`), using `rawMeetsCriteria` as `meetsCriteriaNoul` and falling back to categorical mapping only when unit test mocks omit `meets_criteria`.
2. **Cognitive Task Classification with Anti-Spoofing Preservation**:
   - Expand `inferTaskType` to detect cognitive/workflow verbs anywhere in `taskDescription` when no code files are modified, while strictly retaining `hasCodeFiles` and `containsCodeChanges` overrides so code changes are always verified as `"code_change"`.
3. **Deterministic `isPlanCliStub` Filtering & Word-Boundary Phase Matching**:
   - Exclude unmodified `plan-cli.cjs create` stub files from `collectDeliverableArtifacts` and `extractCriteriaFromPlan`, replace `options.taskId.includes(phaseIdentifier)` with `/\bphase[-_\s]*0*${escapedId}\b/i`, and exclude `plans/reports/` from `isPlanFile`.

## Implementation & Verification Results (`/ck:cook --tdd`)
1. **Phase 1 — Dual-Primitive JEV Calibration (`src/cook-expert-judge.ts`, `src/plan-evaluator.ts`)**:
   - Added `meets_criteria` (`type: "noul"`) alongside `deliverables_verdict` (`type: "choice"`) in `runPhaseMacroCheck`, validated `rawMeetsCriteria` in `[0, 1]` before verdict resolution (fail-closed), preserved calibrated `meetsCriteriaNoul`, emitted task-type-aware `P=${rawMeetsCriteria.toFixed(2)}` diagnostics, and aligned `claude_isolation_adherence` threshold in `src/plan-evaluator.ts` with `resolveAutoApprovalThreshold()` (`0.80`).
2. **Phase 2 — Cognitive Task Classifier & Work-Log Fallback (`typesafe-planner.ts`, `src/bicameral-consensus.ts`)**:
   - Exported `COGNITIVE_TASK_PATTERN` and `IMPLEMENTATION_LEAD_PATTERN` guard in `inferTaskType` and synchronized `evaluateAdvisorIntent`, ensuring research/brainstorming/planning tasks without code changes classify as `"analysis_research"` and supply `convo.agentWorkLog` when `rawDeliverableArtifacts` is empty while preserving anti-spoofing `"code_change"` overrides.
3. **Phase 3 — `plan-cli.cjs` Stub Filter & Word-Boundary Phase Guard (`src/evidence-collector.ts`, `typesafe-planner.ts`)**:
   - Exported `isPlanCliStub(content)` to filter unmodified `plan-cli.cjs create` templates in `collectDeliverableArtifacts` and `extractCriteriaFromPlan`, replaced substring `options.taskId.includes(phaseIdentifier)` with word-boundary `/\bphase[-_\s]*0*${escapedId}\b/i`, and excluded `plans/reports/` from `isPlanFile`.
4. **Phase 4 — Task Report Telemetry & Baseline Deployment (`typesafe-planner.ts`, `tools/sync-baseline.cjs`)**:
   - Extended `TaskReport.scores` and `formatTaskReport` with `verdict` and `task_type` telemetry, verified all test suites (`295 pass, 0 fail` in workspace; `310 pass, 0 fail` in deployed target across 35 files), and synchronized to `C:/Users/thant/Projects/omp_extension` via `node tools/sync-baseline.cjs`.
