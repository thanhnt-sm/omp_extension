---
title: "TypeSafe judge threshold and todo lifecycle alignment"
description: "Follow-on plan for the existing todo-drop/judge-fidelity work: determine whether threshold normalization is valid for JEV noul scores, prevent plan completion while contracted work remains, and make judge decisions actionable and visible. This plan does not supersede plans/261012-todo-drop-judge-fidelity."
status: pending
priority: P1
effort: "1-2d"
branch: master
tags: [typesafe, jev, threshold, todo-lifecycle, fail-closed]
blockedBy: [261012-todo-drop-judge-fidelity, 261013-bicameral-judge-consensus]
blocks: []
created: 2026-10-12
---

# TypeSafe judge threshold and todo lifecycle alignment

## Problem
The current code applies a fixed `0.80` approval threshold to a JEV `noul` probability in `runDropJustificationCheck` and `runPhaseMacroCheck`, while the UI displays a gray zone `[0.30, 0.80)`. The observed `0.35` result correctly remains undecided under that contract, but the implementation must establish whether the threshold is a policy threshold over a normalized probability or an incorrectly reused range endpoint. Independently, a session can report a completed plan while contracted todo work is still active; the todo, plan-file, and `plan-cli` enforcement paths therefore require one lifecycle invariant.

## Scope decision
Use a **follow-on plan**, not a replacement: `plans/261012-todo-drop-judge-fidelity/` already owns the broader payload/evidence/drop implementation. This plan owns only threshold semantics, decision-state propagation, agent guidance, and the plan-completion contradiction. It MUST preserve fail-closed behavior and MUST NOT auto-approve from an unverified heuristic.

## Prediction report

### Verdict: CAUTION

The fixed `0.80` is not mathematically wrong if JEV returns a calibrated probability in `[0,1]` and the policy means “approve only when probability is at least 0.80.” Multiplying an observed range `0.4–0.6` by `0.8` is not generally valid: it changes the policy to a moving interval and can approve a score that remains below the required confidence.

Critically, source auditing reveals that threshold handling is currently bifurcated:
1. `src/cook-expert-judge.ts` and `src/verification-gate.ts` dynamically resolve the threshold via `resolveAutoApprovalThreshold()` (reading `process.env.TYPESAFE_AUTO_APPROVAL_THRESHOLD`).
2. `typesafe-planner.ts` hardcodes `"0.80"` and `threshold: 0.80` in task report and prompt formatters, causing display desynchronization when custom thresholds are configured.
3. Policy evolution: The historical red-team disposition in `261012-typesafe-jev-alignment-fix` (requiring mandatory EGC human approval for all drops) is formally superseded by the current dated policy in `261012-todo-drop-judge-fidelity` (automatic approval if host and judge gates pass, human escalation restricted strictly to undecided gray zone `[0.30, threshold)`).

### Agreements
- The code MUST distinguish JEV output semantics ($P \in [0,1]$) from local policy thresholds ($P \ge \text{threshold}$).
- Formatter strings in `typesafe-planner.ts` MUST call `resolveAutoApprovalThreshold()` rather than hardcoding `"0.80"`.
- A JEV score in a gray zone MUST remain explicitly `undecided`; it MUST NOT be silently converted to approval or rejection.
- A plan MUST NOT be considered complete while active contracted tasks remain, regardless of which surface reports completion.
- Agent guidance MUST state the exact decision, evidence, and next action; “ask human” is insufficient without the reason and required input.
- Network provenance must be verified with instrumented transport logging rather than inferred from local rejection messages.
- Tests MUST cover boundary values and actual final state transitions, not only formatted messages.
### Conflicts and resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| Fixed `0.80` vs scaled range | Keep one policy threshold if JEV is `[0,1]` probability | Avoid lowering approval confidence accidentally | One comparison is cheap and deterministic | Display policy meaning, not mysterious math | The user’s range-scaling proposal may be a category error | Verify API contract; retain fixed threshold unless evidence proves JEV returns another scale |
| Gray-zone handling | Three-state result is explicit | Fail closed; no silent allow | No extra network call | Human sees why and what evidence is missing | Human confirmation may mask bad payloads | Preserve `approve/reject/undecided`; expose missing/invalid-response separately |
| Plan completion contradiction | Centralize lifecycle invariant | Prevent bypass through direct file/CLI paths | Avoid repeated full scans | Explain active task IDs | Existing guards may observe different state stores | Gate every completion surface against the authoritative contracted-task state |
| Prompting the agent | Structured remediation contract | Do not let agent self-authorize | Keep messages bounded | Give executable next steps | Prompt injection can be embedded in task text | Delimit untrusted text; put policy instructions outside it; emit machine-readable decision |

