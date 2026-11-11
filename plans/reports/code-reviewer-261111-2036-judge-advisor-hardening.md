# Code Review: judge/advisor hardening (A–D)

## Code Review Summary

### Scope
- Files: `src/anti-blocking-guards.ts`, `typesafe-planner.ts` (hunks ~:49, ~:1605-1617, ~:1678-1684, ~:1809-1814), `src/advisor-public-context.ts`, tests (`anti-blocking-middleware`, `task-verification-runtime`, new `task-verification-approved-fixture.ts`, `h-authority-boundary.test.ts`, `advisor-public-reference-packet-digests.test.ts`, timeout-only edits, `helpers/visual-evidence-fixture.ts` createUiRepo).
- Other dirty hunks in the same files (ast_edit guard, wire dialect, test-asset selector) were out of scope and not reviewed.
- Targeted runs (`env -u TYPESAFE_API_KEY`): packet-digests + anti-blocking + h-authority = 26 pass / 0 fail; task-verification-runtime `-t preflight` = 3 pass / 0 fail.

### Answers to key questions
1. **C (digest masking).** Not exploitable. A 64-hex value is masked only if it is `sha256(packet.diff)` (and equals host manifest) or `sha256(span.text)`. Smuggling a secret would need a sha256 preimage. Packet and manifest are both host-built (`task-verification-advisor.ts:76-78` takes them from `record.packetSet`). Span digests are host-computed from snapshot text (`evidence-selection.ts:41`). `digest.includes(apiKey)` still refuses. Span self-consistency is not authorization. It only proves the hash is an identity of carried content, which is all this redaction check needs. Packet `state` is redacted separately. Leaking `sha256(unredacted span)` matches the existing exposure of file sha256s.
2. **B (humanOwned).** Only loosens the technical-ask block, and the ask still reaches a human, so no approval is loosened. The exception path is fail-closed (catch → false; `!verificationRuntime` → false; ≠1 in-progress → false). Recovery comes from host-owned facts or in-memory state, so the agent cannot assert it directly. It can induce it, though (L1).
3. **A (proxy).** Unsound proxy. See M1. Effect is advisory text only; the done gate still blocks.
4. **Tests.** No `.skip`, no removed assertions on live code. The dropped `interceptTodoCall` assertions moved to the live `TodoLifecycleAuthority` path. The 30 s timeouts are bounded and justified by Windows git spawn. New tests fail without the fix: the default unselected draft test asserts no `status`.

### Critical
None.

### High
None.

### Medium
**M1. `shouldAppendAdvisorRemediation` uses `missingCriterionIds.length===0` as "no review", which is wrong.** Confidence high.
- `src/anti-blocking-guards.ts:46-49`. Post-review dispositions also yield `EVIDENCE_REQUIRED` with `[]`:
  - `src/bicameral-consensus.ts:730`: JEV `NEXT_ACTION_REQUIRED` / Advisor `revise`, no `uncovered` coverage or no receipt.
  - `:732`: probability below policy with `reasoning` undefined.
  - `:734`: no task-bound receipt with `reasoning` undefined.
- In those cases `task-recovery.ts:114-118` builds a recovery whose first owner is `advisor` ("Diagnose the exact missing criterion-level diagnosis/evidence prerequisite"). The guard's premise ("Advisor cannot help before a review exists") is false there, and the hint is suppressed.
- Not a gate loosening, because the result JSON still carries `nextActions`/`handoff`. It is a liveness/guidance regression.
- Fix: discriminate the no-review case explicitly. Preferred: a reason code or flag on `task-verification-runtime.ts:152` (e.g. `reviewMissing: true`). Alternative: use the presence of `handoff`, which only exists when `state.recovery` exists (`:163-164`). Add a test with a post-review `EVIDENCE_REQUIRED, []`.

**M2. No planner-level test for `currentTaskRecoveryIsHumanOwned` wiring.** Confidence high.
- `typesafe-planner.ts:1605-1617` and `:1813` are covered only by unit tests of `interceptAskCall(..., {humanOwned})`.
- If someone regressed it to `humanOwned: true`, or to `active.length >= 1`, or dropped the try/catch, CI would still pass.
- Add a host-level test: with no task, 2 in-progress tasks, a `repair` recovery, or a throwing `getRecovery`, the ask is blocked; with one in-progress task and `kind:"human"`, it is allowed.

