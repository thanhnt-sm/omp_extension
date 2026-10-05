---
phase: 2
title: "Decouple Evaluator and Patch Client"
status: in_progress
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Decouple Evaluator and Patch Client

## Overview
Extract the multi-persona debate logic into a dedicated file, add the new file to the integrity shield, and fix a critical bug where the judge client was missing the debate evaluation method.

## Requirements
- Functional: `runMultiPersonaDebate` and `constructMultiPersonaQuestions` must be successfully migrated to `src/debate-evaluator.ts`.
- Security: `src/debate-evaluator.ts` MUST be added to `PROTECTED_INTEGRITY_PATTERNS` in `typesafe-planner.ts` to prevent autonomous tampering.
- Bugfix: `createExtensionJudgeClient` MUST implement `evaluateDebate` to dispatch real API calls instead of falling back to mock scores.

## Architecture
Moving from an inline function within `typesafe-planner.ts` to an imported module `src/debate-evaluator.ts`. `typesafe-planner.ts` will strictly handle interception and bridging.

## Related Code Files
- Create: `src/debate-evaluator.ts`
- Modify: `typesafe-planner.ts`
- Modify: `tests/typesafe-planner.test.ts`

## Implementation Steps
1. Create `src/debate-evaluator.ts` and copy the interfaces and functions. Export `TypeSafeQuestion`.
2. In `typesafe-planner.ts`, import the newly created functions.
3. **Security:** Add `src/debate-evaluator.ts` to `PROTECTED_INTEGRITY_PATTERNS` array inside `typesafe-planner.ts`.
4. **Bugfix:** Implement `evaluateDebate` on the returned client in `createExtensionJudgeClient` (delegating to `executeTypeSafe` with proper parameterization for `jev-fast`).
5. Update imports in `tests/typesafe-planner.test.ts` to point to the new `src/debate-evaluator.ts` module.
6. Delete the duplicated logic in `typesafe-planner.ts`.

## Success Criteria
- [x] `src/debate-evaluator.ts` contains the logic and is covered by dedicated tests.
- [ ] `src/debate-evaluator.ts` is protected by Gate 1 in `typesafe-planner.ts` (pending host auth).
- [ ] `evaluateDebate` is properly implemented in the judge client (pending host auth).
- [x] Entire test suite (`bun test`) passes without regression.
## Risk Assessment
- Risk: Model routing mismatch. Mitigation: Ensure `executeTypeSafe` accepts a model parameter so `jev-fast` is passed correctly instead of hardcoded `jev-latest`.