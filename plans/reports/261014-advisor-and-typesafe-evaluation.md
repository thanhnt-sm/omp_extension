---
title: "Advisor & TypeSafe System One Evaluation Report: Todo Done Verdict Fidelity Architecture"
date: 2026-10-14
type: advisor-and-typesafe-evaluation
skills: [ck:advisor, typesafe-ai]
devices: [xd://typesafe_advisor, xd://typesafe_judge, xd://typesafe_expert_review, xd://typesafe_rerank, xd://typesafe_evaluate_multi]
---

# Advisor & TypeSafe System One Evaluation Report

## Executive Summary
This report documents the multi-tool evaluation of candidate architectures for fixing `meets_criteria=0.00` score quantization, non-code task misclassification, `plan-cli.cjs` stub false positives, and `phaseIdentifier` collisions across `src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `src/evidence-collector.ts`, and `typesafe-planner.ts`.

We executed both the read-only `ck:advisor` subagent (`ConsultCkAdvisor`) and five explicit `xd://typesafe_*` System One devices (`xd://typesafe_advisor`, `xd://typesafe_judge`, `xd://typesafe_expert_review`, `xd://typesafe_rerank`, and `xd://typesafe_evaluate_multi`). All evaluators achieved unanimous consensus recommending **Option A (Dual-Primitive Hybrid + Context-Aware Task Classifier + Plan-CLI Stub Detector + Scoped Plan Closure Guard)**.

---

## 1. Bicameral `ck:advisor` & `xd://typesafe_advisor` Verdict

### Verdict
`proceed` (`AUTO_APPROVE` — Advisor Confidence: `0.98`, JEV Confidence: `1.00`, Subagent `ck:advisor` Confidence: `0.97`)

### Ranked Options Comparison

| Rank | Candidate Architecture | `ck:advisor` Score | `xd://typesafe_advisor` Score | `xd://typesafe_rerank` Score | Decision |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **1** | **Option A: Dual-Primitive Hybrid (`deliverables_verdict` + `meets_criteria` `noul`) + Context-Aware Task Classifier + Plan-CLI Stub Detector + Word-Boundary Phase Matching** | **0.96** | **0.98** | **1.99** | **Selected (Recommended)** |
| **2** | **Option B: Pure Categorical Verdict (remove `meets_criteria` numeric score from `MacroCheckResult` and `TaskReport`)** | 0.35 | 0.90 | 1.06 | Rejected (breaks 13 existing tests & loses continuous calibration) |
| **3** | **Option C: Bypass Gate 2 JEV Macro-Check for all non-code tasks** | 0.20 | 0.65 | 0.77 | Rejected (violates Gate 2 invariant & opens evasion vector) |

---

## 2. Explicit `xd://typesafe_*` Device Telemetry

### A. `xd://typesafe_judge` (Primitive Evaluation)
- **`recommended_architecture` (`choice`)**: `"option_a_hybrid_calibrated"` (`confidence: 1.00`)
- **`architectural_soundness` (`score`, 0..3)**: `1.83 / 3.00` (`confidence: 0.83` — Solid/Exemplary boundary)
- **`diagnosis_completeness` (`noul`)**: `0.49` (prompted deeper inspection of `typesafe-planner.ts:1228`, uncovering Root Cause #6: overbroad `isPlanFile` regex matching `plans/reports/*.md` on Plan Closure Guard).

### B. `xd://typesafe_expert_review` (`role: "risk_security_triage"`)
- **Risk Score**: `1.34 / 3.00` (`acceptable: true`, threshold $\le 1.50$)
- **Security Invariant Verification**: Confirmed that preserving the anti-spoofing override (`containsCodeChanges` in `src/cook-expert-judge.ts:194-201`) guarantees that any task modifying `.ts`, `.js`, `.cjs`, `.json`, or config files is forced into `"code_change"` verification regardless of task name.

### C. `xd://typesafe_rerank` (Candidate Architecture Ranking)
1. `Option A: Dual-Primitive Hybrid + Context-Aware Task Classifier + Plan-CLI Stub Detector + Word-Boundary Phase Matching` — **Score: `1.99`**
2. `Option B: Pure Categorical Verdict` — **Score: `1.06`**
3. `Option C: Bypass Gate 2 JEV Macro-Check for all non-code tasks` — **Score: `0.77`**

### D. `xd://typesafe_evaluate_multi` (Multi-Dimension Verification)
- `preserves_anti_spoofing_security`: `0.82`
- `prevents_non_code_false_rejects`: `0.66`
- `filters_plan_cli_tbd_stubs`: `0.58`
- `maintains_backward_compatibility`: `0.37` (highlighted the critical requirement identified by `ScoutJudgeAndConsensus`: 11 unit tests mock `meets_criteria` only while 3 mock `deliverables_verdict` only, so `runPhaseMacroCheck` must support both in its response parser).
- `calibrates_meets_criteria_score`: `0.32` (highlighted that `meetsCriteriaNoul` should prioritize `rawMeetsCriteria` from JEV's `noul` primitive and only fall back to `deliverablesVerdict` mapping when mocked unit tests omit `meets_criteria`).

---

## 3. Synthesized Technical Specifications for Option A

1. **Dual-Primitive Question & Calibrated Score (`src/cook-expert-judge.ts:253-369`)**:
   - Send `meets_criteria` (`type: "noul"`) alongside `deliverables_verdict` (`type: "choice"`), `architectural_drift` (`type: "choice"`), and `scope_mode` (`type: "choice"`).
   - Compute `meetsCriteriaNoul`:
     ```ts
     const meetsCriteriaNoul =
       rawMeetsCriteria ??
       (deliverablesVerdict === "APPROVE"
         ? 1.0
         : deliverablesVerdict === "NEXT_ACTION_REQUIRED"
         ? 0.5
         : 0.0);
     ```
     When live JEV responds, `rawMeetsCriteria` is always a real calibrated probability $P \in [0, 1]$ (never hardcoded `0.00` unless JEV actually scores $0.00$). When unit test mocks only return `deliverables_verdict`, the fallback preserves 100% test backward compatibility.
   - Replace the static accusatory rejection message with a diagnostic message that retains the word `"rejected"` (satisfying `tests/cook-expert-judge.test.ts:590` and `tests/cook-verification-adversarial.test.ts:243`) while reporting `rawMeetsCriteria` and `effectiveTaskType`.

2. **Context-Aware Task Classification & Work-Log Fallback (`typesafe-planner.ts:336-385, 1981-1984` & `src/bicameral-consensus.ts:497-500`)**:
   - Broaden `inferTaskType` (when no code files are in `gitStatus`) to match cognitive/workflow tasks (`scout|diagnos|investigat|research|analy[sz]|explore|find|audit|review|check|trace|inspect|read|clarif|brainstorm|plan|design|synthesi[sz]|consult|evaluat|assess|document|journal|organi[sz]|verif|ask|propose|validate|compare|summarize`) anywhere in `taskDescription`.
   - Always pass `convo.agentWorkLog` in `deliverableArtifacts` when `rawDeliverableArtifacts` is empty and no code files changed.

3. **Plan-CLI Stub Detector & Word-Boundary Phase Matching (`typesafe-planner.ts:421-441, 1228, 1834-1856` & `src/evidence-collector.ts:159-186, 383-410`)**:
   - Add `isPlanCliStub(content: string): boolean` to detect unfilled `plan-cli.cjs create` templates (`Brief description of scope and deliverables.`, `- [ ] Verifiable acceptance criteria`, `TBD.`).
   - Filter out stub files from `collectDeliverableArtifacts` (or annotate them as `[Scaffolded Plan Stub — Not Yet Populated]`) and skip stub checkboxes in `extractCriteriaFromPlan`.
   - Replace `options.taskId.includes(phaseIdentifier)` with a strict word-boundary regex (`/\bphase[-_\s]*0*${escapedId}\b/i`).
   - Narrow `isPlanFile` in `typesafe-planner.ts:1228` so `plans/reports/*.md` files are not treated as `plan.md` / `phase-*.md` closures.

4. **Transparent Task Report (`typesafe-planner.ts:656-723`)**:
   - Display `verdict`, `meets_criteria`, `drift`, `scope`, and `task_type` in `formatTaskReport`.

## Unresolved Questions
- None. Ready for interactive `ck:brainstorm` user review and `/ck:plan` generation.
