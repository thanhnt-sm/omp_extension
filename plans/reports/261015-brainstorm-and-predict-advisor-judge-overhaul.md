# Brainstorm & Multi-Persona Prediction Report (`ck:brainstorm` + `ck:predict`): Advisor (`0.90`), Threshold (`0.80`), and TypeSafe JEV Overhaul

- **Date**: 2026-10-15
- **Workspace**: `D:/100.Software/Github/omp_extension`
- **Skills**: `ck:brainstorm`, `ck:predict`, `ck:council`, `ck:advisor`

---

## 1. Brainstorm Analysis (`ck:brainstorm`)

### Problem Statement
1. **Advisor Fixed-Score Pathology (`0.90`)**: `src/bicameral-consensus.ts` uses a 36-verb regex in `evaluateAdvisorIntent("done")` and a `0.50 + 0.25 + 0.15 = 0.90` bag-of-words formula in `evaluateAdvisorDecision`, producing `ALLOW (Confidence 0.90)` on nearly every turn and zero `DISALLOW` paths on `done`.
2. **Residual `0.80` / `0.30` / `0.70` Threshold Walls**: `resolveAutoApprovalThreshold()` (`0.80`) and `DROP_REJECT_FLOOR` (`0.30`) remain active in `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, and `typesafe-planner.ts`, overriding categorical verdicts and emitting `"below required threshold 0.80"` / `"(reject < 0.30)"`.
3. **JEV Low-Score / False-Rejection Pipeline**: `jev-latest` is fed double-clamped XML-wrapped state fields (crushed to 950 chars when state > 28KB), hollowed-out diffs (`summarizeUnifiedDiff` deleting implementation lines > 14KB), whole-plan checkboxes for single sub-tasks (`extractCriteriaFromPlan` ignoring `taskId`), array `criteria` on `choice`/`noul` in `constructGateQuestions`, and `"test evidence not collected"` whenever `testCommand` is absent from `todo` params.

### Evaluated Approaches
- **Approach A (Selected — Full Structural & Calibration Overhaul)**:
  - Calibrate Advisor via continuous multi-signal evidence scoring + first-class `DISALLOW` on failing tests/missing code diff + live JEV confidence binding (`decision_clarity`, `recommended_option`, `advisor_alignment`).
  - Purge all `0.80`/`0.30`/`0.70` walls and messages; use categorical `choice` verdicts + natural Bayes $P=0.50$ consistency.
  - Make `extractCriteriaFromPlan` task-aware, fix `constructGateQuestions` dict schema, preserve implementation hunks in `summarizeUnifiedDiff`, remove double-clamping/950-char amputation in `sanitizeStateForTypeSafe`, and fix `truncatePayloadState`.
- **Approach B (Rejected — Cosmetic Message Scrubbing)**:
  - Hide `"0.80"` from error strings and jitter `0.90` by $\pm 0.03$. Rejected: violates engineering integrity and leaves JEV false rejections and Advisor rubber-stamping broken.

---

## 2. Multi-Persona Pre-Analysis (`ck:predict`)

## Verdict: GO

### Agreements (all 5 personas align)
- **Eliminate Hardcoded Advisor Confidence (`0.90`)**: Confidence must reflect actual evidence quality and JEV distribution concentration, never a static literal.
- **Purge `0.80` / `0.30` / `0.70` Threshold Walls**: Categorical JEV verdicts (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED`) and natural Bayes probability ($P \ge 0.50$) must govern Gate 2 without artificial `0.80` walls.
- **Task-Scoped Criteria & Clean State**: `jev-1.13` reads `task_requirements` literally; passing unstarted checkboxes from later tasks or phases guarantees false rejections.

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| **How Lobe 1 (Advisor) uses JEV vs local evaluation** | Bind Advisor confidence to JEV answers when online and multi-signal evidence when synchronous | Never allow untrusted agent claims alone to yield high confidence without diff/test corroboration | Avoid adding a second sequential HTTP round-trip on `todo done` | Show genuine, varying confidence scores and accurate reasons in reports and popups | Some unit tests call `evaluateAdvisorIntent` synchronously without `client` | Compute calibrated multi-signal confidence in synchronous `evaluateAdvisorIntent` / `evaluateAdvisorDecision` AND bind JEV's calibrated `confidence`/`noul` in `runBicameral*` without extra HTTP round-trips |
| **Fate of `resolveAutoApprovalThreshold` export** | Remove all `0.80` walls | Keep Gate 1 & Claude boundary checks fail-closed | Zero overhead | Never display `0.80` or `0.30` in any user/agent message | Existing tests import `resolveAutoApprovalThreshold` | Default `resolveAutoApprovalThreshold()` to `0.50` (natural Bayes midpoint) for backward-compatible imports, and remove all `"threshold 0.80"` / `"(reject < 0.30)"` walls and strings |
| **Diff & State Truncation (`summarizeUnifiedDiff` & `sanitizeStateForTypeSafe`)** | Preserve actual added/removed code hunks up to 14KB | Keep 32KB hard cap and secret redaction intact | Single-pass clamping without double-truncation | Prevent JEV from thinking valid code is stubbed | Adversarial 200KB diff flood test must still pass `< 32KB` | Preserve contiguous diff lines up to budget while prioritizing headers/assertions on extreme 200KB floods, and raise `sanitizeStateForTypeSafe` field caps to match `runPhaseMacroCheck` (`3000`/`5000`) |

### Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Legacy unit tests asserting literal `"0.80"` or `confidence === 0.90` | Medium | Audit and update unit tests in `tests/*.test.ts` to assert calibrated bicameral behavior and Bayes-aligned contracts |
| 200KB diff flood exceeding 32KB API limit | High | Keep `MAX_BODY_BYTES = 32768` guard in `executeTypeSafe` and `preparePayloadSafe` |
| `Drift` / `Scope` failure with `deliverables_verdict === "APPROVE"` triggering `ESCALATE` popup on Attempt 1 | High | Downgrade `jevMacro.verdict` to `"NEXT_ACTION_REQUIRED"` when `driftChoice !== "no_drift"` or `scopeChoice === "REDUCTION"` so the agent receives actionable remediation first |

### Recommendations
1. Implement genuine multi-signal confidence calculation and `DISALLOW` detection in `src/bicameral-consensus.ts`.
2. Remove all `0.80`/`0.30`/`0.70` walls and messages across `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, and `typesafe-planner.ts`.
3. Fix `extractCriteriaFromPlan`, `constructGateQuestions`, `sanitizeStateForTypeSafe`, `summarizeUnifiedDiff`, `collectConversationContext`, and `truncatePayloadState`.
