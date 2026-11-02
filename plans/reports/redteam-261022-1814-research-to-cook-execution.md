---
title: "Red Team Review — 261019-research-to-cook-execution"
status: completed
---
# Red Team Review — 261019-research-to-cook-execution

Date: 2026-10-22 · Tier: Full (10 phases, 4 lenses) · Reviewers: 4 independent Opus code-reviewers (security / failure-mode / assumptions / contract-scope), evidence-filtered by lead.

## Verification results (lead, direct codebase)

| Claim | Result |
|---|---|
| Phase-3 anchor `src/egc.ts:263` "early verified persistence" | **FAILED** — no `verified` symbol exists in `src/egc.ts`; :263 is `ledger.debts.get(target.key)` |
| Phase-3 anchor `src/egc.ts:359-380` "remaining-work consumers" | **FAILED** — range is `/egc approve|reset|lint|selftest` command block |
| Phase-4 anchor `typesafe-planner.ts:436-463` artifact reader + `readFileSync` | **FAILED** — range is task-kind classifier; guarded read is `readWorkspaceFile` at :476 |
| Phase-6 `createExtensionJudgeClient` callsites "1729/1810/2055/2763/2813/2849/2940" | **FAILED** — actual: 1227 (adapter), 1780, 2231, 2252, 2287; factory at 2066 |
| Phase-2 anchor `tests/bicameral-consensus.test.ts:416-458` thinking-inclusion | **FAILED** — same file already asserts exclusion; F17 coverage lives in `tests/public-evidence-egress.test.ts` |
| All phase "Create" targets exist | **VERIFIED** — `src/types/verification.ts`, `task-contract.ts`, `verification-receipt.ts`, `judge-evidence-packet.ts`, `atomic-judge.ts`, `advisor-protocol.ts`, `advisor-runtime.ts`, `src/typesafe-child-env.cjs`, `src/typesafe-evidence-file.cjs`, `tools/jev-paired-eval*.ts`, `plans/261019-jev-atomic-review/evaluation/*` |
| Phase-6 policy-client consumers complete | **FAILED** — actual consumers also include `src/advisor-native-budget.ts`, `src/atomic-evaluation.ts`, `src/atomic-judge.ts`, `src/debate-evaluator.ts`, `src/egc-judge.ts`, `src/semantic-judge-client.ts`, `tools/jev-paired-workspace.ts`, `tools/sync-baseline.cjs` |
| Phase-4 `readWorkspaceFile` consumers complete | **FAILED** — 10 files, not 3: adds `src/host-history.ts`, `src/plan-closure.ts`, `src/task-contract-runtime-sources.ts`, `src/evidence-workspace.ts`, `src/advisor-readonly.ts`, `src/advisor-public-context.ts`, `tools/jev-paired-files.ts`, `tools/sync-baseline.cjs` |
| Critical "250 ms fetch timeout kills live JEV" | **REJECTED** — `timeoutMs: Math.min(250,…)` at `src/typesafe-api-client.cjs:549` only feeds `cancelBodyBounded`; fetch timeout is `Math.min(timeoutMs, remaining)` in `withTimeout` at :554 |
| `sync-baseline` lock bound to stale plan | **VERIFIED** — `tools/sync-baseline.cjs:526-529`: `acquireLock(initialPlan)` then a *second* `createPlan(preflight(config))` is applied |

## Findings (post evidence filter, deduplicated, ranked)

| # | Finding | Severity | Verdict |
|---|---|---|---|
| 1 | Plan materially stale: all "Create" targets already implemented and wired (commit `278f380`); executing verbatim re-does work or forks implementations | Critical | **CONFIRMED** |
| 2 | Stale `file:line` anchors (Phase-2/3/4/6) presented as current discovery coordinates | Critical | **CONFIRMED** |
| 3 | `sync-baseline` acquires lock from `initialPlan` but mutates with a freshly-built plan; lock and transaction can bind different target roots | Critical | **CONFIRMED** |
| 4 | EGC protected-config/`unsandboxed` scan runs only inside `WRITERS[...]` branch (`src/egc.ts:234-239`); TODO/todo_write completion path (:242-275) is not screened for the same payload | High | **CONFIRMED** |
| 5 | `specOf` + `uncontracted:"allow"` (`src/egc.ts:177-181`, gate at :201) lets a task with no contract entry and no verify/holdout reach `ok:true` — "unfalsifiable" failure is skipped in allow mode | High | **CONFIRMED** |
| 6 | Phase-9 `dependencies: [7]` but step 6 consumes Phase-8's strategy decision; undefined input if 8 stays pending | High | **CONFIRMED** |
| 7 | Interface consumers under-enumerated (policy client: +8 modules; guarded reader: +7 modules) → migration will miss real callers | High | **CONFIRMED** |
| 8 | Phase-5 scopes re-migration of a production debate path already consolidated (`src/debate-evaluator.ts`, planner:19/:2220); real residual is duplicate *test* modules | High | **CONFIRMED** |
| 9 | `advisor-native-budget.ts:37-41` drains an abort-signalled promise after the scheduler returns with no bound | High | PLAUSIBLE (needs runtime repro) |
| 10 | Windows test-command cancellation kills the `cmd.exe` wrapper (`shell:true`); `terminationObserved` may be recorded while grandchildren survive | High | PLAUSIBLE |
| 11 | Advisor `scope.files` authorization depends on request-self-declared digest; host `isAuthorizedSource` exists (`src/advisor-public-context.ts:20-38,61-66`) but the invariant is not stated in the plan | High → Medium | **CONFIRMED** (invariant must be frozen in plan) |
| 12 | `advisorApplicabilityDigest` strips `dispatchId` (`src/advisor-protocol.ts:102-107`) → a later re-dispatch can reuse an earlier receipt | Medium | **CONFIRMED** |
| 13 | Child-env secret screen covers only the active `TYPESAFE_API_KEY` literal (`src/typesafe-child-env.cjs:41-53`) | Medium | **CONFIRMED** |
| 14 | Oversized required file → `FILE_TOO_LARGE` → EGC `UNAVAILABLE` rather than `EVIDENCE_REQUIRED` | Medium | **CONFIRMED** |
| 15 | `[id]`-shape-only identity in `selectNativeTargets` (`src/egc.ts:249`, assert at :42) does not bind content digest/incarnation | Medium | **CONFIRMED** |

Rejected without merit: the 250 ms "critical fetch timeout" finding (see verification table).

## Disposition

Accepted (14 of 15). Rejected (1). Findings 1/2/6/7/8 are plan-document corrections. Findings 3/4/5/9/10/11/12/13/14/15 become explicit phase requirements.

## Unresolved

- Was `278f380` intended as the implementation of phases 1–7? Determines whether those phases become verification-only.
- Does `AbortSignal.any` exist in the pinned Bun runtime (used at `src/typesafe-api-client.cjs:488`)?
