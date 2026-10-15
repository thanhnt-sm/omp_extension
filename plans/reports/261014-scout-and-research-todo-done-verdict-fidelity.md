---
title: "Scout & Research Report: TypeSafe Todo Done Verdict Fidelity & meets_criteria=0.00 Root Causes"
date: 2026-10-14
type: scout-and-research-report
skills: [ck:scout, ck:research, ck:docs-seeker]
---

# Scout & Research Report: TypeSafe `todo done` Verdict Fidelity & `meets_criteria=0.00` Root Causes

## Executive Summary
This report consolidates findings from parallel `ck:scout` codebase analysis (`ScoutJudgeAndConsensus`, `ScoutPlannerAndEvidence`), `ck:docs-seeker` inspection of official TypeSafe System One documentation (`https://docs.typesafe.ai/primitives.md`, `https://docs.typesafe.ai/confidence.md`), and `ck:research` evaluation of calibrated probability (`noul`) vs. categorical verdict (`choice`) LLM-as-a-Judge patterns.

We pinpointed **six technical root causes** in `D:/100.Software/Github/omp_extension` (`src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `src/evidence-collector.ts`, and `typesafe-planner.ts`) that explain why `typesafe-task-report` displays `meets_criteria=0.00` and `"Deliverable verification rejected: implementation is evading work, malicious, or stubs out needed functionality."` during `todo(op="done")` on research, brainstorming, and planning tasks.

---

## Part 1: Codebase Scout Findings (`ck:scout`)

### 1. `src/cook-expert-judge.ts:253-369` — Missing `meets_criteria` (`noul`) Question & Quantized `0.00` Fallback
- **Question Omission (`lines 253-277`)**: `runPhaseMacroCheck` sends only 3 `type: "choice"` questions to `https://api.typesafe.ai/v1/systemone`:
  1. `deliverables_verdict` (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED`)
  2. `architectural_drift` (`no_drift` | `unapproved_deviation` | `scope_creep` | `other`)
  3. `scope_mode` (`HOLD` | `EXPANSION` | `REDUCTION` | `other`)
  Unlike `constructGateQuestions` in `src/verification-gate.ts:141-160` (which sends both `deliverables_verdict` (`choice`) and `meets_criteria` (`noul`)), `runPhaseMacroCheck` never includes `meets_criteria` (`type: "noul"`).
- **Hardcoded Quantization (`lines 307, 336`)**:
  - `const rawMeetsCriteria = answers.meets_criteria?.noul;` is always `undefined` in live `runPhaseMacroCheck` executions.
  - Line `336` synthesizes `meetsCriteriaNoul` via a ternary step function:
    ```ts
    const meetsCriteriaNoul = rawMeetsCriteria ?? (deliverablesVerdict === "APPROVE" ? 1.0 : deliverablesVerdict === "NEXT_ACTION_REQUIRED" ? 0.5 : 0.0);
    ```
  - Whenever `deliverables_verdict` is `"REJECT"`, `meetsCriteriaNoul` is forced to `0.00` regardless of actual deliverable completeness or JEV confidence.
- **Dead-Code Threshold Branch & Accusatory Fallback (`lines 357-361`)**:
  ```ts
  if (rawMeetsCriteria !== undefined && rawMeetsCriteria < 0.80) {
    reasons.push(`Implementation score P=${rawMeetsCriteria.toFixed(2)} is below required threshold ${resolveAutoApprovalThreshold().toFixed(2)}.`);
  } else {
    reasons.push("Deliverable verification rejected: implementation is evading work, malicious, or stubs out needed functionality.");
  }
  ```
  Because `rawMeetsCriteria` is always `undefined`, the `if` branch is unreachable in production and every `REJECT` emits the static accusatory string.

### 2. `typesafe-planner.ts:336-385, 1981-1984` & `src/bicameral-consensus.ts:497-500` — Narrow Task-Type Classification
- `inferTaskType(gitStatus, deliverableArtifacts, taskDescription)` (`typesafe-planner.ts:374-381`) only classifies a task with no modified files as `"analysis_research"` if `taskDescription` matches at the **start of the string**:
  ```ts
  /^\s*(?:step\s*\d+\s*[:.-]\s*)?(?:scout|diagnos|investigat|research|analy[sz]|explore|find|audit|review|check|trace|inspect|kiểm tra|phân tích|tìm)\b/i
  ```
- Tasks starting with verbs such as `Read`, `Clarify`, `Brainstorm`, `Plan`, `Design`, `Synthesize`, `Consult`, `Evaluate`, `Assess`, `Document`, `Journal`, `Organize`, `Verify`, `Ask`, or `Propose` fall through to the default `"code_change"` (`line 384`).
- In `handleTodoInterception` (`typesafe-planner.ts:1981-1984`):
  ```ts
  const rawDeliverableArtifacts = await collectDeliverableArtifacts(projectDir, evidence.changedFiles);
  const taskType = inferTaskType(evidence.gitStatus, rawDeliverableArtifacts, taskId);
  const deliverableArtifacts =
    rawDeliverableArtifacts || (taskType === "analysis_research" ? convo.agentWorkLog : "");
  ```
  When `taskType` is misclassified as `"code_change"` and `changedFiles` is empty, `deliverableArtifacts` is `""` (discarding `convo.agentWorkLog`), and `runPhaseMacroCheck` prompts JEV to evaluate `unified_diff: "No diff (unobserved)"` against the `"code_change"` rubric, guaranteeing `deliverables_verdict: "REJECT"`.

### 3. `typesafe-planner.ts:421-441` & `src/evidence-collector.ts:159-186` — `plan-cli.cjs create` Stub False Positives
- Running `plan-cli.cjs create` scaffolds `plan.md` (with `TBD.`) and `phase-XX-*.md` boilerplate stubs containing:
  - `Brief description of scope and deliverables.`
  - `- [ ] Verifiable acceptance criteria`
  - `- [ ] Test validation commands`
  - `- Create: src/new-file.ts`
- If `todo(op="done")` runs on an intermediate task before the phase stubs are overwritten with real content, `collectDeliverableArtifacts` reads the stub `.md` files and sends `TBD.` to JEV as `deliverable_artifacts`, causing JEV to return `REJECT` ("stubs out needed functionality") and `scope=EXPANSION`.
- Simultaneously, `extractCriteriaFromPlan` (`src/evidence-collector.ts:159-186`) extracts `- [ ] Verifiable acceptance criteria` and `- [ ] Test validation commands` as mandatory requirements.

### 4. `src/evidence-collector.ts:383-410` & `typesafe-planner.ts:1834-1858` — Substring Collision & Stale `defaultPlanPath`
- In `src/evidence-collector.ts:393`, phase matching uses `options.taskId.includes(phaseIdentifier)`. When `phaseIdentifier` is `"1"`..`"5"`, any `taskId` containing that digit matches `phase-01..05.md`, sets `criteriaSource = "phase"`, and overwrites `planRequirements` (`[taskId]`) with the phase file's checkboxes.
- In `typesafe-planner.ts:1838-1855`, `defaultPlanPath` picks the newest unfinished `plans/\d{6}-*/plan.md` across the entire repository (e.g., `plans/261012-todo-drop-judge-fidelity/plan.md` with `status: in-progress`), binding unrelated historical plans to current tasks.

### 5. `typesafe-planner.ts:1220-1245` — Overbroad `plans/` Path Matching in Plan Closure Guard
- Any `write`/`edit` to a file under `plans/` (including `plans/reports/*.md`) whose text matches `/status:\s*(?:completed|complete)/i` triggers `assertNoActiveContractedTasks("Uncompleted contracted tasks exist")`, falsely treating a standalone report under `plans/reports/` as a `plan.md` closure!

### 6. `typesafe-planner.ts:1305, 1461` — Silent Host Interception & Report Opacity
- `pi.on("tool_call", handleTodoInterception)` intercepts `ask` and `todo(op="done")` inside the host extension without surfacing `deliverablesVerdict`, `expertConfidence`, or `taskType` in `formatTaskReport` (`typesafe-planner.ts:673-723`).

---

## Part 2: Official TypeSafe Documentation & Research Findings (`ck:docs-seeker` & `ck:research`)

### 1. Official TypeSafe System One Primitives (`https://docs.typesafe.ai/primitives.md` & `confidence.md`)
- **`Choice` vs. `Noul` Semantics**:
  - `Choice` returns `{ choice, probabilities, confidence }` where $\text{confidence} = \frac{p_{\max} - 1/n}{1 - 1/n}$ measures distribution concentration on the winning option, **not** the probability of deliverable satisfaction. If `choice === "REJECT"` with $p_{\text{REJECT}} = 0.90$, `confidence` is `0.85` (high confidence in rejection).
  - `Noul` returns `{ noul }` $\in [0, 1]$, the direct calibrated probability $P(\text{yes})$ that a boolean condition holds.
- **Parallel Multi-Question Batching**:
  - Official TypeSafe guidance states: *"Send every question that uses the same state in one request. You can mix question types freely. System One models evaluate every question in a request in parallel. Adding questions barely changes the response time and costs only the tokens for the extra questions."*
  - Including `meets_criteria` (`type: "noul"`) alongside `deliverables_verdict` (`type: "choice"`), `architectural_drift` (`type: "choice"`), and `scope_mode` (`type: "choice"`) in `runPhaseMacroCheck` provides both categorical routing and true calibrated probability $P \in [0, 1]$ in a single HTTP request.

### 2. Test Suite Compatibility Constraints Across `tests/`
- Scouting all 35 test files revealed 16 mock evaluations for `runPhaseMacroCheck`:
  - 11 tests mock `meets_criteria: { noul }` only.
  - 3 tests mock `deliverables_verdict: { choice }` only.
  - 2 tests mock both (`tests/judge-input-fidelity.test.ts:116-121`, `tests/todo-drop-gate.test.ts:134-139`).
  - `tests/cook-expert-judge.test.ts:590` and `tests/cook-verification-adversarial.test.ts:243` assert that rejection reasons on `deliverables_verdict: "REJECT"` match `/rejected/i`.
- Therefore, `runPhaseMacroCheck` must:
  1. Send `meets_criteria` (`type: "noul"`) in `questions` alongside `deliverables_verdict` (`type: "choice"`).
  2. Gracefully accept mock responses providing either `deliverables_verdict`, `meets_criteria`, or both.
  3. Retain the word `"rejected"` in task-type-aware rejection messages when `deliverablesVerdict === "REJECT"`.

---

## Actionable Recommendations
1. **Add `meets_criteria` (`type: "noul"`) to `runPhaseMacroCheck`** and use `rawMeetsCriteria` for `meetsCriteriaNoul` whenever returned by JEV, with diagnostic rejection messages that include `P=${rawMeetsCriteria.toFixed(2)}` and task type context.
2. **Broaden `inferTaskType` and `evaluateAdvisorIntent`** to detect cognitive/workflow verbs anywhere in `taskDescription` when no code files are modified, and always fall back to `convo.agentWorkLog` when `rawDeliverableArtifacts` is empty and no code files changed.
3. **Add `isPlanCliStub(content)` detection** in `collectDeliverableArtifacts` and `extractCriteriaFromPlan` so unmodified `plan-cli.cjs` templates (`Brief description of scope and deliverables.`, `TBD.`, `- [ ] Verifiable acceptance criteria`) are excluded from active phase requirements and annotated as scaffold stubs.
4. **Enforce word-boundary phase matching** (`/\bphase[-_\s]*0*${escapedId}\b/i`) in `src/evidence-collector.ts:389-394` and scope `defaultPlanPath` in `typesafe-planner.ts:1834-1856` so stale historical plans are not bound to unrelated tasks.
5. **Scope Plan Closure Guard (`typesafe-planner.ts:1220-1245`)** to `plan.md` / `phase-*.md` files rather than matching `plans/reports/*.md`.
6. **Enrich `formatTaskReport`** (`typesafe-planner.ts:673-723`) to show `verdict`, `meets_criteria`, and `task_type`.

## Unresolved Questions
- None; all root causes and test-suite invariants are verified against source code and tests.
