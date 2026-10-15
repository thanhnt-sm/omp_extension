---
phase: 2
title: "State Clamping, Subagent Context & Untracked Diff Fidelity"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: State Clamping, Subagent Context & Untracked Diff Fidelity

## Overview
Preserve tail-clamping in `sanitizeStateForTypeSafe`, extract `<task-result>` summaries in `collectConversationContext`, and include untracked file diffs in `collectTaskEvidence` when `baseline` is absent.

## Success Criteria
- [x] `sanitizeStateForTypeSafe` clamps `agent_work_log`, `test_summary`, and `user_request` using `"tail"`.
- [x] `collectConversationContext` extracts `<task-result>` summary content and restricts `lastTestSummary` to `bash`/`eval` tool results.
- [x] `collectTaskEvidence` synthesizes untracked (`??`) diffs even when `options.baseline` is omitted.
