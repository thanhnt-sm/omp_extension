---
title: "Red-Team Hardening and EGC Harmonization"
description: "TDD-driven remediation of red-team vulnerabilities in typesafe-planner and harmonization with EGC v2"
status: pending
priority: P1
effort: "4h"
branch: master
tags: [red-team, tdd, egc, security, verification-gate]
blockedBy: []
blocks: []
created: 2026-10-04
---

# Red-Team Hardening and EGC Harmonization

## Overview
Remediates critical vulnerabilities identified in the red-team evaluation of `typesafe-planner.ts` and establishes zero-collision co-existence with the Evidence-Gated Completion extension (`src/egc.ts`). Follows strict TDD: every phase begins with failing adversarial regression tests before implementing fixes.

## Key Objectives
1. **TDD Adversarial Test Harness**: Implement unit & E2E tests reproducing the 7 red-team vulnerabilities (batch op bypass, op bypass, fabricated evidence, blind diff summarization, privilege escalation, unhandled loop states, and extension hook collision).
2. **Todo Normalization & Coverage**: Support both `{ ops: [...] }` batch and `{ op: ... }` flat schemas; gate all mutative ops (`done`, `rm`, `drop`, `init`, `start`, `append`).
3. **Diff & Evidence Integrity**: Preserve function bodies in unified diffs up to the full 32KB payload boundary; prevent synthetic fallback claims ("Tests passed", "+ // No diff") when genuine evidence is absent.
4. **Deconfliction & Privilege Guard**: Prevent dual-extension deadlock by yielding `todo` verification when `egc.ts` is active, and enforce integrity guard against self-granted `allowJudgeModification`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [TDD Regression Suites](./phase-01-tdd-regression-suites.md) | Pending |
| 2 | [Todo Batch and Op Normalization](./phase-02-todo-batch-and-op-normalization.md) | Pending |
| 3 | [Context and Diff Preservation](./phase-03-context-and-diff-preservation.md) | Pending |
| 4 | [Deconfliction and Privilege Guard](./phase-04-deconfliction-and-privilege-guard.md) | Pending |
