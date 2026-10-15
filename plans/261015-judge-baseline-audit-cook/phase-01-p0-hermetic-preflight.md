---
phase: 1
title: "P0 Hermetic preflight"
status: completed
priority: P1
effort: "high"
dependencies: []
---

# Phase P0: Hermetic preflight

## Overview

Remove real-home fixture mutation and make extension/deployment preflight read-only until safe roots, inventory, and the immutable pointer are verified.

## Requirements

- Add `ExtensionRuntimeOptions` (`homeDir`, `env`, `preflightBudgetMs`) and return an instance-owned `PlannerSessionState` from `registerExtension` without a temporary exported singleton.
- Resolve all four TypeSafe enablement sites using injected `homeDir`/`env`; tests use temporary `.claude/.ck.json` fixtures.
- Use temporary copied bundles plus Bun subprocesses for missing/corrupt dependency tests; restore environment/fetch in `finally`; use unique evidence directories.
- Refactor `tools/sync-baseline.cjs` into a read-only preflight: real safe roots, non-overlap containment, existing-component link/junction rejection, strict one-statement pointer validation, discovered inventory, and no config/proxy provisioning.
- Add `OMP_WORKSPACE_DIR`, `OMP_HOME_DIR`, `OMP_BUN_BIN` overrides and `--dry-run`; reject unsafe/missing/duplicate roots before lock, backup, or writes.

## Related Code Files

- Modify: `typesafe-planner.ts`, `tools/sync-baseline.cjs`, `tests/typesafe-planner-integration.test.ts`, `tests/evidence-collector.test.ts`, `tests/health-watchdog.test.ts`
- Create: `tests/sync-baseline.test.ts`
- Reuse: `tests/helpers/test-env-harness.ts`

## TDD Steps

1. Replace unsafe fixtures and add behavioral subprocess/preflight snapshots for missing/BOM/extra pointer statements, root overlap, junctions, source absence, backup existence, and dry-run.
2. Run `bun test tests/typesafe-planner-integration.test.ts tests/evidence-collector.test.ts tests/health-watchdog.test.ts tests/sync-baseline.test.ts`; record RED if new behavior is absent.
3. Implement the minimum factory injection and read-only preflight/inventory checks.
4. Re-run the same module command GREEN.

## Success Criteria

- [x] Unsafe input exits nonzero without target/home/pointer/config bytes or existence changing and without a backup.
- [x] A valid dry-run creates no lock, backup, or writes.
- [x] Hermetic module/load tests do not read personal config or mutate real homes.
- [x] The named module suite passes.
