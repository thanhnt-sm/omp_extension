# ADR-20261019-jev-atomic-advisor-direction: Is bounded JEV atomic review with genuine Advisor synthesis the right direction?

Status: Decided
Date: 2026-10-19
Council: ai domain, 3 lenses (cost, docs-fidelity, engineering) + research

## Question

Should this repository retain A, repaired-M, or pursue B, bounded Hybrid-H with focused JEV predicates, genuine Advisor reasoning and separate parent acceptance? Decide the architectural direction using all three independent lenses and the completed online research, without treating documentation as local outcome validation, changing production or plan files, authorizing inference/deployment/native operations, or exceeding the already-spent five-call fresh-research allowance.

## Context

The supplied source reviews describe incomplete evidence provenance, a heuristic internal “Advisor” subsequently changed by JEV, and native consumers that do not consistently honor composed outcomes. These are reported static/source-probe findings, not a local model-quality benchmark. Repaired-M is the required corrected production baseline and comparator, **not a claim that the current runtime already implements those repairs**. Genuine parent review and shared correctness repairs belong in A as well as B.

TypeSafe documentation supports narrow typed judgments, coherent relevant state, shared-state batching and code-owned composition. It neither certifies this repository’s architecture nor establishes that adding atomic predicates and an Advisor improves completed-task accuracy, calibration, economics or latency. The separate host protocol design remains a proposed integration, not proof of deployed trusted receipt binding. No held-out local A/B quality benchmark or all-in completed-task billing is supplied.

This record decides direction only. “Decided” does not mean implemented, evaluated, promoted or operationally authorized. No source, test, configuration or masterplan change is part of this decision-writing pass.

## Options considered

| Option | Description |
|---|---|
| A | Repaired-M production baseline/comparator: correct evidence, authority, availability and parent reasoning while retaining the macro-shaped workflow. Not endorsement of today's defective implementation. |
| B | Bounded Hybrid-H candidate with coherent atomic semantic predicates, real independent read-only Advisor synthesis, distinct parent acceptance and conditional adoption against repaired A. No wholesale tiny-todo fan-out. |

## Lens verdicts

| Lens | Verdict | Confidence |
|---|---|---|
| cost | Proceed: select A as production baseline; retain B as a conditional experiment. A ranked 8/10, B 6/10 for adoption. | 0.91 — baseline-first sequencing, not measured savings |
| docs-fidelity | Proceed: choose B as a bounded, falsifiable candidate while A remains the production baseline. | 0.95 — documentation fit and limits, not eventual operational benefit |
| engineering | Proceed: recommend B conditionally; A remains baseline/comparator until whole-task benefit and trusted integration are demonstrated. | 0.89 — conditional direction, not accuracy or savings |

All verdicts and confidence values are transcribed from the full unfiltered `experts` entries in [durable council inputs](../../plans/261019-research-to-cook-execution/research/council-inputs.json), selected by lens. No lens was omitted. Advisory option scores use different scales and are not combined. The original session copy was `local://jev-council-verbatim-inputs.json`.

## Evidence

R = retrieval; P = publication; V = explicit release/review; I = source inspection/report date. Classification distinguishes official contracts, vendor demonstrations, independent guidance/source inspection and recorded measurements. “Independent” does not imply vendor-neutral or statistically independent errors. Local static findings are not classified as measured accuracy.

