---
phase: 4
title: "Phased Todo List & RM Drop-Gate Hardening + Baseline Sync"
status: completed
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: Phased Todo List & RM Drop-Gate Hardening + Baseline Sync

## Overview
Track phased `todo(op="init", list=[...])` and bare `todo(op="rm")` in `activeContractedTasks`, pass `userPrompt` in `typesafe_elevate_plan`, verify all test suites, and sync baseline.

## Success Criteria
- [x] `extractTodoItemsFromOp` extracts tasks from both `op.items` and `op.list[].items`.
- [x] Bare `todo(op="rm")` without `task` triggers Drop Gate when `activeContractedTasks.size > 0`.
- [x] All test suites pass and `node tools/sync-baseline.cjs` deploys cleanly.
