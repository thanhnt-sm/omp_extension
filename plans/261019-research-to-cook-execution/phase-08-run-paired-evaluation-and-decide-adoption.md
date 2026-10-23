---
phase: 8
title: "Run paired evaluation and decide adoption"
status: pending
priority: P1
dependencies: [7]
---

# Phase 8: Run paired evaluation and decide adoption

## Overview
Implement and execute a resumable paired evaluator for repaired-M versus complete H. Documentation fit is not accuracy/economic proof. Coverage C01/C10/C28/C34; consumes phase7's real workspace driver and all baseline correctness fixes.

**Current state (2026-10-22):** `tools/jev-paired-eval.ts`, its `jev-paired-*` library, `tests/jev-paired-evaluation.test.ts` and the frozen `plans/261019-jev-atomic-review/evaluation/*` inputs already exist. This phase is **verify-then-extend**; the remaining real work is the authorized empirical run and its adoption decision, not scaffolding.

**Dependency:** this phase produces the strategy decision that Phase 9 consumes, even though Phase 9's frontmatter depends only on Phase 7 source readiness.

## Requirements
- Implement the full candidate regardless of its promotion result. A negative result retains repaired-M; an unrun benchmark is never called completed.
- Compare equivalent original obligations and eligible evidence. Give both arms repaired input and genuine parent reasoning where required; do not credit H for a fix applied only to H.
- Freeze task/project/family holdouts, independent human labels, exact model/policy/rubric and decision rules before outputs. No heldout tuning, repeated favorable sampling or invented independent cases.
- Record actual all-attempt usage/cost, Advisor/reviewer workload, queue-inclusive latency and parent-level errors/deferrals. Unknown metadata is null with a reason, never free or copied from requested values.
- Shadow evaluation cannot stage native operations, mutate task/plan state or grant human/deployment authority.

## Related Code Files
- Verify (exists — do not recreate): `D:/100.Software/Github/omp_extension/tools/jev-paired-eval.ts` — validate/freeze/benchmark/report/decide CLI.
- Verify (exists — do not recreate): `D:/100.Software/Github/omp_extension/tools/jev-paired-eval-lib.ts` — bounded corpus/split/scheduling/statistics/decision functions.
- Extend (exists): `D:/100.Software/Github/omp_extension/tests/jev-paired-evaluation.test.ts` and fixtures under `tests/fixtures/jev-paired-evaluation/`.
- Verify/freeze (exists): `D:/100.Software/Github/omp_extension/plans/261019-jev-atomic-review/evaluation/` — protocol.json, corpus.jsonl, splits.json, labels.jsonl, prices.json.
- Write real run output only when executed under `D:/100.Software/Github/omp_extension/plans/261019-jev-atomic-review/reports/paired/<run-id>/`.
- Modify existing client/adapters only to preserve actually returned model/usage/attempt metadata; share phase6 transport and limits, never add another retry owner.
- Update `D:/100.Software/Github/omp_extension/tools/README.md`, `docs/typesafe-operations.md`, atomic plan and coverage ledger from actual results.

## Architecture
A planned local `PairedReviewDriver.evaluate(strategy,input,shadowContext)` calls real repaired-M/H workspace code; H consumes genuine phase7 Advisor receipts. This is an application seam, not an invented host SDK method. Missing real reasoning returns a named prerequisite, not a heuristic substitute.

Separate populations: deterministic fixtures; constructed whole-parent semantic challenges; permission-cleared natural whole-task cohorts. Fixtures contribute zero model-benchmark cases. Each frozen case binds project/parent/family/derivation IDs, language/type/risk, original contract/criteria, baseline/evaluated snapshots, source/counterevidence, test/integration/authority situation and privacy provenance.

Two independent human reviewers, blind to model outputs/variant, label original parent obligations and evidence. A third human adjudicates disagreements. Models, candidate authors and the candidate Advisor are not their own gold labels. Keep ambiguous/unadjudicated cases visible outside primary promotion denominators.

Freeze executable `protocol.json` declarations before outputs: target deployment population/scope, required language/task/risk/integration strata, positive minimum usable independent groups per required stratum and overall, canonical-parent selection, metric definitions and accounting/latency policies. The custodian supplies scope/sample requirements before inference; absent/undersized declarations are invalid/insufficient, never vacuous success. No arbitrary sample or business-risk SLO is silently invented.

`metricGates` is a closed typed table: metric ID, eligible population/stratum, numerator, denominator, lower/higher-is-better direction, M comparator, allowed equality and required-support/unknown rule. Defaults: zero H approvals on gold non-approvable cases; zero M-correct/H-wrong exact dispositions; zero missed required integration defects; strictly positive correctness-improvement lower bound; required error/unnecessary-deferral rates, usage-priced review cost, observed p95 and unnecessary reviewer actions H<=M. Required missing support/metadata returns retain_M with inconclusive/prerequisite status. Optional descriptive metrics cannot become gates after outcomes.