### Risk summary

| Risk | Severity | Mitigation |
|---|---|---|
| Threshold is changed to `range * 0.8`, weakening approval | Critical | Treat JEV `noul` as `[0,1]`; require API evidence before changing semantics; boundary tests at 0.29/0.30/0.79/0.80/0.81 |
| Plan reports complete while todo remains active | Critical | Shared completion predicate and tests through todo, `plan-cli check`, and `status: completed` mutation paths |
| Block/undecided becomes generic approval prompt | High | Typed decision state plus structured user/agent report with correlation and next action |
| Raw judge/task content injects instructions or leaks secrets | High | Existing payload sanitizer, bounded fields, redaction tests, no raw headers/payload in UI |
| JEV result is not visible although the call failed | High | Emit one safe result event for allow/block/error and test transport failure classification |

## Acceptance contract
- A fixed threshold is used only when documented as a probability policy; no range scaling is introduced without TypeSafe API evidence.
- `0.35` produces `undecided` and an approval request only if human review is the defined policy for undecided; `0.29` rejects; `0.80` approves; invalid/missing JEV output is `unavailable`, not `undecided` by accident.
- Active contracted tasks prevent plan completion through every reachable completion path.
- Agent-facing rejection text contains decision, score/threshold or unavailable reason, affected task IDs, evidence status, and exact next actions; it does not grant authorization flags.
- Every JEV evaluation emits one visible safe result; the action cannot proceed on deny or unavailable.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Research and prediction](./phase-01-research-and-prediction.md) | Pending |
| 2 | [Threshold and decision contract](./phase-02-threshold-and-decision-contract.md) | Pending |
| 3 | [Todo enforcement and agent guidance](./phase-03-todo-enforcement-and-agent-guidance.md) | Pending |
| 4 | [Regression and live verification](./phase-04-regression-and-live-verification.md) | Pending |

## Required files and symbols
- `src/cook-expert-judge.ts`: `resolveAutoApprovalThreshold`, `DROP_REJECT_FLOOR`, `runDropJustificationCheck`, `runPhaseMacroCheck`, scorecard formatting.
- `typesafe-planner.ts`: `handleTodoInterception`, contracted-task state, plan-CLI/bash completion guard, task report and JEV result emission.
- `tests/todo-drop-gate.test.ts`, `tests/cook-expert-judge.test.ts`, `tests/verification-gate.test.ts`, `tests/typesafe-lifecycle-gating.test.ts`: boundary and lifecycle regressions.
- `tools/sync-baseline.cjs`: deployment verification only; no direct global edits.

## Verification commands
```text
bun test tests/cook-expert-judge.test.ts tests/verification-gate.test.ts tests/todo-drop-gate.test.ts tests/typesafe-lifecycle-gating.test.ts
bun test
node tools/sync-baseline.cjs
```
Expected: targeted and full suites pass without weakening assertions; sync creates a timestamped backup, deploys workspace files, validates the immutable loader pointer, and passes target verification. After OMP restart, controlled allow/block/unavailable scenarios show one JEV result and preserve the lifecycle invariant. Live API evidence is reported only if the request reaches `https://api.typesafe.ai/v1/systemone`.

## Deployment constraint
Only this workspace is editable. Never modify `C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts` or `C:/Users/thant/Projects/omp_extension` directly. Use the sync script, then restart the OMP session because extension code is cached.

## Handoff
Implementation MUST start through `/ck:cook D:/100.Software/Github/omp_extension/plans/261012-judge-threshold-lifecycle-alignment/plan.md --tdd` after this plan is reviewed. The existing `261012-todo-drop-judge-fidelity` plan remains the prerequisite and source of broader payload/evidence changes.

## Remaining-issue correction
- Macro evaluation now catches thrown judge requests and reports `approved: false`, `error: "unavailable"`, with escalation instead of escaping the decision path.
- Missing, nonnumeric, nonfinite, and out-of-range `meets_criteria` values fail closed before confidence calculation or policy comparison. Transport errors and missing required dimensions use the same unavailable classification.
- Direct smoke exercise: NaN, Infinity, -1, 1.1, and a thrown transport request reject as unavailable; 0.44 rejects and 0.95 approves with `no_drift`/`HOLD`. This is controlled local evidence, not a live API evaluation.
- The historical 0.44 / scope_creep / EXPANSION result does not establish its cause. Wrong plan selection, missing test evidence, and cached-code causality remain unverified hypotheses without the original request/log.
- The 0.80 policy remains unchanged. Restart reloads deployed extension code; it does not guarantee Gate 2 approval. The original six tasks remain blocked, not completed.
