---
title: "TypeSafe JEV Alignment Fix"
description: ""
status: complete
priority: P2
effort: 
branch: master
tags: []
blockedBy: []
blocks: []
created: 2026-10-12
---

# TypeSafe JEV Alignment Fix

## Overview
This plan addresses the widespread TypeSafe JEV false rejections (scores $\le 0.13$) on non-code tasks (research, analysis, docs) by enriching the Gate 2 payload with exact acceptance criteria and introducing task-aware multi-label rubrics. It also downgrades the pre-flight verification loop to an advisory diagnostic hook to prevent agent deadlocks.


TBD.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Setup Enriched Payload](./phase-01-setup-enriched-payload.md) | Complete |
| 2 | [Task-Aware Rubrics](./phase-02-task-aware-rubrics.md) | Complete |
| 3 | [Pre-Flight Advisory Hook](./phase-03-pre-flight-advisory-hook.md) | Complete |
| 4 | [Regression Verification](./phase-04-regression-verification.md) | Complete |

## Red Team Review

| Finding | Severity | Disposition | Rationale & Fix |
|---------|----------|-------------|-----------------|
| Evasion via `todo(drop)` spam | Critical | Accept | A malicious agent could spam drops to clear the board. Fix: In Phase 3, dropping a contracted task MUST trigger an Escalation Gate (EGC) for human approval, not just a passive UI notification. |
| Artifact Truncation Penalization | High | Accept | Truncating an oversized markdown artifact to 8KB may cause JEV to falsely flag it as incomplete. Fix: In Phase 1, implement AST-aware hunk summarization or LLM semantic distillation before payload serialization. |
| Anti-Spoofing False Positives | Medium | Reject | A strict override to `code_change` if any `.ts` file is modified is the safest posture. False positives (e.g., accidental formatting) should be fixed by the agent reverting the accidental change. |

## Validation Log

### Verification Results
- Claims checked: 3
- Verified: 3 | Failed: 0 | Unverified: 0
- Tier: Standard
- Decisions Confirmed: 
  - `runPhaseMacroCheck` exists in `src/cook-expert-judge.ts`.
  - `collectTaskEvidence` in `src/evidence-collector.ts` correctly accepts `planPath`.
  - Dual Verification Gate structure remains intact.
