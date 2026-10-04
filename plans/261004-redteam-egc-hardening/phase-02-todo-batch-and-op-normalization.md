---
phase: 2
title: "Todo Batch and Op Normalization"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Todo Batch and Op Normalization

## Overview
Normalize `todo` and `todo_write` input payloads in `typesafe-planner.ts` to handle both batch `{ ops: [...] }` schemas and legacy flat `{ op: ... }` calls. Expand gate coverage across mutative task lifecycle operations.

## Requirements
- Functional:
  - Normalize tool arguments to `ops: Array<Record<string, unknown>>` regardless of caller schema.
  - Intercept and validate `done` and `rm`.
  - Validate and track task drops (`drop`), list resets (`init`), task starts (`start`), and item additions (`append`) to prevent evasion of contracted requirements.
  - If unexpected input structure is encountered, log a warning/error instead of silently failing open.
- Non-functional:
  - Input parsing latency < 1ms.
  - No breakage of existing single-op callers.

## Architecture
In `typesafe-planner.ts`:
- Introduce `normalizeTodoOps(params: Record<string, unknown>): Array<Record<string, unknown>>`.
- Refactor the tool interception hook to iterate through all operations in the batch.
- Reject completion if any operation in the batch fails verification.

## Related Code Files
- Modify: `typesafe-planner.ts`
- Test: `tests/redteam-vulnerabilities.test.ts`, `tests/verification-gate.test.ts`

## Implementation Steps
1. Add `normalizeTodoOps` in `typesafe-planner.ts` matching EGC's extraction logic:
   ```typescript
   const ops = Array.isArray(params.ops) ? params.ops : params.op ? [params] : [];
   ```
2. Check for unknown input formats and emit diagnostic warning if non-empty parameters contain unrecognized keys.
3. Apply verification gate logic to every completion/removal op within the normalized `ops` list.
4. Add state-tracking / invariant checks on `drop` and `init` to prevent dropping contracted tasks without human approval.

## Success Criteria
- [ ] Batch `{ ops: [{ op: "done", ... }] }` correctly intercepted and evaluated.
- [ ] Dropping contracted tasks via `init` or `drop` is gated or logged.
- [ ] Phase 1 tests for batch/op bypass transition from RED to GREEN.

## Risk Assessment
- *Risk*: Legitimate batch updates might be delayed if each item triggers an independent heavy check.
- *Mitigation*: Run Gate 1 micro-checks for all items in batch, then run Gate 2 macro-check once over the cumulative git diff.
