---
phase: 6
title: "P5 Recovery transaction"
status: completed
priority: P1
effort: "high"
dependencies: [5]
---

# Phase P5: Recovery transaction

## Overview

Turn deployment into a manifest-owned, conflict-safe transaction with verified preimages and compensating rollback.

## Requirements

- Keep `tools/sync-baseline.cjs` as the only deployment entry. Use P0 root defaults/overrides and an allowlisted set of global resolver/MCP/agent destinations; never delete config, proxy, or skills.
- Persist a validated `.sync-manifest.json` with deployed hashes. Manage only known manifest-owned files; identical files may enroll, differing unowned/modified files conflict, and only unchanged prior-owned vanished source files prune.
- Perform lock/recheck, external staging, intent-first journal with preimages/absent markers, hash verification, transactional manifest write, target verification through `execFileSync(OMP_BUN_BIN, ["test"])`, and reverse rollback for every copy/prune/hash/test/manifest failure.
- Preserve ownership/ACL safety, retain backup/journal, return distinct recovered/incomplete failure status, and support listed `OMP_FAULT_INJECT` checkpoints without bypassing preflight.

## Related Code Files

- Modify: `tools/sync-baseline.cjs`
- Modify: `tests/sync-baseline.test.ts`

## TDD Steps

1. Add fixture matrix for conflicts/ownership/pruning, lock, backup/partial writes/faults, manifest verification, test failure, rollback failure, immutable bytes, deterministic repeat deployment, and isolated real-Bun target verification.
2. Run `bun test tests/sync-baseline.test.ts`; record RED.
3. Implement manifest/journal/rollback transaction using P0 preflight boundaries.
4. Re-run the same suite GREEN.

## Success Criteria

- [x] Deployment never overwrites unowned or modified content and never repairs the pointer/config.
- [x] Failure restores only transaction-touched paths or reports unresolved external modification.
- [x] Dry-run never writes; verified repeat deployment is deterministic and idempotent.
- [x] The full sync-baseline suite passes including isolated real-Bun rehearsal.
