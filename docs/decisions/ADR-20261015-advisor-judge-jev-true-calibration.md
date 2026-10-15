# ADR-20261015: True JEV-Backed Advisor Calibration, Complete 0.80/0.30 Threshold Purge, and Structured JEV State Fidelity

- **Date**: 2026-10-15
- **Status**: Decided
- **Domain**: AI / Software Architecture (`omp_extension`)
- **Skills**: `ck:council`, `ck:brainstorm`, `ck:predict`, `ck:advisor`, `typesafe-ai`

---

## Question

How should `omp_extension` (`typesafe-planner.ts` and `src/*.ts`) overhaul the Bicameral Advisor and TypeSafe JEV (`jev-latest`) Judge so that:
1. Advisor (`evaluateAdvisorIntent`, `evaluateAdvisorDecision`, `runBicameralMacroCheck`, `runBicameralDropCheck`, `runBicameralDecisionCheck`) never outputs hardcoded `0.90` rubber-stamp approvals (`ALLOW (0.90)`),
2. All residual `0.80` (`resolveAutoApprovalThreshold`), `0.30` (`DROP_REJECT_FLOOR`), and `0.70` numerical threshold walls and error messages are completely eliminated per ADR-20261013, and
3. TypeSafe System One (`jev-latest`) receives clean, sub-task-scoped, uncorrupted structured JSON `state` and canonical `questions` so valid work is accurately evaluated without false `0.00–0.52` rejections?

---

## Candidate Options

| Option | Summary |
|---|---|
| **Option 1: Batched Dual-Lobe JEV Evaluation + Calibrated Multi-Signal Heuristic + Zero Threshold Walls + Structured Sub-Task State (Recommended)** | 1. **Advisor Calibration**: Query JEV for Lobe 1 (`advisor_intent` choice + `intent_confidence` / per-option `score`) and Lobe 2 (deliverables/drift/scope) in a single batched `/v1/systemone` request when online; replace hardcoded `0.90`/`0.85`/`0.95` literals in `evaluateAdvisorIntent`/`evaluateAdvisorDecision` with continuous multi-signal evidence scoring and real `DISALLOW` paths when tests fail or code evidence is missing.<br>2. **Zero `0.80`/`0.30` Threshold Walls**: Eliminate `0.80`/`0.30`/`0.70` walls and threshold strings from `cook-expert-judge.ts`, `verification-gate.ts`, `plan-evaluator.ts`, and `typesafe-planner.ts`; rely on categorical `choice` verdicts (`APPROVE` \| `REJECT` \| `NEXT_ACTION_REQUIRED` / `ESCALATE`) with natural Bayes consistency ($P = 0.50$).<br>3. **JEV State & Criteria Fidelity**: Scope `extractCriteriaFromPlan` to the active `taskId` (putting broader plan context in `plan_context`), remove redundant XML-inside-JSON double-clamping and 950-char cliff amputation, preserve implementation code in `summarizeUnifiedDiff`, support `params.phase` and broad test-runner detection in `collectConversationContext`, and fix `constructGateQuestions` dict `criteria` schema. |
| **Option 2: Keep Regex Lobe 1 Advisor with Adjusted Weights + Lower `resolveAutoApprovalThreshold` to `0.50`** | Retain regex-only Lobe 1 with tweaked weights and change `resolveAutoApprovalThreshold()` default from `0.80` to `0.50` while keeping threshold comparisons and XML-wrapped state strings. |
| **Option 3: Separate Sequential HTTP Calls to `/v1/systemone` for Advisor (Lobe 1) and Judge (Lobe 2)** | Issue two separate sequential HTTP POST requests to `/v1/systemone` on every `todo(op="done")` and `todo(op="drop")`: one for Lobe 1 Advisor and one for Lobe 2 Judge. |

---

## Expert Lenses & Verdicts

| Lens | Verdict & Rationale | Confidence |
|---|---|---|
| **ArchitectureLens (`ck:advisor`)** | **Option 1.** Combines Lobe 1 and Lobe 2 questions in a single parallel System One request when online while equipping the synchronous `evaluateAdvisorIntent` / `evaluateAdvisorDecision` engine with real negative-evidence (`DISALLOW`) branches and continuous signal-weighted confidence instead of fixed `0.90` constants. Eliminates the post-hoc `advisor.verdict = "DISALLOW"` monkey-patch in `runBicameralMacroCheck`. | 0.97 |
| **TypeSafe Best-Practice Lens (`typesafe-ai`)** | **Option 1.** Official TypeSafe docs (`docs.typesafe.ai/concepts/state.md`, `primitives.md`, `model-jaggedness/jev-1.13.md`, `confidence.md`) mandate: (a) clean structured JSON `state` objects without unrelated whole-plan distractor text, (b) literal alignment between `instructions`/`criteria` and the specific sub-task being judged, (c) batching parallel questions over the same state in one request, and (d) using native `choice`/`score` distribution `confidence` and natural Bayes $P=0.50$ rather than arbitrary `0.80`/`0.30` walls. | 0.96 |
| **Security & Reliability Lens** | **Option 1.** Preserves Gate 1 deterministic checks (`.claude` isolation, test exit code 0, net assertion-deletion AST guard) and secret redaction while fixing `truncatePayloadState` (`"at "` and `"# "` line-scrambling), `constructGateQuestions` dict schema compliance, and `summarizeUnifiedDiff` implementation preservation. | 0.95 |

