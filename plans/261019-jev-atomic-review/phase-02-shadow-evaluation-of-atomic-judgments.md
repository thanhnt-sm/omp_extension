---
phase: 2
title: "Shadow evaluation of atomic judgments"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Shadow evaluation of atomic judgments

## Overview
Compare repaired-current workflow M against candidate H: narrow semantic judgments with real Advisor parent synthesis. This is a falsifiable experiment, not a claim of improved accuracy. No shadow output may mutate todo, plan or authority.

## Requirements
- Keep meaningful coarse todos. Decompose semantic predicates and evidence packets, not every command into a native todo.
- Retain original parent/integration obligations and explicit criterion coverage. All child checks passing is insufficient for parent completion.
- Use deterministic checks for exit codes, file existence, hashes, schema validity and exact matches; use JEV only for semantic relationships not reliably computable in code.
- Batch independent questions sharing coherent evidence. Dependent retrieval or changed evidence needs a new packet; do not concatenate unrelated todos to minimize requests.
- Distinguish supported, contradicted and insufficient evidence. Missing snippets cannot prove global absence or completeness.
- Freeze original acceptance meaning, model version, policy and rubric for a comparison. No prompt/threshold tuning against held-out cases to obtain approval.

## Architecture
`EvidencePacket` binds operation, targets, task/criterion IDs, contract revision, relevant workspace/test identity and evidence coverage/omissions. Source evidence contains path/range/text plus digest, not hashes alone. `ReviewReceipt` records post-redaction payload/rubric identity, requested/resolved model, typed criterion outcomes and applicability. A real read-only Advisor reads original contract, relevant evidence and integration results; it does not author native approval or waive user scope.

Keep deterministic composition in existing modules. Candidate shape may add a shared evidence-to-criterion function under `src/verification-gate.ts`; this is proposed API, not an existing exported function. Existing expert wrappers call it rather than create a second completion orchestrator.

## Related Code Files
- Candidate integration after authorization: `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `typesafe-planner.ts`, `src/typesafe-api-client.cjs`.
- Evaluation reports under `plans/261019-jev-atomic-review/reports/` only when the actual experiment runs; no fabricated dataset/results in this plan.
- Scenario specification: [36-case matrix](../reports/261019-jev-atomic-scenarios.md).

## Implementation Steps
1. Evaluation owner defines independently adjudicated whole-task cases and task/project-level train/holdout split. Include clean and flawed code, research without code edits/tests, docs, dirty baselines, multi-commit work, integration incompatibility, missing/tail proof, negation, injected artifacts and Vietnamese/English strata.
2. Compare current versus repaired inputs first. Compare repaired M versus H on equivalent original obligations and evidence; ablate duplicate Choice/Noul same-proposition checks and the added Advisor stage. Do not claim granularity caused an improvement already explained by fixed input plumbing.
3. Run candidate semantic predicates only in a separately authorized offline/shadow evaluation. Verify source/test provenance before model calls; abstain on omissions instead of guessing. Record exact resolved model and post-redaction inputs subject to privacy controls.
4. Measure task-level false approvals/rejections, abstentions, correct escalation, integration-defect recall, evidence coverage, reviewer workload, actual billed input usage and end-to-end latency. Include all attempts and Advisor cost; no accuracy claims from mocks or pure truth tables.
5. Compare batching strategies using the same predicates and equivalent evidence. Apply organization quotas, cancellation, bounded concurrency and one retry owner; cache only reusable semantic results with valid dependencies, never authority.
6. Predeclare risk tolerances and paired confidence intervals before reviewing held-out outcomes. Reject H's promotion if its advantage vanishes versus repaired M, misses parent defects, only shifts false rejects into abstentions, or exceeds declared cost/workload limits.

## Success Criteria
- [x] Original contract coverage and separate parent integration are proven in evaluated cases.
- [x] Task/project-held-out labels and adjudication procedure are recorded; language strata are visible.
- [x] Current/repaired/H paired results and uncertainty are reported, not invented.
- [x] Model/rubric/evidence identities and requested/actual usage are traceable without secret/thinking disclosure.
- [x] Same semantic reject is not repeatedly sampled until pass; recovered transport outage does not require fake source edits.
- [x] Demonstrated benefits meet predeclared risk/cost targets; otherwise retain repaired M and stop this candidate.

## Risk Assessment
API question independence is not statistical error independence. More checks can amplify false blocks; selected snippets can hide global counterevidence. Cached cookbook speedups and toy equations are not workload measurements. Corpus size requirements depend on task-level risk: even 0 observed false approvals is not 0 risk. If no representative adjudicated data is available, promotion remains pending, not approved by persona consensus.
