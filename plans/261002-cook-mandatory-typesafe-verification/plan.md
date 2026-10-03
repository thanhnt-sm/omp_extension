---
title: "Mandatory TypeSafe Judge & Expert Evaluation in Cook Workflow"
description: "Architectural elevation of the ck:cook workflow enforcing mandatory TypeSafe System One verification (meets_criteria, scope preservation, architectural drift) across all modes, with dual-cadence gating and tri-role expert evaluation."
status: completed
priority: P1
effort: "6h"
tags: ["omp", "cook", "typesafe", "system-one", "red-team", "tdd", "compliance", "dual-cadence"]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Mandatory TypeSafe Judge & Expert Evaluation in Cook Workflow

## Overview

Eliminates the critical vulnerability where AI coding agents declare tasks or plans complete without rigorous proof, skip plan requirements, or omit edge cases in `ck:cook`. In the previous architecture, TypeSafe System One judgments were only optionally invoked during `--auto` mode calibration. 

This plan implements the architectural consensus produced by `ck:predict`, establishing **mandatory TypeSafe System One evaluation across all execution modes** (`interactive`, `code`, `fast`, `parallel`, `auto`), structured as a high-performance **Dual-Cadence Verification Pipeline** with a **Tri-Role Expert Evaluator System**.

---

## Architecture & Core Invariants

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CK:COOK WORKFLOW RUNTIME                        │
│                 (Interactive, Code, Fast, Parallel, Auto)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       ▼                                                         ▼
┌───────────────────────────────┐         ┌──────────────────────────────┐
│  CADENCE 1: TASK MICRO-CHECK  │         │  CADENCE 2: PHASE MACRO-CHECK│
│    (Local, 0-Token, Fast)     │         │   (TypeSafe System One API)  │
├───────────────────────────────┤         ├──────────────────────────────┤
│ 1. Git working tree status    │         │ 1. meets_criteria (Noul>=.70)│
│ 2. Test runner exit code == 0 │         │ 2. plan_drift ('no_drift')   │
│ 3. Assertion deletion guard   │         │ 3. scope_preservation (HOLD) │
│ 4. Claude boundary guard      │         │ 4. Expert Evaluator Triage   │
└──────────────┬────────────────┘         └──────────────┬───────────────┘
               │ Passed                                  │ Approved
               └────────────────────┬────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        HUMAN REVIEW GATE (Scorecard)                   │
│          "✓ TypeSafe Verification: Meets Criteria (0.95), Drift (None)"│
│          [Approve / Request Changes / Escalate to Expert]              │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Invariants

1. **Mandatory Semantic Verification:** In all modes, no implementation phase or task completion can be finalized without verifying that unified diffs and test results fully satisfy the written plan (`meets_criteria >= 0.70`, `plan_drift == 'no_drift'`).
2. **Dual-Cadence Performance:**
   - **Micro-Check (Per Task):** Deterministic Gate 1 only (0 tokens, <150ms). Runs test exit code, clean working tree, test assertion deletion detection, and Claude directory guards.
   - **Macro-Check (Per Phase & Review Gate):** Dispatches ground-truth OS evidence to TypeSafe System One (`jev-latest`) before presenting review gates or finalizing phases.
3. **Tri-Role Expert Evaluators:**
   - **Scope Arbiter:** Evaluates if draft plans or changes drop requirements (`scope_mode`). Rejects unauthorized `REDUCTION`.
   - **Architectural Drift Guard:** Evaluates if file edits alter interfaces or touch unapproved subsystems (`plan_drift`).
   - **Risk & Security Triage:** On-demand expert assessment when facing technical trade-offs or complex edge cases.
4. **Human Escalation Escape Hatch (Fail-Closed):**
   - If TypeSafe API is offline or returns network/auth errors in non-auto modes, the workflow **never silently bypasses** and **never deadlocks**. It triggers an interactive dialog via the `ask` tool: *"TypeSafe Judge offline. Proceed with manual verification? [Approve / Retry / Abort]"*.
5. **Claude / Anthropic Zero-Touch Isolation Protocol:**
   - 100% independent routing to `https://api.typesafe.ai/v1/systemone` using `TYPESAFE_API_KEY`.
   - Zero access, reading, or modification of `~/.claude/**` or Anthropic credentials.
   - Egress redaction scrubs all `sk-ant-*` tokens to `[REDACTED:anthropic-key]`.
   - Strict 32KB (`<= 32,768` bytes) payload budget with smart error retention.

---

## TDD Strategy & Verification Protocol

Implemented under strict Test-Driven Development (`--tdd`):
1. **Red:** Write unit tests defining failing behavior and adversarial evasion attempts before editing code.
2. **Green:** Implement minimal clean code to satisfy the test suites.
3. **Refactor:** Enforce `ts-no-any`, `ts-no-tiny-functions`, and `ts-promise-with-resolvers`.
4. Test runner: `bun test` in project workspace.

