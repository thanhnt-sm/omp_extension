# RCA: task-bound Advisor refused with `advisor_public_reference_redaction_required` for unselected (and span-selected) packets

Date: 2026-11-11 · Agent: debugger · Mode: read-only (no src/tests edits) · Status: CONFIRMED

## Executive summary

- **Real, reproduced offline.** Default `typesafe_collect_evidence` (no `selections`) → `COLLECTED` → `typesafe_review_task` → `REVIEW_REQUIRED` → `typesafe_prepare_advisor` (task mode) returns `EVIDENCE_REQUIRED: Public source preparation prerequisite: advisor_public_reference_redaction_required`.
- **Production default path.** Planner returns no `nextActions` on `COLLECTED`; selections are only requested on `CURATION_REQUIRED`. So the happy path for every small task hits this. Even an empty diff fails (id = `diff:e3b0c442…b855`, sha256 of "").
- **Sibling latent bug (new finding):** span-based selections fail identically (`source:<p>:<sha>:lines:a-b:<spanDigest>`). Only full-file selections work, which is exactly the workaround in `tests/task-verification-approved-fixture.ts:26-34`.
- **Impact:** liveness, not safety. Fails closed; no approval leaks. But bicameral completion needs an Advisor receipt, so `todo done` is unreachable on the default path, and the refusal text ("use an explicit source-bound consultation") misdirects the agent.
- **Regression origin:** `validatePublicReferences` landed in `7064bb7` (2026-11-01). The `diff:<sha>` evidence id predates it (`278f380`, 2026-10-21). Tests missed it because advisor tests use hand-built packets with non-hex ids (`tests/advisor-fixtures.ts:32` → `source:src/public.ts:fixture`; `tests/egress-and-process-boundary.test.ts:31` → `ev-1`), never `buildJudgeEvidencePacket` output.
- **Priority:** P1 (blocks the primary completion flow).

## Evidence chain

1. `src/judge-evidence-packet.ts:132`: an unselected packet adds `diff:${digestBytes(evidence.gitDiff)}` to every obligation's `evidenceIds`. A span selection adds `...:lines:${s}-${e}:${span.digest}`.
2. `src/advisor-public-context.ts:42`: `evidenceRefs` is built from all `obligation.evidenceIds`.
3. `src/advisor-public-context.ts:17-23`, `validatePublicReferences`: masks only 64-hex values found in `authorizedFiles[].sha256` plus `generatedDigests` (task mode passes none, see `:44`). Any other 64-hex value stays raw and goes to `redactEvidenceState`.
4. `src/typesafe-redact-patterns.cjs` (`ENTROPY_CANDIDATE_RE`, `MIN_ENTROPY_RUN=32`, `HEX_ENTROPY_THRESHOLD=3.0`): a sha256 hex run scores about 3.9 bits/char, so it gets redacted. The redacted output then differs from the input digest, and `:22` throws `advisor_public_reference_redaction_required`.
5. `src/task-verification-advisor.ts:78` catches the error and turns it into the `EVIDENCE_REQUIRED` outcome above.
6. Planner path: `typesafe-planner.ts:1377-1392`. `selections` is optional, and `nextActions` is set only for `CURATION_REQUIRED`. `src/task-evidence-runtime.ts:232-243` returns `COLLECTED` for an unselected, complete single packet.

## Repro (scratch, outside repo, offline; `env -u TYPESAFE_API_KEY`)

`C:\Users\thant\AppData\Local\Temp\claude\38a656f0ed30b87e\32c66b2a-237f-4ed3-8212-f0b370b4104e\scratchpad\repro\repro-unselected-advisor.ts`
```
collected status ok: true coverageComplete: true packets: 1
packet scope (undefined = unselected): undefined
obligation evidenceIds[0]: [ "diff:e3b0c442...b855", "source:reports/cause.md:d206...", "artifact:reports/cause.md:d206..." ]
review status: REVIEW_REQUIRED
prepareReview(task) -> {"status":"EVIDENCE_REQUIRED","reasons":["Public source preparation prerequisite: advisor_public_reference_redaction_required. ..."]}
direct prepareAdvisorPublicContext THREW: advisor_public_reference_redaction_required
control (diff id removed): OK
```
`...\scratchpad\repro\repro-span-selection.ts`: full-file selection OK; spans `[{1,1}]` → THREW `advisor_public_reference_redaction_required`.

## Hypotheses tested

| # | Hypothesis | Result |
|---|---|---|
| H1 | `diff:<sha>` id not in the masked digest set, so the redactor flags it | CONFIRMED (control: stripping only that id → OK) |
| H2 | The refusal comes from the apiKey-substring or `^[a-f0-9]{64}$` check (`:19`) | ELIMINATED: the digest list holds only authorized file sha's, all valid; the throw is at `:22` (redactor delta) |
| H3 | Production always selects, so low severity | ELIMINATED: no selection on the `COLLECTED` path; selections only follow `CURATION_REQUIRED` |
| H4 | Only the diff id is affected | ELIMINATED: span digests fail the same way (repro 2) |

