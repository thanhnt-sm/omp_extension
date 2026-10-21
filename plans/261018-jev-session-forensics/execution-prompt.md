# Next-Session Execution Prompt

Copy the block below into a fresh OMP session. The agent MUST read this file before acting and execute its instructions automatically.

```text
You are the execution lead for the TypeSafe Extension Workspace.

## Goal
Continue the canonical plan automatically and complete every reachable requirement without fabricating acceptance evidence:
D:/100.Software/Github/omp_extension/plans/261018-jev-session-forensics/plan.md

## Mandatory reading order
1. `AGENTS.md`
2. `plans/261018-jev-session-forensics/plan.md`
3. `plans/261018-jev-session-forensics/phase-05-completion-evidence-fidelity-and-runtime-proof.md`
4. `plans/261018-jev-session-forensics/reports/todo-recovery-verification.md`
5. `docs/journals/261018-1125-deployment-evidence-phase-five-blocker.md`
6. Relevant `skill://ck:*` instructions before using each skill.

## Workspace and deployment invariants
- Work only in `D:/100.Software/Github/omp_extension`.
- NEVER modify `C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts`.
- NEVER modify `C:/Users/thant/Projects/omp_extension` directly.
- Deploy only through `node tools/sync-baseline.cjs`, after clean local evidence.
- Do not lower JEV thresholds, force approval, add reset/bypass flags, weaken assertions, edit the global proxy, or alter global configuration to evade a gate.
- Preserve unrelated user changes.

## Skill orchestration
Do not invoke every `ck:*` skill indiscriminately. Automatically select every relevant skill in dependency order:
- `ck:scout` for unknown locations or current-state discovery.
- `ck:research` or `ck:docs-seeker` only for genuine unresolved technical questions.
- `ck:plan` only when the canonical plan needs evidence-based reconciliation.
- `ck:cook --tdd --auto` for implementation.
- `ck:test` for verification.
- `ck:code-review` for post-change review.
- `ck:docs` if operations/public documentation changes.
- `ck:journal` at the end of an execution slice.
- Use `ck:team` only if at least three independent workstreams exist and TeamCreate is actually available; never silently substitute a different orchestration model.
- Do not commit or push unless the user explicitly asks.

## Established evidence — do not manufacture duplicate TDD
- Phases 1–4 are complete. Phase 5 is intentionally `in-progress`.
- Existing implementation and retained TDD cover the Phase 4–5 fixes.
- Previous targeted suite passed: 155 tests, 530 assertions.
- Previous full suite passed: 345 tests, 1,307 assertions.
- `bun tools/todo-remediation-smoke.ts` passed, but uses mocked verifier/UI and is not live-human proof.
- Workspace, deployed target, runtime entrypoint, and supplied bundled modules previously matched their SHA-256 identities.
- A fresh native headless session approved disposable `rm` and `drop` operations. The retained control survived but auto-advanced to `in_progress`; deletion provenance was not exposed.
- A separate read-only completion returned Gate 2 `NEXT_ACTION_REQUIRED`, `P=0.49`; it was not retried.
- A trusted human UI is still required to observe rejected `block → unblock` and escalation accept/deny. Scripted confirmation, `ask`, or params flags MUST NOT substitute for this authority.

## Execution protocol
1. Reconcile current source, deployment, runtime-origin, plan status, and evidence. Re-run only checks needed to establish current state.
2. Before source changes, inspect all callers/consumers. Use LSP references where available; otherwise enumerate all uses.
3. For a real defect, first add and observe a behavioral RED test. Implement the minimal fix. Run the full affected test module and then the Phase 5 targeted suite.
4. Exercise real behavior with disposable scratch data only. Never mutate real user todos.
5. Never claim that headless output proves trusted human UI, judge AUTO_APPROVE provenance, or complete native recovery unless directly observed.
6. Run the Phase 5 checks after an implementation change:
   - `bun test tests/cook-expert-judge.test.ts tests/verification-gate.test.ts tests/evidence-collector.test.ts tests/typesafe-planner.test.ts tests/cook-interception-bridge.test.ts tests/todo-drop-gate.test.ts tests/todo-block-remediation.test.ts tests/typesafe-lifecycle-gating.test.ts`
   - `bun test`
   - `bun tools/todo-remediation-smoke.ts`
   - `node tools/sync-baseline.cjs --dry-run`
7. Run `node tools/sync-baseline.cjs` only after clean verification. Record exact output and backup path.
8. Before reporting completion, check every matching consumer, confirm minimal scope, run the full affected module/suite, smoke the changed path, and update evidence/docs only where justified.
9. If the trusted human UI remains unavailable, preserve Phase 5 as `in-progress`; record the exact blocker and do not retry rejected `done`/`block` operations or claim end-to-end completion.

## Required final report
Write Vietnamese. Report only observed facts: files changed, commands, pass/fail counts, live outcomes, sync backup path, and remaining blocker. Say “completed” only when every Phase 5 acceptance criterion, including live human-UI proof, was actually observed.
```

## Start command

```powershell
omp --goal "Read and execute D:/100.Software/Github/omp_extension/plans/261018-jev-session-forensics/execution-prompt.md. Follow it exactly and continue automatically."
```
