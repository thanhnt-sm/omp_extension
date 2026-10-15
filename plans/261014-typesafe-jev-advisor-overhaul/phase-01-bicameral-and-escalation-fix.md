---
phase: 1
title: "Bicameral Consensus & Off-by-One Escalation Fix"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Bicameral Consensus & Off-by-One Escalation Fix

## Overview
Eliminate the off-by-one pre-JEV escalation on Attempt #3 and prevent Lobe 1 regex matches on `[toolCall:` from converting JEV `REJECT` verdicts into `HUMAN_ESCALATION`.

## Success Criteria
- [x] `typesafe-planner.ts` passes `attemptCount: currentFailures` so Attempt #3 is evaluated by JEV.
- [x] `evaluateAdvisorIntent` removes `\[toolCall:|\[toolResult:` from `done` regex and `runBicameralMacroCheck` returns `AUTO_REJECT` on unverified JEV `REJECT`.
- [x] `formatConsensusEscalation` displays full reason text without 35-char truncation.