Correctness is equality to the independently adjudicated expected five-disposition enum. Natural semantic gold never uses UNAVAILABLE to excuse service failure; unexpected live outages count as unsuccessful workflow dispositions and separately unavailable, not fabricated semantic model errors. Service fixtures stay outside model-quality counts. All eligible scheduled independent pairs remain in workflow denominators, not only jointly successful calls.

Freeze ownership of actual JEV/Advisor/distinct-parent/failed attempts by run/case/arm/original parent and deduplicate receipt IDs. Primary pairing uses independent real arm executions, no hidden cross-arm outcome reuse; exact resume reuses its original receipt and charges it once. If evaluating shared common work, freeze allocation first, count paid work once in run totals and label per-strategy counterfactual allocation separately. Missing cost is null with reason, never zero.

Primary automatic cash gate is **complete usage-priced cash per scheduled shadow review episode**, at frozen applicable prices, including all required JEV/reasoning/parent attempts; actual billed cost is separate. Gold-complete snapshot, model approval, reasoning receipt and successful native commitment are different events. Shadow has no actual workflow-completion event: production cost/throughput is unavailable there, not a fictitious completed task. Actual workflow cost/completion needs an independently verified original-task completion, exact native result, upstream effort/failed attempts and a nonzero declared denominator. Zero completions means undefined cost/completion with zero support, never free or nonfinite JSON. Human valuation/amortization uses supplied rates/horizons only.

Latency is monotonic admission-to-terminal disposition, including queue/retries/cooldown/reasoning/parent work. Freeze nearest-rank empirical p50/p95 (`ceil(q*n)`), include terminal errors/timeouts, shared cache/cooldown conditions and counterbalanced order. Unfinished/censored episodes make the run incomplete; no success-only comparison. Preserve timing segments across resume and include known resume wait or mark missing timing. Implement distribution-free95% order-statistic p95 intervals from binomial rank tails; unsupported upper rank remains unbounded/unknown, not false precision. Observed-p95 dominance is not a population guarantee.

Report separate false-approval risk among gold non-approvable parents and unsafe fraction among approvals for each eligible population. Zero events with denominator m>0 has one-sided95% binomial upper bound `1-.05**(1/m)`; m=0 is unavailable. Challenge/natural populations remain separate and canonical parents are frozen before outputs. Bounds report uncertainty without manufacturing approved population-risk thresholds.

## Implementation Steps
1. Implement the CLI/driver/manifest and pure decision replay first. Map all36scenarioIDs to real deterministic assertions or semantic-case references; never count variants/translations/renamed constants as independent tasks.
2. Produce approved challenge/natural cases prospectively when historical snapshots are incomplete. Original P=.13 missing wire and deployed equality are not prerequisites. The runner does not execute shell commands embedded in corpus text; it consumes trusted frozen receipts.
3. Group connected project/parent/template/derivation families before deterministic60/20/20 dev/calibration/holdout assignment. Prefer project-disjoint holdout; one-project family holdout must not be sold as cross-project generalization. Freeze eligible cases/groups/labels/seed and source digests before outcomes.
4. Freeze exact requested JEV version. `src/typesafe-api-client.cjs:28` currently sends `MODEL = 'jev-latest'`; the `1.13.0` reference at `:352` is a documented-source note, not a pinned runtime constant. State the evaluated model identity explicitly (a resolved model, not an alias) and do not present an unpinned vendor number as a frozen decision.
5. Run repaired-M/H in counterbalanced seeded order; initial concurrency1 unless trusted quota policy explicitly allows more. Retain every scheduled pair, unavailable result and billed attempt. Existing bounded429/529 transport is the only retry owner; never rerun completed semantic output to select a pass.
6. Report input-repair, duplicate Choice/Noul, incremental Advisor and batching/context ablations separately. Pure batching keeps individual state/questions byte-identical. Curated-small versus global-union state is a context-selection experiment, not batching alone.
7. Use phase6's explicit local128question ceiling and32768-byte prepared-body policy. Official current docs have no separate count cap within model contexts; local128 is not vendor truth. Global80 is optional/unproven until final bytes and context fit; if infeasible report that arm's reason/denominator without silently dropping/chunking evidence. This cannot block all H evaluation.
8. Record per-attempt requested/resolved model, actual provider usage/cache/billing fields when returned, prepared-body identity/bytes, question IDs/count, coverage, errors/retry/cooldown, timings and real Advisor receipt/cost provenance. Retain only approved sanitized evidence and final outputs, no private thinking/prompts/keys.
9. Compute full disposition/error/deferral/integration/coverage/request/usage/cost/reviewer/latency metrics and stratify with explicit raw/cluster denominators. Primary shadow economics is complete usage-priced cost per scheduled review episode. Report all-attempt cost per independently verified completed original task **only when that actual completion evidence and nonzero denominator exist**; otherwise emit unavailable/null with reason/support. Keep billing, supplied amortization/rate scenarios and production workflow claims separate.
10. Use one canonical parent per independent provenance group for primary inference; correlated variants are descriptive. For discordant counts a=Hcorrect/Mwrong,b=Mcorrect/Hwrong,n=pairs, implement/test conservative one-sided95% improvement lower bound `L_CP(a,n,.025)-U_CP(b,n,.025)` by binomial-tail inversion. Zero unsafe events still receive a nonzero upper risk bound. Unsupported independence/generalization means inference unavailable, not inflated sample size.
11. Predeclare `strict-corpus-dominance-v1`: adopt_H only if complete invariant-passing implementations, representative frozen adjudicated holdout, zero observed unsafe approvals/H-only wrong dispositions/required integration misses, positive primary improvement lower bound, non-worse observed secondary/stratum outcomes, and complete observed cost/p95 latency/unnecessary reviewer actions no greater than repaired-M. A real review cannot override any failed gate.
12. Otherwise select retain_repaired_M with explicit failed/unknown gates. Record measurementStatus complete/prerequisite_pending/unavailable/inconclusive separately; retention does not mark an unrun comparison complete. A useful but costlier H requires a new explicitly approved tradeoff/protocol, not weakening the finished holdout.

