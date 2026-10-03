---
title: "TypeSafe System One Judge Definitive Alignment and Zero-Conflict Architecture"
description: "Comprehensive implementation plan to align oh-my-pi's TypeSafe System One judge integration with official TypeSafe.ai documentation, eliminate rogue endpoints and schema mismatches, resolve Question ID blindness, and guarantee zero conflicts with oh-my-pi upstream updates by isolating all enhancements to extension space."
status: completed
priority: P1
effort: "6h"
tags: ["typesafe", "system-one", "omp", "extension-isolation", "schema-alignment", "anti-context-rot", "zero-conflict"]
blockedBy: []
blocks: []
created: 2026-10-02
---

# TypeSafe System One Judge Definitive Alignment & Zero-Conflict Architecture

## Executive Summary

Audit of user sessions and TypeSafe.ai console logs revealed an inconsistent execution pattern:
* **Why requests reach TypeSafe in some sessions:** Calls through `typesafe-planner.ts` (`executeTypeSafe`) and the MCP server target the valid endpoint (`https://api.typesafe.ai/v1/systemone`) with `model: "jev-latest"`. When invoked directly with valid inputs, these requests succeed and register on the dashboard.
* **Why other sessions break and fail silently:**
  1. Sub-workflows in `src/cook-expert-judge.ts` hardcoded an invalid endpoint `https://api.typesafe.ai/v1/judge` (returning HTTP 404) and omitted the required `model` parameter.
  2. `src/plan-evaluator.ts` and `src/cook-expert-judge.ts` formatted `criteria` for `choice` and `noul` questions as string arrays `[...]` instead of JSON maps/objects (`Record<string, string>`), triggering immediate input rejection (`invalid_input: criteria must be a dict`) in `typesafe-api-client.cjs` and `sanitizeAnswers()` failure.
  3. `typesafe_rerank` suffered from **Question ID Blindness**: because TypeSafe does not send question IDs to the underlying Jev model, sending identical instruction strings without backtick-indexed candidates (`candidates[${i}]`) resulted in arbitrary scoring.
  4. `src/cook-expert-judge.ts` attempted to read a non-existent `.confidence` property on `noul` answers, falling back to a hardcoded `0.92`.

This plan establishes a **definitive, zero-conflict fix** that brings 100% compliance with TypeSafe.ai official documentation while strictly preserving oh-my-pi's core codebase untouched.

---

## Zero-Conflict & Core Invariants

1. **Zero-Touch Core Codebase:** No files in `packages/coding-agent/` or oh-my-pi engine core are edited. All logic, validation, and transformations live in extension space (`typesafe-planner.ts`, `src/*`, and user config). Upstream `git pull` on oh-my-pi will never produce merge conflicts.
2. **Single Canonical Transport:** Every sub-module (`cook-expert-judge`, `plan-evaluator`, `verification-gate`) routes exclusively through `executeTypeSafe()` or a unified client targeting `POST https://api.typesafe.ai/v1/systemone` with `model: "jev-latest"`.
3. **Strict TypeSafe API Contract Adherence:**
   - `choice`: `criteria` must be a Dictionary `{ [option: string]: description | object }` (max 255 options).
   - `noul`: `criteria` if supplied must be `{ "true": string, "false": string }`. Output reads `answer.noul` (0..1) only; never `.confidence`.
   - `score`: `criteria` must be an ordered array of 2..10 level descriptions.
4. **Anti-Context-Rot & Token Guard:** Git diffs and file payloads are sanitized and summarized before entering `state` (capped at 8KB / ~2000 tokens) to keep Jev within optimal calibration and well below the 32k token limit.
5. **Backtick Path Referencing:** Every question instruction must explicitly reference state fields using backticks (e.g., \``diff_summary\``, \``plan_requirements\``, \``candidates[${i}]\``).

---

## System Architecture

```
+-----------------------------------------------------------------------------------+
|                           Oh-My-Pi Extension Boundary                             |
|                                                                                   |
|  +---------------------+   +---------------------+   +-------------------------+  |
|  | typesafe_judge      |   | typesafe_rerank     |   | typesafe_expert_review  |  |
|  | typesafe_elevate    |   | typesafe_eval_multi |   | typesafe_verify_complete|  |
|  +----------+----------+   +----------+----------+   +------------+------------+  |
|             |                         |                           |               |
|             v                         v                           v               |
|  +-----------------------------------------------------------------------------+  |
|  |                      Payload Normalizer & Safety Guard                      |  |
|  |  - Auto-normalizes array criteria to TypeSafe Dict (Choice & Noul)          |  |
|  |  - Enforces backtick indexing for multi-candidate arrays                    |  |
|  |  - Summarizes large unified diffs (Diff Truncator, max 8KB)                 |  |
|  |  - Egress secret redaction (typesafe-redact.cjs)                            |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  |                    Unified TypeSafe Transport Client                        |  |
|  |  - POST https://api.typesafe.ai/v1/systemone                                |  |
|  |  - Payload: { state, questions, model: "jev-latest" }                      |  |
|  |  - Sanitizer: typesafe-api-client.cjs sanitizeAnswers()                    |  |
|  |  - Policy: typesafe-policy-client.cjs checkPolicy() (Lattice Gate)          |  |
|  +-------------------------------------+---------------------------------------+  |
+----------------------------------------|------------------------------------------+
                                         | HTTPS Bearer $TYPESAFE_API_KEY
                                         v
+-----------------------------------------------------------------------------------+
|                         TypeSafe System One (Jev 1.13)                            |
|             Calibrated Probabilities (Choice / Score / Noul)                      |
+-----------------------------------------------------------------------------------+
```

---

## Phases Overview

| Phase | Title | Status | Priority | Effort |
|:---:|---|:---:|:---:|:---:|
| 1 | [Audit and Unify Network Transport](./phase-01-audit-and-unify-network-transport.md) | completed | P1 | 1h |
| 2 | [API Contract and Schema Alignment](./phase-02-api-contract-and-schema-alignment.md) | completed | P1 | 1.5h |
| 3 | [Context and State De-cluttering Anti-Context-Rot](./phase-03-context-and-state-de-cluttering-anti-context-rot.md) | completed | P1 | 1.5h |
| 4 | [Fix Compound Tools Rerank and Multi-label](./phase-04-fix-compound-tools-rerank-and-multi-label.md) | completed | P1 | 1h |
| 5 | [Configuration Hardening and Zero-Conflict Verification](./phase-05-configuration-hardening-and-zero-conflict-verification.md) | completed | P1 | 1h |

---

## Risk Assessment & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Breaking Existing Extension Callers** | High | Provide backward-compatible normalization inside `preparePayloadSafe()` so callers passing legacy criteria arrays are auto-converted to compliant Dicts. |
| **Upstream OMP Update Conflicts** | High | All changes are strictly restricted to local extension files (`typesafe-planner.ts`, `src/*`, `tests/*`). Core OMP remains 100% clean. |
| **Token Overflow on Large Git Diffs** | Medium | Implement smart AST/hunk truncation in `src/evidence-collector.ts`, keeping state below 8KB. |
| **Auth Latch Lockout** | Medium | Maintain the 401/403 auth error flag with clear out-of-band notification so the user knows when a key needs rotation. |
