# ADR-20261012-typesafe-jev-alignment: Improving TypeSafe JEV Semantic Judge Application and Agent Alignment

Status: Decided
Date: 2026-10-12
Council: software domain, 3 lenses (Architecture, Maintainability, Delivery) + research

## Question

How can we improve the application of the TypeSafe JEV semantic judge (`jev-latest`) and agent alignment within OMP when marking tasks as "done", resolving pervasive Gate 2 rejections (scores $P \le 0.13$) on legitimate completions without sacrificing verification integrity or inflating operational latency?

## Context

Oh-My-Pi enforces a Dual Verification Gate when agents invoke `todo(op="done")` in `typesafe-planner.ts`:
1. **Gate 1 (Micro-Check):** Fast, deterministic local checks (test suite exit codes, Claude safety boundaries, assertion preservation).
2. **Gate 2 (Macro-Check):** Remote semantic evaluation against TypeSafe System One (`POST https://api.typesafe.ai/v1/systemone` using `jev-latest`) in `src/cook-expert-judge.ts`. Gate 2 checks three dimensions: `meets_criteria` (Noul score $\ge 0.80$), `architectural_drift` (Choice: `no_drift`), and `scope_mode` (Choice: `HOLD` or `EXPANSION`).

In practice, agents frequently complete legitimate tasks—particularly analytical, research, architectural, doc-generation, or chore tasks—only to be rejected by Gate 2 with $P \approx 0.10 - 0.13$ and flagged as `scope_mode = "REDUCTION"`. After 3 consecutive rejections, the autonomous loop halts for user escalation.

Empirical codebase audit revealed two compounding root causes:
1. **Context Starvation (`typesafe-planner.ts:1125`):** `handleTodoInterception` invokes `collectTaskEvidence` without supplying `planPath`. As a result, `evidence.criteria` is empty (`[]`), causing `planRequirements` to default to `[taskId]` (e.g. `["task-1"]`). Furthermore, for analytical or documentation tasks, `unifiedDiff` defaults to `"No diff (unobserved)"` and `testSummary` to `"No test output (unobserved)"`.
2. **Monolithic Code-Centric Rubric (`src/cook-expert-judge.ts:181-188`):** The JEV prompt asks: *"Does `unified_diff` satisfy all deliverables in `plan_requirements` without skipping requirements or faking tests?"* with criteria *"true: Implementation fulfills all listed acceptance criteria with real passing tests"*. When an analytical task produces non-code artifacts (markdown reports, JSON specifications, council ADRs) without git diffs or unit tests, JEV correctly concludes that `unified_diff` contains zero deliverables and rejects the completion.

## Options considered

| Option | Description |
|---|---|
| Option A: Contextual Injection | Enrich Gate 2 payload with explicit acceptance criteria, task categorization, non-git deliverables (markdown/reports), and test traces. |
| Option B: Iterative Pre-Flight Verification | Require agents to run a local multi-evaluation self-correction loop via `xd://typesafe_evaluate_multi` prior to calling `todo(done)`. |
| Option C: Phased Rubrics & Task-Aware Dynamic Thresholds | Decouple monolithic pass/fail rubrics into task-specific evaluation schemas (`code_change`, `analysis_research`, `documentation`, `chore`) with calibrated dynamic thresholds. |

## Lens verdicts

| Lens | Verdict | Confidence |
|---|---|---|
| ArchitectureLens | Option A (Tier 1 Foundation) + Option C (Tier 2 Calibration). Option B as Tier 3 non-blocking advisory hook only. | 0.90 |
| MaintainabilityLens | Option A + Option C Hybrid Architecture. Reject Option B as a mandatory blocking loop. | 0.92 |
| DeliveryLens | Immediate Option A (1–2 days, 0 extra roundtrips) + Fast-follow Option C (2–4 days). Reject standalone Option B. | 0.88 |
| Researcher | Tri-Pillar Framework: Option A grounds the judge; Option C orthogonalizes rubrics; Option B requires a hard ceiling ($\le 2$ retries) and non-blocking fallthrough. | 0.85 |

## Evidence

