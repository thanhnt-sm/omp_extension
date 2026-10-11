---
title: "Session Pre-Flight Health Probe Transport Scoping & Dual-Notification Fix"
description: "Implementation plan for decoupling fetch network errors from internal host IPC rejections during session_start in typesafe-planner.ts, ensuring false-positive unreachable warnings are eliminated."
status: completed
priority: P2
effort: "45m"
tags: [typesafe, health-probe, transport-scoping, session_start, diagnostics]
created: 2026-10-09
---

# Session Pre-Flight Health Probe Transport Scoping & Dual-Notification Fix

## Overview
Isolate the `fetch("https://api.typesafe.ai/v1/systemone")` call within its own tightly scoped `try...catch` block in `typesafe-planner.ts:session_start`. This prevents downstream IPC message bus failures (such as `nextTurn` turn-queue unreadiness) or UI notification errors from leaking into the network catch block and falsely emitting "TypeSafe warning: TypeSafe API unreachable".

---

## Acceptance Criteria
- [x] **Transport Scoping Isolation**: Enclose the `fetch()` network probe in its own independent `try/catch` block in `typesafe-planner.ts:session_start`.
- [x] **False-Positive Warning Suppression**: When the probe returns HTTP 200 OK, ensure `TypeSafe: ONLINE (jev-latest)` is emitted and subsequent IPC errors do not trigger the "TypeSafe API unreachable" warning.
- [x] **Hermetic Verification**: Pass all tests in `tests/health-watchdog.test.ts` cleanly with zero failures.
- [x] **Dynamic Dev Workspace Detection**: Dynamically detect dev workspace in `typesafe-planner.ts` using package.json package name rather than hardcoded machine path.
- [x] **Stall Ratchet Authorization & Failure Reset**: Provide authorization bypass flags (`authorized`, `isHuman`, `advisorApproved`, `resetFailures`) to allow graceful operator intervention.
---

## Phases

### Phase 1: Transport Scoping Refactor
- In `typesafe-planner.ts`, refactor the `session_start` event listener to declare `let probeRes: Response;`.
- Wrap only the `fetch()` call inside `try { ... } catch { ... }` that catches network/timeout errors, emits the "TypeSafe API unreachable" warning, and returns early.
- Evaluate `probeRes.status` branches (401/403, 404, 200 OK, other) outside the network catch block.
- Wrap all downstream `pi.sendMessage` calls with `.catch(() => {})`.

### Phase 2: Hermetic Test & Integration Verification
- Execute `bun test tests/health-watchdog.test.ts`.
- Execute throwaway integration script simulating `pi.sendMessage` rejection on `nextTurn` to prove false-positive warning suppression.
- Execute throwaway integration script simulating `Failed to fetch` to prove true-positive warning retention.
- Run full regression suite `bun test tests/`.
