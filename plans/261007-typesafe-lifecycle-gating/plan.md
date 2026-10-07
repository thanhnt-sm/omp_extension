---
title: "TypeSafe Lifecycle Gating & Human Authorization Fix"
description: "Fix premature blocking on initial todo/plan creation, enrich error messages with actionable next-step guidance for AI agents, enforce strict Gate 1 (tests) and Gate 2 (plan semantic alignment) completion checks across both Todo tools and Plan lifecycle mutations, plug zero test coverage void in tests/, and guarantee strict hermetic isolation of .claude configurations."
status: completed
priority: P1
effort: "4.5h"
branch: master
tags: [typesafe, gating, tdd, red-team, lifecycle, plan-cli, test-coverage, claude-isolation]
blockedBy: []
blocks: []
created: 2026-10-07
---

# TypeSafe Lifecycle Gating & Human Authorization Fix

## Overview
This plan resolves the false-positive invariant violation in `typesafe-planner.ts` where initial task and plan creation (`op: "init"`) was unconditionally blocked even when the task list was empty. It relaxes initial creation, preserves strict human-authorization guards for mutative resets/drops of contracted tasks, injects actionable guidance into all rejection notices, and strengthens Gate 1 deterministic test verification and Gate 2 plan-diff semantic validation before allowing `todo done` or plan closure.

Critically, this plan plugs two massive vulnerabilities discovered during adversarial red-teaming:
1. **The Plan Completion Backdoor:** `grep 'plan-cli'` and `grep 'status: completed'` returned 0 matches in `typesafe-planner.ts`, allowing agents to bypass rejected todos by directly marking plans as completed.
2. **The Zero Test Coverage Void:** `grep 'handleTodoInterception'`, `grep 'invariant violation'`, and `grep 'dropping or resetting'` returned 0 matches in `typesafe-planner.test.ts` and `tests/`. The entire tool interception lifecycle was running without automated regression tests!

## Core Architectural Invariants
1. **Empty-to-Contracted Freedom:** Agents MUST be permitted to establish initial plans and todo lists (`op: "init"`) when no prior active tasks exist.
2. **Contracted-to-Contracted Guard:** Dropping, resetting, or overriding existing active/incomplete tasks requires verified human authorization.
3. **Actionable Remediation (Never Halt Blindly):** Every tool rejection from Gate 1, Gate 2, or Invariant Guards MUST provide actionable steps telling the agent what to do next (`ask` user, fix test errors, or align diff).
4. **Strict Completion Gating across Todo & Plan:** Completing tasks (`op: "done"`), writing `status: completed` to plan files, or calling `plan-cli.cjs check` remains strictly dual-gated (Gate 1 local tests pass + Gate 2 TypeSafe semantic alignment with initial plan).
5. **Strict Claude Isolation Guarantee (`claude_account_untouched` >= 0.95):** Zero modifications to `~/.claude`, Claude settings, credentials, or Anthropic configs. All modifications are strictly restricted to local project code (`typesafe-planner.ts` and `tests/`).
6. **Strict TDD & Regression Safety:** Zero untested invariants. All lifecycle gating rules must have executable assertions in `tests/typesafe-lifecycle-gating.test.ts`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research & Test Reproduction (TDD Red)](./phase-01-research-test-reproduction.md) | Completed |
| 2 | [Lifecycle Invariant Relaxation & Guidance (TDD Green)](./phase-02-lifecycle-invariant-relaxation-guidance.md) | Completed |
| 3 | [Dual Gate Plan Verification Integration (TDD Refactor)](./phase-03-dual-gate-plan-verification-integration.md) | Completed |

## Red Team Adversarial Review

| Finding | Severity | Persona | Attack Vector / Failure Mode | Disposition | Actionable Fix in Plan |
|---------|----------|---------|------------------------------|-------------|------------------------|
| RT-01 | High | Security | Agent sneaks in `todo init` by tricking empty-check using synthetic tasks or clearing list via backdoor | Accepted | Check true active task count via persistent state; if uncompleted tasks exist, require authorization. |
| RT-02 | High | Devil's Advocate | Agent receives error and repeatedly invokes `ask` tool in an infinite loop burning tokens | Accepted | Rate-limit consecutive escalations via `consecutiveFailuresByTask` and ratchet after 3 failures. |
| RT-03 | Critical | Architect | Agent modifies `typesafe-planner.ts` directly during execution to disable Gate 1/Gate 2 | Accepted | Protected infrastructure guard requires `allowJudgeModification: true` with human auth context. |
| RT-04 | Critical | Security / Architect | **Plan Completion Backdoor:** `grep 'plan-cli'` and `grep 'status: completed'` returned 0 matches in `typesafe-planner.ts`. Agent completely bypasses Todo gates by editing `plan.md` directly or running `plan-cli check`. | Accepted | Add file mutation and bash tool interception in Phase 3 to gate `status: completed` and `plan-cli check`. |
| RT-05 | Critical | Devil's Advocate / QA | **Zero Test Coverage Void:** `grep 'handleTodoInterception'`, `grep 'invariant violation'`, and `grep 'dropping or resetting'` returned 0 matches in `tests/`. Logic had 0 automated tests! | Accepted | Phase 1 dedicated to authoring comprehensive TDD Red suite in `tests/typesafe-lifecycle-gating.test.ts`. |
| RT-06 | Critical | Security | **Accidental Touch of Claude Infrastructure:** Modifying `.claude` config files or global MCP manifests during plan execution. | Accepted | Invariant 5: Strict boundary protection. Block any write/edit to `~/.claude` or `**/.claude/**`. Gate 2 validates `claude_account_untouched >= 0.95`. |
| RT-07 | Medium | Performance | Gate 1 runs full test suite on every task completion causing developer lag | Accepted | Support targeted test command overrides via `testCommand` property with default fallback. |

## Validation Log

| # | Question / Edge Case | Persona Alignment | Chosen Decision & Tradeoff |
|---|----------------------|-------------------|----------------------------|
| 1 | Should initial `todo init` require a plan file to exist first? | Architect & Devil's Advocate | Allow `init` to bootstrap initial todo or plan, but enforce plan existence and alignment during `done`. |
| 2 | How should human authorization be recognized? | Security | Check `ctx.isHuman`, `ctx.authorized`, or explicit parameter `allowJudgeModification` validated by human `ask`. |
| 3 | What if test suite fails during Gate 1 check? | Architect | Block `done`, increment failure ratchet, return formatted test stderr + actionable remediation instructions. |
| 4 | How to prevent plan completion bypass when todo is rejected? | Security & Architect | Intercept `write`/`edit` on `plans/**/*.md` containing `status: completed` and `bash` running `plan-cli.cjs check`. |
| 5 | Why was this bug never caught by existing CI? | Devil's Advocate / QA | Because test suites only tested standalone helper functions, never the event interceptor `handleTodoInterception`. Phase 1 fixes this permanently. |
| 6 | Does this plan affect `.claude` or Claude account settings? | Security & Architect | NO. Pure project-scope modification. Strict Claude isolation invariant enforced: no touching `.claude` directory, tokens, or global configs. |
