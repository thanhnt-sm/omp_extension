---
title: "CK* Multi-Agent Red-Team, Debug, Code Review & Predict Audit: 5 Recent oh-my-pi Sessions (TypeSafe, Judge, JEV & Advisor)"
date: 2026-10-14
type: redteam-audit-and-predict-report
status: completed
skills_used:
  - ck:team
  - ck:scout
  - ck:research
  - ck:docs-seeker
  - ck:debug
  - ck:code-review
  - ck:advisor
  - ck:council
  - ck:predict
  - ck:journal
  - ck:project-organization
---

# Comprehensive Red-Team & Forensic Audit: TypeSafe, Judge, JEV (`jev-1.13.0`), and Advisor Across 5 Recent `oh-my-pi` Sessions

## Executive Summary
All suspicions raised by the user are **100% confirmed with source-code and live session telemetry evidence**:
1. **Why `Bicameral Consensus Escalation (Lobe 2: ESCALATE | 3 consecutive failed revision attem)` Popped Up to the Human**:
   - Caused by a **3-part defect chain** in `typesafe-planner.ts:1797, 2036`, `src/cook-expert-judge.ts:185-191`, and `src/bicameral-consensus.ts:448, 613, 712`:
     1. **Attempt 1 (`currentFailures=0, attemptCount=1`)**: Fails Gate 2 Macro-Check (`meets_criteria=0.45`, `NEXT_ACTION_REQUIRED`) because `sanitizeStateForTypeSafe` (`typesafe-planner.ts:533`) head-clamps `deliverable_artifacts` to 2,000 chars and `deliverables_verdict` judges a single sub-task against the entire session `user_request`. `consecutiveFailuresByTask` becomes `1`.
     2. **Attempt 2 (`currentFailures=1, attemptCount=2`)**: When `write` and `todo(op="done")` are batched in the same assistant turn, `pi.on("tool_call", handleTodoInterception)` fires before `write` flushes to disk, so `currentDiffHash === prevRemediation.diffHash`. Gate 0 Remediation Ratchet rejects without calling JEV and increments `consecutiveFailuresByTask` to `2`.
     3. **Attempt 3 (`currentFailures=2, attemptCount=3`) — Off-by-One Short-Circuit**: `typesafe-planner.ts:2036` passes `attemptCount: currentFailures + 1` (`3`). Line 185 of `src/cook-expert-judge.ts` checks `if (ctx.attemptCount >= 3)` **at the top of `runPhaseMacroCheck` BEFORE calling JEV**, immediately returning `{ approved: false, escalateToUser: true, reasons: ["3 consecutive failed revision attempts reached..."] }` with `verdict: undefined`. `runBicameralMacroCheck` maps `verdict: undefined` to `jev.verdict = "ESCALATE"`, Lobe 1 regex matches `[toolCall:` and returns `ALLOW (0.90)`, `arbitrateConsensus` returns `HUMAN_ESCALATION`, and `typesafe-planner.ts:2055` pops up `ui.confirm()` with `formatConsensusEscalation` slicing the reason to 35 chars (`"3 consecutive failed revision attem"`).
2. **Why JEV `REJECT` Verdicts Are Silently Overridden to `Decision: APPROVED (by: human)` While Milder `NEXT_ACTION_REQUIRED` Blocks the Agent**:
   - Lobe 1 (`evaluateAdvisorIntent` in `src/bicameral-consensus.ts:443-525`) is a local regex matcher that matches `/\[toolCall:|\[toolResult:/i` in `agentWorkLog` (injected by `collectConversationContext` on every turn) and **never returns `DISALLOW` on `operation === "done"`**.
   - Consequently, `AUTO_REJECT` (`advisor === "DISALLOW" && jev === "REJECT"` at `line 592`) is **100% unreachable dead code**. Every JEV `REJECT` (`P=0.00, 0.09, 0.13, 0.35, 0.52`) hits `ALLOW + REJECT -> HUMAN_ESCALATION` (`line 607`), prompting `ui.confirm` on Attempt #1 and logging `Decision: APPROVED (by: human)`.
3. **Why Wrong / Corrupted Content Is Sent to JEV**:
   - `sanitizeStateForTypeSafe` (`typesafe-planner.ts:510-555`) head-clamps `agent_work_log` and `test_summary` (which `runPhaseMacroCheck` tail-clamped to 3,000 chars) down to 2,000 or 950 chars from `"head"`, **deleting the tail (the most recent 1,000–2,050 chars of work and test results)**!
   - `collectTaskEvidence` (`src/evidence-collector.ts:346-356, 370-405`) omits untracked (`??`) file diffs when `baseline` is absent (sending `gitDiff: ""` in `xd://typesafe_verify_completion`), and dumps the entire dirty working tree when a task makes zero tracked edits relative to `baseline`.
   - `collectConversationContext` (`typesafe-planner.ts:654`) clamps `toolResult` entries to 400 chars from `"tail"`, discarding 100% of `<task-result>` subagent outputs and keeping only OMP's `"is now idle"` footer.
4. **Why Primitive Usage & Advisor Are Flawed**:
   - `evaluateAdvisorDecision` (`src/bicameral-consensus.ts:162-359`) is a bag-of-words regex scorer (`+0.25` for any 4-letter word in `userRequest`, `+0.15` in `workLog`, `+0.25` for `(Recommended)`, `+0.12` for buzzwords) that claims `confidence: 0.98` and suppresses JEV's `recommended_option` whenever `advisor.confidence > 0.75` (`line 967`).
   - `runDropJustificationCheck` (`src/cook-expert-judge.ts:673`) assigns `drop_verdict.confidence` on a `REJECT` choice to `dropJustifiedNoul`, printing `Judge: drop_justified=0.58 (reject < 0.30)` when JEV rejected the drop.
   - `todo(op="init", list=[...])` (`typesafe-planner.ts:1532, 1724`) ignores `op.list`, leaving `activeContractedTasks` empty so `todo(op="rm")` bypasses the drop gate completely.
