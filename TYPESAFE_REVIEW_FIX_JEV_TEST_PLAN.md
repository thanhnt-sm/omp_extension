# TypeSafe Extension: Fix Red-Team Residuals, Upgrade Evidence Performance, Verify Judge/JEV, Close Every Todo

> **Executor:** Gemini, fresh OMP session, workspace `D:/100.Software/Github/omp_extension`.
> **Mode:** `ck:cook --auto --tdd` on this file. Planned with `ck:plan --validate --tdd --red-team --auto` + `ck:predict` on 2026-10-26.
> **Source of truth:** this file. Do not read `plans/261019-research-to-cook-execution` for instructions; it is only cross-referenced for Red Team IDs.

## 0. Read This First (Execution Contract)

1. Run **Gate 0** (§4.1) before creating any native todo. If Gate 0 fails, do **not** call `todo` with `init`; follow §4.5.
2. Create the native todo list **exactly once** with `todo init`, using the six items in §4.2 verbatim. Never `init` again in the same session. Re-initialising over open items is a lifecycle replacement and is rejected unless `typesafe_prepare_todo_mutation` prepares it first.
3. Each phase follows TDD: **T** (write failing/safety-net tests) → **I** (implement) → **V** (affected suites + changed-path smoke). Mark a todo done only through the closure chain in §4.3.
4. Never edit `C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts`. Deploy only via `node tools/sync-baseline.cjs` (Phase 6).
5. No assertion weakening, no `.skip`, no raised test timeouts to hide slowness, no fake Advisor receipts, no lowered thresholds.
6. **Do not edit this plan file while executing.** `typesafe_bind_task` freezes this file's digest as the contract source, and editing it creates source drift plus an out-of-task mutation. Write every log entry to `plans/reports/261026-typesafe-review-fix-execution-log.md` (the "Execution Log"). Write it **only between** a todo's settled `done` and the next `typesafe_bind_task`; keep notes in memory during a phase.

## 1. Verified Baseline (2026-10-26, HEAD of workspace)

| Fact | Evidence |
|---|---|
| `bun test tests/evidence-collector.test.ts tests/sync-baseline.test.ts` | **63 pass, 0 fail, 426.78 s** wall time. No timeout failures right now: the problem is **slowness**, not failure. |
| `inspectDirectoryChain` calls `fs.realpathSync.native` on every path prefix | `src/typesafe-evidence-file.cjs:30-37` |
| `readWorkspaceFile` walks the root chain 2 extra times (`originalRoot`, `afterRoot`) in addition to 2× `inspect()` | `src/typesafe-evidence-file.cjs:55,57,72,74` |
| `captureWorkspaceSnapshot` runs both `ls-files --cached --others` and `ls-files --others` | `src/evidence-workspace.ts:72,80` |
| `collectTaskEvidence` deliberately recaptures `after` ("Never reuse an earlier changed-file list") | `src/evidence-collector.ts:177-178`; test pins it at `tests/evidence-collector.test.ts:494-497` |
| Windows termination uses async `taskkill` and has no fallback when it fails | `src/evidence-collector.ts:136-138` |
| Sync lock acquired from `initialPlan`, transaction runs on a re-preflighted `plan`, and nothing checks that they match | `tools/sync-baseline.cjs:526,529`; `acquireLock` derives the lock path from `plan.targetDir` at `:231-232` |
| EGC protected-config scan only runs for `WRITERS`; `TODO_TOOLS` inputs skip it | `src/egc.ts:234-241` |
| `uncontracted:"allow"` exempts tasks from "No verification command" | `src/egc.ts:180,201` |
| `FILE_TOO_LARGE`/`FILE_MISSING` from `readWorkspaceFile` propagates to `attempt()` catch → `EGC UNAVAILABLE` | `src/egc.ts:133,149-154,189,227` |
| `selectNativeTargets` **already** uses exact `content ===`; the remaining gap is that an operation with no `task` string matches every target | `src/egc-native.ts:32-35` |
| Post-scheduler drain `await observed.promise` is unbounded | `src/advisor-native-budget.ts:41` |
| `advisorApplicabilityDigest` strips `dispatchId` but keeps binding/revision/snapshot; reuse is intentional | `src/advisor-protocol.ts:102-108`, `src/advisor-runtime.ts:73-78` |
| Child-env secret screen only uses the `TYPESAFE_API_KEY` value | `src/typesafe-child-env.cjs:22,41-42,79-80` |
| Numeric `usage.input_tokens` redacted to `[REDACTED:kv]`: separated key regex matches `token(s)`, and `isWholesaleRedactable` redacts numbers | `src/typesafe-redact-patterns.cjs:511-512,538-548`; `src/typesafe-redact.cjs:60-65,93-100` |
| Advisor provider allowlist has **no Google/Gemini API** | `src/advisor-guards.ts:8-10` (`openai-*`, `azure-openai-responses`, `anthropic-messages` only) |
| Advisor agents pin no model, so the child inherits the session model | `.omp/agents/advisor.md:1-6`, `.omp/agents/ck-advisor.md:1-6` |
| Native `done` requires `verificationRuntime.preflight → APPROVED_PENDING_COMMIT` (bind → evidence → M review → real Advisor → review) | `typesafe-planner.ts:1617-1628`, `src/task-verification-runtime.ts:76-77` |
| `init/drop/rm/block` over existing targets need a fresh (60 s TTL) grant from `typesafe_prepare_todo_mutation`; block/drop also need human UI confirmation | `src/todo-lifecycle-authority.ts:30,63-138` |
| A fresh session with no todo history may `init` without a grant | `src/todo-lifecycle-authority.ts:36-38,122` |
| Previous session failure mode: `todo init` over 9 open items → `EVIDENCE_REQUIRED: Prepare this exact lifecycle mutation…`, and `xd://` reported 0 mounted TypeSafe devices | observed 2026-10-26 |