## Fix options (tighten-only, redactor untouched)

**A (recommended): register host-recomputed packet digests through the existing `generatedDigests` channel.** Precedent: consultation already passes `[questionDigest]` (`advisor-public-context.ts:82`).
- In `src/advisor-public-context.ts`, add a helper and pass its result as the 4th argument at `:44`:
```ts
import { createHash } from "node:crypto";
const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
/** Only digests the host recomputes from content the packet already carries; caller hex stays unmasked. */
function hostRecomputedPacketDigests(packet: JudgeEvidencePacket, manifest?: EvidencePacketSetManifest): string[] {
  const out: string[] = [];
  if (!packet.scope) { const d = sha256Hex(packet.diff); if (!manifest || manifest.diff.digest === d) out.push(d); }
  for (const item of packet.source) for (const span of item.spans ?? []) if (sha256Hex(span.text) === span.digest) out.push(span.digest);
  return out;
}
// :44
validatePublicReferences(client, { authorizedFiles, evidenceRefs }, { apiKey: ..., homeDirs: ... }, hostRecomputedPacketDigests(packet, options.evidenceManifest));
```
- Why this is tighten-only:
  - The redactor is unchanged.
  - The `^[a-f0-9]{64}$` and apiKey-substring checks still apply to the new digests.
  - A digest is masked only when the host recomputes it from the packet's own `diff` or `span.text`, and the diff digest must also match the host-built manifest.
  - Any forged or injected hex still trips the redactor.
  - The sha256 stays verbatim in `evidenceRefs`/`criterionCoverage`, so identity binding is preserved.
  - Packet shape and digests are unchanged, so M packets and stored receipts are unaffected.
- `digestBytes` (`src/evidence-workspace.ts`) can replace `sha256Hex` if importing it adds no cycle. Both compute utf8 sha256 hex.
- Verified in a scratch-patched copy (`...\scratchpad\repro\patched-advisor-public-context.ts`): both repros now pass.

**B (not recommended): fixed, redaction-safe ids** such as `diff:unified` / `source:<p>:<sha>:lines:a-b` (the `ui_visual_evidence` fixed-key precedent). This drops the sha256 from the obligation id, which weakens identity binding against what the brief requires. It also changes `canonicalDigest(packet)`, which invalidates existing packet/receipt digests, and it touches the M path. Reject.

**C (insufficient): omit the diff id when the diff is empty.** This leaves non-empty diffs and spans broken.

## Files and lines to change

- `src/advisor-public-context.ts`: add `node:crypto` import and helper near `:16`; change call at `:44`.
- `tests/task-verification-approved-fixture.ts:26-34`: once fixed, drop the re-collect workaround, or keep it and add a dedicated test below. Update the comment either way.

## Tests to add (new file `tests/advisor-public-reference-packet-digests.test.ts`, offline, uses `readonlyVerificationFixture`)

1. Default unselected collection → `runtime.review` → `advisorServices.prepareReview(target, ctx, "task")` returns a draft (no `status`), and `draft.evidenceRefs` contains `diff:${manifest.diff.digest}` verbatim.
2. Span selection (`spans:[{startLine:1,endLine:1}]`) → `prepareAdvisorPublicContext` succeeds, and the evidenceRef keeps `:lines:1-1:<spanDigest>`.
3. Negative (tighten-only proof): a cloned unselected packet with an obligation id `diff:<random 64-hex ≠ sha256(packet.diff)>` → throws `advisor_public_reference_redaction_required`.
4. Negative: span with tampered `digest` (≠ sha256(text)) → throws.
5. Negative: `apiKey` set to the diff digest → throws (the existing `:19` check still applies to generated digests).
- Regression watch: `tests/anti-blocking-middleware.test.ts:160-161` expects `EVIDENCE_REQUIRED` for task mode without review state. It must stay red for that reason (`!state`), not this one.

## Prevention

- Advisor tests should use packets from `buildJudgeEvidencePacket`, not hand-built fixtures with non-hex ids. The coverage gap is exactly why `7064bb7` shipped this.
- Every new evidence-id format carrying a digest must state how the advisor public-reference check authorizes it. Add a note next to the id construction at `judge-evidence-packet.ts:132`.

## Unresolved questions

- `integrationReceipts[].receiptId` also enters `evidenceRefs` (`:41-42`). If a production receiptId is ≥32 chars of high-entropy text (for example a raw sha256 or base64 id), the same refusal would occur for `parent_review`. I did not check this; check the receiptId format.
- `state.evidence_packet` (`:39`) is redacted for display, so file sha's and the diff digest show as redacted inside `state` while `authorizedFiles`/`evidenceRefs` show them raw. This is cosmetic for the Advisor and outside this fix.