Decision is a non-authoritative candidate assessment within frozen observed review scope. `adopt_H` cannot claim production completed-task savings from static review, authorize deployment or waive unknown whole-workflow economics. Phase10's actual risk/release owner must accept explicitly bounded scope and any unproven economics through trusted activation authority; otherwise retain repaired-M. Different tradeoffs require fresh approved preregistration, not reinterpretation of a failed gate.

## External Inputs and Automatic Continuation
- Repository/data-spend owner supplies exact exportable cases, bounded provider spend and actual quotas through trusted authority. A JSON authorized:true field is not consent.
- Evaluation custodian and human labelers supply the frozen adjudicated cohort. No artificial model-generated gold or blanket historical-data demand.
- Phase7 owner supplies real reasoning integration and usage/pricing provenance. Missing usage remains unknown.

Auto cook completes candidate/runner/fixtures/docs and every other ready phase while these inputs wait. Phase9 depends on phase7, not completion of this external measurement lane; it can migrate/verify the canonical baseline and shadow engine. Live H promotion remains conditional. Preserve the actual pending experiment obligation with owner/action/release condition and a resumable manifest; never label the entire project permanently blocked.

## Commands After Implementation
`bun tools/jev-paired-eval.ts validate --protocol plans/261019-jev-atomic-review/evaluation/protocol.json`

`bun tools/jev-paired-eval.ts freeze --protocol plans/261019-jev-atomic-review/evaluation/protocol.json`

`bun tools/jev-paired-eval.ts benchmark --protocol plans/261019-jev-atomic-review/evaluation/protocol.json --run-id <frozen-run-id>`

Benchmark automatically reports/decides; deterministic `decide --run <run-directory>` performs no model calls. Exit0=completed valid decision (including measured retention),2=invalid inputs,3=named prerequisite pending,4=interrupted/incomplete service run. Persist status before exit.

## Success Criteria
- [ ] Real workspace M/H drivers run; H is not a mock or renamed heuristic; shadow causes no production mutation.
- [ ] All36scenarios have explicit coverage; labels/splits/provenance are frozen and independently adjudicated for actual promotion.
- [ ] Actual paired task/parent outcomes, uncertainty, all-attempt cost completeness and integration errors are reported honestly.
- [ ] Count/body/context-infeasible arms and missing model/usage fields cannot become silently successful measurements.
- [ ] Deterministic replay selects the same decision without networking; semantic resampling/leakage/duplicate-family inflation fails validation.
- [ ] Both adoption and retention preserve implemented capabilities and native authority; an unavailable/unrun experiment stays explicitly unfinished.
- [ ] Validation rejects absent/undersized required strata, ambiguous metrics, missing required support, duplicate costs, censored latency and numerical/comparable cost-per-completed-task claims with missing/nonpositive completion denominators. A valid shadow run reports completion cost unavailable/null with zero support, while its required cash gate uses complete cost per scheduled review episode. Replay covers ties/errors/timeouts/interval boundaries.

## Verification
Parent runs complete evaluation and affected transport/payload/native/atomic/Advisor modules, a changed-path CLI fixture smoke with networking forbidden, and full `bun test`. Fixture output must say not a model benchmark. Authorized paired inference is a separate empirical run.

## Risk Assessment
Corpus dominance is not zero population risk or a universal business SLO. Observed usage pricing is not an actual bill; unknown Advisor cost is never zero. Static review economics cannot establish production completion throughput.

Portability note: the vendor example's53777-character article alone exceeds the unchanged32768-byte local body cap. Its serial-single/batch ratios are not runnable local topology/latency proof. Earlier toy concurrency4 timing is not initial phase8 serial scheduling; global80 and independence-based reliability arithmetic remain conditional illustrations.