## 2. Prediction Report (`ck:predict`)

**Verdict: CAUTION.** Proceed with the corrections below. Two parts of the original draft would have weakened security invariants, and one environment prerequisite (Advisor provider under Gemini) can block every todo closure.

### Agreements
- The realpath reduction is safe. `realpath(leaf)` resolves every prefix, so a junction, 8.3 alias or reparse point in any segment still changes the result. Per-segment `lstat` stays.
- Removing the duplicate `git ls-files` spawn is behaviour-preserving: `ls-files --stage` lists the same cached paths, including unmerged and skip-worktree paths.
- The sync lock/plan mismatch is a real TOCTOU. Assert identity; do not restructure the transaction.
- Redaction should exempt only finite non-negative integer telemetry counts on exact keys. Strings stay redacted.

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| Reuse caller `afterSnapshot` in `collectTaskEvidence` | Breaks documented invariant `:177` | A stale snapshot becomes proof | Saves 1 snapshot | — | Callers pass `record.snapshot` (`typesafe-planner.ts:2256`), which can be stale | **Reject.** Keep fresh `after`. |
| Reuse `after` as `stable` when no source read | — | Removes the only concurrent-mutation guard | Saves 1 snapshot | — | Combined with the row above, zero fresh captures | **Reject.** Keep `stable` recapture. Reuse `gitStatus` for `cleanWorkingTree` only when `stable.treeDigest === after.treeDigest`. |
| Sync `taskkill` (`spawnSync`, 5 s) | — | Kills the tree | Blocks the OMP host event loop up to 5 s (the extension runs in-process) | Host freeze | `close` already waits for inherited pipes | **Async `taskkill`**: await its exit with a bounded timer; on non-zero exit or error, call `child.kill()`. Keep the existing `close` settlement. |
| EGC regex on todo inputs | One screen for all inputs | Wants full regex | — | Todo text like "Fix egc.ts" would be blocked | Todo tools write no files | **Todo inputs: block only `"unsandboxed": true`.** The path regex stays writer-only. |
| `uncontracted:"allow"` | Public option changes meaning | Unfalsifiable completion | — | Users of `allow` start seeing refusals | — | Exempt only when `jev.mode === "enforce"` **and** `requirements.length > 0` (judge acts as falsifier). Document in `docs/typesafe-operations.md`. |
| Child-env secret patterns | — | Catch `*_API_KEY/_SECRET/_TOKEN/_PASSWORD` | — | A short secret value (e.g. `"1"`) would reject every PATH → all children fail | — | Pattern-discovered secrets count only if `trim().length >= 12`. Named list plus `TYPESAFE_API_KEY` keep ≥ 1. A shared collector is used by `buildChildEnvironment` **and** `createVerificationHome().environment`. |
| Redact digests (`policyIdentity`, `bodyDigest`) | — | Fail-safe redaction is acceptable | — | Cosmetic | YAGNI: not observed as a defect | **Out of scope.** Only `usage.*_tokens` counts. |

### Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Advisor child under Gemini fails with `advisor_provider_api_unsupported` → no `done` ever approved → every todo stays open | **Critical** | Gate 0 probe (§4.1). If unsupported, follow §4.5. Do not create todos you cannot close. |
| Perf edits weaken path-identity checks | High | Existing `tests/evidence-file-security.test.ts` must pass unchanged, plus new junction/alias-root tests (Phase 1 T). |
| `allow` semantics change breaks existing EGC users | Medium | Docs + explicit refusal message naming the remedy. |
| Secret screen DoS on short values | Medium | Min-length rule + test. |
| Sync deploy overwrites live runtime mid-session | Medium | Deploy only in Phase 6 after the full suite is green. The user restarts OMP afterwards. |

## 3. Red Team Review

