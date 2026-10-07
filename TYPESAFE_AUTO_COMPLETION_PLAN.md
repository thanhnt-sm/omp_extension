## Prediction Report: Autonomous TypeSafe Task Completion & Remediation

## Verdict: CAUTION

### Agreements (all personas align)
- Auto-closing tasks with high verification scores (>= 80%) reduces friction and improves autonomous execution speed.
- Preventing session closure when `todo` or tasks remain incomplete ensures data consistency.
- Automatic plan/todo recreation upon failure is necessary for true autonomy.

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|-----|-----------------|------------|
| Threshold | 80% is arbitrary. | 80% might bypass critical security checks if the missing 20% is security-related. | Re-evaluating adds latency. | N/A | What if the 80% is just boilerplate? | Use 80% as base, but require 100% on critical gates (Gate 1 local verification). |
| Remediation Loop | Continuous looping causes stack overflows or rate limits. | Infinite loops drain tokens and expose logs. | Infinite loops. | N/A | It will get stuck looping the same bad fix. | Implement max retry limit (e.g., 3) before hard stopping and asking human. |

### Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Infinite remediation loops | High | Hard cap on regeneration retries (max 3). |
| False positive >80% | Medium | Ensure Gate 1 (deterministic verification) passes before Gate 2 (TypeSafe semantic score) is considered. |

### Recommendations
1. Enforce strict `todo` synchronization in the session completion handler.
2. Integrate a minimum score threshold (80% or 0.8) in `verification-gate.ts` / `plan-evaluator.ts` for auto-approval.
3. Build a Red Team retry loop with a hard cap for failed evaluations.

---

## Context
The agent currently stops and prompts the user for decisions too frequently, leading to orphaned `todo` items and premature session closure. The goal is to fully automate task, `todo`, and plan closure if the TypeSafe judge scores >= 80% and deterministic verification passes. If it fails, the agent must auto-remediate (Red Team, rethink, remake plan) instead of halting, ensuring session state strictly aligns with `todo` completion.

## Approach (TDD Phases)

### Phase 1: Configurable Auto-Approval Threshold
- **Red**: Write a test in `plan-evaluator.test.ts` where the judge returns 0.79 (below default 80 threshold) resulting in human prompt, and another where `omp.typesafe.autoApprovalThreshold` is configured to 70 and 0.75 results in auto-approval. Test fails (no config loaded).
- **Green**: Update `package.json` to register `omp.typesafe.autoApprovalThreshold` (default 80, range 0-100). Update `plan-evaluator.ts` or `verification-gate.ts` to fetch this setting.
- **Refactor**: Abstract configuration loading to a single config typed getter.

### Phase 2: Strict Gate 1 Verification Pre-Check
- **Red**: Write a test in `verification-gate.test.ts` verifying that submitting an incomplete `todo` or missing task proof throws `TypeSafeInvariantViolation` *and* mocks verify zero network calls to the TypeSafe judge API.
- **Green**: Update `verification-gate.ts` to mandate Gate 1 (local proof of `done` task and `todo`). If Gate 1 fails, immediately reject. If Gate 1 passes, proceed to Gate 2 (TypeSafe judge).
- **Refactor**: Ensure session closure block and Gate 1 check share the same `todo` synchronization state.

### Phase 3: Autonomous Remediation Loop
- **Red**: Write a test mocking a Gate 2 failure (score < threshold). Assert that it does not prompt the user but instead clears `todo`, triggers Red Team, and increments retry count.
- **Green**: Implement the retry loop in the session handler. Cap retries at 3.
- **Refactor**: Ensure the `TypeSafeError` cleanly redirects to the remediation handler instead of bubbling up.

## Critical files & anchors
- `package.json` - Add configuration `omp.typesafe.autoApprovalThreshold`.
- `src/plan-evaluator.ts` - Anchor at `evaluatePlan`. Compare score against the configured threshold instead of hardcoded 0.8.
- `src/verification-gate.ts` - Anchor at `verifyCompletion`. Mandate Gate 1 passes before invoking Gate 2.

## Verification
- **Test Config Threshold**: Set threshold to 60. Mock score 0.65 -> Verify auto-approval.
- **Test Gate 1 Preemption**: Submit without `todo` done. Verify invariant error and *no network call* to `api.typesafe.ai`.
- **Test Remediation Loop**: Mock score < threshold. Verify system auto-remediates up to 3 times before prompting.

## Red Team Review

| Adversary Vector | Impact | Mitigation |
|------------------|--------|------------|
| Threshold Manipulation | User sets threshold to 0% to bypass TypeSafe completely. | `package.json` validation limits threshold. Gate 1 remains an absolute requirement regardless of Gate 2 threshold. |
| Gate 1 Spoofing | Agent simply claims "I did it" without invoking the `todo` tool. | Gate 1 must read the programmatic state of the active `todo` list from the tool history/extension state, not text output. |

## Validation Log

**User Requirements Validated:**
- [x] Force agent to prove `done` task and `todo` *before* checking TypeSafe judge (Gate 1 before Gate 2).
- [x] TypeSafe judge result must be compared to a configurable threshold, not hardcoded 80%.
- [x] Threshold is human-adjustable, defaults to 80%.
- [x] If score >= threshold, allow automatic completion without asking the user.

## Assumptions & contingencies
- **Assumption**: The `todo` list state can be programmatically read before session closure. If not, we will maintain an internal state sync map in the extension.
- **Contingency**: If the TypeSafe API is completely unreachable, the system will fall back to asking the user (current behavior) rather than infinitely retrying.