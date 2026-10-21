# JEV Atomic Evidence Review and Advisor Synthesis — Online Verification

Research timestamp: **2026-10-19T10:54:10+07:00**. Status: research and architectural recommendation only; **not approval, implementation, activation, or model evaluation**.

## Contents

1. [Executive summary](#executive-summary)
2. [Methodology and call log](#methodology-and-call-log)
3. [Evidence table](#evidence-table)
4. [Findings and limits](#findings-and-limits)
5. [Options A/B](#options-ab)
6. [Ranked recommendation](#ranked-recommendation)
7. [Public quotation capture](#public-quotation-capture)
8. [Unresolved questions](#unresolved-questions)

## Executive summary

**Yes, the direction is defensible—but only as a bounded, evaluated hybrid, not a proven upgrade.** TypeSafe explicitly recommends narrow typed judgments, coherent relevant state, independent questions batched together, and composition/control flow in code. It does **not** establish that this repository needs wholesale microtask fan-out, that an Advisor automatically improves accuracy, or that child passes establish parent completion. Its documentation does not certify this local architecture.

Independent publisher guidance converges on simple composable workflows, focused evaluation, human-calibrated task-specific measurements, and enforced authorization. Anthropic explicitly cautions that additional complexity must demonstrably improve outcomes. Therefore: **repair and retain A (repaired-M) as baseline; investigate B (Hybrid-H) under a predeclared paired evaluation before promotion.** No local accuracy/cost superiority is established. Four publisher families were consulted: TypeSafe, Anthropic, OpenAI, OWASP. Only TypeSafe authoritatively specifies its API; independent corroboration of its proprietary accuracy/calibration claims is absent here.

## Methodology and call log

Scope: vendor contract versus architectural inference; security, cost and parent-level correctness. Matching research/organization skills read. Selected config `skills.research.useGemini=false`; no Gemini or inference API invoked. Registered specialized researcher/model unavailable: this is a dedicated research task context, **not a claimed Sonnet/Opus execution**.

**Exactly five external research tool calls**, including search and page opening; no additional network calls after these. Local artifact reads are not fresh retrievals.

| # | Tool and target | Retrieval date / outcome |
|---|---|---|
| 1 | WebSearch: `site:docs.typesafe.ai/cookbooks/parallel_questions OR site:anthropic.com/engineering/building-effective-agents OR site:platform.openai.com/docs/guides/evaluation-best-practices OR site:genai.owasp.org "Excessive Agency"` | 2026-10-19; discovery only; search interpreted exact phrase narrowly, so not evidence for substantive claims |
| 2 | Read TypeSafe parallel-questions page [T4] | 2026-10-19; opened; cached reader continuation read locally |
| 3 | Read Anthropic effective-agents page [A1] | 2026-10-19; opened |
| 4 | Read OpenAI evaluation best practices [O1] | 2026-10-19; redirected to developers.openai.com; opened; continuation read locally |
| 5 | Read OWASP Excessive Agency [W1] | 2026-10-19; opened |

Reused prior **same-session** public captures from `local://council-prior-primary-docs.md`, originally retrieved 02:27:35–02:33:53 UTC on 2026-10-19. These contain twelve TypeSafe pages; only observed relevant passages support claims below. Truncated omissions were not inferred. Fresh versus reused retrieval is distinguished below; report preserves public quotations for the ADR.

Publication differs from retrieval: most TypeSafe/OpenAI pages undated; TypeSafe jaggedness explicitly reviewed 2026-10-02; models names release 2026-10-14; batching code identifies September 2026 pricing, **not publication date**. Anthropic published 2024-12-19, metadata modified 2026-08-10, and warns tooling has changed. OWASP is its 2025 edition, metadata modified 2025-05-05; exact original publication unobserved. Its canonical metadata misleadingly names a different slug; the opened title/body explicitly address Excessive Agency.

## Evidence table

Dates: **R** = retrieval, **P** = publication, **V** = explicit review/release. “Independent” means independent of TypeSafe, not vendor-neutral or a local measurement.

| claim | source(URLorfile:line) | date | type(official/vendor/independent/measured) | supports |
|---|---|---|---|---|
| T1: One snap judgment/question; typed Choice, Score, Noul; compose in code | https://docs.typesafe.ai/primitives.md | R 2026-10-19, prior; P unknown | official | Direct contract/design guidance, not proof of task accuracy |
| T2: Structured state; related facts stay together when comparison requires them | https://docs.typesafe.ai/concepts/state.md | R 2026-10-19, prior; P unknown | official | Relevant coherent packets, not arbitrary fragmentation |
| T3: Code owns rules, workflow and effects; independent questions can be batched | https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md | R 2026-10-19, prior; P unknown | vendor | Narrow primitives; no local Advisor/parent architecture endorsement |
| T4: Batching saves repeated shared-state input in one published example | https://docs.typesafe.ai/cookbooks/parallel_questions.md | R 2026-10-19, fresh; P unknown | vendor | 13 questions, five repeats, Jev 1.12; not A/B or independent replication |
| T5: Version aliases, context, pricing, language and data-handling statements | https://docs.typesafe.ai/models.md | R 2026-10-19, prior; V 1.14 release 2026-10-14 | official | Explicit limits and version pinning; no production attestation |
| T6: Request body/encoding/depth and typed answer fields | https://docs.typesafe.ai/api.md | R 2026-10-19, prior; P unknown | official | 32 MiB body, 64 nested levels; Noul versus confidence |
| T7: Indirection, irrelevant state, adversarial content and option-order failure modes | https://docs.typesafe.ai/model-jaggedness/jev-1.13.md | R 2026-10-19, prior; V 2026-10-02 | vendor | Explicit counterevidence to blanket reliability; version-specific |
| T8: Jev generates neither text/code nor conversation | https://docs.typesafe.ai/introduction/coding-agents.md | R 2026-10-19, prior; P unknown | official | Not a coding-agent/reasoning-Advisor replacement |
| T9: Choice confidence computed from option probabilities | https://docs.typesafe.ai/confidence.md | R 2026-10-19, prior; P unknown | official | Captured interactive implementation demonstrates formula; not local calibration validation |
| A1: Start simple; focused parallel evaluation and orchestrator synthesis are patterns, not prescriptions | https://www.anthropic.com/engineering/building-effective-agents | R 2026-10-19; P 2024-12-19 | independent | Conditional support for B; equally supports retaining A until measured gains |
| O1: Task-specific, held-out, human-calibrated evals; judge bias and handoff correctness matter | https://developers.openai.com/api/docs/guides/evaluation-best-practices | R 2026-10-19; P unknown | independent | Evaluate components and end-to-end behavior; no automatic ensemble superiority |
| W1: Least privilege, user approval and downstream authorization | https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ | R 2026-10-19; 2025 edition | independent | Model recommendation is not permission; read access still requires scope |
| L1: Atomic engine/real runtime Advisor remain pending; current internal Advisor heuristic | plans/reports/261019-jev-current-state-and-recovery.md:9-29 | 2026-10-19 | measured | Existing source-review checkpoint; not independently rerun in this pass |
| L2: Native consumer ignores composed escalation; heuristic is mutated after JEV | plans/reports/261019-typesafe-source-rootcause-review.md:87-103 | 2026-10-19 | measured | Reported source/probe evidence; not a live model benchmark |

## Findings and limits

### What TypeSafe actually confirms

- **Focused typed judgments**, not generated diagnosis or plans. “No reasoning” should mean *not designed for slow multi-hop/System Two tasks*, not an unsupported claim that inference performs no internal computation. A real generative reasoning Advisor must be a separate capability [T1,T7,T8].
- **State is evidence, questions define judgments.** JSON names preserve relationships. Filter irrelevant material, but retain contract, contradiction and comparison context that determines the answer [T2,T7].
- **Batch independence is a question-evaluation contract:** each question sees the same state without another answer becoming hidden context. It does **not** establish statistical independence of errors caused by the same missing evidence, model or misleading framing [T1,T3; inference]. Never multiply pass probabilities as if independent reliability were measured.
- **Noul is P(yes), not generic confidence or percent completion.** At 0.5, yes/no are equally likely; near zero can mean confident “no.” Choice/Score expose separate confidence derived from distributions. Captured Choice implementation uses `(n × p_max − 1)/(n − 1)`; it is not simply `p_max`. Neither field proves correctness on this workload [T1,T6,T9]. No universal safe approval threshold follows.

### Versions, context and request limits

As captured, Jev 1.14.0 is newest; `jev-preview` points there while `jev-latest` points to stable `jev-1.13.0`. Pin the evaluated version and record returned model ID. Default limits: **64k/request** (`state` + all questions), **32k/question** (`state` + that question). No separate question-count cap within both limits. Opt-in `TypeSafe-Danger-Zone-Long-Context: true` raises both to **262k**, explicitly slower and less accurate [T5].

HTTP limits are different: **32 MiB body**, compressed and decompressed, UTF-8 without BOM, maximum **64 nested levels**, finite numbers [T6]. Passing a byte limit does not establish token-budget fitness or semantic sufficiency.

### Security and performance: facts versus hypotheses

**Read-only is not a privacy boundary.** Removing mutation tools reduces integrity risk but does not constrain which secrets can be read or sent to external services. Enforce authorized paths/identities and outbound-data minimization, not just a read-only prompt [W1; application inference]. TypeSafe says requests/responses are not training data and mentions enterprise ZDR; this is **not** proof of default zero retention, this account’s contract, or deployed redaction [T5]. Legal terms were not opened.

Human authorization must come from an authenticated permission boundary, not JEV/Advisor opinion. Authorization belongs downstream with complete mediation [W1]. TypeSafe explicitly acknowledges adversarial state can move Jev 1.13 answers [T7]; independent review contexts do not guarantee independent errors or injection resistance.

Published batching example: **$0.000497 / 0.27 s** for one 13-question request versus **$0.006090 / 2.71 s** for 13 singles: **12.2× cheaper, 10.0× faster**. Latency comparison sums **serial** single calls; concurrent singles narrow it. Dataset: one 53,777-character GDPR article, five repeats, Jev 1.12, historical pricing. Two Noul questions show sampling differences; this is not exact bitwise invariance for every question [T4].

Current listed input price is $0.042/M tokens; output free [T5]. **UNVERIFIED:** local end-to-end cost or accuracy improvement. Measure cost/completed parent task including Advisor, retries, failed attempts, review time and critical-path latency—not just JEV tokens. OpenAI’s page also announces Evals-platform retirement; guidance remains useful, but no dependency on that hosted product is recommended [O1].

## Options A/B

| Dimension | A — repaired-M baseline | B — bounded Hybrid-H candidate |
|---|---|---|
| Scope | Repair evidence, outcomes, authority and actual parent review; retain macro shape | Same repairs, plus coherent atomic semantic predicates and real independent read-only Advisor synthesis |
| Strength | Simpler attribution and operational baseline [A1] | Better diagnostic isolation is plausible; focused evaluation matches guidance [T1,A1,O1] |
| Failure risk | Broad question can hide multiple conditions [T1] | Fragmentation can discard counterevidence; synthesis can miss cross-file/parent obligations [T2,O1] |
| Cost | Fewer orchestration components; actual total unmeasured | Shared-evidence batching may save tokens; Advisor/fan-out/retries may dominate [T4,A1] |
| Acceptance | Must repair known defects; not “current broken macro is sufficient” | Promotion only after paired, independently labelled parent-level evaluation |

Neither option permits `child_pass ⇒ parent_done`, fake Advisor reasoning, human-permission inference, or retrying unchanged evidence until approval. **Retry-to-pass risk [inference]:** selecting a favorable stochastic response does not repair a failed obligation. Separate bounded transport retries from semantic reconsideration; preserve failed attempts and require fresh corrective evidence for reevaluation.

Actual versus planned: L1/L2 document existing heuristic/macro defects and pending atomic/Advisor integration. This report adds no implementation or runtime proof; no code example is offered as an implemented API.

## Ranked recommendation

Confidence values are **researcher judgment, not measured accuracy**.

1. **A now; B as gated challenger — 0.91.** Repair shared evidence/authority/security foundations first; keep a credible comparator. Do not promote solely because documentation favors “atomic.”
2. **Bounded B design — 0.84.** One semantic condition per question; coherent provenance-bound evidence with explicit missing/conflicting evidence. Batch only suitable shared-state questions. Keep arithmetic, authorization and acceptance composition deterministic; preserve independent raw Advisor/JEV outputs and parent-level integration obligations.
3. **Defer superiority/adoption claim — 0.97.** Predeclare representative task/project-held-out paired comparison, blinded independent labels, false approvals/rejections, abstention, missing-counterevidence cases, parent integration failures, reviewer workload, total cost and latency. Include multilingual, adversarial, stale evidence and shared-error cases [T7,O1]. No inference evaluation was run here.

**What would change my mind:** B reduces predeclared parent-level failure/cost metrics against repaired A without violating the safety budget; labels remain independent of model outputs; gains survive version pinning and hard slices. Conversely, equivalent quality with higher total cost, omitted counterevidence, weak authority or correlated failures favors A. A macro baseline that still hides several judgments is not a fair “repaired” comparator.

## Public quotation capture

Short public excerpts retained for ADR use; source IDs resolve to opened URLs above. No private conversation, internal thinking or raw tokens copied.

- T1: “Ask for one snap judgment per question.”
- T2: “Put related information together when the decision requires comparing those parts.”
- T3: “Keep control flow, deterministic rules, and side effects in code.”
- T3: “One primitive's result does not become hidden context that changes another primitive's result.”
- T7: “State is data, and `jev-1.13` does not treat it as hostile by default.”
- A1: “consider adding complexity only when it demonstrably improves outcomes.”
- O1: “Use human feedback to calibrate automated scoring.”
- W1: “Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not.”

## Unresolved questions

- What independent labelled parent-task corpus and risk-specific acceptance budget will decide adoption?
- Which actual host-supported Advisor binding preserves independence, provenance and bounded evidence access?
- What effective deployed model/version, thresholds, transport limits and data-retention terms apply? Documentation does not attest them.
- How much relevant counterevidence is lost by packet selection, and how correlated are JEV/Advisor failures?
- What are total cost/completed task and p95 latency versus repaired A? No local measurements yet.
