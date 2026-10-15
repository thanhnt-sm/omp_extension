---
phase: 7
title: "P6 Runtime promotion"
status: in-progress
priority: P1
effort: "high"
dependencies: [6]
---

# Phase P6: Runtime promotion

## Overview

Produce full workspace/rehearsal evidence, protect the immutable loader-pointer boundary, and prove loaded runtime origin and native behavior after restart.

## Requirements

- Run full workspace `bun test` after P0, then `bun tools/todo-remediation-smoke.ts`; label it handler-unit evidence, not native proof.
- Run the isolated P5 real-Bun rehearsal and `node tools/sync-baseline.cjs --dry-run` on real paths. Re-read the immutable pointer; expected mismatch or ownership conflict blocks promotion, never triggers repair.
- Only after a clean supervised release may `node tools/sync-baseline.cjs` execute with verification enabled. `OMP_SKIP_VERIFY_TESTS=1` never satisfies promotion.
- On restart, emit a safe `typesafe-health` origin record containing entrypoint/module URLs and one-time SHA-256 hashes. Compare with the deployment manifest.
- Exercise a restarted isolated scratch native session: parent/child isolation, phase/all completion, authoritative result commit, rejection/error/stale cancellation safety, UI/headless behavior, resume/reappend isolation, captured tool IDs/details/state/origin without secrets.

## Current external promotion gate

P6 remains **pending**. The real immutable loader proxy currently fails the required one-line trampoline shape, so its mismatch blocks promotion. No agent or deployment tool may repair, replace, or otherwise mutate that proxy automatically; an operator must repair it externally under the repository rule before a fresh read-only dry-run can proceed. Source-level origin logging and workspace tests do not substitute for runtime evidence: after an externally repaired, supervised deployment, OMP must be restarted and an isolated live scratch native session must capture the loaded `typesafe-health` origin proof and native lifecycle evidence. Those restart/live-host checks are external prerequisites, not completed by this phase plan.

## Source proof and remaining promotion gate

Source/runtime-origin support is complete. Reported workspace evidence is `bun test` passing `317/0` and the todo smoke passing; neither check was rerun while updating this plan. Runtime promotion is still pending because the real `node tools/sync-baseline.cjs --dry-run` exits `1` during immutable pointer validation. An external operator, not this workspace or its deployment tooling, must repair the immutable proxy. After that repair, P6 still requires a clean supervised promotion, an OMP restart to reload the cached extension, and a live scratch native-session smoke before it may be marked complete.

## Related Code Files

- Modify: origin logging and migrated smoke paths as required by P2/P3 implementation.
- Verify: workspace/target deployment and live OMP host; never modify the global proxy.

## Steps

1. Execute full workspace and isolated rehearsal evidence.
2. Execute real-path dry-run and report pointer/conflict condition without remediation.
3. If promotion prerequisites are satisfied, deploy through the managed script with target test verification.
4. Restart OMP, collect the origin record, and run the isolated native scratch smoke.

## Success Criteria

- [ ] Full workspace suite, unit smoke, and isolated deployment rehearsal are observed.
- [ ] Real promotion never proceeds past pointer or ownership preflight failures.
- [ ] Loaded hashes/origins match the successful manifest after restart.
- [ ] Native scratch-session evidence covers isolation, result lifecycle, and denial paths; otherwise P6 records the exact external prerequisite and remains pending.
