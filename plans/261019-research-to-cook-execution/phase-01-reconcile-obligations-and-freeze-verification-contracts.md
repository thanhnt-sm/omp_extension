---
phase: 1
title: "Reconcile obligations and freeze verification contracts"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Reconcile obligations and freeze verification contracts

## Overview
Implement the shared, host-owned contract and receipt identity used by every later phase. The exhaustive audit already exists; this phase must produce working code and consumer behavior, not another investigation-only report.

**Current state (2026-10-22):** `src/types/verification.ts` and `src/task-contract.ts` already exist and are wired. This phase is **verify-then-extend**: start by reconciling each requirement below as `I` (preserve), `P` (finish), or `U` (implement). Never recreate or overwrite an existing module.

Context: [33-plan inventory](../reports/261019-all-plan-implementation-inventory.md), [C01–C35 coverage](../reports/261019-all-research-implementation-coverage.md), [recovery evidence](../reports/261019-todo-recovery-evidence.json). Coverage: C04/C07/C15/C17/C29/C35; interface inputs for every other row.

## Requirements
- Preserve every accepted original obligation, authoritative amendment and parent integration requirement. Record unsafe/superseded mechanisms with an explicit replacement, never silently remove their objectives.
- Task identity is an incarnation, not text alone: include native phase/target binding, contract revision and creation provenance; same text reappended is a new incarnation.
- Bind the explicit user-approved cook/plan path and frozen criterion sources. Never infer the newest unfinished plan or treat Continue/Proceed, a worklog or an agent-generated checkbox as a new user contract.
- Keep source delivery, verification outcome, native lifecycle and deployment state separate. A JSON/report cannot grant authority or replace the native tracker.
- Preserve three already native-completed targets and the F16 repair. No replay of global proxy edits, ops[], fake approval, agent authorization/reset flags or threshold tuning.

## Architecture
Create bounded domain types in `src/types/verification.ts` and contract/history functions in `src/task-contract.ts`; use existing factory state and host session history rather than a scheduler/database. New names below are planned APIs, not existing SDK claims.

`TaskContract` carries contract/revision/incarnation IDs, exact native target, trusted original task kind and allowed mutation scope, approved source path/digest, original user/amendment references, stable criteria/source spans, approved command IDs, parent dependencies and policy digest. Bind kind/scope to trusted request/plan, not model-declared research. Task-bound snapshots/test/Advisor/outcome receipts share these identities; separate authorized remediation does not silently rewrite a review-only contract.

Outcome variants: `EVIDENCE_REQUIRED`, `UNAVAILABLE`, `REJECTED`, `HUMAN_REQUIRED`, `APPROVED_PENDING_COMMIT`. Actual native success requires a matching result; do not encode lifecycle completion into a semantic receipt. Probability, Choice confidence, heuristic scores and human authorization are distinct types/fields.

Freeze discriminated `ReviewBinding` variants: `consultation` binds host request/session, frozen question/evidence/policy and authorized scope, with no native authority; `task_review` requires the exact contract/incarnation/logical-operation/target binding; `parent_review` additionally binds parent obligations and applicable child/integration receipts. Shared dispatch/result provenance applies to every variant. Never create a synthetic todo for standalone consultation or make native identities optional everywhere. Evaluation uses explicitly frozen corpus contract references in shadow purpose, not imported live-task authority; a case snapshot cannot register/complete a Main todo.

Use supported `appendEntry`/`getBranch` and event hooks after capability checks; host-generated records include schema version, operation/call identity and source provenance. Persist contracts/debt, not portable staged approvals. Read-only history projection must reject malformed, foreign, stale or ambiguous binding. Never trust an agent-authored file as host provenance.

