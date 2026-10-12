---
phase: 3
title: "Pre-Flight Advisory Hook"
status: complete
priority: P2
effort: "2h"
dependencies: ["2"]
---

# Phase 3: Pre-Flight Advisory Hook

## Overview
Deliver Tier 3 Advisory Pre-Flight (Option B). This exposes a diagnostic tool to allow agents to preemptively verify their work before committing to `todo(done)`. It serves as a bounded self-correction loop ($\le 2$ retries) without causing hard deadlocks.

## Requirements
- **Functional:** Expose `xd://typesafe_verify_completion` (or similar endpoint) as a non-mutative, advisory check.
- **Functional:** MUST NOT block the execution of `todo(done)` if the pre-flight fails.
- **Functional:** Agent instructions MUST explicitly cap retries at 2 to prevent token exhaustion.
- **TDD Requirement:** Verify that the hook invokes the same semantic judge payload as Gate 2.

## Architecture
- `src/verification-gate.ts`: Ensure the underlying verification logic can be called out-of-band.
- `typesafe-planner.ts`: Make sure `xd://typesafe_verify_completion` is correctly registered and its schema warns the LLM about the 2-retry limit.
- **Fast-Path Fix:** Update `typesafe-planner.ts` to add `drop` and `rm` to the `isSafeFastPath` array, resolving the deadlock identified in the `ck:predict` report. Add a `pi.sendMessage` UI notification when a task is dropped.

## Related Code Files
- Modify: `src/typesafe-planner.ts`
- Modify: `tests/typesafe-planner.test.ts`

## Implementation Steps
1. **TDD:** Add a test verifying `xd://typesafe_verify_completion` returns the evaluation scorecard without mutating `activeContractedTasks`.
2. **TDD:** Add a test verifying `todo(op: "drop")` bypasses Gate 1/2 but triggers a notification payload.
3. Update `isSafeFastPath` in `src/typesafe-planner.ts` to include `drop` and `rm`.
4. Implement the UI notification (`pi.sendMessage`) when dropping a contracted task to prevent silent evasion.
5. Register the `xd://typesafe_verify_completion` tool with updated instructions capping retries.

## Success Criteria
- [x] Agents can call the pre-flight hook to receive structured feedback.
- [x] Agents can successfully `todo(op: "drop")` a broken task without being blocked by Gate 1/2 tests.
- [x] Dropped tasks visibly alert the human operator.
- [x] All TDD unit tests pass.

## Risk Assessment
- **Agent Loop Thrashing:** Agents might ignore the retry limit.
  - *Mitigation:* The hard ceiling is enforced by the harness. If the hook is called $> 2$ times per phase, throw a rate-limit exception.