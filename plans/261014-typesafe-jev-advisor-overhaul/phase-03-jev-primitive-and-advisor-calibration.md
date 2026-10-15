---
phase: 3
title: "JEV Primitive Calibration & Advisor Option Ranking"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: JEV Primitive Calibration & Advisor Option Ranking

## Overview
Enforce `meets_criteria >= threshold` alongside `deliverables_verdict`, invert `REJECT` choice confidence for `dropJustifiedNoul`, and prioritize JEV `recommended_option` in `runBicameralDecisionCheck`.

## Success Criteria
- [x] `runPhaseMacroCheck` and `verifyTaskCompletion` reject when `meets_criteria < resolveAutoApprovalThreshold()` even if `deliverables_verdict === "APPROVE"`.
- [x] `runDropJustificationCheck` computes `1 - confidence` when `drop_verdict === "REJECT"` and `rawDropNoul` is absent.
- [x] `runBicameralDecisionCheck` adopts JEV's `recommended_option` regardless of heuristic `advisor.confidence`.