Lenses: security, failure-mode, performance, architecture. All findings were checked against code (evidence column).

| # | Finding | Severity | Evidence | Disposition | Applied in |
|---|---|---|---|---|---|
| R1 | Draft claims tests time out; they pass (63/0) but take 426.78 s | High | §1 row 1 | Accept: acceptance changed to "0 fail + measured speed-up", not a fixed 15 s | Phase 1 V |
| R2 | Reusing `afterSnapshot` violates the fresh-capture invariant | Critical | `src/evidence-collector.ts:177`, `typesafe-planner.ts:2256` | Accept: removed | Phase 1 |
| R3 | Reusing `after` as `stable` removes the concurrent-mutation guard | High | `src/evidence-collector.ts:275-276` | Accept: removed | Phase 1 |
| R4 | Sync `taskkill` blocks the host event loop | High | in-process extension, `src/evidence-collector.ts:132-142` | Accept: async bounded wait | Phase 2 |
| R5 | RT#15 "exact content match" already implemented | Medium | `src/egc-native.ts:33` | Accept: scope narrowed to missing-`task`/multi-target ambiguity | Phase 3 |
| R6 | Todo-input regex blocks legitimate task names mentioning `egc.ts` | Medium | `src/egc.ts:238` regex `egc\.(ts|json|lock)` | Accept: todo screen = `unsandboxed` flag only | Phase 3 |
| R7 | RT#12 draft is unverifiable ("document/enforce") | Medium | `src/advisor-protocol.ts:102-108` | Accept: concrete invariant test (revision/tree change ⇒ new digest; dispatchId-only change ⇒ same digest) + doc comment | Phase 4 |
| R8 | Secret-pattern expansion can DoS all child processes | Medium | `src/typesafe-child-env.cjs:46,53` | Accept: min-length 12 for pattern-discovered values | Phase 4 |
| R9 | `createVerificationHome().environment` duplicates the old single-key screen | Medium | `src/typesafe-child-env.cjs:79-80` | Accept: shared collector | Phase 4 |
| R10 | Drain bound is meaningless if the scheduler itself awaits the worker | Medium | `src/advisor-native-budget.ts:33-41` | Accept: the test uses a fake scheduler that resolves on abort without awaiting the worker | Phase 4 |
| R11 | Advisor provider allowlist excludes Gemini | Critical | `src/advisor-guards.ts:8-10` | Accept: Gate 0 + §4.5 (no code change; adding a Google adapter is out of scope) | §4 |
| R12 | Draft's digest-field redaction expansion is speculative | Low | not observed | Accept: removed (YAGNI) | Phase 5 |
| R13 | Draft has no todo-closure procedure → repeat of the observed `EVIDENCE_REQUIRED` stall | Critical | §1 last rows | Accept: §4 added | §4 |
| R14 | Phase criteria were bold text; `parseContractCriteria` only reads bullets under a heading titled exactly `Success Criteria` → bind would throw `contract_phase_has_no_criteria` | Critical | `src/task-contract-source.ts:91,107` | Accept: converted to `### Success Criteria`; verified by running the real parser (6/6 phases OK, 15 criteria) | All phases |
| R15 | Logging into this file mid-run changes the bound source digest | High | `src/task-contract-source.ts:42`, contract `approvedSource.digest` | Accept: log moved to a separate report, written only between todos | §0, §8 |
| R16 | Phase 6 restarted OMP before its own `done`, and its criteria needed the post-restart runtime plus its own completion → Phase 6 todo could never close | Critical | `typesafe-planner.ts:1437-1438` (`session_start` → `invalidateTodoState`) | Accept: restart moved to §9 after closure; criteria limited to pre-restart, observable facts | Phase 6, §9 |

## 4. Todo Closure Protocol (mandatory)

### 4.1 Gate 0: capability probe (no todo calls yet)
1. Confirm these tools are callable (top-level or `read xd://` lists them): `typesafe_bind_task`, `typesafe_collect_evidence`, `typesafe_review_task`, `typesafe_prepare_advisor`, `typesafe_prepare_todo_mutation`, `typesafe_judge`.
2. Call `typesafe_prepare_advisor` with `{"question":"capability probe"}`. **FAIL** if the result says "Independent native Advisor unavailable" (the stub registered at `typesafe-planner.ts:2308-2312`).
3. Confirm the Advisor child's provider API is one of `openai-codex-responses | openai-responses | azure-openai-responses | openai-completions | anthropic-messages`. If the session model is Gemini, the advisor agent must run on a supported model. Check whether the host supports a `model:` frontmatter key in `.omp/agents/advisor.md` / `ck-advisor.md`. **Ask the user before changing agent config.** Never add a fake entry to `advisorProviderApis`.
4. Hold the Gate 0 result in memory. Write it to the Execution Log right after Gate 0, before `todo init`: no task is bound yet, so the write is outside any task interval.

