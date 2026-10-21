---
phase: 2
title: "Repair task evidence and receipt fidelity"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Repair task evidence and receipt fidelity

## Overview
Produce actual task-relative content evidence and trusted verification receipts shared by native/advisory callers. Cover C04–C08/C12/C18/C22/C30 and RECOVERY-SEC-03. Reuse the working F16 applicability/delivery behavior; do not increase caps or rewrite real artifacts to obtain approval.

## Requirements
- Dirty tracked preimages, clean tracked blobs, staged edits, untracked creation/deletion/revert and all task commits must be attributed truthfully. Filtering filenames around `git diff HEAD` is not a task-relative delta.
- Capture the evaluated tree after approved tests run; source changes during verification/JEV must invalidate stale evidence, not disappear through an earlier changed-file list.
- Native todo schema stays unchanged. Do not read invented native `testCommand`, `requirements` or `planPath` fields. Bind approved plan criteria and real test receipts through phase1 contracts/project tools.
- Research/docs/non-git work may prove completion without code diffs/default tests. Git error text, mtime or an agent saying tests passed is not evidence.
- Every budget/omission and provenance limitation is explicit; missing mandatory proof is EVIDENCE_REQUIRED, not model judgment about a different task.
- Preserve the original review/docs purpose when source/config is inspected or changed by separately authorized work. Use trusted task-bound mutation receipts/allowed scope; unrelated and unattributed deltas remain explicit counterevidence, not silently hidden. A repository-wide code/JSON extension cannot itself convert review acceptance into implementing findings; unauthorized source mutation remains blocking. Unknown bindings stay conservative, never agent-controlled research exemptions.
- **F17 privacy prerequisite:** exclude private thinking/reasoning/analysis blocks at the original typed context projection, before concatenation, logs/receipts or outgoing state. Admit only supported public text/tool-intent/result evidence; preserve useful public proof. Ambiguous private material is not exported. Never try to remove private reasoning by lexical regex after mixing it with evidence. Current native remote judgment through the unsafe collector must not be invoked until a verified safe implementation is active.

## Architecture
Extend existing collector with versioned baseline records and a single `EvidenceSnapshot`/`VerificationReceipt` contract. Clean tracked content references the pinned Git tree; dirty/untracked preimages require immutable owned content plus digest. Use bounded private host-owned storage for necessary preimages, not committed snapshots or unbounded copies of the entire repository. Bound file/count/total bytes by trusted host policy; never pretend omitted bytes were captured.

A project-owned `typesafe_collect_evidence` tool may execute only verification command IDs bound to the approved task contract, outside the22-second native gate. It reuses the real command runner and records cwd, actual command, exit/status, source/test tree identity, artifact/output digest, timestamps and task/criterion applicability in host-owned history. It does not invoke JEV or grant native completion. Native `done` consumes a current applicable receipt; the existing explicit verifier remains advisory and shares preparation.

`EvidencePacket` uses named data fields, criterion/source spans, current content and counterevidence. A digest identifies bytes, not semantic correctness or permission. Preserve raw relevant proof rather than signature-only or LLM summaries; fail explicitly if mandatory evidence cannot fit. Keep vendor32MiB input limit distinct from this client's32KiB policy and the4940-byte artifact budget.

Follow-up source evidence: deployed `collectConversationContext` includes assistant thinking; a synthetic-marker-only actual-helper/production-preparation probe retained it in both projected and prepared state with zero network/native operations. See `plans/reports/261019-private-context-export-evidence.json`. No historical private transmission is asserted. Replace the unsafe incidental thinking-inclusion expectation in `tests/bicameral-consensus.test.ts:416-458` with meaningful final-egress exclusion and positive public-evidence preservation; do not alter task6's existing diagnostic assertions to obtain approval.

