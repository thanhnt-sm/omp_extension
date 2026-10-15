---
phase: 4
title: "P3 Native todo transaction"
status: completed
priority: P1
effort: "high"
dependencies: [1, 2, 3]
---

# Phase P3: Native todo transaction

## Overview

Replace singleton and synthetic todo mutation handling with factory-owned canonical state and a native single-op preflight/result transaction.

## Requirements

- Return `PlannerSessionState` from each factory: canonical phases, task baselines, revision/generation, checkpoint/remediations/failure maps, staged calls, and bounded tombstones. Derive active contracts from canonical phases.
- Remove mutable exported singleton state, reset helpers, `normalizeTodoOps`, `ops[]`, test-name bypasses, and latest-instance fallback. Migrate every caller/search hit to explicit state.
- Hydrate/rehydrate canonical state from native branch/tool results; invalidate stage data on generation/revision changes, TTL expiry, shutdown, and orphaned turn events.
- Stage a native operation by real call ID, hash, generation, revision, target set, shared snapshot/evidence/provenance; run no progress mutation until a matching successful native result with validated `details.phases` and transitions commits.
- Match documented native targeting/precedence, include abandoned targets for done, apply safe phase/all aggregation, hard preflight budget, cancellation, and exactly-once reporting/tombstones.

## Related Code Files

- Modify: `typesafe-planner.ts`, `src/evidence-collector.ts`, `tools/todo-remediation-smoke.ts`
- Modify tests: lifecycle, todo/drop/block, reconciliation, fidelity, planner, redteam, evidence collector.

## TDD Steps

1. Add native-shaped tool-call → TodoTool → tool-result harness coverage for isolation, mult-target done, errors, stale/revised/duplicate calls, branch/reappend, lifecycle, deadlines, and no-result safety.
2. Run `bun test tests/typesafe-lifecycle-gating.test.ts tests/todo-drop-gate.test.ts tests/todo-block-remediation.test.ts tests/plan-reconciliation.test.ts tests/judge-input-fidelity.test.ts tests/typesafe-planner.test.ts tests/redteam-vulnerabilities.test.ts tests/evidence-collector.test.ts`; record RED.
3. Implement factory state, staged preflight, native result commit, and shared evidence/cancellation contract; migrate every consumer.
4. Re-run the named command GREEN.

## Success Criteria

- [x] Instances/branches/children do not leak authorization or baselines.
- [x] Native errors, missing/malformed results, stale or revised calls never report or advance progress.
- [x] One operation verifies shared work once and commits only authoritative native transitions.
- [x] The named module suite passes; live-native importability remains explicitly proven or deferred to P6.
