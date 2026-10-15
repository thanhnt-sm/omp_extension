# Forensic Root-Cause & Best-Practice Research Report: Advisor (`0.90`), Threshold (`0.80`), and TypeSafe JEV (`jev-latest`) Low-Score Rejections

- **Date**: 2026-10-15
- **Workspace**: `D:/100.Software/Github/omp_extension`
- **Pipeline**: `ck:scout` $\rightarrow$ `ck:debug` $\rightarrow$ `ck:research` $\rightarrow$ `ck:docs-seeker` $\rightarrow$ `typesafe-ai`

---

## Executive Summary

All three issues reported by the user are **100% confirmed with exact `file:line` source-code and live-session telemetry evidence**:

1. **Why Advisor Always Approves with `0.90` Confidence ("cứ như bị fix cứng 0.9 vậy")**:
   - `evaluateAdvisorIntent` (`src/bicameral-consensus.ts:364-550`) and `evaluateAdvisorDecision` (`lines 162-359`) do **not** query TypeSafe JEV; they are local regex/bag-of-words heuristics with hardcoded literal confidence values (`0.90`, `0.85`, `0.95`, `0.80`).
   - On `operation === "done"` (`lines 446-461`), `evaluateAdvisorIntent` checks `agentWorkLog` against a 36-verb regex (`/pass|implement|added|completed|fixed|...|check|...|review|plan|.../i`). Because `collectConversationContext` (`typesafe-planner.ts:668-719`) populates `agentWorkLog` from the last 8 assistant turns (including `[toolCall: read (...)]` and assistant thoughts), this first branch matches **~99% of active turns** and returns a hardcoded `{ verdict: "ALLOW", ckVerdict: "proceed", confidence: 0.90 }`.
   - Furthermore, `evaluateAdvisorIntent("done")` has **zero `DISALLOW` return statements**. Instead, `runBicameralMacroCheck` (`lines 702-709`) retroactively mutates `advisor.verdict = "DISALLOW"` *after* JEV returns `REJECT` while leaving `advisor.confidence` at `0.90`. And in `evaluateAdvisorDecision` (`lines 178-209`), base `0.50` + user-request word match `+0.25` + work-log word match `+0.15` deterministically equals **`0.90`**.

2. **Why Judge & Advisor Still Reference the `0.80` (`80%`), `0.30`, and `0.70` Thresholds ("mặc dù đã gỡ bỏ hết ngưỡng 0.8 đi rồi")**:
   - `resolveAutoApprovalThreshold()` in `src/verification-gate.ts:75-82` (re-exported in `src/cook-expert-judge.ts:3-5` and imported in `src/plan-evaluator.ts:3`) still defaults to **`0.80`**.
   - In `runPhaseMacroCheck` (`src/cook-expert-judge.ts:328, 378-403`), even when JEV returns a categorical `deliverables_verdict` (`REJECT` or `NEXT_ACTION_REQUIRED`), the code compares `rawMeetsCriteria < threshold` (`0.80`) and emits:
     `Deliverable verification rejected (...): score P=0.XX is below required threshold 0.80.` (or `vs threshold 0.80`).
   - `verifyTaskCompletion` (`src/verification-gate.ts:375-432`), `generateVerificationScorecard` (`src/cook-expert-judge.ts:583-584`), `runDropJustificationCheck` (`src/cook-expert-judge.ts:601, 682-728`), `evaluatePlanDraft` (`src/plan-evaluator.ts:339-351`), and `formatTaskReport` (`typesafe-planner.ts:774`) still enforce and print `0.80`, `0.70`, and `DROP_REJECT_FLOOR = 0.30`.

3. **Why Judge (`jev-latest`) Frequently Rejects Work with Low Scores (`0.00`–`0.52`)**:
   - **Defect 3A — Double-Encoded XML-Polluted `state` & Double-Clamping Amputation**: `runPhaseMacroCheck` wraps every field in `<tag>\n...\n</tag>` (`encloseUntrusted`) and stringifies it into `rawState`. Then `sanitizeStateForTypeSafe` (`typesafe-planner.ts:499-578`) parses `rawState` back into an object, retains redundant XML tags inside JSON fields, re-clamps `3,000`-char fields down to `2,000` chars (injecting duplicate truncation markers), and crushes all non-diff fields to **`950` chars** whenever serialized state exceeds `28,000` chars.
   - **Defect 3B — Whole-Plan / Whole-Phase Criteria Mismatch (`src/evidence-collector.ts:186-218`)**: `extractCriteriaFromPlan(planContent, taskId)` ignores its `taskId` argument and extracts **every checkbox** (`- [ ]` and `- [x]`) from the entire `plan.md` or `phase-XX.md`. When an agent completes Sub-Task 1 of $N$, `jev-1.13` (which reads instructions and criteria literally per `docs.typesafe.ai/model-jaggedness/jev-1.13.md`) sees that Tasks 2..$N$ are not yet implemented and returns `P = 0.06–0.45` (`REJECT` / `NEXT_ACTION_REQUIRED`).
   - **Defect 3C — Phantom `todo` Tool Parameters (`testCommand`, `planPath`, `requirements`, `phaseTitle`)**: OMP's native `todo` tool schema (`op, task, list, items, phase, reason, i`) does not include `testCommand`, `planPath`, `requirements`, or `phaseTitle`. Because `testCommand` is always `undefined` and `collectConversationContext` only matches a narrow `bun test` regex, `test_summary` defaults to `"No testCommand provided for this task; test evidence not collected."`, which JEV penalizes.
   - **Defect 3D — `summarizeUnifiedDiff` Hollows Out Implementation Code (`typesafe-planner.ts:466-497`)**: On diffs $> 14\text{ KB}$, `summarizeUnifiedDiff` deletes all lines except file/hunk headers, `expect(`, signatures, and `return`/`throw`/`TODO`. JEV sees function signatures with `[... N lines truncated ...]` bodies and rejects the diff for "stubbing out needed functionality".
   - **Defect 3E — `constructGateQuestions` Invalid Array `criteria` & `truncatePayloadState` Line Scrambling**: `src/verification-gate.ts:146-159` passes `string[]` criteria for `choice` and `noul` (violating `typesafe-api-client.cjs:113-143`), and `src/payload-safety.ts:122, 148` matches substring `"at "` and Markdown `"# "` headings, scrambling non-diff state lines.