## Related Code Files
- Modify: `D:/100.Software/Github/omp_extension/src/evidence-collector.ts` — baseline/preimages, full commit interval, post-test collection, non-git evidence.
- Create: `D:/100.Software/Github/omp_extension/src/verification-receipt.ts` — command/artifact receipt creation, binding and freshness validation.
- Create: `D:/100.Software/Github/omp_extension/src/judge-evidence-packet.ts` — shared typed evidence projection and omission accounting.
- Modify: `D:/100.Software/Github/omp_extension/typesafe-planner.ts` — project evidence tool and native consumers; one integration owner.
- Modify: `D:/100.Software/Github/omp_extension/src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `src/payload-safety.ts` — shared applicability/preparation, no second semantic authority path.
- Extend: `D:/100.Software/Github/omp_extension/tests/evidence-collector.test.ts`, `tests/judge-input-fidelity.test.ts`, `tests/payload-safety.test.ts`, `tests/task-artifact-routing.test.ts`, and focused new receipt behavior tests.

## Implementation Steps
1. Inventory/export references and freeze the baseline/receipt shape from phase1. Bind task start to a real source snapshot; record provenance and ancestry. If an older baseline lacks bytes, report that specific gap—do not invent a new historical baseline or erase existing debt.
2. Capture immutable dirty/untracked preimages and clean Git references. Diff against those bytes and the complete baseline→evaluated commit interval, including multiple commits and dirty endpoint changes. Use existing Git execution facilities; do not implement another diff parser/framework.
3. Implement delete/revert/untracked and valid-empty-baseline handling without including unrelated pre-task WIP hunks. Bound private storage, preserve confidentiality, and remove retained content only when its owning contract is legitimately closed or retention is explicitly expired/reported.
4. Implement real verification collection through the approved command/tool path. Match actual command/cwd/task/source/test identities; reject echo-only, foreign, failed, stale or partial receipts. Long tests run outside native preflight. No default test for a research task and no command from a model-authored arbitrary policy.
5. Capture after tests, then revalidate relevant file/tree identities before semantic evaluation and staging. Detect files created/modified by tests and during a pending judge. At native result, validate available host preconditions and receipt identity; document the remaining filesystem/native atomicity window rather than promise impossible rollback.
6. Implement non-git collection using genuine bound host operation/artifact/test evidence. Distinguish supported non-git scope from Git command failure; no fake empty-diff success or mtime-only attestation.
7. Replace rolling user/worklog text as the authoritative contract input. Pass actual explicit plan/phase criteria through shared preparation. Keep source text untrusted; preserve omitted/counterevidence information and original parent obligations.
8. Align native/advisory/plan/expert packet preparation and local byte accounting, preserving redaction and F16 full mandatory proof. Test/prod wrappers must not silently use different limits or amputate required criteria/test/artifact evidence.
9. Populate per-target result/report evidence through the actual native consumer rather than only adding formatter fields. Phase3 supplies final outcome taxonomy and phase9 migrates every remaining caller.

## Success Criteria
- [ ] Same-file pre-task WIP is excluded while both task commits and genuine dirty endpoint changes remain visible.
- [ ] New/deleted/reverted/untracked files and valid-empty baselines retain correct scope without fabricated history.
- [ ] A test modifying a second tracked file cannot hide it from deterministic safety or semantic evidence.
- [ ] Failed/foreign/stale receipts and modifications during the request cannot authorize completion; real current receipts do apply.
- [ ] Research/docs/non-git tasks receive relevant criteria/evidence without invented code/test obligations.
- [ ] Native/advisory consumers agree on the same bound packet; relevant tail proof and omission/error distinctions survive actual final preparation.
- [ ] Full F16 regressions remain meaningful; no report deletion, cap increase, weaker test or confidence fallback obtains a pass.

## Verification
Use actual temporary Git projects for dirty-preimage, two-commit, delete/revert, test-created-file and concurrent-change transitions; use a genuine non-git directory for that lane. Exercise the registered evidence tool and native callback, not just a mock that echoes fields. Parent runs complete affected evidence/input/payload/native modules, separate changed-path smoke, then full `bun test` at integrated readiness. Never re-pin wording or duplicate same-path test rows.

## Risk Assessment
Preimages and command output may contain secrets. Retain minimally with host-owned access controls, redact only before allowed egress and never store user thinking. Raw baseline bytes are not a model prompt. Phase4 completes shared child environment and real-target file authorization; these requirements must be integrated before any new live evaluation/export.
