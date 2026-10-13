# Prediction Report: TypeSafe System One JEV Threshold & Verification Gate Alignment

## Verdict: CAUTION

### Agreements (all personas align)
- **Mathematical Invariant of JEV Noul**: TypeSafe System One JEV `noul` outputs represent normalized, calibrated probabilities $P \in [0, 1]$. Floating range multipliers (e.g., $P \times 0.8$) are mathematically unsound as they distort the probability calibration and create an unpredictable moving threshold.
- **Fail-Closed Gate 2 Verification**: Gate 2 semantic verification must reject implementations that fail to satisfy planned deliverables ($P < \text{threshold}$), preventing stubs and superficial completions from passing silently.
- **Strict Distinction Between Gray Zone and Unavailability**: The gray zone $[0.30, \text{threshold})$ represents an undecided assessment requiring human confirmation, whereas network failures, missing answers, or invalid payloads represent `unavailable` states that must fail closed without presenting an interactive approval prompt.
- **Single Source of Truth for Auto-Approval Threshold**: `resolveAutoApprovalThreshold()` must be the unified authority for resolving the gate threshold, respecting `TYPESAFE_AUTO_APPROVAL_THRESHOLD` (clamped to $[0.50, 0.99]$, default $0.80$) across `src/verification-gate.ts`, `src/cook-expert-judge.ts`, and `typesafe-planner.ts`.

---

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| **Threshold Removal vs Dynamic Resolution** | Removing the threshold entirely decouples gate evaluation from policy, causing arbitrary approval states. | Critical vulnerability: without a threshold floor, superficial stubs (Attack 1) pass with non-zero scores (e.g., $0.42$). | Zero performance impact; `resolveAutoApprovalThreshold` is an in-memory env read with $O(1)$ fast-path parsing. | Transparent: developers see exact score vs required threshold in scorecards. | Why have a local threshold if the judge evaluates criteria? Because the judge provides evidence ($P$), while the client enforces policy. | **Consolidate & Enforce**: Restore `resolveAutoApprovalThreshold()` in `src/verification-gate.ts`, re-export in `src/cook-expert-judge.ts`, and enforce $P \ge \text{threshold}$ across all Gate 2 checks. |
| **Drop Justification Decision Contract** | Bounded 4-state contract (`approve`, `reject`, `undecided`, `unavailable`) maintains deterministic state transitions. | High risk if scores $\ge 0.30$ auto-approve: agents can drop user-requested tasks without permission. | Zero token overhead on auto-reject ($< 0.30$) or auto-approve ($\ge 0.80$). | Interactive `ui.confirm` prompt only triggers for gray zone $[0.30, 0.80)$, preventing alert fatigue while protecting user agency. | Wouldn't human escalation on every drop be safer? No, redundant prompts for obvious obsoletions cause user fatigue and blind approvals. | **Preserve Gray Zone [0.30, 0.80)**: Auto-approve $\ge 0.80$, auto-reject $< 0.30$, and require interactive confirmation for $[0.30, 0.80)$. |
| **Scorecard Formatting Contract** | Scorecard template in `cook-expert-judge.ts` must maintain alignment with `review-cycle.md` expectations. | Scorecard must not leak internal secrets or untrusted raw agent strings without escaping. | Pure string templating; zero compute latency. | Must clearly display both the actual score and the required threshold (e.g., `(Threshold >= 0.80)`). | Omitting threshold string simplifies UI formatting. But users cannot judge pass/fail margins without the threshold reference. | **Retain Threshold in Scorecard**: Format `Meets Plan Deliverables: P = X.XX (Threshold >= Y.YY)` cleanly within the ASCII box boundaries. |

---

### Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| **Superficial Completion Auto-Approval** | Critical | Enforce `meetsCriteriaNoul < threshold` checks in both `runPhaseMacroCheck` and `verifyTaskCompletion` to block failing deliverables. |
| **Unauthorized Task Dropping via Gray Zone Bypass** | High | Return `decision: "undecided"` for scores in $[0.30, \text{threshold})$ in `runDropJustificationCheck` and require interactive human confirmation. |
| **Export/Module Breakage on Build** | High | Export `resolveAutoApprovalThreshold` from `src/verification-gate.ts` and re-export in `src/cook-expert-judge.ts` to satisfy both test harnesses and runtime consumers. |
| **Silent Fail-Open on Non-Interactive Runs** | Medium | When `hasUI === false` or `ui.confirm` is missing, undecided drops must reject deterministically and return actionable NEXT ACTIONS. |

---

### Recommendations
1. **Restore `resolveAutoApprovalThreshold`**: Define in `src/verification-gate.ts` and re-export in `src/cook-expert-judge.ts`.
2. **Re-establish Gate 2 Threshold Bounds**: In `src/verification-gate.ts:verifyTaskCompletion` and `src/cook-expert-judge.ts:runPhaseMacroCheck`, add reasons and reject completion when `meetsCriteriaNoul < threshold`.
3. **Restore Drop Justification Decision Contract**: In `src/cook-expert-judge.ts:runDropJustificationCheck`, enforce `approve` ($\ge \text{threshold}$), `reject` ($< 0.30$), and `undecided` ($[0.30, \text{threshold})$).
4. **Re-align Verification Scorecard**: In `src/cook-expert-judge.ts:generateVerificationScorecard`, format the threshold label with `(Threshold >= ${threshold.toFixed(2)})`.
5. **Align Documentation**: Update `docs/source-code-specification.md` to accurately document the $0.80$ threshold policy.