---

## Decision

We adopt **Option 1**:

1. **Calibrated, Non-Rubber-Stamp Advisor (`src/bicameral-consensus.ts`)**:
   - Remove hardcoded `0.90`, `0.85`, `0.95`, `0.80` confidence literals from `evaluateAdvisorIntent` and `evaluateAdvisorDecision`.
   - Compute continuous, evidence-weighted confidence from independent signals (task-to-worklog token overlap, verified test exit/summary status, concrete diff/artifact presence, user prompt alignment, and explicit penalties for failing tests, error traces, or missing code changes on `code_change` tasks).
   - Introduce first-class `DISALLOW` return paths in `evaluateAdvisorIntent("done")` when test output shows failures (`exit != 0`, `FAIL`), when a `code_change` task has zero diff and zero test evidence, or when safety boundaries are violated—eliminating the post-hoc monkey-patch in `runBicameralMacroCheck`.
   - In `runBicameralDecisionCheck`, `runBicameralMacroCheck`, and `runBicameralDropCheck`, incorporate JEV's real distribution `confidence` and per-option / intent judgments directly into `advisor.confidence` and `rankedOptions`.
   - Route `todo` drop interception in `typesafe-planner.ts` through `runBicameralDropCheck` so Lobe 1 and Lobe 2 genuinely arbitrate drops together.

2. **Complete Elimination of `0.80`, `0.30`, and `0.70` Threshold Walls (`src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `typesafe-planner.ts`)**:
   - Remove `0.80` (`resolveAutoApprovalThreshold`) and `0.30` (`DROP_REJECT_FLOOR`) from all decision branches, scorecards, task reports, and rejection messages.
   - Use JEV's categorical `choice` verdicts (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED` / `ESCALATE`) as primary authority, paired with natural Bayes majority ($P = 0.50$) for `noul` probabilities (`meets_criteria`, `task_actionability`, `claude_isolation_adherence`, `claude_account_untouched`, `drop_justified`).
   - Keep `resolveAutoApprovalThreshold()` and `DROP_REJECT_FLOOR` exported only as backward-compatible symbols calibrated to the natural Bayes midpoint (`0.50`) so any external caller importing the symbol never hits a `0.80` or `0.30` wall, and never print `"threshold 0.80"` or `"(reject < 0.30)"` in any diagnostic, scorecard, or rejection message.

3. **High-Fidelity JEV `state` and `questions` Pipeline (`src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`, `src/evidence-collector.ts`, `src/payload-safety.ts`, `typesafe-planner.ts`)**:
   - Make `extractCriteriaFromPlan(planContent, taskId)` task-aware: when `taskId` matches specific checklist items or phase sections, return the matching task criteria as `criteria` (`criteriaSource = "phase"`), rather than dumping every checkbox of the entire multi-phase plan into `task_requirements`.
   - In `verifyTaskCompletion`, scope `constructGateQuestions` to `context.taskId` (and matching task criteria) and convert `deliverables_verdict.criteria` and `meets_criteria.criteria` from invalid `string[]` arrays to canonical `Record<string, string>` dictionaries.
   - Align field budgets between `runPhaseMacroCheck` and `sanitizeStateForTypeSafe` (`3,000` chars for `task_requirements`, `agent_work_log`, `test_summary`; `5,000` chars for `deliverable_artifacts`), eliminate the `> 28,000` char cliff that crushed all fields to `950` chars, and update `summarizeUnifiedDiff` to preserve added/removed implementation lines up to the 14KB budget instead of stripping function bodies.
   - Expand test-runner detection in `collectConversationContext` (`bun test`, `npm test`, `vitest`, `jest`, `pytest`, `cargo test`, `go test`, `dotnet test`, `msbuild`, `tsc`, `node --test`) and read `params.phase || primaryOp.phase` in `handleTodoInterception`.
   - Fix `truncatePayloadState` in `src/payload-safety.ts` so `"at "` substring matches and Markdown `"# "` headings do not scramble non-diff state lines.

---

## Reopen Conditions

Reopen if TypeSafe System One introduces a new v2 request schema or if OMP changes the native `todo` tool parameter contract.
