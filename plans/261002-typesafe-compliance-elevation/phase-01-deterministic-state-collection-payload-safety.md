---
phase: 1
title: "Deterministic State Collection & Payload Safety"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Deterministic State Collection & Payload Safety

## Overview

Builds an isolated, tamper-proof state extractor (`TaskEvidenceCollector`) and payload bounding engine (`PayloadSafetyManager`). This phase ensures that whenever a TypeSafe judge evaluation is triggered, the verification `state` is derived directly from ground-truth OS signals (Git status, unified diffs, process execution exit codes, and test logs) rather than malleable text composed by the LLM agent.

Crucially, this phase enforces the **Claude Zero-Touch Isolation Protocol**: state extraction strictly ignores and isolates all Claude/Anthropic configuration and credentials (`~/.claude*`, `ANTHROPIC_*`), and scrubs any sensitive tokens before transmission.

## Requirements

### Functional Requirements
- **Tamper-Proof Signal Extraction:** Programmatically query Git working tree status (`git status --porcelain`, `git diff --stat`, `git diff`) for all files modified in the active task.
- **Claude / Anthropic Boundary Path Guard:** 
  - Strictly prohibit scanning, reading, or diffing files matching `~/.claude/**`, `**/.claude/**`, or `~/.claude.json`.
  - Exclude all environment variables starting with `ANTHROPIC_` or `CLAUDE_` from process execution environments and state evidence.
- **Direct Test Execution & Capture:** Execute configured test commands directly via isolated child process execution; capture process exit code, stdout, and stderr without intermediate agent filtering.
- **Acceptance Criteria Extraction:** Parse the active task's acceptance criteria directly from the authoritative `plan.md` or `phase-*.md` file on disk.
- **Egress Redaction:** Integrate with `~/.claude/mcp/typesafe/typesafe-redact.cjs` to scrub API keys, auth tokens, passwords, and user home-directory paths from state strings.
  - Specifically add regex patterns matching Anthropic API keys (`\bsk-ant-[A-Za-z0-9_-]{20,}\b`) and Claude session cookies, mapping to `[REDACTED:anthropic-key]`.
- **Strict 32KB Payload Bounding:** Guarantee that the complete serialized JSON request (`state` + `model` + `questions`) never exceeds 32,768 bytes, applying smart structural truncation (preserving test errors and symbol changes over raw diff lines) when necessary.

