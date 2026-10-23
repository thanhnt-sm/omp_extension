---
phase: 9
title: "Migrate all consumers and verify integration"
status: pending
priority: P1
dependencies: [7]
---

# Phase 9: Migrate all consumers and verify integration

## Overview
Integrate every actual caller into the canonical contract/evidence/result/authority pipeline and verify real consumer behavior. The phase7 dependency means its **source-ready outputs**, not a requirement to mark phase7's externally dependent live-child criteria complete. Structural migration may proceed after the phase7-source-ready milestone while runtime/provider acceptance or phase8 labels/spend wait. **Strategy selection is a separate gate: until Phase 8 returns a valid adoption/retention decision, Phase 9 must keep repaired-M and may not claim a selected H strategy.**

## Requirements
- No duplicate native authority orchestrator, compatibility shim, deprecated alias or production fake fallback. Preserve meaningful generic API/advisory tools without giving them native authority.
- One input/result meaning across native done/drop, explicit verifier, plan elevation, expert roles, Advisor, rerank/multi-label, standalone EGC and evaluation driver, with purpose-specific applicability.
- Repaired-M remains selected while H promotion lacks required evidence. This is deliberate configured strategy, not per-request fallback after an H rejection/error.
- Operational README and current operations guide agree with current host registration, bound contract/evidence collection, receipt preparation, preflight staging, matching-result commit, configured approval policy, mutation grants and current repository command/path. Historical architecture/runbooks explicitly identify their applicable source/runtime revision instead of presenting old gates or environment flags as current.
- Cross-cutting verification evidence distinguishes implementation, component tests, integration, host-live behavior, deployment and external prerequisites. A passing suite or source SHA alone does not close the other dimensions.

## Architecture
The common evaluator consumes phase1/2 contracts/packets, phase3 authority, phase6 policy and phase7 source-ready implementations. Generic raw judge and standalone consultation remain useful without synthetic todos, but their discriminated receipts cannot stage native work. Task/parent native consumers require current host contract/incarnation/operation/target bindings and real applicable reasoning. Phase7 remaining live acceptance stays open until observed; source-ready is not a waiver.

Separate evaluation strategy selection from runtime outcome handling. An `adoption.json` record is non-authoritative evidence requiring validated policy/revisions and activation approval. H unavailable/rejected never invokes M to search for approval. If retention is selected, H remains a real tested non-authoritative candidate/driver; no second production task tracker or orphan mock path remains.

## Related Code Files
- Verify-then-extend actual consumers in `D:/100.Software/Github/omp_extension/typesafe-planner.ts`, `src/bicameral-consensus.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`, `src/egc.ts` and shared CJS/policy modules. Do not recreate modules already present.
- Integrate existing contract/evidence/receipt/atomic/Advisor modules and `D:/100.Software/Github/omp_extension/tools/jev-paired-eval.ts` only where a real caller gap remains; no aliases to obsolete implementations.
- Update actual agent definitions under `D:/100.Software/Github/omp_extension/agents/` and `.omp/agents/`; never write global installed definitions directly.
- Update current maintained docs and affected behavior tests from real behavior; enumerate every changed-path consumer before editing.

## Implementation Steps
1. Re-run exported references against the integrated revision and enumerate every real caller/registration. Use the C01–C35/security coverage ledger, not only filenames from the recent atomic plan. Record purpose, contract source, evidence preparation, result consumer, authority and final native effect for each.
2. Move callers to canonical inputs and strict required primitive outputs; remove confidence-to-probability/mock compatibility paths, obsolete duplicated wrappers and post-JEV Advisor rewriting. Update all public docs/tests using changed contracts; do not leave aliases to hide breakage.
3. Confirm native/advisory distinction: an explicit verifier or expert result can inform a bound operation but never commit it, clear rejection debt or authorize another target. Plan-file/plan-cli closure guards consume the correct canonical unfinished set after history restoration.
4. Integrate the real Advisor request/receipt lifecycle with direct decision/expert roles and native recovery. Missing assessment says pending with exact executable action. Existing six report sections render actual validated assessment data, never a template disguised as reasoning.
5. Preserve phase6 bounded generic API/rerank/multilabel and per-purpose policy. Canonical semantic packets cannot bypass host count/body/privacy limits; generic raw calls cannot create authority receipts.
6. Apply strategy decision only to the exact evaluated implementation/policy/model scope. Until valid adoption and activation, select repaired-M; continue testing H's real non-authoritative driver. No runtime error/negative-result fallback can resample a different strategy.
7. Prove source/task/test/contract freshness, logical operation versus new call IDs, matching native commit, per-target reporting, EGC coexistence and debt recovery end-to-end. Include failed parent compatibility despite passing children and research/docs with no code/tests.
8. Reconcile all older accepted behavior with the explicit safe replacements. Preserve actual working F16/identifier-boundary/transport/deployment/native-transaction behavior. Delete dead source paths and obsolete incidental/wording tests, not substantive failing acceptance or inconvenient reports.
9. Update maintained docs/current checkpoints and every mapped legacy objective from actual evidence. Preserve dated historical claims as history with correction notes; do not globally scrub old prose or mark all child checkboxes complete just because a parent table said so.
10. Independent reviewer examines integrated code/security/maintenance. Address actionable issues via scoped executor→parent checks/smoke→fresh review. Parent owns acceptance, not workers' completion labels or advisory confidence scores.

## Success Criteria
- [ ] Every actual native/advisory/plan/expert/Advisor/fanout/EGC/eval caller uses the intended canonical semantics and purpose policy.
- [ ] No obsolete probability fabrication, duplicate debate/authority implementation, unsafe fallback or compatibility alias remains.
- [ ] Real reasoning and parent integration work; unsupported, forged, stale or unavailable evidence cannot stage approval.
- [ ] Generic/advisory API calls remain useful but cannot commit task lifecycle or grant consent.
- [ ] H selection requires validated adoption; H rejection/error never switches to M to obtain approval.
- [ ] Research/docs/non-git, multi-commit/dirty evidence, closure/history/debt and all high-risk security transitions pass actual behavior checks.
- [ ] Each U/P coverage row has code/caller and exercised evidence or a specific still-unmet external criterion; no blanket completion claim.

## Verification
Parent runs each fully affected module after its source integration, then the full `bun test` once the complete candidate is ready. Run actual changed-path extension/native/Advisor and evaluation CLI smokes, not only test suites. Separate fake transport/control-flow proof, genuine readonly child execution, live JEV benchmark and actual native commit evidence. Only configured project commands may be claimed; current package has no lint/typecheck script. Target-deployment verification is a separate surface in phase10, not a rerun to reconfirm an old failure.

## Risk Assessment
A canonical pipeline is not a universal approval wrapper. Keep function responsibilities/purpose policy small; do not rebuild the existing transport, deployment framework or task system. New modules should be cohesive and bounded; unrelated global refactors are not authorized. If measurement prerequisites delay H adoption, keep that lane unfinished while completing these source/integration obligations.