## Related Code Files
Paths below are absolute and actions apply only in this workspace.
- Extend (exists — do not recreate): `D:/100.Software/Github/omp_extension/src/types/verification.ts` — common contract/outcome/receipt types, no new service classes.
- Extend (exists — do not recreate): `D:/100.Software/Github/omp_extension/src/task-contract.ts` — binding, amendment and branch projection helpers.
- Modify: `D:/100.Software/Github/omp_extension/typesafe-planner.ts` — factory-owned contract registry, actual host hooks/tool registration and explicit plan binding.
- Modify: `D:/100.Software/Github/omp_extension/src/evidence-collector.ts` and `src/verification-gate.ts` — accept the shared contract reference, preserve advisory non-authority.
- Extend behavior tests under `D:/100.Software/Github/omp_extension/tests/` for contract binding/history; reuse current native lifecycle/input fixtures.
- Modify relevant historical plan frontmatter/notes only through documented CLI status operations and evidence-backed reconciliation; do not rewrite the historical record as current proof.

## Implementation Steps
1. Parent freezes the C01–C35 plus RECOVERY-SEC-01–06 coverage ledger and exact inherited plan acceptance. For each objective record implemented/partial/unimplemented/superseded/unsupported, implementation owner and final evidence. Audit inputs are already delivered; do not rerun all historical work.
2. Reconcile every requirement in this phase against the current tree (`I`/`P`/`U`) **before** editing. Then run symbol references before exported changes; use configured LSP, otherwise explicit callsite inventory. Record current real host registration, session identity/history, custom-entry and task receipt capabilities; do not invent `pi.spawnAgent` or change native todo schema.
3. Implement canonical contract parsing from an explicit approved plan/phase reference. Preserve source spans and parent obligations; exclude boilerplate as evidence, not as authority. For non-plan research use the actual original user request and explicit task association, not code/test requirements invented by a generic rubric.
4. Integrate a bounded project extension contract-binding operation if needed. Agent input is a proposal; validate it against observed native targets and trusted user/plan source before recording. Material scope reduction/conflict requires actual human authority; status updates and unrelated user turns do not silently amend criteria.
5. Persist/reproject supported host-owned contract/debt history across branch/restart; new session/branch identities invalidate transient stages. Do not restore approvals from receipt JSON or clear unresolved debt during hydration. Phase 3 supplies full lifecycle/debt policy consumption.
6. Freeze typed boundaries for phases 2–8 before parallel executors edit shared consumers. Native todo has no `testCommand`/`requirements`/`planPath` additions; project-owned evidence/Advisor tools and bound receipts supply missing functionality.
7. Update caller contracts/docs and the coverage ledger with code references. One integration owner edits the entrypoint; other executors own disjoint modules/tests. New modules target roughly200lines; extract cohesive functions, not wrapper services.

## Success Criteria
- [x] Original contract and criterion IDs survive Continue/Proceed, rolling context and unrelated newer reports.
- [x] Duplicate names/reappend/branch/restart cannot inherit another incarnation's authority or transient approvals.
- [x] Explicit phase references select only their real criteria; no latest-plan guessing or placeholder acceptance.
- [x] User amendments retain prior unmet obligations unless genuine authority changes them; payload flags cannot amend scope.
- [x] Existing F16 behavior and three native completions remain preserved; every U/P research/security row has a concrete execution owner.
- [x] Native/advisory consumers use the same typed identity while advisory results remain unable to commit native tasks.

## Verification
Parent runs full affected contract, evidence, lifecycle and input modules after integration, then a real registered callback smoke for original/changed/forged/stale binding. Run `bun test` at the integrated gate. The package currently defines only the test script: do not claim a nonexistent lint/tsc/build command ran. If new tooling becomes necessary, implement and document it explicitly.

## Risk Assessment
Agent-generated plan text and source hashes are not permission. History contains untrusted dynamic data; accept only proven host-origin records and preserve privacy. Raw user thinking/transcripts never enter receipts or JEV packets. This phase establishes revision-scoped evidence guarantees, not an invented atomic filesystem/native-todo transaction.
