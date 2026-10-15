---
title: "TypeSafe, JEV & Bicameral Advisor Full Overhaul"
description: "Fix all 7 red-team root causes identified across the 5 recent oh-my-pi sessions: off-by-one attemptCount escalation, inverted Bicameral REJECT vs HUMAN_ESCALATION routing, sanitizeStateForTypeSafe tail-clamping amputation, sub-task vs full-session user_request prompt mismatch, phased todo(op='init', list) & todo(op='rm') drop-gate bypass, untracked diff omission in verification-gate, and JEV recommended_option suppression in typesafe_advisor."
status: completed
priority: P1
effort: "4h"
branch: master
tags: [typesafe, jev-1.13, bicameral-consensus, red-team, overhaul, tdd]
created: 2026-10-14
---

# TypeSafe, JEV & Bicameral Advisor Full Overhaul

## Overview
Comprehensive 4-phase TDD overhaul resolving all 7 critical defects uncovered during the multi-agent red-team audit of the 5 most recent `oh-my-pi` sessions (`01a13a32`, `01a139f1`, `01a13937`, `01a13930`, `01a13909`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Bicameral Consensus & Off-by-One Escalation Fix](./phase-01-bicameral-and-escalation-fix.md) | Completed |
| 2 | [State Clamping, Subagent Context & Untracked Diff Fidelity](./phase-02-state-clamping-and-evidence-fidelity.md) | Completed |
| 3 | [JEV Primitive Calibration & Advisor Option Ranking](./phase-03-jev-primitive-and-advisor-calibration.md) | Completed |
| 4 | [Phased Todo List & RM Drop-Gate Hardening + Baseline Sync](./phase-04-todo-list-rm-hardening-and-sync.md) | Completed |

## Success Criteria
- [x] Off-by-one `attemptCount` fixed so Attempt #3 calls JEV and only escalates after 3 actual failures (`attemptCount >= 3` where `attemptCount = currentFailures`).
- [x] JEV `REJECT` in `runBicameralMacroCheck` routes to `AUTO_REJECT` instead of `HUMAN_ESCALATION` when no passing test/build override exists.
- [x] `sanitizeStateForTypeSafe` preserves `"tail"` for `agent_work_log`, `test_summary`, and `user_request`.
- [x] `todo(op="init", list=[...])` and bare `todo(op="rm")` are tracked in `activeContractedTasks` and gated by the Drop Gate.
- [x] All unit and integration test suites pass via `bun test` and baseline is deployed via `node tools/sync-baseline.cjs`.