---

## Key Findings & Evidence Matrix

| Issue Category | Exact Location (`file:line`) | Root Cause Mechanism | Observed Runtime Symptom |
|---|---|---|---|
| **Advisor `0.90` Hardcode** | `src/bicameral-consensus.ts:446-477` | 36-verb regex on `agentWorkLog` + `CLEAN_BUILD_PATTERNS` returns literal `confidence: 0.90`; zero `DISALLOW` paths in `operation === "done"`. | `Lobe 1 (Advisor Intent): ALLOW (Confidence 0.90)` on every task. |
| **Advisor `0.90` Option Score** | `src/bicameral-consensus.ts:178-209, 274, 987, 1017` | Bag-of-words `0.50 + 0.25 + 0.15 = 0.90`; `runBicameralDecisionCheck` never updates `advisor.confidence` from JEV. | `## Verdict: proceed`, `## Confidence: 0.90` (or `0.85`). |
| **`0.80` / `0.30` Threshold Leaks** | `src/verification-gate.ts:75-82, 375-432`<br>`src/cook-expert-judge.ts:328-408, 583, 601, 682-728`<br>`src/plan-evaluator.ts:339-351`<br>`typesafe-planner.ts:23, 774` | `resolveAutoApprovalThreshold()` returns `0.80`; `runPhaseMacroCheck` and `verifyTaskCompletion` format rejections as `below required threshold 0.80`; `DROP_REJECT_FLOOR = 0.30`. | Rejection messages and scorecards still cite `0.80` and `0.30` thresholds. |
| **JEV Payload & Schema Corruption** | `src/cook-expert-judge.ts:199-220`<br>`typesafe-planner.ts:466-578`<br>`src/evidence-collector.ts:186-218`<br>`src/verification-gate.ts:146-159`<br>`src/payload-safety.ts:113-203` | Double-clamping (`3000 -> 2000 -> 950`), XML tags inside JSON fields, hollowed-out diffs $>14\text{ KB}$, whole-plan criteria for single sub-task, missing `testCommand`. | JEV returns `meets_criteria = 0.00–0.52` and `REJECT` / `NEXT_ACTION_REQUIRED` on valid work. |

---

## TypeSafe System One (`jev-1.13`) Official Best Practices (`docs.typesafe.ai`)

1. **Structured JSON Object State (`docs.typesafe.ai/concepts/state.md` & `model-jaggedness/jev-1.13.md`)**:
   - Pass `state` as a clean JSON object with named fields rather than double-encoded JSON strings or XML-wrapped blobs.
   - Filter out irrelevant context (`jev-1.13` suffers from context rot when unrelated whole-plan requirements or unrelated dirty files are mixed into a single sub-task check).
2. **Parallel Batched Questions (`docs.typesafe.ai/primitives.md`)**:
   - All questions over the same `state` are evaluated independently in parallel in a single HTTP request. Lobe 1 (Advisor intent/alignment) and Lobe 2 (Judge deliverables/drift/scope) can be evaluated together in one `/v1/systemone` call.
3. **Literal Criteria Alignment (`docs.typesafe.ai/model-jaggedness/jev-1.13.md`)**:
   - `jev-1.13` reads `instructions` and `criteria` literally. Sub-task completion must be judged against the specific `todo_task` and matching task requirements—never against unstarted future phases of the plan.
4. **Confidence & Noul Semantics (`docs.typesafe.ai/confidence.md` & `primitives/noul.md`)**:
   - `Choice` and `Score` answers carry a distribution-derived `confidence` in $[0, 1]$ (`(n * p_max - 1) / (n - 1)` for Choice).
   - `Noul` answers are calibrated probabilities $p \in [0, 1]$ with natural Bayes decision boundary $p = 0.50$ and certainty distance $|2p - 1|$. Hardcoded client-side walls (`0.80` / `0.30`) distort calibrated outputs.
