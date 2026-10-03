---
phase: 5
title: "Configuration Hardening and Zero-Conflict Verification"
status: completed
priority: P1
effort: "1h"
dependencies: [
  "phase-01-audit-and-unify-network-transport",
  "phase-02-api-contract-and-schema-alignment",
  "phase-03-context-and-state-de-cluttering-anti-context-rot",
  "phase-04-fix-compound-tools-rerank-and-multi-label"
]
---

# Phase 5: Configuration Hardening and Zero-Conflict Verification

## Overview
Perform final configuration audits (provider base URLs, opt-in resolvers, environment variables), execute an exhaustive regression and adversarial test suite, and verify that 100% of the enhancements reside in extension space with zero modifications to oh-my-pi's core codebase.

## Requirements
- **Functional:**
  1. **Provider Configuration Verification (`models.yml`):**
     - Verify that `providers.typesafe.baseUrl` is configured as `https://api.typesafe.ai` (WITHOUT `/v1` suffix) to prevent doubled URL pathing (`/v1/systemone` is appended automatically by the transport).
  2. **Opt-in & Credential Verification:**
     - Ensure `.ck.json` project opt-in resolver and `TYPESAFE_API_KEY` presence are verified on every session start.
     - Ensure auth failures (HTTP 401/403) set `disabledByAuthError = true` cleanly with out-of-band notification to the user.
  3. **Module Cache Invalidation Guidance:**
     - Document that Node's CJS module cache retains previously loaded kit modules until process restart; verify fresh runtime behavior.
  4. **End-to-End Suite Execution:**
     - Execute the full test suite (`bun test`) ensuring all 76+ existing tests pass, plus new tests covering all 4 previous phases.
  5. **Zero-Conflict Audit:**
     - Verify that not a single file in `src/` or `packages/coding-agent/` has been touched.
- **Non-Functional:**
  1. 100% test pass rate under `bun test`.
  2. Zero git merge conflicts when upstream oh-my-pi is updated.

## Architecture
```
+---------------------------------------------------------------------------------+
|                        Configuration & Invariant Checklist                      |
|                                                                                 |
|  [x] models.yml: baseUrl = "https://api.typesafe.ai" (no /v1)                   |
|  [x] process.env.TYPESAFE_API_KEY present and non-empty                         |
|  [x] .ck.json: resolveTypeSafeEnabled() returns true                            |
|  [x] Extension Layer: typesafe-planner.ts (100% of changes contained here)      |
|  [x] Base Layer: src/ (100% UNTOUCHED)                                          |
|  [x] Core Layer: packages/coding-agent/ (100% UNTOUCHED)                        |
+---------------------------------------------------------------------------------+
```

## Related Code Files
- Verify: `typesafe-planner.ts`
- Verify: `typesafe-planner.test.ts`
- Audit: `src/` (Must show 0 modifications)

## Implementation Steps
1. **Audit Environment & Configuration:**
   - Check `models.yml` or provider settings to confirm `baseUrl` has no `/v1` suffix.
   - Verify `TYPESAFE_BASELINE` and `TYPESAFE_LATTICE` environment settings.
2. **Execute Full Test Suite:**
   - Run `bun test` across the entire workspace.
   - Confirm all unit, integration, adversarial, and compliance tests pass with 0 errors.
3. **Run Zero-Conflict Audit:**
   - Inspect directory diffs to confirm no files in `src/` or core packages were modified.
4. **Smoke-Test Extension In-Memory:**
   - Simulate a real session invocation of `typesafe_judge`, `typesafe_rerank`, and intercepted `todo` completions, verifying that all outbound requests conform to TypeSafe System One specifications.

## Success Criteria
- [ ] All tests pass under `bun test` with 0 failures and 0 regressions.
- [ ] `src/` directory has 0 modified files.
- [ ] No `/v1/judge` endpoint calls exist anywhere in the active execution path.
- [ ] Every request to TypeSafe API passes `validateInput()` and `sanitizeAnswers()`.
- [ ] Verification command: `bun test` passes completely.

## Risk Assessment
- **Risk:** Stale CJS module caching in a long-running daemon could mask changes to external `.cjs` files.
- **Mitigation:** Instruct the user or workflow to restart the OMP process whenever kit modules are updated.
