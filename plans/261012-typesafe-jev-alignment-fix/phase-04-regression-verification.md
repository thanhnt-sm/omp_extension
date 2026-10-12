---
phase: 4
title: "Regression Verification"
status: complete
priority: P1
effort: "2h"
dependencies: ["1", "2", "3"]
---

# Phase 4: Regression Verification

## Overview
Ensure all changes across Phase 1-3 maintain the rigorous TypeSafe Dual Verification Gate invariants and do not degrade the strictness of standard code evaluations.

## Requirements
- **Functional:** Existing Gate 1 micro-checks (unit tests, assertions) MUST still block invalid code completions.
- **Functional:** Standard `code_change` evaluations MUST still fail if the JEV score is $< 0.80$.
- **Functional:** End-to-end integration tests MUST cover the complete flow of an analytical task bypassing the monolithic git-diff check.

## Architecture
- `tests/e2e-workflow.test.ts` (or equivalent integration suite): Add end-to-end simulations of `todo(done)` for both `analysis_research` and `code_change` paths.

## Related Code Files
- Modify: `tests/e2e-workflow.test.ts`
- Modify: `tests/typesafe-lifecycle-gating.test.ts`

## Implementation Steps
1. Create a mock repository setup in tests that mimics a research task (empty git diff, written markdown artifact).
2. Trigger `todo(done)` and assert the mocked TypeSafe API receives the `taskType: "analysis_research"` and `deliverableArtifacts` payload.
3. Assert that Gate 2 passes despite the empty diff.
4. Create a second mock setup with modified code files but an agent claiming `analysis_research`.
5. Assert that the deterministic guard overrides it to `code_change` and the TypeSafe API receives the correct payload.
6. Verify all existing adversarial regression tests pass.

## Success Criteria
- [x] Integration tests simulate both valid and spoofed task completions.
- [x] TypeSafe Dual Verification Gate invariants are proven intact.
- [x] Overall test coverage remains $\ge 95\%$.

## Risk Assessment
- **Integration Test Fragility:** E2E tests mocking git and external APIs can be flaky.
  - *Mitigation:* Use isolated temporary directories and precise mock responses for the JEV endpoint.