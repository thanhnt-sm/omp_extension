---
phase: 1
title: "Evidence and authority prerequisites"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Evidence and authority prerequisites

## Overview
Future implementation scope, not executed by this review. Establish a correct repaired-current baseline before testing whether narrower JEV judgments add value. Findings and observed repros: [source review](../reports/261019-typesafe-source-rootcause-review.md).

## Requirements
- Keep original user contract, authoritative amendments, criterion/source references and task identities distinct from rolling work-log messages.
- Collect actual task-relative evidence, not just a task-filtered list of HEAD diffs; include the full baseline-to-evaluated commit interval and relevant dirty preimages.
- Preserve existing exact-target native transaction and rejected-block human-confirmation policy. Advisory/heuristic/model outputs never grant human authority.
- Represent unavailable, insufficient evidence, semantic rejection and human-required separately. Do not rewrite an independent Advisor result after reading JEV.
- Repair ordinary native-history rehydration and require host-attested EGC enforcement before handoff. No marker-only verification bypass.
- No threshold reductions, test weakening, approval shims or report removal to satisfy the gate.

## Architecture
Use current modules and existing native stage/result flow. Contract metadata must reference stable task/criterion identity, not display text alone. Evidence includes content/spans plus hashes; hashes do not prove semantic correctness or historical loaded memory. Capture minimal receipts after redaction with requested/resolved model, operation/targets, contract/evidence/rubric identities. Do not log raw secrets or model thinking.

## Related Code Files
- Modify after authorization: `src/evidence-collector.ts`, `typesafe-planner.ts`, `src/bicameral-consensus.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`, `src/payload-safety.ts`, `src/typesafe-api-client.cjs`.
- Update existing behavior tests in `tests/evidence-collector.test.ts`, `tests/bicameral-consensus.test.ts`, `tests/todo-drop-gate.test.ts`, `tests/todo-block-remediation.test.ts`, `tests/typesafe-lifecycle-gating.test.ts`, `tests/judge-input-fidelity.test.ts` and relevant rubric/transport modules.
- Update operational docs only when permanent behavior changes are implemented.

## Implementation Steps
1. Integration owner freezes operation/contract/receipt interfaces and runs symbol references before exported API changes; use LSP if configured, otherwise explicit callsite inventory.
2. Evidence executor owns `src/evidence-collector.ts` and its tests: actual dirty preimages, complete commit range, correct revert/delete/untracked handling, test execution provenance and explicit criteria mapping. No new scheduler.
3. Authority executor owns `src/bicameral-consensus.ts` and its tests: preserve independent results; fail closed on unavailable advisory validation; separate recommendation from authorization; handle intent negation conservatively.
4. Parent integration owner alone edits `typesafe-planner.ts`: durable contracts/receipt use, consensus policy consumption, ordinary-result rehydration, host-attested EGC handoff, correct error taxonomy and bounded evidence-aware retry semantics. Semantic reject cannot be retried unchanged; transport recovery may retry under deadline/cooldown without artificial edits.
5. Consolidate duplicate debate policy and align payload policy between tests/production; do not select the weaker behavior just to make tests pass. Keep native/advisory operations separate while sharing evidence preparation.
6. Inspect every matching caller/duplicate; run complete affected modules and changed-path smoke, then full `bun test` once integration is ready. Document intentional externally visible policy decisions.

## Success Criteria
- [x] Same-file pre-task hunk excluded; both task commits included; deleted/reverted/untracked files correctly attributed.
- [x] Continue/Proceed cannot replace original contract; native research packet retains relevant artifacts and genuine test applicability.
- [x] HTTP503 never becomes semantic reject, implementation-edit directives or fabricated JEV approval.
- [x] Advisor conflict cannot be discarded by native done; matching native result remains necessary.
- [x] Ordinary native todo history restores unfinished work; marker-only EGC does not disable enforcement.
- [x] Negated drop request does not become permission; existing verified obsolete-task removal and trusted rejected-block UI paths retain intended semantics.
- [x] Full relevant test files and actual callback smoke pass; `bun test` passes without verification-asset weakening.

## Risk Assessment
Baseline contents can contain secrets; retain minimally and redact before egress. New identities can break duplicate-name callers; migrate every caller without aliases. Workspace/test changes after evaluation require validity checks; do not promise atomic filesystem/todo transactions unless host capability is proven. Existing older plans overlap; this phase does not reset their statuses or authorize deployment.
