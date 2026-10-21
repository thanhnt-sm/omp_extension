# Phase 2 source provenance

## Scope and identity boundary

This is a read-only trace of workspace source, not proof of the modules loaded by a historical or current OMP host. The frozen corpus contains no persisted TypeSafe evaluation event and no runtime-origin/`typesafe-health` record. Workspace search found no runtime-origin manifest. The existing runtime-promotion phase also records that promotion remains pending until an external immutable-pointer repair, supervised deployment, host restart, and live origin record. Therefore deployed module identity, bundle identity, loaded-memory identity, runtime fingerprint, and historical version are **unknown**. No global trampoline or deployed target was inspected or changed as a substitute for that evidence.

## Source snapshots

A pre-change local hash snapshot was taken during this forensic run after the cohort cutoff and before the later source changes visible at `2026-10-18T08:20:31Z`. The tool did not expose an exact wall-clock timestamp for that first hash command; its bounded read interval is `(2026-10-18T08:12:11.928658Z, 2026-10-18T08:20:31Z]`. This is more precise than inventing a timestamp. The current hashes below were read at `2026-10-18T08:20:31Z`.

| module | pre-change local SHA-256 | current local SHA-256 | interpretation |
|---|---|---|---|
| `typesafe-planner.ts` | `ff79eee017fcf95341a000f7a4f09bd4251a568a1b2b96fe543a23f48acb49c0` | `c69a85b951098fc1940d0e6a8ab7d1d216f2d13e2c6df65caddd99c2487df165` | local source changed; no runtime attribution |
| `src/cook-expert-judge.ts` | `82e818b214f70b2de59ae28e76622e515ec746cd1fec54e64b43d3ca9818718b` | `196b107f01021c6bfdaf5de0902d8258ff4ff36e2a5a19616193fdef6222b0db` | local source changed; no runtime attribution |
| `src/evidence-collector.ts` | `f67b27bd232ce88bd37e95b8fae9c466591aa0697bbba3d985868dc0ae886d04` | `324c0372cdd70a6ba5938e6a3dd43f3ae5be4aeeace7af22682d43a2c23b7ef6` | local source changed; no runtime attribution |
| `src/bicameral-consensus.ts` | `732877fc0a8863cd60509a1f59a4e9783321775660640766fad416728e81f3bc` | `732877fc0a8863cd60509a1f59a4e9783321775660640766fad416728e81f3bc` | unchanged local source |
| `src/verification-gate.ts` | `6affd6ffc6de1e2bb4eec59d2a00f004fff8eee51aeaed9c65b8bc9fa488b465` | `1391445166654a69c03f3eaf9d3b14a4294618ef79ad4a4b3c403ee1dbfc9227` | local source changed; no runtime attribution |
| `src/payload-safety.ts` | `3aab4c0008c30668da4b0efd94eb791596712565459fbf04022bb92eb066f58a` | `3aab4c0008c30668da4b0efd94eb791596712565459fbf04022bb92eb066f58a` | unchanged local source |
| `src/typesafe-redact-patterns.cjs` | `5fda466c847cd0b5e60b79e1188a113ab2dc20430a694f96b279d4401c207409` | `5fda466c847cd0b5e60b79e1188a113ab2dc20430a694f96b279d4401c207409` | unchanged local source |
| `src/typesafe-redact.cjs` | `7895ca45141e29869ff1802ae7bca045cbcefc624c6cb14af60e2eecda87d548` | `7895ca45141e29869ff1802ae7bca045cbcefc624c6cb14af60e2eecda87d548` | unchanged local source |


## Current workspace source trace

### Native done path

1. **Caller and early exits:** `typesafe-planner.ts` snapshots the workspace, enters native verification only for `done` with affected tasks and without verified host authorization. For each target it collects evidence and runs `runTaskMicroCheck`. A failed Gate 1 invokes the cancellation path; a missing API key or disabled resolver also invokes cancellation. Consequently, a host-authorized bypass or Gate 1 failure does not prove any Gate 2 request.
2. **Evidence:** `collectTaskEvidence` receives a task baseline when available and otherwise uses full working-tree evidence. With a baseline it derives `changedFiles`, status and tracked/untracked diff; without one it uses `git status` and `git diff HEAD`, with a fallback to the most recent commit. It optionally reads plan criteria. `changedFiles` and `gitDiff` are independent channels: missing changed-file data does not establish that no markdown/diff evidence exists.
3. **Prompt and advertised scope:** native macro invocation passes `todoTask`, filtered explicit `params.requirements`, git status as `diffSummary`, git diff as `unifiedDiff`, test summary, task type `code_change`, conversation context, and `collectDeliverableArtifacts(projectDir)` **without** passing `changedFiles`. The artifact helper only includes changed markdown-like files when it is supplied such a list, so this native call's dedicated artifact string is empty; markdown may still exist in `unifiedDiff`. It also omits `diffScope` and `planPath`. The macro helper defaults absent `diffScope` to the advertised `full-working-tree`; that advertised field is not proof of the collector's actual baseline choice. Explicit `params.requirements` is not plan-file criteria.
4. **Sanitizer and transport:** macro state is XML-enclosed/clamped, then the judge client calls `preparePayloadSafe`. That pipeline rejects secret round-trip keys, scrubs credential-shaped fields and strings, reserves JSON headroom and caps payload values. The CJS client validates request shape, runs the same payload preparation with a 32,768-byte final body limit, sends POST to the TypeSafe endpoint, and sanitizes returned answers to permitted primitive/choice fields. Source caps prove possible controls, not historical input truncation; no persisted wire stage exists in this corpus.
5. **Primitive parser and policy:** macro `meets_criteria` is a `noul` probability only when finite in `[0,1]`; `deliverables_verdict`, drift and scope are separately parsed. `resolveAutoApprovalThreshold` defaults to `0.50`, normalizes percent input, and compares `>` at the exact default but `>=` for a configured threshold. Missing historical threshold/comparison is unknown. A Gate 1 refusal is nonnumeric local evidence, not a JEV score.
6. **Final authority:** `runBicameralMacroCheck` starts with Advisor heuristic state, awaits macro JEV, may mutate Advisor confidence or verdict, derives a consensus decision, and returns `macroResult`. The native caller gates on `macro.macroResult.approved`, not the returned consensus verdict. On failed macro result it invokes cancellation and records remediation metadata. The subsequent native proposed report has `approved: true`, `decidedBy: authorizationProvenance`, empty reasons, and no score fields. Thus a current score-bearing historical report requires a distinct emission path/version or remains unattributed.

### Advisor state and mutation

`evaluateAdvisorIntent` ranks options heuristically, using its own option scores and confidence. `runBicameralMacroCheck` can subsequently reweight confidence for an approved JEV score or rewrite the Advisor state to `DISALLOW` following a reject. Other consensus paths can promote an Advisor option and confidence from JEV recommendation/clarity. An archived Advisor record must therefore identify pre-JEV, post-JEV, or unknown state; source structure alone does not make them comparable observations.

## Attribution rule

No archived event is attributed to this source snapshot. Current filesystem equality, timestamps, commit windows, or overlapping message prose are not proof of a loaded module or historical payload. A future attribution requires a persisted runtime-origin record covering the imported/bundled modules and a structurally anchored event with the relevant route and primitive.
