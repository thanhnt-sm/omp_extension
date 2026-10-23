---
phase: 3
title: "Enforce authority lifecycle and actionable recovery"
status: pending
priority: P1
dependencies: [2]
---

# Phase 3: Enforce authority lifecycle and actionable recovery

## Overview
Repair authority/result/recovery semantics before decomposed judgments can influence native work. Coverage: C02/C09–C18 and RECOVERY-SEC-01/02/04/05. Build working lifecycle and policy behavior, not only Advisor instructions.

**Current state (2026-10-22):** the lifecycle/EGC code has already moved beyond the historical `verified` persistence model. This phase is **verify-then-extend**. The old `src/egc.ts:263`/`:359-380` and `false ?? resultPhases` references are stale discovery notes; resolve current symbols and preserve existing regression coverage before changing authority code.

## Requirements
- One deterministic composer consumes independently preserved intent/reasoning and JEV outcomes. Native done must not accept only `macroResult.approved` while ignoring HUMAN_ESCALATION/RECONCILE/REJECT.
- No JEV approval may be fabricated from a heuristic, service outage, Choice confidence, missing answer or synthetic fallback. Keep raw probability, confidence and local intent signals separate.
- Preserve current approved policy while correcting representations. Do not restore historical .80/.30 rules, lower thresholds to obtain pass, or declare .50 universally optimal. Any future policy change needs explicit approved evidence.
- Unavailable, evidence-required, semantic-rejected, human-required and approved-pending-commit have different next actions. Lifecycle blocked/pending is not a verification result.
- Rejected blocking retains trusted exact-target confirmation; verified obsolete drop remains automatic when actual policy permits. An automatic drop keeps `verified-policy` provenance, not a human-confirmed label. Unblock/start cannot erase debt or consent boundaries.

## Architecture
Reuse the phase1 typed outcome/contract and phase2 evidence receipt. Treat existing keyword logic as a limited `IntentSignal`, not a real Advisor or calibrated probability. It may identify uncertainty/conflict, not supply human authority. Phase7 supplies the actual independent reasoning assessment; missing required reasoning produces an actionable request, never a fake pass.

Native staging uses the composed disposition, bound operation/input/targets/incarnation/revision/evidence/policy and existing generation/TTL/tombstone rules. Matching successful native result alone commits. Human permission is host context or trusted UI for that exact fresh operation; it is not a payload flag, an ask answer impersonating ui.confirm, or permanent permission keyed by task text.

Planner remains the native authorizer; remove marker/env-only delegation rather than add optional EGC ownership transfer. EGC may provide a bound semantic assessment but cannot disable planner enforcement. Standalone EGC distinguishes assessment from matching native lifecycle success: verified-in-preflight never closes an obligation or releases debt. Missing/throwing/stale/noncovering EGC leaves planner enforcing or an explicit unavailable outcome, never fail-open.

## Related Code Files
- Modify: `D:/100.Software/Github/omp_extension/src/bicameral-consensus.ts` — independent inputs, canonical typed decisions, no post-JEV rewriting/fake outage agreement, negation and exact intent.
- Modify: `D:/100.Software/Github/omp_extension/typesafe-planner.ts` — consume disposition, human boundary, branch/debt restoration, outcome-specific reports and recovery.
- Modify: `D:/100.Software/Github/omp_extension/src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/remediation-generator.ts` — canonical primitive/result/error handling and concrete guidance.
- Modify: `D:/100.Software/Github/omp_extension/src/egc.ts` — no protected-config/`unsandboxed` payload may reach the TODO/native completion branch merely because the scan is currently nested under `WRITERS`; apply the same conservative input scan before `TODO_TOOLS` dispatch where applicable.
- Modify: `D:/100.Software/Github/omp_extension/src/egc.ts` — `uncontracted:"allow"` must not make a task with no verify/holdout evidence falsifiably complete; require an explicit bounded verification basis or return evidence-required, and expose the mode in lint/lock output.
- Modify: `D:/100.Software/Github/omp_extension/src/egc-native.ts` / target projection — bind staged completion to contract incarnation, exact call ID, generation and evidence/pass fingerprint; `[id]` shape alone is not sufficient for same-text or forged target identity.
- Reuse/extend: `D:/100.Software/Github/omp_extension/src/task-contract.ts`, `src/types/verification.ts`, `agents/advisor.md`, `agents/ck-advisor.md`, `.omp/agents/advisor.md`, `.omp/agents/ck-advisor.md`.
- Extend whole behavior modules: `tests/bicameral-consensus.test.ts`, `tests/todo-block-remediation.test.ts`, `tests/todo-drop-gate.test.ts`, `tests/typesafe-lifecycle-gating.test.ts`, `tests/egc.test.ts`, `tests/verification-gate.test.ts`.