Gate 0 passes only if all four steps pass.

### 4.2 Native todo list (create once, verbatim, after Gate 0 passes)

```
todo init list=[{"phase":"Execution","items":[
 "Phase 1: Evidence reader and snapshot performance",
 "Phase 2: Sync lock identity and Windows termination",
 "Phase 3: EGC screening, allow mode, refusals, target ambiguity",
 "Phase 4: Advisor drain, applicability invariant, child-env secrets",
 "Phase 5: Telemetry count redaction",
 "Phase 6: Full verification, live JEV, deploy and reconciliation"]}]
```

- Each item text must equal its `## Phase N: …` heading below. `typesafe_bind_task` binds by exact content, and `phaseHeading` must match.
- Use `todo start` for the active item (allowed without a grant). Use `append` (not `init`) for any genuinely new work.

### 4.3 Per-todo closure chain (run for every item, in order)
1. `typesafe_bind_task {"task":"<exact item>","phase":"Execution","planPath":"TYPESAFE_REVIEW_FIX_JEV_TEST_PLAN.md","phaseHeading":"<exact heading>"}` → expect `BOUND`. Bind **before** editing code so the baseline snapshot predates the change (`typesafe-planner.ts:1330-1332`).
2. Implement the phase (T → I → V).
3. `typesafe_collect_evidence {"task":…,"phase":"Execution"}` (add `commandId` for the approved verify command if the contract lists one).
4. `typesafe_review_task {…}` → read `nextActions`.
5. `typesafe_prepare_advisor` with the exact arguments from `nextActions`. Then execute **only** the native task call it returns, and wait for the settled result.
6. `typesafe_review_task {…}` again → expect `APPROVED_PENDING_COMMIT`.
7. `todo done task="<exact item>" phase="Execution"`. Wait for the settled Core result before any other todo call (`typesafe-planner.ts:1601`).

**If step 4 or 6 rejects:** don't retry unchanged. Read the Advisor diagnosis, repair the code/evidence, re-run V, then repeat from step 3. **If `EVIDENCE_REQUIRED`:** supply exactly the missing evidence it names. **If `UNAVAILABLE`:** go to §4.5.

### 4.4 Forbidden (each one recreates the blocked state)
- `todo init` a second time; `drop`/`rm` of open items to "clean up"; `block` without a `typesafe_prepare_todo_mutation` grant used within 60 s.
- Compound shell around plan-cli (`cd … && node plan-cli …`). Closure authority accepts only a direct quoted argv with bash `cwd` set (`src/plan-closure.ts:11-19`).
- Claiming completion from child/subagent passes, or writing receipts by hand.