---

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Workflow Specification & Review Gate Upgrade](./phase-01-workflow-specification-review-gate-upgrade.md) | Completed | P1 | 1.5h |
| 2 | [Dual-Cadence Verification Engine & Expert Roles](./phase-02-dual-cadence-verification-engine-expert-roles.md) | Completed | P1 | 2.0h |
| 3 | [OMP Extension Interception & Bridge Integration](./phase-03-omp-extension-interception-bridge-integration.md) | Completed | P1 | 1.5h |
| 4 | [Adversarial Stress Test Matrix & Validation](./phase-04-adversarial-stress-test-matrix-validation.md) | Completed | P1 | 1.0h |

---

## Red-Team Review & Hostile Verification Scenarios

1. **Evasion Attempt:** Agent runs tests with `exit 0` stub -> Gate 1 detects lack of real test execution or deleted assertions.
2. **Scope Drop Attack:** Agent submits plan omitting difficult rollback requirements -> Scope Arbiter returns `REDUCTION` and blocks.
3. **Diff Flood Attack:** Agent generates >200KB of diff -> Smart truncation bounds payload to $\le 32,768$ bytes while keeping compiler error traces.
4. **Network Outage:** Remote judge drops connection -> System fails closed and invokes `ask` tool for human confirmation.
5. **Token Scraping Attack:** Agent attempts to pass Anthropic API key in state -> Redaction engine scrubs token before transmission.

---

## Acceptance & Definition of Done

- [x] `ck:cook` references upgraded: TypeSafe semantic check converted from optional to mandatory in `workflow-steps.md` and `typesafe-judgments.md`.
- [x] `src/cook-expert-judge.ts` implemented with Scope Arbiter, Drift Guard, and Risk/Security Triage roles.
- [x] Bounded retry loop (max 2 auto-revisions; on 3rd attempt, escalate via `ask` dialog).
- [x] OMP extension `typesafe-planner.ts` exposes `typesafe_expert_review` tool and enforces interception on all completion tools.
- [x] All unit and adversarial test suites pass under `bun test` with 100% assertion success.
- [x] Zero occurrence of `: any` or `as any` across TypeScript implementations.
- [x] Complete zero-touch isolation from Claude/Anthropic accounts verified by automated unit tests.

---

## Red Team Review & TypeSafe Adjudication Log

| ID | Hostile Lens | Finding Description | Codebase Evidence | TypeSafe Validity | Disposition & Remediation |
|---|---|---|---|---|---|
| **RT-1** | Security Adversary | Custom question keys in `typesafe_expert_review` could potentially bypass secret checks if unvalidated | `src/payload-safety.ts:212` | $P = 0.66$ | **APPLIED:** Mandate in Phase 2 that all custom question keys in `typesafe_expert_review` pass through `isSecretInKey()` and `preparePayloadSafe()`. |
| **RT-2** | Assumption Destroyer | System assumes Git repository exists; non-git workspaces cause `git status` to exit 128, causing false-positive gate failures | `git status` exit code 128 in non-git directories | $P = 0.90$ | **APPLIED:** Added Non-Git fallback in Phase 2: if `git status` returns 128, Gate 1 switches to filesystem modified timestamp scanner rather than hard-failing. |
| **RT-3** | Failure Mode Analyst | Agent can bypass `todo` tool call interception hook by directly editing `todo.json` with `write` / `edit` tools | `typesafe-planner.ts:271` (`todo` hook only) | $P = 0.80$ | **APPLIED:** Enhanced Phase 3 interception to also trap `write` and `edit` operations targeting `todo.json` and `.todo*` state files. |

---

## Validation Log & Codebase Verification

### 1. Verification Pass (Fact Checker & Contract Verifier)
- **Claims Checked:** 12
- **Status:** 12 Verified, 0 Failed, 0 Unverified (Tier: Standard, 4 phases)
- **Verified Contracts:**
  - `src/payload-safety.ts`: Exists, exports `preparePayloadSafe`, `redactAnthropicSecrets`, `truncatePayloadState`. Verified clean.
  - `src/evidence-collector.ts`: Exists, exports `assertPathIsClaudeSafe`, `collectTaskEvidence`, `sanitizeEnvironment`. Verified clean.
  - `src/verification-gate.ts`: Exists, exports `checkDeterministicPreconditions`, `verifyTaskCompletion`. Verified clean.
  - `typesafe-planner.ts`: Exists, registers tools, contains `handleTodoInterception`. Verified clean.
  - `cook/references/typesafe-judgments.md`: Exists, contains sections 3a-3d. Verified clean.

### 2. Critical Question Validation Interview (Pre-Implementation Confirmation)
1. **Dual-Cadence Cadence Thresholds:** Micro-check on every atomic task (local, 0 token) vs Macro-check on phase and review gates (TypeSafe System One). *(Confirmed & Recommended)*
2. **Human Escalation Fallback:** On network drop or 503 from TypeSafe, prompt user via `ask` dialog rather than failing silently or blocking indefinitely. *(Confirmed & Recommended)*
3. **Direct File Bypass Defense:** Intercept both tool calls (`todo done`) and file writes targeting `todo.json`. *(Confirmed & Recommended)*
