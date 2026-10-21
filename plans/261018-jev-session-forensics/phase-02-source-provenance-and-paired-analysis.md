---
phase: 2
title: "Source provenance and paired analysis"
status: completed
priority: P1
effort: ""
dependencies: [1]
---

# Phase 2: Source provenance and paired analysis

## Overview
Trace current gate payloads and final authority, then quantify only comparable archived observations. Current source mechanisms are not proof of historical causes.

## Requirements
- Separate native Gate 1, native Gate 2, explicit advisor, explicit verification and other routes; never pool probability, choice, confidence, risk score, or populations with different selection mechanisms.
- Distinguish original Advisor heuristic state from returned post-JEV Advisor state, and local macro verdict from actual native action.
- Missing wire payload, task identity, runtime fingerprint or threshold remains unknown. No inferred raw payload, fabricated pair or calibration claim.

## Architecture
Phase 1 events -> route/runtime/proposition stratification -> strict pair classification -> per-population aggregates + case ledger. Source trace independently records caller -> evidence -> prompt -> sanitizer/budget -> request -> primitive parser -> policy -> action.

Pairing rules:
1. **Direct pair:** same session, branch and evaluation/call identity with both Advisor and JEV outputs explicitly persisted. Record whether Advisor is pre-JEV, post-JEV, or unknown. Compare propositions before calling disagreement.
2. **Contextual sequence:** separate calls with same explicit task identity and branch. Record intervening mutations and evidence changes. Even without visible mutations, hidden state or different questions can exist; never count these as matched same-input disagreement.
3. **Unmatched:** missing identities or one side absent. Temporal proximity and similar wording are not join keys.

Denominator for a matched disagreement rate is direct comparable pairs with both outcomes available; if zero, report N/A. Also report all excluded, unknown and contextual counts. Descriptive score distributions are not probability calibration without independently labeled outcomes.

## Related Code Files
Read only, re-discover symbols if shifted:
- `typesafe-planner.ts:463-490` artifact helper; `:1610-1683` native gates; `:1687-1706` proposed report.
- `src/evidence-collector.ts:335-564` baseline fallback, markdown diff and optional plan criteria.
- `src/cook-expert-judge.ts:150-230,351-385` zero-evidence gate, task type, advertised diff scope, score/choice policy.
- `src/bicameral-consensus.ts:220-340,811-870,1135-1175` option ranking, Advisor mutation and consensus.
- Discover threshold resolver in `src/verification-gate.ts` and payload sanitizer/transport via `find`, then read returned ranges.
- Discover active deployed counterparts from actual runtime-origin metadata; inspect read-only, including bundled origin where applicable. Never edit the global trampoline.
- Create: `reports/source-provenance.md`, `reports/paired-cases.md`, `reports/analysis-summary.json`.

## Tests Before
Extend temporary fixtures before aggregation: exact same-call pair; same task/different call contextual sequence; sibling branch; missing Advisor; pre/post-JEV distinction; unknown historical version; missing threshold; Gate 1 refusal; score-bearing historical report with human override; repeated rejection attempts. Expected classifications and denominators must be explicit. Observe RED for newly unsupported behavior, or record already-passing cases honestly.

## Implementation Steps
1. Record source hashes and source-read time. Trace native early exits first: host-authorized bypasses and Gate 1 failures do not establish a JEV request. Native macro invocation currently supplies `taskType: code_change` only when reached.
2. Inspect artifact and diff channels independently: missing `changedFiles` makes the dedicated artifact string empty, but markdown may still be present in `unifiedDiff`. Record observed content visibility and truncation; never translate missing artifact field into absent evidence everywhere.
3. Separate actual collected diff provenance from advertised `diff_scope`. The native call omits `diffScope` and `planPath`; the macro advertises full-working-tree fallback, while evidence collection can use a baseline. Explicit `params.requirements` is not plan-file criteria.
4. Trace all caller fields through sanitizer and transport. Record source caps and which persisted payload stage is available; do not assert observed input truncation from source limits alone.
5. Trace Advisor option score vs confidence, and mutations after JEV. Current macro helper can rewrite Advisor confidence/verdict; native caller gates on `macroResult.approved`, not the returned consensus verdict.
6. Stratify task reports by route, timestamp/runtime evidence, decision, `decidedBy`, score presence and override. Current native proposed report has no score fields: historical score-bearing notices require another emission path/version or explicit unknown attribution. Current filesystem equality does not identify previously loaded memory or older session modules.
7. Compare deployed/current hashes only for discovered relevant modules. A runtime-origin manifest must cover imports/bundle identity before attributing behavior to a historical event; timestamps/commit windows alone provide context, not proof. Do not deploy or restart to obtain it.
8. Aggregate counts and score distributions per route/primitive/runtime/authority. Define operational low using each observed threshold and comparison (`>` vs `>=`); keep a separate clearly labeled descriptive bin if useful. Preserve rejected attempts separately from task reports, and attempts separately from unique task counts.
9. Produce strongest low/high cases where available, with redacted excerpts, raw local file/line/event anchors, route, proposition, missing fields and falsifying evidence. If no valid direct disagreement or high-score agreement exists, report zero/N/A and the observability limitation.

## Refactor
Only disposable offline grouping functions. No telemetry, threshold changes, inference fallback, new extension API, or production regression tests.

## Tests After
Run the temporary `node --test` suite and full frozen-cohort extractor/analysis. Assert direct + contextual + unmatched partitions, disjoint route populations, numeric + missing/invalid totals, and independent recomputation of reported means/medians. Re-read at least one real refusal and one real approval when available; otherwise document absence.

## Success Criteria
- [x] Source trace includes early exits, evidence channels, post-JEV mutation and final action authority.
- [x] Every historical attribution has runtime evidence or an explicit unknown qualifier.
- [x] No cross-call contextual case enters direct-pair rates.
- [x] Reports, rejections/retries and primitive scales have separate denominators.
- [x] All statistics reproduce from the frozen sanitized ledger; no target frequency is prescribed.

## Risk Assessment
Historical payload observability may make same-input comparison impossible; deliver the limit rather than inventing telemetry or API replays. Gate 1 selection can censor Gate 2 populations. Human overrides and scoreless current reports make historical score streams heterogeneous.
