---
title: "JEV session forensics across workspaces"
status: completed
priority: P1
effort: "completed"
supersededBy: "261102-atomic-judge-proactive-advisor-healing"
completedInCycle: "2026-11-02"
verificationSuite: "tests/atomic-jev-judge.test.ts, tests/proactive-advisor-dispatch.test.ts"
---
# JEV session forensics across workspaces

## Reviewed execution plan
Canonical plan: [plans/261018-jev-session-forensics/plan.md](plans/261018-jev-session-forensics/plan.md).

The canonical five-phase plan supersedes this brief's original approach and diagnosis. Phases 1–3 retain read-only forensics and ephemeral parser TDD. User-requested Phases 4–5 add permanent native todo recovery/evidence fixes with retained behavioral TDD. This planning revision does not implement or deploy runtime fixes.

## Preserved scope
Analyze up to the latest 15 eligible OMP sessions in every locally archived workspace. Focus on actual JEV inputs/outputs and comparable Advisor/JEV evaluations. Deliver an evidence-backed Vietnamese diagnosis and five independent ck:predict persona reports.

Forensic Phases 1–3 make no code, thresholds, permanent tests, deployment or global configuration changes. Recovery Phases 4–5 plan scoped workspace code/tests/docs changes and managed rollout after verification. Neither branch may lower JEV thresholds, bypass native commit authority or modify the immutable global OMP proxy. Missing historical payloads remain unknown, not justification for telemetry or API replay.

## Validated decisions
- Refresh the latest-session cohort at one execution cutoff; exclude the investigation session and empty sessions before slicing.
- Use ephemeral parser TDD with synthetic RED/GREEN checks; retain only sanitized evidence/results.
- Apply all nine accepted, scoped red-team findings. See canonical plan for dispositions and source anchors.
- Recovery-first order: Phase 4 → 5 may execute independently before archive analysis. User selected human confirmation to block rejected tasks, preserving rejection debt; AUTO_APPROVE rm/drop must not prompt.
- [Todo recovery research](plans/261018-jev-session-forensics/reports/todo-recovery-research.md) records source anchors and observed docs-only boundary false positive; the runtime fix remains unimplemented.

## Prior reported results — not reproduced in this review
The earlier brief reported 14 workspaces, 60 sessions, 23,449 JSONL records, 7,486 tool starts and 119 task-report notices. It reported 54 score-bearing reports (mean 0.402, median 0.33, 29 below 0.50) and separately 159 native refusal results, 131 numeric (mean 0.227, median 0.22).

No linked original selection manifest or event ledger was supplied. These figures are historical claims, not fresh observations, parser acceptance targets or pooled score populations. The earlier cohort reportedly included an empty/current session. Exact historical reproduction is not required by the validated fresh-cohort choice.

The earlier brief also reported current/deployment hash equality, missing native wire payloads, and unanimous five-persona CAUTION verdicts. Those results were not reproduced in this planning review; execution must independently verify them or retain the limitation.

## Source-backed corrections from plan review
- Native `todo done` can exit at Gate 1 before JEV (`typesafe-planner.ts:1618-1638`). If native Gate 2 is reached, the call passes `taskType: "code_change"` and invokes `collectDeliverableArtifacts` without changed files (`:1662-1663`).
- The dedicated artifact string is therefore empty by default (`typesafe-planner.ts:463-485`), but markdown can still reach the unified diff (`src/evidence-collector.ts:425-436`). Do not claim all report evidence is absent.
- The native call omits `diffScope` and does not pass `planPath` to evidence collection. Collected diff provenance can differ from the fallback scope advertised to JEV (`src/cook-expert-judge.ts:222-226`). Plan criteria are not automatically collected (`src/evidence-collector.ts:501-548`).
- Advisor option ranking scores are not JEV completion probability. Returned Advisor confidence/verdict can be modified after JEV (`src/bicameral-consensus.ts:828-848,1142-1168`). Native final authority checks `macroResult.approved` (`typesafe-planner.ts:1671`).
- Current native proposed reports contain no score fields (`typesafe-planner.ts:1687-1693`). Historical score-bearing notices need route/version/decision/authority attribution; current source alone cannot explain their origin.
- Current macro policy uses strict `P > 0.50` at the default threshold and can downgrade categorical APPROVE (`src/cook-expert-judge.ts:363-372`). Historical thresholds require per-event evidence.
- Same-session temporal proximity is not a same-input comparison. Only explicit same-evaluation, comparable-proposition pairs enter disagreement rates; cross-call sequences stay contextual.

## Verification and handoff
Planning verification covers source contracts, a real synthetic boundary-classification smoke, CLI plan inspection and structural/link checks. Phase files specify future RED/GREEN, parser smoke, privacy checks, native recovery/evidence fixes, Vietnamese deliverables and managed runtime proof. Do not report those future checks or repairs as already passed.

After clearing context:
`/ck:cook --tdd D:/100.Software/Github/omp_extension/plans/261018-jev-session-forensics/plan.md`
For immediate todo recovery, execute Phase 4 → 5 first; keep Phase 1 → 2 → 3 as the independent forensic branch.
