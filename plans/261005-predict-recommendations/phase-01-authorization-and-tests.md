---
phase: 1
title: "Authorization and Test Migration"
status: complete
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Authorization and Test Migration

## Overview
This phase secures explicit human authorization via environment variables to bypass infrastructure protection, and migrates existing multi-persona tests to a new dedicated test file.

## Requirements
- Functional: Must establish a mechanism to legally modify `typesafe-planner.ts` via host environment variables (not tool parameters or EGC delegation).
- Non-functional: Existing tests must be cleanly migrated without losing coverage.

## Architecture
N/A - Configuration and Test scaffolding.

## Related Code Files
- Create: `tests/debate-evaluator.test.ts`
- Modify: `tests/typesafe-planner.test.ts`

## Implementation Steps
1. Request human user to set `TYPESAFE_ALLOW_MODIFICATION=1` in the host environment before proceeding, as this is the only secure way to modify protected infrastructure.
2. Scaffold `tests/debate-evaluator.test.ts`.
3. Migrate the existing `ck:predict` test blocks (e.g., `constructMultiPersonaQuestions` tests) from `tests/typesafe-planner.test.ts` into the new `tests/debate-evaluator.test.ts` file.
4. Run `bun test tests/debate-evaluator.test.ts` (this will fail initially until Phase 2 is complete).

## Success Criteria
- [x] Human authorization is verified via environment variable.
- [x] Existing tests are migrated to the new test file.

## Risk Assessment
- Risk: System blocks modification. Mitigation: Ensure the human user has explicitly set the environment variable and restarted the agent session if necessary.