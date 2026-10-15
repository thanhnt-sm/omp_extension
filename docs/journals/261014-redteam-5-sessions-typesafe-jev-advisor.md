# Technical Journal: Red-Team Audit of 5 Recent oh-my-pi Sessions & 4-Phase TypeSafe/JEV/Advisor Overhaul

- **Date**: 2026-10-14
- **Plan**: `plans/261014-typesafe-jev-advisor-overhaul/plan.md` (`status: completed`)
- **ADR**: `docs/decisions/ADR-20261014-typesafe-jev-advisor-overhaul.md`
- **Reports**:
  - `plans/reports/261014-redteam-audit-5-sessions-typesafe-jev-advisor.md`
  - `plans/reports/261014-phase1-session-forensics-and-scout.md`
  - `plans/reports/261014-phase1-source-and-payload-audit.md`

## 1. Context & What Happened
Audited the 5 most recent `oh-my-pi` sessions across all workspaces (`01a13a32`, `01a139f1`, `01a13937`, `01a13930`, `01a13909`, plus `01a138b5` and `01a13851`) using a parallel multi-agent team (`ScoutPayloadAndGateFlow`, `ReviewerRedTeamDefects`, `AdvisorArchitectureAudit`, `DevCookJudgeAndConsensus`, `DevEvidenceAndGates`, `DevPlannerExtension`, `ReviewerOverhaulAudit`).

## 2. Root Causes Identified & Fixed
1. **Off-by-One Pre-JEV Escalation & Duplicate `ui.confirm` (`typesafe-planner.ts`, `src/cook-expert-judge.ts`)**:
   - Passing `attemptCount: currentFailures + 1` caused Attempt #3 (`currentFailures === 2`) to trigger `if (ctx.attemptCount >= 3)` at the top of `runPhaseMacroCheck` *before* calling JEV, returning `verdict: undefined` $\rightarrow$ mapped to `jev.verdict = "ESCALATE"` $\rightarrow$ `HUMAN_ESCALATION` popup with 35-char truncated reason `"3 consecutive failed revision attem"`.
   - Fixed by passing `attemptCount: currentFailures`, forwarding `skipConfirm` when `HUMAN_ESCALATION` is declined, and expanding `formatConsensusEscalation` reason slicing to 240 chars.
2. **Inverted Bicameral Rejection Routing (`src/bicameral-consensus.ts`)**:
   - `evaluateAdvisorIntent` matched `\[toolCall:|\[toolResult:` in `agentWorkLog` and never returned `DISALLOW` on `done`, making `AUTO_REJECT` unreachable and turning every JEV `REJECT` into `HUMAN_ESCALATION` (`Decision: APPROVED (by: human)`).
   - Fixed by removing `\[toolCall:|\[toolResult:` from the `done` regex and setting `advisor.verdict = "DISALLOW"` in `runBicameralMacroCheck` and `evaluateBicameralDoneConsensus` whenever JEV returns `REJECT` (`!jevMacro.escalateToUser`), routing to `AUTO_REJECT`.
3. **Tail-Evidence Amputation & Subagent `<task-result>` Loss (`typesafe-planner.ts`, `src/evidence-collector.ts`)**:
   - `sanitizeStateForTypeSafe` previously head-clamped tail-clamped `agent_work_log` and `test_summary` to 2,000/950 chars, deleting the most recent test results and actions.
   - Fixed by preserving `"tail"` clamping for `TAIL_KEYS` (`agent_work_log`, `test_summary`, `testOutput`, `user_request`), head-clamping `<task-result>` outputs to 1,200 chars in `collectConversationContext`, and synthesizing untracked (`??`) file diffs in `collectTaskEvidence` even when `baseline` is omitted.
4. **Primitive Calibration & Advisor Option Ranking (`src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `src/verification-gate.ts`)**:
   - Simplified `deliverables_verdict` instructions per `jev-1.13` guidelines, enforced `meets_criteria >= 0.50` floor when `deliverables_verdict === "APPROVE"`, inverted `drop_verdict.confidence` (`1 - confidence`) on `REJECT` in `runDropJustificationCheck`, and prioritized JEV `recommended_option` in `runBicameralDecisionCheck`.
5. **Phased `todo(op="init", list)` & Bare `todo(op="rm")` Drop-Gate Hardening (`typesafe-planner.ts`)**:
   - Implemented `extractTodoItemsFromOp` (prioritizing `op.list` over `op.items` to prevent dual-parameter smuggling), gated bare `todo(op="rm")` when `activeContractedTasks.size > 0`, and cleared module state on `session_start`.

## 3. Verification & Deployment
- Local workspace `bun test`: **310 pass, 0 fail** (33 suites).
- Target deployment `tools\sync-baseline.bat` (`C:\Users\thant\Projects\omp_extension`): **325 pass, 0 fail, 1230 expect() calls** across 35 suites.
- Live `jev-1.13.0` smoke verification on `runBicameralMacroCheck`: returned `verdict: "AUTO_APPROVE", approved: true, deliverablesVerdict: "APPROVE", driftChoice: "no_drift", scopeChoice: "HOLD"`.