| Claim | Source | Date | Type | Supports |
|---|---|---|---|---|
| Gate 2 fails on analytical tasks due to empty git diff and `[taskId]` requirements fallback | `typesafe-planner.ts:1120-1132`, `src/cook-expert-judge.ts:172-209` | 2026-10-12 | measured | Option A, Option C |
| Grounding LLM judges with reference criteria and execution traces increases ROC-AUC from ~0.62 to ~0.89 | Scale AI Agentic Rubrics (2026); Anthropic Evals Engineering Guide | 2025–2026 | official | Option A |
| LLMs cannot reliably self-correct reasoning without external specification anchors or deterministic feedback | Huang et al., *Large Language Models Cannot Self-Correct Reasoning Yet*, ICLR 2024 | 2024-05 | independent | Rejecting standalone Option B |
| Orthogonal multi-aspect rubrics eliminate single-score collapse and halo effects (Cohen's $\kappa > 0.78$) | AdaRubric (2025); Liu et al., *G-Eval* (2023) | 2023–2025 | independent | Option C |
| Providing only code diffs without acceptance criteria causes external judges to hallucinate missing requirements | Anthropic Evals Engineering Guide; SWE-bench Verified Standards | 2025 | official | Option A |
| Mandatory inner agent retry loops produce 2x–4x API roundtrips, token explosion, and high risk of deadlocking | Maintainability & Delivery Lens operational audit | 2026-10-12 | measured | Rejecting Option B as mandatory gate |
| Bounded self-correction buffers with structured feedback reduce human escalation friction if capped at $\le 2$ attempts | Reflexion (Shinn et al., 2023); LangChain RubricMiddleware | 2023–2025 | independent | Option B as advisory tier only |

## Decision

**Adopt a Hybrid Architecture: Option A (Contextual Injection) as Immediate Tier 1 Infrastructure and Option C (Task-Aware Multi-Label Rubrics & Calibrated Thresholds) as Tier 2 Fast-Follow. Option B is downgraded to an Opt-In, Non-Blocking Advisory Diagnostic Tool (Tier 3) with a strict cap of $\le 2$ attempts.**

Under this decision:
1. **Tier 1 (Immediate Payload Enrichment - Option A):** `typesafe-planner.ts` and `evidence-collector.ts` are updated to pass explicit plan acceptance criteria, task intent, and non-git artifact content (e.g., written files, generated documents) into `MacroCheckContext`. This closes the information asymmetry gap on every single `todo(done)` call with zero added API roundtrips.
2. **Tier 2 (Task-Aware Multi-Label Rubrics - Option C):** `runPhaseMacroCheck` dynamically selects the question schema based on task classification (`code_change` vs `analysis_research` vs `doc_specification`). Non-code tasks evaluate deliverable thoroughness and plan compliance against generated artifacts without penalizing missing unified diffs or test suites. Code tasks retain strict 0.80 thresholds and zero-drift criteria.
3. **Tier 3 (Advisory Pre-Flight - Option B):** Expose `xd://typesafe_verify_completion` as an optional pre-flight linter for complex multi-file tasks. It MUST NOT be a mandatory blocking gate before `todo(done)`. Any pre-flight invocation is capped at a maximum of 2 self-correction retries.

## Rationale

This decision directly resolves the tension between agent productivity and verification rigor using the standard tie-break hierarchy: **measured data > official docs > expert judgment > vendor claims**.

1. **Measured Data & Direct Reproduction:** Direct testing in OMP confirmed that Gate 2 rejections are overwhelmingly false positives stemming from context starvation. The judge was given `unified_diff: "No diff (unobserved)"` and `plan_requirements: "task-1"` for a research task, making a score of $P=0.10$ mathematically inevitable under the current prompt. Option A and C address the exact failure mechanism observed in the runtime.
2. **Official Guidance & Empirical Literature:** Scale AI (2026) and Anthropic Evals establish that an external evaluator cannot perform reliable discrimination without grounded reference contracts. Huang et al. (ICLR 2024) proved that ungrounded iterative self-correction (Option B) degrades performance and induces hallucinations unless backed by deterministic ground truth.
3. **Operational Viability (Maintainability & Delivery Lenses):** Option A and C introduce zero additional remote HTTP roundtrips. They leverage the existing batched `POST /v1/systemone` request. Conversely, mandatory Option B would increase latency by 200–400%, inflate token consumption, require invasive agent prompt rewrites across diverse models, and risk infinite loop thrashing.
4. **Separation of Concerns:** Option C orthogonalizes "did the work meet requirements?" from "is code diff present?". This eliminates monolithic score collapse and prevents non-code phases from being penalized as code omissions.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Context Window / Token Bloat in Gate 2 Payload | Medium | Enforce an 8 KB cap on serialized `state` via `sanitizeStateForTypeSafe`. Truncate oversized diffs via `summarizeUnifiedDiff` while preserving hunk headers, contracts, and assertions. |
| Agent Task-Type Spoofing (Bypassing Code Checks) | High | Implement deterministic harness-level override: if `git status --porcelain` contains modified tracked code files, the task is strictly forced to `code_change` rubric, preventing agents from claiming `analysis_research` to bypass diff verification. |
| Gate 1 Invariant Regression | Critical | Gate 1 (Micro-Check) remains an immutable, non-bypassable pre-condition. No semantic judge evaluation is invoked if tests fail, assertions are removed, or unsafe files are modified. |
| Dynamic Threshold Miscalibration | Medium | Maintain the strict $\ge 0.80$ threshold and `no_drift` requirement for all `code_change` tasks. Only modulate rubrics for non-code tasks where diffs and test suites are not expected deliverables. |
| Advisory Pre-Flight Agent Thrashing (Option B) | Low | Pre-flight is strictly optional and advisory. Enforce a hard harness ceiling ($\le 2$ iterations) with non-blocking fallthrough to prevent retry storms. |

## Implementation checklist

- [ ] **Phase 1: Contextual Payload Enrichment (Option A - Immediate)**
  - [ ] Update `typesafe-planner.ts:handleTodoInterception` to resolve `planPath` and extract task criteria before calling `collectTaskEvidence`.
  - [ ] Extend `MacroCheckContext` in `src/cook-expert-judge.ts` to include `taskType` (`code_change` | `analysis_research` | `doc_specification`), `deliverableArtifacts`, and explicit `acceptanceCriteria`.
  - [ ] Update `evidence-collector.ts` to detect generated file paths outside git working tree diffs (e.g. newly written `.md` documents, ADRs).
- [ ] **Phase 2: Task-Aware Multi-Label Rubrics (Option C - Fast-Follow)**
  - [ ] Refactor `runPhaseMacroCheck` in `src/cook-expert-judge.ts` to branch question generation based on `taskType`.
  - [ ] For `analysis_research` and `doc_specification` tasks: prompt JEV to evaluate `deliverable_thoroughness` and `contract_fulfillment` against artifact text, replacing the `unified_diff` check.
  - [ ] For `code_change` tasks: preserve strict `unified_diff` completeness, `no_drift`, and $\ge 0.80$ threshold.
  - [ ] Add deterministic task-type guard in `typesafe-planner.ts`: force `code_change` if working tree diff is non-empty.
- [ ] **Phase 3: Advisory Pre-Flight Tooling (Option B - Tier 3 Hook)**
  - [ ] Register `xd://typesafe_verify_completion` as an optional diagnostic tool for agent pre-flight inspection.
  - [ ] Enforce max 2 retries in agent prompt recommendations and ensure failure falls through cleanly without blocking `todo(done)` invocation.
- [ ] **Phase 4: Regression and Adversarial Verification**
  - [ ] Add unit tests in `typesafe-planner.test.ts` verifying that analytical tasks with markdown deliverables pass Gate 2 with $P \ge 0.80$.
  - [ ] Verify adversarial attempt to disguise code modifications as `analysis_research` is intercepted and re-routed to `code_change`.

## Reopen conditions

This decision will be reopened and revisited via `--recheck` under any of the following conditions:
- Gate 2 false rejection rate on analytical/research tasks remains greater than $5\%$ following Phase 1 and 2 implementation.
- Upstream TypeSafe System One releases a native task-categorization endpoint or a dedicated multi-artifact evaluation API.
- Measured average token consumption per `todo(done)` call exceeds 12,000 tokens due to artifact payload serialization.
- Breaking schema modifications are introduced to `POST https://api.typesafe.ai/v1/systemone`.

## Owners

- Primary: OMP Core Architecture & TypeSafe Extension Integration Maintainer (`omp-typesafe-maintainers`)
- Secondary: Delivery & Agent Developer Experience Team

## Council metadata

- Models used: ArchitectureLens, MaintainabilityLens, DeliveryLens, Researcher (`google-antigravity/gemini-3.8-flash`), Adjudicator (`google-antigravity/gemini-3.8-flash`)
- Cost estimate: ≈$0.02 (cached API execution)
- Lenses run: Architecture, Maintainability, Delivery (domain: software) + Research
- Generated by: `/ck:council` on 2026-10-12
