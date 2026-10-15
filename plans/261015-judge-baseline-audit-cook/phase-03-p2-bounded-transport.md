---
phase: 3
title: "P2 Bounded transport"
status: completed
priority: P1
effort: "high"
dependencies: [2]
---

# Phase P2: Bounded transport

## Overview

Unify all TypeSafe network traffic around one pre-serialized body transport with bounded deadlines, cleanup, retry, and credential-generation state.

## Requirements

- Add shared `requestWithRetry`, credential cooldown/check/reset, and bounded body cancellation APIs to `src/typesafe-api-client.cjs`; extend the TypeScript module contract and loader checks.
- Prepare/redact/cap/serialize exactly once; runner never re-normalizes or re-redacts. Keep the 32,768-byte cap and no raw body/key in failures.
- Use full SHA-256 key identity with generation-aware state. Handle 429/529 retry only, bounded 15-second total/10-second attempts, useful remaining budget, jitter/Retry-After, abortable caller/sleep/body cleanup, and no stale response state mutation.
- Move `judgeTypeSafe`, `executeTypeSafe`, health probe, cook/verification/plan judge clients, and debate evaluation to the shared policy. Add optional `model`, default `jev-latest`; unavailable debate must fail closed rather than fabricate scores.

## Related Code Files

- Modify: `src/typesafe-api-client.cjs`, `typesafe-planner.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`
- Create: `tests/typesafe-transport-retry.test.ts`

## TDD Steps

1. Add virtual-clock/timer tests for retry boundaries, retry-after variants, abort/body stalls, concurrent cooldown, A→B→A stale responses, checkpoint persistence, and unavailable debate.
2. Run `bun test tests/typesafe-transport-retry.test.ts tests/typesafe-planner-integration.test.ts tests/auth-recovery-watchdog.test.ts tests/health-watchdog.test.ts tests/cook-expert-judge.test.ts tests/verification-gate.test.ts tests/plan-evaluator.test.ts`; record RED.
3. Implement the shared prepared-body runner and migrate every production path.
4. Re-run the named command GREEN.

## Success Criteria

- [x] No path sends an unprepared or duplicate-serialized body.
- [x] Deadlines bound fetch, sleep, JSON/cancel cleanup, and caller abort.
- [x] Credential state is hash/generation-scoped and no unavailable result approves work.
- [x] The named module suite passes.
