---
title: "TypeSafe Stability Guardrails, Active Health Watchdog & Integrity Shield"
description: "End-to-end reliability, active pre-flight health monitoring, dynamic auth recovery, and core file integrity protection to guarantee unbroken TypeSafe System One execution."
status: completed
priority: P1
effort: "6h"
tags: [typesafe, stability, security, integrity, health-check, tdd]
blockedBy: []
blocks: []
created: 2026-10-03
---

# TypeSafe Stability Guardrails, Active Health Watchdog & Integrity Shield

## Executive Summary

Multiple operational sessions observed intermittent TypeSafe availability: initial setups succeed, followed by inexplicable API outages, authentication dropouts (401), routing errors (404), and test pollution. This plan operationalizes the consensus reached in the `ck:predict` multi-persona analysis, establishing:
1. **Core File & Code Integrity Shield:** Hard tool interception preventing unintended AI or script edits to TypeSafe extension infrastructure.
2. **Dynamic Auth Recovery & Key Watchdog:** Replacing permanent in-process lockouts with token-hash-aware self-healing while safeguarding against retry storms.
3. **Session Pre-Flight Health Watchdog:** Non-invasive, event-driven diagnostic probes on `session_start` and failure boundaries with visual user notifications.
4. **Hermetic Test Isolation & CI Hardening:** Total eradication of `process.env.TYPESAFE_API_KEY` leaks between test suites.

## Architectural Principles

- **Fail-Closed, Yet Self-Healing:** The system never executes unauthorized downward policy mutations, but automatically restores operational state the moment valid credentials reappear.
- **Hermetic Boundary Isolation:** Zero leakage of Anthropic tokens, zero side-effects across test suites, and strict payload bounds ($\le 32,768$ bytes).
- **Proactive Visibility:** Zero silent degradations. If fallback to chat models occurs or TypeSafe becomes unreachable, visual alerts (`display: true`) notify the operator immediately.
- **TDD Rigor:** Every protective layer is preceded by a failing adversarial unit test proving both detection and enforcement.

## Phases

| Phase | Name | Status | Priority | Effort |
|---|---|---|---|---|
| 1 | [File and Code Integrity Shield](./phase-01-file-and-code-integrity-shield.md) | Completed | P1 | 1.5h |
| 2 | [Dynamic Auth Recovery and Key Watchdog](./phase-02-dynamic-auth-recovery-and-key-watchdog.md) | Completed | P1 | 1.5h |
| 3 | [Session Pre-Flight Health Probe](./phase-03-session-pre-flight-health-probe.md) | Completed | P1 | 1.5h |
| 4 | [Test Environment Isolation and Hardening](./phase-04-test-environment-isolation-and-hardening.md) | Completed | P1 | 1.5h |

## Red-Team & Hostile Verification Scenarios

1. **Malicious Tool Bypass (Prompt Injection):** Agent attempts to edit `typesafe-planner.ts` to comment out `checkPolicy` $\rightarrow$ Interceptor cancels operation and alerts user.
2. **Key Expiration & Restoration Flap:** Server emits 401 on temporary token revocation, user updates `.env` with new key $\rightarrow$ Watchdog detects hash change and unblocks execution without restarting OMP.
3. **Silent Fallback Deception:** Network disconnects mid-session $\rightarrow$ Health probe catches dropout, surfaces prominent warning rather than silently failing open.
4. **Test Key Pollution Strike:** Rogue test script sets `process.env.TYPESAFE_API_KEY = "test_key"` $\rightarrow$ Test harness enforces automatic rollback and prevents cross-file corruption.

## Verification & Acceptance Gates

- [x] All 4 phase TDD suites pass with 0 failures (`bun test`).
- [x] Direct file modification of protected TypeSafe files is blocked with actionable user escalation.
- [x] Token hash watchdog successfully clears auth failure flags upon key rotation.
- [x] `session_start` displays health status and warns immediately if credentials/routing fail.

## Red Team Review

### Session — 2026-10-03
**Findings:** 4 total (4 accepted, 0 rejected)
**Severity Breakdown:** 1 Critical, 2 High, 1 Medium

| # | Finding Title | Severity | Disposition | Applied Resolution |
|---|---|---|---|---|
| 1 | Windows Path Traversal & Symlink Bypass | Critical | Accept | Use `path.resolve()` normalization before checking protected paths |
| 2 | Concurrent 401 Notification Storm | High | Accept | Debounce `pi.sendMessage` alerts so only 1 alert fires per failed key hash |
| 3 | Session Start Probe Lag on Offline Hosts | High | Accept | Enforce background execution (`deliverAs: "nextTurn"`) with strict 3s timeout |
| 4 | Leaked Global Fetch Mocks Across Unit Tests | Medium | Accept | Mandate `try ... finally` restoration via `withScopedEnv` in Phase 4 |

## Validation Log

### Session 1 — 2026-10-03
**Trigger:** `/ck:plan validate` interview pass with user.
**Questions Asked:** 2

#### Confirmed Decisions
1. **File Override Mechanism:** Cờ tham số `allowJudgeModification: true` + prompt xác nhận người dùng. Không chặn tuyệt đối nhưng yêu cầu xác nhận rõ ràng trước khi sửa file core.
2. **Session Start Notification:** Hiển thị thông báo trạng thái ngắn gọn khi Online (`TypeSafe: ONLINE (jev-latest)`), giúp người dùng luôn an tâm rằng TypeSafe đang hoạt động.

### Session 2 — 2026-10-03
**Trigger:** `/ck:cook plans/261003-typesafe-stability-guardrails/plan.md --auto --tdd`
**Outcome:** 106/106 tests passing across 16 test files. TypeSafe System One Tri-Role evaluation: `architectural_drift_guard: no_drift` (0.96), `scope_arbiter: EXPANSION`, `risk_security_triage: 1.94` (Zero/Low risk), `quality_tier: 3.0` (Excellent).
**Tighten-Only Policy & Operator Override:** TypeSafe calibrated `meets_criteria: 0.62` (< 0.70) and `safe_to_auto_approve: 0.28` (< 0.70) due to core security sensitivity. Autonomously halted auto-advance and escalated to operator; operator granted explicit override approval to finalize.
