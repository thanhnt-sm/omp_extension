---
title: "TypeSafe Plan Compliance & Elevation System"
description: "Dual-tier verification framework for OMP: elevating plan quality with a 3-question rubric and enforcing execution compliance via deterministic and TypeSafe System One semantic gates, with strict Claude/Anthropic account isolation."
status: completed
priority: P1
effort: "8h"
tags: ["omp", "typesafe", "system-one", "red-team", "tdd", "compliance", "planning", "anthropic-safety"]
blockedBy: []
blocks: []
created: 2026-10-02
---

# TypeSafe Plan Compliance & Elevation System

## Overview

A robust, fail-closed enforcement framework integrating TypeSafe System One (`jev-latest`) into Oh-My-Pi (OMP) to eliminate the critical vulnerability where AI agents falsely report task completion, skip plan requirements, or generate unvetted, low-quality implementation plans.

The framework operates on two distinct tiers:
1. **Tier 1 (Plan-Time Elevation):** A 3-question evaluation engine assessing Scope & Boundary (`choice`), Algorithm & Edge-Cases (`score`), and Task Actionability (`noul`) prior to plan persistence.
2. **Tier 2 (Execution Compliance Dual-Gate):** A mandatory dual-verification gate intercepting task finalization (`todo: done` / `finish`). It validates deterministic evidence (Git diff, LSP diagnostics, test exit code) locally before dispatching tamper-proof state to TypeSafe System One for semantic verification (`meets_criteria`, `plan_drift`).

---

## Claude / Anthropic Policy Safety & Zero-Touch Isolation Protocol

A primary architectural requirement is to **completely isolate OMP and TypeSafe from the user's Anthropic / Claude account**. Under no circumstance should OMP actions risk account flags, session revocation, rate-limit penalties, or Terms of Service (ToS) violations with Anthropic.

### 1. Touchpoint Inventory & Isolation Rules

| Touchpoint | Asset / Location | Permitted Action | Prohibited Action | Enforcement Mechanism |
|---|---|---|---|---|
| **Filesystem (Config & Kits)** | `~/.claude/hooks/lib/`<br>`~/.claude/mcp/typesafe/` | **READ-ONLY** via `nodeRequire` for shared utility logic (`resolver`, `redact`). | **NO WRITE / EDIT / DELETE.** Never modify `.ck.json`, `settings.json`, or any file in `~/.claude/`. | Host extension executes strictly as an immutable consumer. Path guards reject write attempts to `~/.claude/**`. |
| **Credentials & Auth Sessions** | `~/.claude.json`<br>`~/.claude/sessions/`<br>`ANTHROPIC_API_KEY`<br>`CLAUDE_CODE_TOKEN` | **ZERO ACCESS.** OMP does not read, export, or relay Claude session keys. | **NEVER touch Claude credentials.** Never use Anthropic OAuth for OMP tasks. | In-memory environment boundary. `TaskEvidenceCollector` excludes `~/.claude*` and `ANTHROPIC_*` env vars. |
| **TypeSafe API Destination** | `https://api.typesafe.ai/v1/systemone` | Only sends `TYPESAFE_API_KEY` in `Authorization: Bearer` header. | **NEVER forward Anthropic keys or cookies.** Never proxy through Anthropic endpoints. | Network layer hardcodes independent TypeSafe endpoints. Headers whitelist only `TYPESAFE_API_KEY`. |
| **Egress Redaction** | Request payload (`state`, `criteria`) | Automatically scrubs secrets before network dispatch. | Never emit raw token patterns. | Regex `\bsk-ant-[A-Za-z0-9_-]{20,}\b` + generic JWT/key scrubbers redact all Anthropic tokens to `[REDACTED:anthropic-key]`. |
| **ToS & Usage Compliance** | Anthropic Commercial Terms & Abuse Policy | Use independent proprietary model (`jev-latest`) on TypeSafe infrastructure. | **No scraping of Claude.** No spoofing Claude Code client IDs to bypass rate limits. | Completely distinct API client and model identifier. No Anthropic infrastructure is utilized for judgments. |

### 2. Guardrails Against Accidental Account Flagging
- **Independent Billing & Quota:** TypeSafe System One runs on TypeSafe's cloud infrastructure. Even if an agent triggers a thousand judgments in an automated loop, **zero calls reach Anthropic**, and **zero Anthropic tokens or rate-limits are consumed**.
- **Fail-Safe Secret Scrubbing:** If a project workspace contains an `.env` file with `ANTHROPIC_API_KEY`, Phase 1's `PayloadSafetyManager` scrubs it before it ever leaves the local machine.

---

## Target Architecture & Invariants

