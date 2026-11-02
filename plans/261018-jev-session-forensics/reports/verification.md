---
title: "Phase 1 verification"
status: completed
---
# Phase 1 verification

## Frozen cohort

- Cutoff: `2026-10-18T08:12:11.928658Z`.
- Discovery used `archive.projects(limit=500, silent=True)`, then `archive.sessions(project=<path>, limit=500, silent=True)` for every returned workspace. API ordering is documented newest-first.
- Fourteen workspaces reported 89 sessions; the API returned 82. No listing reached 500. Seven API-reported sessions were not returned, so that limitation is explicit in `cohort-manifest.json`.
- The archive metadata marked 80 returned sessions as zero-message and they were excluded. No independently identifiable current investigation session was present among the two non-empty candidates; zero-message entries were excluded regardless. Two stable, non-empty sessions were selected (both below the per-workspace cap of 15).
- Representative selected JSONL records were read structurally before adapter implementation: line 1 `title`, line 2 `session`, then configuration records; observed activity uses `message` and `custom` records, including `customType: tool_execution_start` with `data.toolCallId` and `data.toolName`. Titles, messages, tool arguments, and raw results are not exported.

## Disposable harness TDD

Harness retained for the Phase 3 check requested by the assignment: `C:/Users/thant/AppData/Local/Temp/jev-forensics-vt75ER`.

1. RED command:
   ```text
   node --test C:/Users/thant/AppData/Local/Temp/jev-forensics-vt75ER/forensics.test.mjs
   ```
   Observed failure: `ERR_MODULE_NOT_FOUND` for the intentionally absent `forensics.mjs`; the suite had not been implemented. This was a real fixture RED, not a production failure.
2. GREEN command:
   ```text
   node --test C:/Users/thant/AppData/Local/Temp/jev-forensics-vt75ER/forensics.test.mjs
   ```
   Observed: 9 tests passed, 0 failed. Fixtures cover structural request/result anchoring, Gate 1 versus Gate 2, prose non-detection, missing/timeout/compacted results, composite identities and duplicate delivery, malformed JSONL accounting, threshold boundary unknown, privacy/redaction, and direct/contextual/unmatched pairing.
3. Corpus commands, each observed successful:
   ```text
   node C:/Users/thant/AppData/Local/Temp/jev-forensics-vt75ER/forensics.mjs --manifest D:/100.Software/Github/omp_extension/plans/261018-jev-session-forensics/reports/cohort-manifest.json --out D:/100.Software/Github/omp_extension/plans/261018-jev-session-forensics/reports
   ```
   Both runs reported identical sanitized identity list `[]` and identical accounting: 2 selected/stable files, 1,198 physical and parsed records, 0 parse errors, 0 included events, 0 duplicates, 0 unresolved events.

## Privacy and integrity

- The harness imports the existing pure CJS `redactString` helper from `src/typesafe-redact-patterns.cjs`; it additionally applies the three Anthropic/session patterns defined in `redactAnthropicSecrets` so fixture coverage is not weaker than that helper. It uses allowlisted structural fields only and aliases task identities.
- The privacy fixture confirmed that both a credential-shaped sentinel and private fixture prose are absent from exported data and errors; test output did not reveal either literal.
- Selected archive SHA-256 values matched the manifest before parse, after each parse, and after the second run. They remain: `32eb94188ee7954cf0afee3958ef5287699228131009d1b580b206b66ca327b0` and `55a69e2b2df59f5172573e110d036032e7b4fa60cca0c5c366bff9fb92a7c421`.
- Raw archive files were read only. No production test, build, sync, runtime edit, deployment, configuration write, external API replay, or installation was run.

## Limit

The two selected transcripts contained no structurally explicit recognized TypeSafe evaluation request/result records. This is a zero-observation corpus result, not evidence that no historical evaluation happened through any unpersisted or differently shaped route. Phase 2 direct-pair rate is consequently N/A rather than zero.