| Claim | Source | Date | Type | Supports |
|---|---|---|---|---|
| E1. Ask one snap judgment per question; related evidence must remain together. | [TypeSafe primitives](https://docs.typesafe.ai/primitives.md), [state](https://docs.typesafe.ai/concepts/state.md); research `plans/261019-research-to-cook-execution/research/jev-atomic-online-verification.md:46-47,65-67`; docs lens F1–F2 | R 2026-10-19, reused same-session captures; P unknown | official | B's bounded predicate design, not arbitrary fragmentation or superior outcomes. |
| E2. Compose workflow/effects in code; batch suitable shared-state questions. Evaluation independence is not statistical error independence. | [System One workflow](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md); research `:48,67,105`; docs lens F3 | R 2026-10-19, reused; P unknown | official | Deterministic composition; no multiplying predicate probabilities into an invented reliability estimate. |
| E3. Jev is not a conversational/text-generating reasoning Advisor. | [Coding agents](https://docs.typesafe.ai/introduction/coding-agents.md); research `:53,65`; docs lens F4 | R 2026-10-19, reused; P unknown | official | Separate genuine reasoning capability; exact host protocol remains a local obligation. |
| E4. Noul is P(yes), not percent complete or a separate confidence statistic; no universal safe local threshold follows. | [Confidence](https://docs.typesafe.ai/confidence.md), [API](https://docs.typesafe.ai/api.md); research `:51,54,68`; docs lens F5 | R 2026-10-19, reused; P unknown | official | Preserve probability semantics and calibrate policy on relevant local data. |
| E5. Versions/aliases differ; documented context and byte limits are distinct. | [Models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md); research `:50-51,72-74`; docs lens F8/F10 | R 2026-10-19; V 1.14 release 2026-10-14; page P otherwise unknown | official | Pin evaluated versions and capture resolved IDs; passing transport limits is not semantic sufficiency. |
| E6. Published 12.2× cost/10.0× speed improvement concerns 13 questions, one 53,777-character article, five repeats and Jev 1.12; singles run serially. | [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions.md); research `:49,82`; docs lens F6–F7 | R 2026-10-19, fresh; P unknown; example pricing September 2026 | vendor | Coherent batching hypothesis only; not H versus repaired-M, concurrent latency or Advisor economics. Differing overview ratios are not blended. |
| E7. Jev 1.13 has documented irrelevant-state/adversarial failure modes. | [Model jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md); research `:52,80`; docs lens F9 | R 2026-10-19, reused; V reviewed 2026-10-02 | vendor | Hard-slice evaluation; no assumed injection immunity or independent-error benefit. |
| E8. Add complexity only when it demonstrably improves outcomes. | [Anthropic effective agents](https://www.anthropic.com/engineering/building-effective-agents); research `:38,55,119` | R 2026-10-19; P 2024-12-19; metadata modified 2026-08-10 | independent | A-first restraint and conditional B, not a prescription for this architecture. |
| E9. Evaluate task-specific outcomes with held-out, human-calibrated labels and handoff checks. | [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices); research `:56,106,120` | R 2026-10-19; P unknown | independent | Paired parent-task evaluation; no dependence on the retiring hosted Evals platform. |
| E10. Least privilege and downstream authorization are required; a model recommendation is not permission. | [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/); research `:38,57,78-80,121` | R 2026-10-19; 2025 edition; metadata modified 2025-05-05; exact P unobserved | independent | Enforced scope, separate human authorization and outbound-data controls. Read-only is not a privacy boundary. |
| E11. Evidence/authority defects and the heuristic, post-JEV-mutated Advisor are reported locally. | Engineering lens `experts[2].rawResult` in the durable inputs, citing `typesafe-planner.ts:1775-1788,1826-1856`, `src/evidence-collector.ts:502-522`, `src/bicameral-consensus.ts:223-267,815-847,1063-1067,1119-1195`; research `:58-59,98` | I 2026-10-19 | independent | Shared repairs precede comparison; this adjudicator did not independently rerun the cited probes. |
| E12. Inspected success boundaries discard usage/resolved-model metadata; illustrative calculations omit major costs. | Cost lens `experts[0].rawResult` in the durable inputs, citing `src/cook-expert-judge.ts:145-157`, `src/typesafe-api-client.cjs:539-544`, `typesafe-planner.ts:2440-2443`, `plans/reports/261019-jev-design-calculations.json:2-44` | I 2026-10-19 | independent | Receipt-based all-in accounting is missing, not a proven cost advantage for A or B. |
| E13. Recorded 387/0 fixture checks and callback exit 0 used zero live API/native calls. | Engineering lens `experts[2].rawResult` in the durable inputs, citing `plans/reports/261019-todo-recovery-evidence.json:496-509` | Recorded 2026-10-19 | measured | Plumbing/control-flow evidence only; not model quality, production activation or economic superiority. No checks rerun here. |
| E14. Listed JEV price is $0.042/M input tokens, output free; actual Advisor routing/billing and local total cost are unknown. | [Models](https://docs.typesafe.ai/models.md); research `:84,125-129`; cost lens `experts[0].rawResult` in the durable inputs | R 2026-10-19; page P unknown | official | Public-price arithmetic only, subject to account terms; actual receipts must replace illustrative assumptions. |

Research references abbreviated `:N` in this table refer to `plans/261019-research-to-cook-execution/research/jev-atomic-online-verification.md`. Lens findings are explicitly attributed reports, not new source measurements by the adjudicator.

## Decision

**A now; B as a gated challenger.** Retain repaired-M as the production baseline/comparator and pursue bounded Hybrid-H only as a non-authoritative candidate until separately authorized evaluation and activation gates pass. This chooses B as the investigation direction, not as today's production replacement. Choosing A permanently remains an acceptable outcome.

Both options must preserve original parent obligations, actual test/evidence provenance, independent raw JEV and Advisor outcomes, deterministic composed disposition, exact-target native commitment and authenticated human permission. Neither child passes, an Advisor recommendation nor semantic agreement can alone establish parent completion or authorization. Unavailable or stale evidence cannot be fabricated into approval. No retry-to-pass on unchanged evidence.

**Adjudicator confidence: 0.90** in this conditional sequence. This is an evidence-weighted architectural judgment, not an average of lens confidence values, a calibrated probability of B's success or validation of superiority.

## Rationale

The lenses agree on shared repairs, A as the fair production comparator, genuine reasoning rather than the heuristic, and no immediate B promotion. Their genuine difference is investment emphasis: cost ranks A above B for adoption; docs-fidelity favors B's interface fit; engineering favors B's separation of responsibilities despite greater integration burden. Those are different objectives, not three independent measurements of one outcome.

The decisive tiers are **official/primary documentation** for permissible primitive/API semantics and **independent primary evaluation/security guidance** for requiring demonstrated benefit and external authority boundaries. Reported local source findings explain why shared repairs are prerequisites. There is no measured local whole-task superiority to break the adoption tie; therefore simpler corrected A retains production priority, and B must earn promotion. Expert preference cannot fill that missing proof, and vendor batching demonstrations rank below the absent local paired evidence for outcome claims.

“Atomic” wording, unanimous conditional advice, plumbing fixture success, structured output and vendor speedups do not prove local correctness, calibration, latency or savings. Lens confidence attaches to scoped judgments; confidence that the documents were read correctly is not confidence that B improves completion. A comparison against broken current plumbing or unequal parent reasoning would misattribute gains to atomic decomposition.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| No independent local parent-task gold set or quality superiority evidence. | High | Freeze blinded labels and risk budgets before evaluation; retain A until paired held-out results pass. |
| Fabricated/stale Advisor receipts, lost escalation, unavailable-service approval or cross-task/native-target confusion. | Critical | Validate host-origin identity and contract/evidence/operation/target bindings outside model-authored claims; preserve raw outcomes; enforce downstream composition and exact matching native result. |
| Fragmentation omits counterevidence; child passes hide parent/cross-file integration failures. | High | Require provenance/coverage maps, explicit missing/conflicting evidence and distinct parent integration review with omission hard slices. |
| Prompt injection, correlated errors, privacy leakage or permission inferred from model opinion. | Critical | Enforce read/outbound scopes and authenticated downstream authorization; minimize authorized packets; adversarial evaluation; no probability-independence assumption. Confirm account retention terms rather than assuming default ZDR. |
| Advisor, retries, abstentions and human work erase token savings; accounting metadata is missing. | High | Instrument actual usage/model receipts and all attempts; compare cash-only and labor-inclusive cost/completed original task plus p95 critical-path latency. |
| Retry-to-pass, duplicated retry ownership, lifecycle recovery or stale filesystem evidence. | High | One bounded transport retry owner; distinguish semantic reevaluation requiring corrective evidence; bind snapshots/freshness and test branch/restart/native paths before activation. |
| Alias drift, language effects and uncalibrated policy invalidate apparent gains. | Medium | Pin/record versions and policy; stratify Vietnamese/English and difficult/adversarial tasks; requalify material upgrades. |

## Implementation checklist

Future work only; all items remain unchecked. This checklist grants no implementation, inference, deployment or native-operation permission.

1. [ ] Repair A's shared foundations: authoritative original/amended criteria, stable identities, actual task preimages/full deltas, trusted test receipts and explicit evidence gaps; freeze common schemas before caller migration.
2. [ ] Correct deterministic authority composition, unavailable handling, lifecycle/recovery and EGC ownership; preserve independent raw Advisor/JEV records and exact-target authenticated consent/native commitment.
3. [ ] Establish genuine parent reasoning in the comparator as well as candidate; keep common reasoning quality comparable and isolate B's incremental work.
4. [ ] Implement the separately reviewed host-supported Advisor protocol with trusted dispatch/result provenance, bounded authorized read/outbound scope, freshness and operation/target bindings. Treat an agent-authored report as untrusted content, not a host receipt. Keep reasoning outside the short mutation preflight.
5. [ ] Construct B's coherent, provenance-bound single-condition semantic packets; retain contradictions/global coverage; batch suitable shared-state questions and keep rules/effects in code. Preserve distinct parent acceptance.
6. [ ] Predeclare paired task/project-held-out gold labels, independent adjudication, sample/slice adequacy, confidence-interval method, false-approval safety budget, rejection/abstention limits and cost/latency/reviewer ceilings before seeing results.
7. [ ] Capture requested/resolved model IDs, policy/evidence versions, actual input usage, Advisor/parent effort and billing, cache behavior, all retries/failures/abandonments and reviewer time. Do not assume a provider, model or cache discount.
8. [ ] Under separate evaluation authorization, run non-mutating paired A/B comparisons on original parent tasks, including stale/missing/conflicting evidence, child-pass/parent-fail, injection, multilingual, outage and recovery/native-target cases. Report component and end-to-end results separately.
9. [ ] Compute total cost per independently verified completed original task: all actual model charges plus declared amortized evaluation/implementation cost, optionally adding review hours at a stated rate, divided by completions. Include unsuccessful attempts in costs; report cash-only and labor-inclusive results. Use the public JEV rate only when applicable to actual account billing.
10. [ ] Require B to satisfy every predeclared safety/authority gate and demonstrate a meaningful parent-level benefit within cost/latency/workload budgets, with uncertainty reported. Equal quality at greater total cost does not justify promotion absent an explicitly accepted safety/operational benefit.
11. [ ] Obtain independent evaluation/risk sign-off and explicit activation approval; prove the actual host/native path, define bounded cutover/rollback criteria and preserve A until the cutover is accepted. No automatic promotion or recheck daemon.

## Reopen conditions

- **Favor permanent A:** adequately sampled paired holdouts show B has no meaningful incremental benefit, equivalent quality at greater all-in cost/workload, persistent parent/integration misses, unacceptable harmful approvals, or no enforceable trusted Advisor/authority binding. Document the accepted limits and retire the challenger rather than retrying until favorable.
- **Favor B promotion:** representative independently labelled paired results meet the predeclared effect/uncertainty criteria, all safety and omission slices stay within budget, actual cost/completion and p95 latency/reviewer workload meet limits, and trusted host/native-path evidence plus explicit activation approval exist. A safety improvement at higher cost requires explicit budget acceptance, not invented economic superiority.
- Reconsider when a pinned model/host release materially changes capabilities, limits, retention/authorization guarantees or hard-slice behavior, or a verified production incident invalidates the evidence assumptions. Upgrade documentation alone does not waive local qualification.
- A designated owner invokes review upon these conditions; no automatic polling, scheduled recheck or daemon is created.

## Owners

- **Implementation:** extension evidence/authority maintainer and host Advisor-protocol maintainer, jointly responsible for schemas, provenance and native integration.
- **Evaluation/risk:** independent evaluation lead owns gold labels, paired protocol and uncertainty; security/privacy reviewer owns scope, authorization and data-handling gates; cost owner owns receipts and workload accounting.
- **Activation:** repository maintainer/release owner accepts the evaluation and cutover; authenticated human/task owner supplies operation-specific permission. Models cannot assume either role's authority.

These are accountable roles, not invented individual appointments.

## Council metadata

- Generated using the `ck:council` adjudication process on **2026-10-19**; domain **ai**; **3 lenses**: cost, docs-fidelity, engineering; one dedicated research context; one adjudication context.
- All full unfiltered inputs read: original `local://jev-council-verbatim-inputs.json`, now preserved as `plans/261019-research-to-cook-execution/research/council-inputs.json` (question/options/routing, all three raw lens results and full raw research). Durable research: `plans/261019-research-to-cook-execution/research/jev-atomic-online-verification.md`.
- Default specialized CK `council-expert`, `council-adjudicator` and `researcher` definitions were **not registered/available**. Three available independent read-only advisor contexts and a task researcher were used; this writer is the available delegated adjudication context. No lens was omitted and no additional expert vote was cast here.
- Actual agent model identities/effort were **unknown or runtime-routed** for this council; no claim of Opus/Sonnet frontmatter or independently verified provider routing. This statement concerns council execution, not the documented JEV version contract.
- **Cost estimate: unknown; no billing receipts.** Public per-token arithmetic is not council billing or local outcome economics.
- Dedicated research spent **exactly 5 external calls**, including discovery/page openings; prior same-session public captures were reused and marked separately. This adjudication made no new external calls, model-evaluation calls, native operations or verification runs.
- Decision status records architecture only. Implementation and promotion remain conditional future work.

## 2026-10-19 safety tightening

Follow-up F17 demonstrates with synthetic-only actual deployed helpers that private thinking can enter prepared judge state; no live exfiltration is asserted. See `plans/reports/261019-private-context-export-evidence.json`. This tightens the privacy/activation gates: do not perform affected remote completion checks before verified public-only projection is active, and do not activate F16 alone while obligation/debt restoration and release security remain unresolved. Direction remains repaired-M first/H gated; this addendum is not a new council vote, implementation or authority grant.