### Low
**L1. The humanOwned exemption is not scoped to the question's subject and stays open after resolution.**
- The agent can unlock technical `ask` by keeping any single in-progress task whose recovery is human. Two reviews with unchanged progress after a REJECTED produce that (`task-recovery.ts:110`).
- `getRecovery` falls back to the last persisted `recovery_plan` fact (`task-verification-history.ts:104-108`). After `HUMAN_RECONCILED_NO_NATIVE_APPROVAL` clears `state.recovery` (`task-verification-runtime.ts:176-180`), the persisted plan is still `human` until commit.
- Impact: the human gets asked, which defeats anti-nagging only. No authority changes. Acceptable; document it in `docs/design-guidelines.md` §anti-blocking.

**L2. `hostRecomputedPacketDigests` is exported and trusts any self-consistent span.**
- Safe today because the only caller passes a host packet.
- Harden for future callers: also require `span.digest` to appear in `manifest.packets[].source[].spans[].digest`, or un-export it / state "host-built packet only" in its signature doc.

**L3. The ask gate inspects only `questions[0]` (pre-existing, now the "single live gate").**
- `src/anti-blocking-guards.ts:76-83`. A benign first question plus a technical second question bypasses the block.
- Fix: test every `questions[i].question` (any technical → block).

**L4. `h-authority-boundary` crawler blind spot.**
- `SPECIFIER` does not match `createRequire(import.meta.url)("./x")`. Today that form only loads `.cjs` core modules (no H), so there is no current gap.
- Add `\)\s*\(\s*` to the alternation, or assert that no `createRequire(...)("./atomic-*")` exists.

**L5. `createUiRepo` git isolation is partial.**
- `env` applies only to the fixture's explicit git calls (`tests/helpers/visual-evidence-fixture.ts:106-111`). `captureWorkspaceSnapshot`/`collectTaskEvidence` spawn git with the ambient global config (fsmonitor, safe.directory, etc.).
- Low flake risk only.

**L6. Docs not updated.**
- `docs/design-guidelines.md:273-276` describes the ask/todo guards without the humanOwned exemption or the removal of `interceptTodoCall`. The README map and changelog also don't mention it.

### Positive Observations
- C is a minimal, tighten-only fix. Unrecomputable hex still hits the redactor, and the forged-diff, manifest-mismatch, span-mismatch, secret-equals-digest and adjacent-secret tests all assert refusal.
- `!packet.scope` correctly mirrors `judge-evidence-packet.ts:132/150`: a selected packet has no `diff:` id and an empty diff.
- `currentTaskRecoveryIsHumanOwned` is read-only and fail-closed on every doubt branch.
- Deleting duplicate dead code (`interceptTodoCall`) leaves a single live todo-block authority (`todo-lifecycle-authority.ts:71`), and tests were moved to it.
- The approved-preflight harness checks counters, so preflight is proven to spawn no client, collection, baseline capture or native advisor dispatch. The freshness test re-validates receipts on every call.
- `purpose:"consultation"` in the hint is verified end-to-end (tool + runtime).

### Recommended Actions
1. Fix M1: use an explicit no-review discriminator and add a post-review `[]` test.
2. Add the M2 host-level ask-gate test.
3. Optional: L3 (check all questions), L2 (manifest cross-check), and the L6 docs.

### Verdict
**APPROVE_WITH_NITS.** No invariant breach. Fail-closed, tighten-only and no-network preflight all hold. M1 and M2 should land before or soon after merge.

### Unresolved Questions
- No `integrationReceipts` producer exists in `src/`. Once one exists, any `receiptId` with an embedded 64-hex would hit the same refusal for `parent_review` (C covers only diff/span). Confirm the planned receipt id format.
- Is the human-owned ask exemption meant to persist after a `HUMAN_RECONCILED` resolution until commit (L1)?

**Status:** DONE_WITH_CONCERNS