### Non-Functional Requirements
- **Speed:** Evidence collection and packaging must complete in < 400ms for typical tasks.
- **Fail-Closed on Tampering:** If the agent attempts to supply an artificial `state` override, discard it and enforce ground-truth collection.
- **Type Safety:** Zero `any` or `as any` annotations; full TypeScript strict typing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   HOST OPERATING SYSTEM                     │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ Git Repository │  │  Test Process  │  │ Plan on Disk  │  │
│  │ (Status, Diff) │  │  (Code, Output)│  │ (Criteria)    │  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬───────┘  │
│          │                   │                   │          │
│          │ [GUARD: Exclude   │                   │          │
│          │  ~/.claude/**]    │                   │          │
└──────────┼───────────────────┼───────────────────┼──────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              src/evidence-collector.ts                      │
│             `collectTaskEvidence(taskId, planDir)`          │
│  - Executes `git diff` against working tree                 │
│  - Captures test runner exit code and raw stderr/stdout     │
│  - Extracts target task acceptance criteria                 │
│  - Enforces zero-touch boundary on Claude configs/tokens    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               src/payload-safety.ts                         │
│            `preparePayloadSafe(outgoing, options)`          │
│  - Redacts credentials via `typesafe-redact.cjs`            │
│  - Explicitly scrubs `sk-ant-` tokens and Claude cookies    │
│  - Enforces 32KB hard budget with structural truncation     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
               TypeSafe System One Ready State
```

## Atomic Micro-Evaluation Checkpoints (TypeSafe System One)

| Micro-Check | Target Invariant | Question Key | Question Type | Pass Threshold | Fail Action |
|---|---|---|---|---|---|
| **MC-1.1** | Zero Claude Touch | `claude_touchpoint_safe` | `noul` | P(safe) $\ge 0.95$ | Reject state collection immediately. Never proceed with dispatch. |
| **MC-1.2** | Anthropic Key Scrub | `anthropic_key_scrubbed` | `noul` | P(scrubbed) $\ge 0.99$ | Reject outgoing payload if `sk-ant-` detected. |
| **MC-1.3** | 32KB Budget Integrity | `payload_bounded` | `noul` | P(bounded) $\ge 0.95$ | Perform AST/line truncation until payload is $\le 32,768$ bytes. |
| **MC-1.4** | Evidence Authenticity | `evidence_unadulterated` | `noul` | P(authentic) $\ge 0.90$ | Drop agent-supplied strings; rerun OS process directly. |

## Related Code Files

- Create: `src/evidence-collector.ts`
- Create: `src/payload-safety.ts`
- Create: `tests/evidence-collector.test.ts`
- Create: `tests/payload-safety.test.ts`
- Modify: `typesafe-planner.ts`

## Implementation Steps (TDD Flow)

1. **Step 1: Test-First Payload Safety & Redaction (Red)**
   - Create `tests/payload-safety.test.ts`.
   - Write unit tests asserting:
     - Automatic redaction of Anthropic keys (`sk-ant-api03-...`) to `[REDACTED:anthropic-key]`.
     - Rejection of payloads with detected secrets in question keys.
     - Redaction of token patterns in `state` and criteria.
     - Hard enforcement of `<= 32768` bytes limit when state is > 100KB.
     - Priority retention: test failures and modified symbol names are kept, while large repetitive diffs are truncated.

2. **Step 2: Implement Payload Safety (Green & Refactor)**
   - Implement `src/payload-safety.ts`.
   - Wire `preparePayloadSafe()` using the kit's `typesafe-redact.cjs` with enhanced Anthropic token patterns.
   - Implement structural AST/line truncation that preserves failure stack traces.
   - Verify tests pass with `bun test tests/payload-safety.test.ts`.

3. **Step 3: Test-First Evidence Collector with Claude Isolation (Red)**
   - Create `tests/evidence-collector.test.ts`.
   - Write tests simulating:
     - Git diff capture with unstaged modifications in project tree.
     - Path guard verification: attempts to read or include files from `~/.claude/` are strictly blocked.
     - Environment sanitization: `process.env.ANTHROPIC_API_KEY` is not inherited by test sub-processes.
     - Test execution capturing exit code `0` (pass) and `1` (fail).
     - Agent attempting to pass mock text state $\rightarrow$ collector enforces real OS data.
     - Extraction of specific acceptance criteria from a sample plan file.

4. **Step 4: Implement Evidence Collector (Green & Refactor)**
   - Implement `src/evidence-collector.ts`.
   - Expose `collectTaskEvidence({ taskId, planPath, testCommand })`.
   - Enforce path boundary checks: if target path resolves inside `.claude`, throw `SecurityViolationError`.
   - Run child processes safely with strict timeouts (10s max for test execution).
   - Verify all tests pass with `bun test tests/evidence-collector.test.ts`.

## Success Criteria

- [x] `bun test tests/payload-safety.test.ts` passes with 100% assertions.
- [x] `bun test tests/evidence-collector.test.ts` passes with 100% assertions.
- [x] Payloads never exceed 32,768 bytes under any oversized input test.
- [x] Tampered agent states are discarded; real Git and test output are strictly enforced.
- [x] Zero files in `~/.claude/` or `ANTHROPIC_*` tokens accessed during evidence gathering.
- [x] No `any` type escapes.

## Risk Assessment

- **Risk:** Test commands taking too long or hanging indefinitely.
  - **Mitigation:** Impose a hard 15-second `AbortSignal.timeout` on child process execution; any timeout is recorded as test failure (exit code 124).
- **Risk:** Truncation strips critical compiler errors.
  - **Mitigation:** Truncation algorithm scans from bottom-up for stack traces and error keywords (`FAIL`, `Error:`, `Exception:`) before slicing diff lines.