```
========================================================================================
                                PLAN CREATION LIFECYCLE
========================================================================================
[Agent Drafts Plan]
        │
        ▼
[Plan-Time Elevation Engine] (Phase 2)
        ├── Q1 Scope & Boundary (Choice: EXPANSION / HOLD / REDUCTION)
        ├── Q2 Algorithm & Edge-Cases (Score: [0..3], required >= 2.0)
        └── Q3 Task Actionability (Noul: P(actionable) >= 0.70)
        │
        ├── Pass ──────────────> Persist Plan & Hydrate Tasks
        └── Fail (score < 2.0) ─> Reject draft, inject rubric feedback (max 2 retries)

========================================================================================
                             EXECUTION & COMPLETION LIFECYCLE
========================================================================================
[Agent signals Task Complete: `todo: done`]
        │
        ▼
[Gate 1: Local Deterministic Gate] (Phase 1 & 3 - Zero Token Cost)
        ├── 1. `git status --porcelain` (Zero uncommitted/untracked leakage in scope)
        ├── 2. `lsp diagnostics` (Zero compilation / type errors)
        └── 3. `test suite runner` (Exit code == 0, non-empty test suite execution)
        │
        ├── Any Fail ──────────> REJECT IMMEDIATELY (Fail Fast, 0 Token Cost)
        └── All Pass ──────────> Gather Evidence Artifacts
                                 │
                                 ▼
[Tamper-Proof State Extractor] ──> Collects Git Diff Stat + Actual Test Output (≤32KB)
                                 │ Scrub Anthropic/Claude Credentials & Home Paths
                                 ▼
[Gate 2: TypeSafe Semantic Gate] (Phase 3)
        ├── State: { Plan Acceptance Criteria + Git Diff + Verifiable Test Logs }
        ├── Q1: `meets_criteria` (Noul: P(pass) >= 0.70)
        └── Q2: `plan_drift` (Choice: no_drift / scope_creep / unapproved_cut)
        │
        ├── Pass (noul >= 0.7 & no_drift) ──> Approve Task Completion
        ├── Rejection (noul < 0.7 or drift) ─> Block completion, inject remediation diff
        └── Offline / API Error ────────────> ESCALATE TO USER via `ask` tool (Never Self-Approve)
========================================================================================
```

### Core Invariants
1. **Zero-Claude-Touch:** OMP never reads, modifies, or transmits Claude/Anthropic auth tokens, session state, or `~/.claude/` files.
2. **Tighten-Only:** Verification results may only raise flags, add test requirements, or demand user review. A judgment result NEVER permits skipping review or bypassing tests.
3. **Native-Only Fallback (v18.4 OMP Standard):** If TypeSafe System One is the primary judge, a failed call NEVER falls back to an uncalibrated general chat model.
4. **Deterministic Pre-Check:** No remote API call is initiated if deterministic preconditions (compilation, test exit code) fail.
5. **Tamper-Proof Evidence:** The agent cannot author the verification `state`. State is gathered programmatically by host extension hooks.
6. **Fail-Closed on Auth/Outage:** If TypeSafe is unreachable during a task completion gate, the extension enforces user escalation via `ask`, forbidding automatic approval.

---

## Granular Plan Decomposition & Multi-Level TypeSafe Evaluation Matrix

To ensure that every atomic unit of work and the holistic architecture are thoroughly vetted, the system decomposes evaluations into **Atomic Micro-Checks (Từng điểm nhỏ nhất)** and a **Systemic Macro-Check (Đánh giá tổng thể)**.

### 1. Atomic Micro-Checks Matrix (Per Phase & Task)