## Implementation Steps
1. Inventory every macro/done/drop/decision/explicit-verifier result consumer. Freeze the canonical required fields and remove all probability fabrication from Choice confidence, default0/.5/1 and renamed mock-compatible schemas; update actual callers/tests, not compatibility aliases.
2. Preserve independent raw intent, real reasoning and JEV assessments. Remove post-JEV Advisor verdict/confidence mutation and local initialization of JEV APPROVE. Missing/error responses return UNAVAILABLE; deterministic integrity failures remain blocking regardless of model opinion.
3. Make native done consume composed disposition and exact human policy. Explicit conflict or insufficient evidence must not stage completion. Keep existing stage/result binding and require fresh identities after any human resolution; do not hold long reasoning inside a22-second preflight.
4. **Verify before repairing history restoration.** Locate the current native-history restoration path (`projectHostHistory`/`debtByIncarnation` and `src/task-contract-history.ts`/`task-contract-runtime-journal.ts`); the historical `false ?? resultPhases` masking is not present in the current tree and must not be "fixed" by pattern-matching. Replay validated host-owned contract/debt events for the right session/branch/incarnation, and add a regression guard proving lifecycle invalidates transient approvals but not unresolved obligations. Same text reappended cannot inherit old permission; unrelated branch work cannot inherit debt incorrectly.
5. Remove marker-only planner yielding and optional authorizer handoff; keep planner authoritative. Test absent/malformed/unapproved/shadow/disappearing/throwing/noncovering EGC and coexistence. In EGC, blocked/stalled/missing/deferred/null never means success. **Verify the current EGC completion path before changing it:** the historical "early `verified` persistence" defect no longer exists under those symbols, so establish the actual seam by reference search and require that a favorable assessment plus a failed/missing/misbound native result completes nothing. Add this as a regression guard rather than a speculative repair.
6. Replace negation-unsafe cancellation matching with contract/explicit-user intent and conservative conflict handling. Preserve legitimate verified obsolete/satisfied removal; do not add universal human prompts, raw drop fast paths or clean-tree approval of rejected deliverables.
7. Hash actual relevant contract/evidence/policy identities for remediation progress, not task text plus reasons. Count semantic failures honestly; do not count transport outage as failed implementation. Same semantic rejection needs genuinely changed relevant evidence; timestamps/unrelated edits are not progress.
8. Populate truthful native reports with result kind, scores when actually returned, missing dimensions, evidence/test applicability, model/receipt identities and judge/human provenance. Unavailable must not emit fabricated implementation directives.
9. Implement the existing real recovery workflow: Advisor diagnoses exact rejection → scoped source/test executors → parent full affected checks/changed path → fresh review → same-target evaluation. Only genuine external prerequisites may wait; require owner/action/release condition and durable handoff. Do not add a polling daemon.

## Success Criteria
- [ ] Advisor/JEV disagreement or unavailable verification cannot authorize native completion or simulate consensus.
- [ ] Every requested primitive is validated; missing/invalid Noul cannot be manufactured from confidence or categorical defaults.
- [ ] Native history restores unfinished work and debt; branch/reappend/restart cannot replay approval or silently forgive rejection.
- [ ] Empty marker, absent/disappearing/throwing/noncovering EGC and agent-declared blocker cannot bypass planner enforcement; favorable preflight plus failed/missing native result leaves obligations/debt unchanged.
- [ ] Trusted human accept/deny/stale/headless paths retain exact-target policy; unblocking reactivates but never completes or clears debt.
- [ ] Negated drop is not permission; genuinely obsolete work can still receive verified automatic cancellation.
- [ ] Outage/evidence/semantic/human outcomes generate different actionable next steps, with bounded retry/progress ownership.
- [ ] No scope is discarded, no gate lowered, no source mock supplies production approval.

## Verification
Parent runs full affected consensus/native/drop/block/lifecycle/EGC/verifier modules, then actual registered-callback scenarios for conflict, outage, forged flags, stale input, duplicate target, history transition, marker-only bypass, EGC capability loss, early-verified then native failure and blocked-to-done denial. Preserve passing legitimate cancellation and matching native commit cases. Run full `bun test` once integrated. Real trusted-UI acceptance is phase10 host evidence; fake callbacks alone cannot claim it.

## Risk Assessment
A UI confirmation, reasoning receipt and model verdict are different authorities. Do not treat source tests as live UI proof. Durable JSON is advisory unless its host origin/binding is proven. Preserve historical missing-wire limitations without inventing them as new acceptance criteria for unrelated tasks. Phase7 reasoning integration must consume this policy rather than introduce another approval service.
