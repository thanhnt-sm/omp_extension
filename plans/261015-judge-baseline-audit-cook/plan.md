---
title: "Judge Baseline Audit Implementation"
description: "Hermetic extension verification, bundled loading, bounded judge transport, native todo transaction, safe deployment, and runtime proof."
status: completed
priority: P1
effort: "multi-phase"
branch: master
tags: [typesafe, safety, tdd, deployment]
blockedBy: []
blocks: []
created: 2026-10-15
supersededBy: "261102-atomic-judge-proactive-advisor-healing"
completedInCycle: "2026-11-02"
verificationSuite: "tests/atomic-jev-judge.test.ts, tests/proactive-advisor-dispatch.test.ts"
---

# Judge Baseline Audit Implementation

## Overview

Execute `JUDGE_BASELINE_COOK_PLAN.md` P0–P6 in order. The workspace is the sole editable source; deployment reaches the active target only through `tools/sync-baseline.cjs`. The global loader pointer is immutable and must only be read/validated, never repaired or created.

### Shared contracts

- Preserve existing redaction, 32,768-byte cap, typed-answer sanitation, and tighten-only lattice. Do not add parsers, routing frameworks, telemetry, or calibration redesign.
- Every phase uses behavioral TDD: add a consumer-visible regression, run the complete named module suite and record real RED when it fails, make the minimum production edit, and rerun GREEN. A pre-existing pass is recorded as such; never regress production solely to manufacture RED.
- Every resolver call receives the factory-owned `homeDir`/`env`; no test-mode bypass. Test isolation uses unique temporary bundle copies and subprocesses, with restored environment and fetch in `finally`.
- Every network request follows one shared, prepared JSON-body transport with bounded total/attempt/body-cleanup deadlines, credential-hash generations, no raw secret/body in errors, and fail-closed unavailable outcomes.
- Every todo mutation is a native single operation. Preflight is staged by call ID, canonical input hash, generation, revision, target set, and provenance; state changes occur only after a validated native tool result. No exported singleton or synthetic `ops[]` compatibility path remains.
- Deployment is a preflighted, transactionally journaled, manifest-owned operation. It rejects unsafe roots, links/junctions, pointer mismatch, stale/modified ownership, and conflicts before any mutation; failures compensate only touched paths.
- P6 may execute workspace and isolated rehearsal evidence automatically. Real deployment needs a clean real dry-run and the immutable proxy prerequisite; the proxy itself is never edited. Post-deployment origin evidence requires an OMP restart and a live native scratch-session smoke.

### Verification policy

Run phase-specific full test modules at every RED/GREEN boundary. After P0, execute the workspace `bun test`, the migrated `bun tools/todo-remediation-smoke.ts`, isolated real-Bun deployment rehearsal, and real-path `node tools/sync-baseline.cjs --dry-run`. Do not claim runtime proof until the restarted process emits the expected bundled-origin/hashes and the native scratch-session scenario completes.

### Cross-plan scope

This audit replaces only overlapping synthetic `ops[]`, singleton, and pre-result deletion work in earlier plans. It neither re-executes threshold/calibration work nor changes historical plan status. Preserve external pending plan ownership.
## Execution status

- P0–P5 are complete. Reported completion evidence is a full workspace suite pass (`317/0`) and a passed todo smoke; this plan did not rerun either check.
- P6 source/runtime-origin support is complete. Runtime promotion remains pending: the real-path dry-run is blocked by immutable proxy validation, and the proxy must be repaired only by an external operator.
- P6 can close only after that external repair permits a clean supervised promotion, OMP is restarted, and a live scratch native-session smoke records origin and lifecycle evidence.


## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [P0 Hermetic preflight](./phase-01-p0-hermetic-preflight.md) | Completed |
| 2 | [P1 Bundled loading](./phase-02-p1-bundled-loading.md) | Completed |
| 3 | [P2 Bounded transport](./phase-03-p2-bounded-transport.md) | Completed |
| 4 | [P3 Native todo transaction](./phase-04-p3-native-todo-transaction.md) | Completed |
| 5 | [P4 Heuristics and intent](./phase-05-p4-heuristics-and-intent.md) | Completed |
| 6 | [P5 Recovery transaction](./phase-06-p5-recovery-transaction.md) | Completed |
| 7 | [P6 Runtime promotion](./phase-07-p6-runtime-promotion.md) | Source proof complete; runtime promotion pending |

## Scope coordination — todo recovery follow-on
`../261018-jev-session-forensics/plan.md` Phases 4–5 specify current-native todo recovery fixes and task-scoped completion evidence. Preserve this audit's call-ID/hash/generation/revision staging and authoritative-result commit guarantees. Its recovery spec supplements P3 behavior; it does not reopen completed audit phases or clear P6's external immutable-proxy/runtime-proof prerequisite. No new blocking dependency is imposed: independent implementation is possible, but any later promotion must verify the integrated candidate and restarted runtime, not reuse earlier smoke evidence for changed code.

## Execution reconciliation — 2026-10-19

Residual C05/C11/C12/C13/C14/C15/C23/C24/C25/C26/C32 ownership: [consolidated master](../261019-research-to-cook-execution/plan.md), with [source-evidenced dispositions](../reports/261019-research-to-cook-coverage.json). Preserve real factory/transport/native/deployment protections; implement specific remaining security/evidence/authority gaps. Historical pointer failure is stale, not a planning/source prerequisite; actual authorized runtime/UI proof remains distinct.