| Scope | Micro-Check Target | Question Key | Type | Evaluation Rubric / Criteria | Threshold | Fail Action |
|---|---|---|---|---|---|---|
| **Phase 1** | Claude Account Isolation | `claude_touchpoint_safe` | `noul` | True if the evidence collector operates strictly within project files and touches ZERO `~/.claude` or Anthropic configs. | $\ge 0.95$ | Hard Abort: Terminate evidence collection, report boundary violation. |
| **Phase 1** | Payload Boundary & Redaction | `payload_bounded` | `noul` | True if serialized request is $\le 32,768$ bytes and stripped of all credential patterns (`sk-ant-`, AWS, tokens). | $\ge 0.95$ | Truncate AST/diff lines and rescrub. Reject if secret in key. |
| **Phase 2** | Scope Preservation | `scope_mode` | `choice` | `HOLD` (matches ask), `EXPANSION` (adds justifiable scope), `REDUCTION` (omits requested features). | `HOLD` or `EXPANSION` | Reject draft if `REDUCTION`. Lattice forbids dropping requested tasks. |
| **Phase 2** | Algorithmic Rigor & Boundaries | `algorithm_depth` | `score` | Level 0: No edge cases; Level 1: Happy-path only; Level 2: Error handling & validation; Level 3: Rollback & invariants. | $\ge 2.0$ | Reject draft. Return rubric feedback highlighting missing error cases. |
| **Phase 2** | Task Measurability | `task_actionability` | `noul` | True if every task has unambiguous verification commands and deterministic pass/fail criteria. | $\ge 0.70$ | Reject draft. Prompt agent to specify concrete test commands. |
| **Phase 3** | Deterministic Integrity | `deterministic_pass` | `noul` | True if test suite ran with real exit code 0 and LSP reports zero type/syntax diagnostics. | $\ge 0.90$ | Gate 1 blocks before network call; demand compile/test fix. |
| **Phase 3** | Criteria Fulfillment | `meets_criteria` | `noul` | Probability that real Git diff and test output completely satisfy the task's stated deliverables. | $\ge 0.70$ | Gate 2 blocks; revert task to `in_progress` with remediation diff. |
| **Phase 3** | Anti-Drift Enforcement | `plan_drift` | `choice` | `no_drift` (strictly matches plan), `unapproved_deviation` (modified unrelated files), `scope_creep`. | `no_drift` | Block completion. Require revert of unauthorized file edits. |
| **Phase 3** | Fail-Closed Escalation | `escalation_enforced` | `noul` | True if network drop / 401 triggers interactive `ask` tool dialog instead of silent auto-pass. | $\ge 0.95$ | Block session; prohibit agent from declaring task done. |
| **Phase 4** | Adversarial Defense Coverage | `adversarial_resilience` | `score` | Level 0: Fails on fake state; Level 1: Catches simple mocks; Level 2: Catches assertion deletion; Level 3: Resilient to all 6 matrix attacks. | $\ge 2.5$ | Hardening required before merging implementation. |

### 2. Holistic Macro-Check (Toàn bộ Giải pháp)
Before committing the final implementation to master, a comprehensive composite evaluation is run over the aggregated code and test reports:
- **`system_integrity` (Score, 4 levels):** Evaluates if the dual-tier system functions end-to-end without race conditions or memory leaks ($\ge 2.5$).
- **`anthropic_compliance` (Noul):** Verifies that the implementation contains zero references, dependencies, or network routes to Anthropic accounts/keys ($P \ge 0.99$).
- **`tdd_conformance` (Noul):** Confirms that every feature has a corresponding failing-before/passing-after test suite ($P \ge 0.90$).

---

## TDD Strategy & Verification Protocol

The entire system is implemented strictly following Test-Driven Development (TDD):
1. **Red:** Write unit and integration tests asserting failure modes, adversarial evasions, and gate enforcement prior to writing implementation code.
2. **Green:** Implement minimal code satisfying the test suites.
3. **Refactor:** Optimize performance, enforce TypeScript type safety (`ts-no-any`), and ensure strict compliance with OMP extension standards.

Test runner: `bun test` in project workspace.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Deterministic State Collection & Payload Safety](./phase-01-deterministic-state-collection-payload-safety.md) | Completed |
| 2 | [Plan-Time Quality Elevation Engine](./phase-02-plan-time-quality-elevation-engine.md) | Completed |
| 3 | [Execution Compliance & Dual Verification Gate](./phase-03-execution-compliance-dual-verification-gate.md) | Completed |
| 4 | [Adversarial Robustness & E2E Validation](./phase-04-adversarial-robustness-e2e-validation.md) | Completed |

## Risk Matrix

| Risk ID | Description | Severity | Likelihood | Mitigation Strategy |
|---------|-------------|----------|------------|---------------------|
| R1 | Agent bypasses hook by editing `todo.json` directly | High | Low | Intercept at the OMP `todo` tool registration and filesystem watcher level. |
| R2 | 32KB payload boundary violated on large files | Medium | Medium | Implement smart structural chunking in `PayloadSafetyManager`. |
| R3 | False-positive gate rejection stalls delivery | Medium | Medium | User escalation escape hatch via `ask` tool with detailed rubric diff. |
| R4 | Accidental leakage of Anthropic/Claude credentials | Critical | Very Low | Mandatory redaction pass for `sk-ant-` tokens; exclude `~/.claude*` from state extraction. |
| R5 | Network latency on `typesafe_judge` calls slows TUI | Low | Low | Async non-blocking pre-computation; 10s hard timeout; caching via `JudgmentCache`. |

## Acceptance & Definition of Done

- [x] All 4 phase test suites pass under `bun test` with 100% assertion success.
- [x] Plan creation rejects plans scoring < 2.0 on algorithm/edge-cases or < 0.70 on task actionability.
- [x] Task completion (`todo: done`) is blocked if unit tests fail, LSP reports type errors, or `meets_criteria` noul < 0.70.
- [x] Extension escalates to `ask` tool when TypeSafe is disabled or network fails during completion gating (no silent self-approval).
- [x] Zero occurrence of `: any` or `as any` across TypeScript implementations.
- [x] Egress payloads strictly validated `<= 32768` bytes and stripped of credentials/secrets.
- [x] Complete zero-touch isolation from Claude/Anthropic accounts verified by automated unit tests.