### 4.5 Fallback when Gate 0 fails or a chain returns `UNAVAILABLE`
- **Gate 0 failed:** do not create native todos. Implement and verify all phases anyway (the code work doesn't depend on todos), record progress in the Execution Log, and finish with a report listing the exact missing capability. Result: zero open todos, because none were created.
- **Mid-run `UNAVAILABLE` on an existing todo:** call `typesafe_prepare_todo_mutation` with `input={"op":"block","task":"<item>","phase":"Execution","reason":"<exact UNAVAILABLE code>"}` and `handoff={"owner":"user","nextAction":"<restore capability X>","unblockCondition":"typesafe_review_task returns APPROVED_PENDING_COMMIT","resumeCommand":"ck:cook --auto D:/100.Software/Github/omp_extension/TYPESAFE_REVIEW_FIX_JEV_TEST_PLAN.md (resume at Phase N step 3)"}`. Answer the host UI confirmation, then call `todo block` with the same input within 60 s. Report that it is blocked, not done.

---

## Phase 1: Evidence reader and snapshot performance

**Files:** `src/typesafe-evidence-file.cjs`, `src/evidence-workspace.ts`, `src/evidence-collector.ts`, `tests/evidence-file-security.test.ts`.

**T (tests first):**
1. Record a baseline with `bun test tests/evidence-collector.test.ts` and `bun test tests/evidence-file-security.test.ts tests/task-evidence-runtime.test.ts`. Note the per-file wall time; write it to the Execution Log after this phase's `done`.
2. Add to `tests/evidence-file-security.test.ts`, matching existing fixture helpers:
   - (a) A file read through a root given via a **directory junction** (Windows: `fs.symlinkSync(target, link, "junction")`) is rejected (`UNSAFE_PARENT` or `AMBIGUOUS_PARENT`).
   - (b) A file whose **intermediate** parent is a junction is rejected.
   - (c) A root given with different letter case on win32 still reads successfully.

   Skip-guard (a)/(b) only with the file's existing platform guard style. These must pass **before** the change; they are the safety net.

**I:**
1. `inspectDirectoryChain` (`:27-39`): keep the per-segment `lstatSync(..., {bigint:true})` and the `isSymbolicLink()/isDirectory()` check. Remove the per-segment `realpathSync.native`. After the loop, run once: `const real = fs.realpathSync.native(absolute); if (comparable(path.resolve(real)) !== comparable(absolute)) reject("AMBIGUOUS_PARENT");`
2. `readWorkspaceFile` (`:49-79`): compute `canonicalRoot` first. If `comparable(canonicalRoot) === comparable(path.resolve(root))`, skip `originalRoot`/`afterRoot` chain walks. `before.directories` and `after.directories` already cover the root prefix, and `:73` compares them. Keep the `:76` realpath equality check. Otherwise (root is an alias), keep the current code path unchanged.
3. `captureWorkspaceSnapshot` (`:63-81`): delete the `:72` spawn. After `stagedIndex` parsing, compute `const untracked = snapshotGit(["ls-files","-z","--others","--exclude-standard"])…` **once**. Set `names` = union of every stagedIndex entry path (all stages, path after `\t`) and `untracked`. `dirty` adds the same `untracked` array (replace the `:80` spawn).
4. `collectTaskEvidence`: keep `:178` and `:275` captures. Track `let statusObserved = false` and set it to true after the `:223` success. Replace `:279-282`: if `statusObserved && stable.complete && stable.treeDigest === after.treeDigest`, then `cleanWorkingTree = gitStatus.length === 0`; else keep the existing spawn.

**V:**
- `bun test tests/evidence-file-security.test.ts tests/evidence-collector.test.ts tests/task-evidence-runtime.test.ts tests/judge-evidence-packet.test.ts` → 0 fail.
- Re-measure `tests/evidence-collector.test.ts` wall time. Acceptance: strictly faster than the logged baseline; log both numbers. If not faster, profile (`bun --cpu-prof`) and log the hotspot before continuing. Never raise timeouts.

### Success Criteria
- [ ] Junction root, junction parent and case-variant root tests pass before and after the change.
- [ ] Each snapshot spawns one fewer git process, and reads skip the redundant root-chain walks when the root is canonical.
- [ ] The evidence suites pass with 0 failures and the measured evidence-collector time is below the baseline.

## Phase 2: Sync lock identity and Windows termination

**Files:** `tools/sync-baseline.cjs`, `src/evidence-collector.ts`, `tests/sync-baseline.test.ts`, `tests/evidence-collector.test.ts`.

**T:**
1. `tests/sync-baseline.test.ts`: add a case where the target root identity changes between preflight and transaction. Reuse the file's existing env-injection pattern (`OMP_TARGET_DIR`, fault hooks such as `OMP_FAULT_INJECT`). If no existing hook can swap the target between the two preflights, add a fault point `fault("after-lock")` immediately after `acquireLock` and have the test swap the target there. Expect a non-zero exit, the message `deployment plan changed after lock`, and no files written to the target. It must fail before the fix.
2. `tests/evidence-collector.test.ts` (Windows-guarded like existing tests): `executeTestCommand` on a command that spawns a long-lived grandchild (`node -e "require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'inherit'});setTimeout(()=>{},60000)"`) with `timeoutMs=500`. Expect `timedOut: true`, settlement within 10 s, and `terminationObserved: true`.

**I:**
1. `main()` `:529`: after `const plan = createPlan(preflight(config), config)`, check `normalizeForComparison(plan.targetDir) !== normalizeForComparison(initialPlan.targetDir)`, and do the same for `workspaceDir` and `backupDir`. On mismatch, `fail("deployment plan changed after lock")`. Keep the lock bound to `initialPlan`.
2. `terminate()` `:136-138`: spawn `taskkill` with `spawnChild` (async, unchanged policy). Attach `once("exit", code => { if (code !== 0) child.kill(); })` and `once("error", () => child.kill())`, plus a 5 s `setTimeout(() => child.kill(), 5000).unref()` cleared on exit. No `spawnSync`. Settlement stays on the child `close` handler.

**V:** `bun test tests/sync-baseline.test.ts tests/evidence-collector.test.ts` → 0 fail. `node tools/sync-baseline.cjs --dry-run` → "Preflight succeeded".

### Success Criteria
- [ ] A target identity change between lock and transaction aborts with no target mutation.
- [ ] A Windows timeout kills the process tree, settles within 10 s, and never blocks the event loop with spawnSync.

## Phase 3: EGC screening, allow mode, refusals, target ambiguity

**Files:** `src/egc.ts`, `src/egc-native.ts`, `tests/egc.test.ts`, `docs/typesafe-operations.md`.

**T** (all in `tests/egc.test.ts`, reusing its existing host/contract harness; each must fail first unless noted):
1. RT#4: with an enforce-mode contract, a `todo` tool_call whose input contains `"unsandboxed": true` is blocked. A `todo` call whose task text is `Fix egc.ts lint` is **not** blocked by the screen.
2. RT#5: `uncontracted:"allow"` with no verify/holdout and `jev.mode` unset → `EGC REFUSED` containing `No verification command`. With `jev.mode:"enforce"` and `defaults.requirements:["r"]` → no such refusal line (the judge path runs).
3. RT#14: a `planFiles` entry larger than 131072 bytes, and a missing `planFiles` entry, each produce `EGC REFUSED: EVIDENCE_REQUIRED: FILE_TOO_LARGE|FILE_MISSING …`, with task `assessment === "rejected"`, not `EGC UNAVAILABLE`. An oversized **untracked** changed file behaves the same way.
4. RT#15: a `done` operation that resolves to more than one target → `EGC: ambiguous completion target; specify exact phase and task content.` and nothing staged. If `todoOperations` normalisation rejects a `done` without `task` (it may already), note that as evidence for the Execution Log and keep only the multi-target case.

**I:**
1. `tool_call` handler `:234-241`: before the `if (!TODO_TOOLS…)` branch, when `contract.mode !== "shadow" && TODO_TOOLS[event.toolName]`, block if `/"unsandboxed"\s*:\s*true/.test(JSON.stringify(event.input ?? {}))`. The writer path regex stays unchanged.
2. `:201`: the condition becomes `!spec.verify?.length && !spec.holdout?.length && !(contract?.uncontracted === "allow" && contract?.jev?.mode === "enforce" && (spec.requirements?.length ?? 0) > 0)`.
3. Add `class EgcEvidenceRefusal extends Error { constructor(readonly code: string, readonly path: string) }`. Wrap `readWorkspaceFile` calls at `:133`, `:149` (non-deletion branch) and `:189`: when `egcRecord(error).code` is `FILE_TOO_LARGE` or `FILE_MISSING`, throw `new EgcEvidenceRefusal(code, path)`. Exception: at `:149`, a Git-proven deletion keeps its current handling. In `attempt()`'s catch, an `EgcEvidenceRefusal` takes the rejected path. Set `task.assessment="rejected"`, `task.attempts++`, `fp = sha(code+path)`, and run the stall accounting the same way as `:223-225`. Return `EGC REFUSED: EVIDENCE_REQUIRED: ${code} ${path}. …`. All other errors keep `EGC UNAVAILABLE`.
4. `:259-261`: for `operation.op === "done"`, if `targets.length > 1`, push the ambiguity problem and `continue`.
5. Docs: in `docs/typesafe-operations.md`, document the new `allow` semantics and the todo `unsandboxed` screen.

**V:** `bun test tests/egc.test.ts` → 0 fail. Smoke: run a throwaway script that loads the EGC harness once per case (delete it afterwards).

### Success Criteria
- [ ] Enforce-mode todo inputs carrying an unsandboxed flag are blocked, while task text that mentions egc files still passes.
- [ ] Allow mode refuses unverified completion unless enforce-mode JEV with requirements provides falsification.
- [ ] Oversized or missing required files yield EGC REFUSED with a rejected assessment, and an ambiguous done target stages nothing.

## Phase 4: Advisor drain, applicability invariant, child-env secrets

**Files:** `src/advisor-native-budget.ts`, `src/advisor-protocol.ts`, `src/typesafe-child-env.cjs`, `tests/advisor-protocol.test.ts`, `tests/typesafe-child-env.test.ts`. Add `tests/advisor-native-budget.test.ts` only if no existing file tests `createAdvisorNativeBudget`.

**T:**
1. RT#9: fake `typesafe-policy-client` scheduler (inject via the module's existing seam; if there is none, add an optional `client` parameter to `createAdvisorNativeBudget` defaulting to the `createRequire` load). The scheduler starts the worker, then resolves `{ok:false, code:"aborted"}` on abort **without awaiting** the worker. The operation ignores its signal and never resolves. Expect `run()` to resolve within 1 s with `{ok:false, started:true}` and a code of `advisor_native_drain_timeout` or the scheduler code.
2. RT#12 in `tests/advisor-protocol.test.ts`, using the file's existing request builders:
   - Changing only `binding.provenance.dispatchId` gives the **same** `advisorApplicabilityDigest`.
   - Changing the contract revision in `binding` gives a **different** digest.
   - Changing `snapshot.treeDigest` gives a **different** digest.
3. RT#13 in `tests/typesafe-child-env.test.ts`:
   - (a) `GITHUB_TOKEN="ghp_" + 32 chars` appended to PATH → `UNSAFE_ALLOWED_VALUE`.
   - (b) `MY_SERVICE_SECRET` (16 chars) inside `TEMP` → `UNSAFE_ALLOWED_VALUE`.
   - (c) `CI_FLAG_TOKEN="1"` does **not** reject a PATH containing `1`.
   - (d) `createVerificationHome().environment("verification", src)` rejects case (a).

**I:**
1. `advisor-native-budget.ts:41`: replace with a race between `observed.promise.then(r => { observed.result = r; return "done"; }, () => "done")` and a timer of `Math.max(1, Math.min(250, (deadline ?? Date.now() + 250) - Date.now()))` ms resolving `"timeout"`. Clear the timer. On `"timeout"`, return `{ ok:false, code:"advisor_native_drain_timeout", started:true }`.
2. `advisor-protocol.ts:102`: add a doc comment stating the invariant: cross-dispatch reuse is permitted only for an identical binding (contract/revision/evidence/policy), snapshot, scope, criteria and prompt; dispatchId is excluded by design so turn boundaries don't discard genuine reviews. No logic change unless the T2 tests fail; if they fail, include the missing field.
3. `typesafe-child-env.cjs`:
   - Add `const NAMED_SECRETS = ["TYPESAFE_API_KEY","ANTHROPIC_API_KEY","OPENAI_API_KEY","GEMINI_API_KEY","GOOGLE_API_KEY","GITHUB_TOKEN","GH_TOKEN","CLAUDE_CODE_OAUTH_TOKEN"]` and `const SECRET_SUFFIX = /(?:_API_KEY|_SECRET|_TOKEN|_PASSWORD)$/i`.
   - Add `function collectSecrets(values)`: named entries with non-empty trimmed values, plus suffix matches with `trim().length >= 12`. Return deduped `[v, v.trim()]`.
   - Use it in `buildChildEnvironment` (`:41-42`) and `createVerificationHome().environment` (`:79-80`).
   - Set `policy().secretNames` to `NAMED_SECRETS`.

**V:** `bun test tests/advisor-protocol.test.ts tests/advisor-runtime.test.ts tests/typesafe-child-env.test.ts` plus the budget test → 0 fail.

### Success Criteria
- [ ] An abort-ignoring native operation can no longer hang run; it resolves within the bounded drain window.
- [ ] The applicability digest is stable across dispatch IDs and changes with contract revision or tree digest.
- [ ] Credential values from named or long suffix-matched variables are rejected in allowlisted values, while short flags are not.

## Phase 5: Telemetry count redaction

**Files:** `src/typesafe-redact.cjs`; tests in `tests/public-evidence-egress.test.ts`, or `tests/payload-safety.test.ts` if that is where `redactEvidenceState` is already exercised.

**T:** `redactEvidenceState` (via `require("../src/typesafe-api-client.cjs")`, matching existing usage):
- (a) `{usage:{input_tokens:10,output_tokens:3,total_tokens:13}}` keeps the numbers.
- (b) `{usage:{input_tokens:"sk-abcdefghijklmnop"}}` is still redacted.
- (c) `{api_token:12345678}` is still `[REDACTED:kv]`.
- (d) `{input_tokens:-1}` and `{input_tokens:1.5}` are still redacted.

(a) fails first.

**I:** in `src/typesafe-redact.cjs`, add `const TELEMETRY_COUNT_KEYS = new Set(["input_tokens","output_tokens","total_tokens","prompt_tokens","completion_tokens","cache_creation_input_tokens","cache_read_input_tokens"])` and `const isTelemetryCount = (k, v) => TELEMETRY_COUNT_KEYS.has(k) && Number.isSafeInteger(v) && v >= 0;`. In `redactDeep` `:94`, the condition becomes `kind && isWholesaleRedactable(v) && !isTelemetryCount(key, v)`. Telemetry counts then fall through to `redactDeep(v)`, which returns the number unchanged.

**V:** `bun test tests/public-evidence-egress.test.ts tests/payload-safety.test.ts tests/trusted-tool-policy.test.ts tests/typesafe-transport-retry.test.ts` → 0 fail.

### Success Criteria
- [ ] Non-negative integer token counts on exact telemetry keys survive public projection, while string, negative, fractional and other sensitive keys stay redacted.

## Phase 6: Full verification, live JEV, deploy and reconciliation

Preconditions: Phase 1–5 todos are `completed` in `todo view`. Do **not** restart OMP during this phase: a restart starts a new session, and `session_start` invalidates the bound contract and todo state (`typesafe-planner.ts:1437-1438`), so this todo could never close.

1. `bun test` (full suite) → 0 fail. Note totals and wall time for the Execution Log.
2. Live checks against the **currently loaded** runtime (log `status`, `resolvedModel`):
   - `typesafe_judge` with one `noul`, one `choice` and one `score` question. Expect HTTP 200, `resolvedModel` matching `jev-*` (record the exact value; `jev-1.14.0` was observed earlier), and valid structured answers. Don't expect numeric `usage` yet: the loaded runtime predates Phase 5 until the restart in §9.
   - `typesafe_rerank` (3 candidates) and `typesafe_evaluate_multi` (2 labels): valid structured answers.
   - `bun tools/jev-paired-eval.ts validate --protocol plans/261019-jev-atomic-review/evaluation/protocol.json` → exit 0.
3. `node tools/sync-baseline.cjs --dry-run`. If it reports a hash conflict on `global_claude/hooks/lib/typesafe-enabled-resolver.cjs` or `global_claude/mcp/typesafe/typesafe-api-client.cjs`:
   - Diff workspace vs target vs `~/.claude/...` and note the diff summary.
   - Ask the user before overwriting any `~/.claude` file.
   - Re-run the dry run until it is clean.
4. `node tools/sync-baseline.cjs` → `DEPLOYED_VERIFIED` (a backup dir is created automatically; deploys files only and does not reload the running session).
5. Close this todo now via §4.3 steps 3–7. Then confirm with `todo view`: 6/6 completed, 0 blocked, 0 pending. If any item isn't completed, follow §4.3/§4.5. Never drop it.
6. After `done` settles, write the Execution Log. Then update the related plan without hand-editing phase tables: `node "C:/Users/thant/.claude/skills/ck-plan/scripts/plan-cli.cjs" status "D:/100.Software/Github/omp_extension/plans/261019-research-to-cook-execution/plan.md"`. Add a dated note to that plan's Red Team table rows #3, #4, #5, #9, #10, #12, #13, #14 and #15: "Fixed by TYPESAFE_REVIEW_FIX_JEV_TEST_PLAN.md Phase N, commit <sha>". Do **not** run `plan-cli check` on its phases: their scopes are broader than these fixes.
7. Hand off to §9 (user restart).

### Success Criteria
- [ ] The full workspace suite passes with 0 failures, and live judge, rerank, multi-label and paired-eval validate checks succeed against the loaded runtime.
- [ ] The sync deploy reports DEPLOYED_VERIFIED for the workspace baseline.
- [ ] The Phase 1 through Phase 5 native todos are completed with no retained rejection debt.

## 5. Validation Log (auto mode, recommended options applied)

| # | Question | Decision | Rationale |
|---|---|---|---|
| V1 | Reuse caller `afterSnapshot`? | No | Invariant `src/evidence-collector.ts:177`; pinned by test `:494-497` |
| V2 | Sync vs async `taskkill` | Async, bounded, with fallback | Host event loop is shared |
| V3 | `allow` mode exemption | Only enforce-JEV + requirements | Keeps falsifiability |
| V4 | Todo-input screen scope | `unsandboxed` flag only | Todo tools write no files; avoids blocking normal task names |
| V5 | Secret min length | 12 chars for suffix-discovered | Prevents PATH DoS |
| V6 | Redact digest fields | Out of scope | Not an observed defect |
| V7 | Todo granularity | 1 per phase (6) | Each closure costs a full review chain; fewer obligations means less closure overhead |
| V8 | Gemini Advisor unsupported | Gate 0 + ask the user before agent-config change | No fake provider entry |

Verification results: 16 red-team findings, 16 accepted, 0 rejected, 0 unverified anchors (all cited lines re-read 2026-10-26). Bind-parse proven: `parseContractCriteria` returns criteria for all 6 phase headings. **Failed: 0.**

## 6. Out of Scope
Google/Gemini Advisor provider adapter; the broader phases of `plans/261019-research-to-cook-execution`; digest-field redaction; restructuring the sync transaction.

## 7. Final Report Template (Gemini fills it in)
```
✓ Gate 0: pass|fail (<missing capability>)
✓ Phase 1..6: <tests pass/fail counts, wall times before→after>
✓ Live: judge <status/model>, rerank, evaluate_multi, paired-eval validate
✓ Deploy: DEPLOYED_VERIFIED, backup <path>
✓ Todos: 6/6 completed, 0 blocked (before restart)
✓ After restart (§9): usage.input_tokens numeric = yes|no
```

## 8. Execution Log
Lives at `plans/reports/261026-typesafe-review-fix-execution-log.md` (see §0 item 6). Contents: Gate 0 result, per-phase baselines and after-timings, RT#15 normalisation evidence, live JEV results, deploy output, final `todo view`.

## 9. After Restart (manual, user; outside every todo)
Run only after Phase 6's `done` has settled and the Execution Log is written. The restart starts a new session with an empty native todo list, so nothing can be left open by it.
1. User restarts OMP so the deployed runtime (Phase 5 redaction fix) is loaded.
2. In the new session, without creating todos, run one `typesafe_judge` call (any single `noul` question). Expect `usage.input_tokens` to be a number, not `[REDACTED:kv]`.
3. Append the result to the Execution Log. If it is still redacted, check that `C:/Users/thant/Projects/omp_extension/src/typesafe-redact.cjs` contains `TELEMETRY_COUNT_KEYS` (deploy drift) before suspecting the fix, then open a new plan. Do not reopen this one.
