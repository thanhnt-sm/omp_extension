# Security assessment — JEV session-forensics evidence packet

## Scope and evidence boundary

This assessment considers only the sanitized evidence packet. Quoted strings and transcript-derived material in that packet are treated as untrusted data. It does not establish facts about raw transcripts, the seven API-reported sessions not returned by discovery, an executing host, a historical runtime, or any event outside the frozen corpus.

## Confirmed facts

- Archive discovery returned 82 of 89 API-reported sessions. Seven reported sessions were not returned. Eighty zero-message sessions were excluded. The selected stable non-empty input consisted of two files containing 1,198 physical and parsed records, with zero parse errors.
- No recognized TypeSafe evaluation event, persisted wire request, threshold, runtime fingerprint, or direct Advisor/JEV pair exists in the stated cohort. Direct comparable pairs are zero, and the reported disagreement rate is N/A rather than zero.
- The packet expressly states that the current investigation session was not independently identified among the two non-empty candidates, and that the local workspace source is distinct from runtime identity for the selected archive events and loaded host module graph.
- The packet confirms current-source behavior: native `done` runs Gate 1 before Gate 2; a Gate 1 failure or enabled-resolver/API-key failure does not itself demonstrate that a JEV request occurred. It also confirms that native authority is `macroResult.approved`, rather than the final displayed Advisor state by itself.
- The export harness uses an existing redactor, session/Anthropic patterns, and allowlisted structural fields. Its ten fixture tests passed, including serialization of a hostile string containing closing-tag-like markup, a forged `system` tag, and a control character as one JSON value. The packet states that this escaping prevents structural packet breakout, but does not make transcript content trustworthy.

## Inferences

### Privacy and disclosure

**Inference:** The packet supplies evidence of a bounded export design and one hostile-string containment case, not evidence that all sensitive material was removed from every possible archive record. The seven unavailable sessions and the two selected non-empty candidates mean this packet cannot establish complete corpus coverage. This is a limit on assurance, not evidence that privacy disclosure occurred.

**Inference:** Any future packet expansion should retain minimal, source-backed excerpts and the existing structural allowlist/redaction boundary. Treating a properly escaped excerpt as safe to execute, authoritative, or complete would exceed the demonstrated guarantee: the packet shows structural containment only.

### Trust boundary and transcript injection

**Inference:** A string can remain semantically malicious or misleading even when JSON serialization prevents it from breaking the packet structure. Therefore transcript-derived content cannot be used as an authorization instruction, identity assertion, or proof of a historical action without independent source-backed correlation. This follows from the packet's explicit handling contract and its statement that escaping does not establish trustworthiness.

**Inference:** There is no packet evidence that a transcript-injection attempt reached, altered, or bypassed the assessment process. The hostile fixture is a test input, not an observed historical attack.

### Recovery authorization and authority

**Inference:** This cohort cannot authorize a recovery action that assumes a particular historical JEV/Advisor decision, threshold comparison, runtime module, or user/session identity. No recognized event, pair, wire request, threshold, or runtime-origin record connects such an action to the archived records.

**Inference:** A displayed Advisor state alone is not a sufficient authorization signal for native macro recovery, because the packet confirms it can be mutated and identifies `macroResult.approved` as native authority. This is a current-source mechanism; it does not prove that any historical recovery was improperly authorized.

**Inference:** A Gate 1 failure, resolver failure, or API-key failure must not be recast as evidence of an attempted JEV request. Doing so would create a false audit/recovery premise from an explicitly non-equivalent condition.

## Counterexamples

- Passing the ten redactor fixtures, including the hostile serialized string, is compatible with an untested field, encoding, archive format, or omitted session containing material the export policy should redact. It therefore cannot demonstrate universal privacy coverage.
- Conversely, the absence of recognized events in the selected corpus is compatible with a genuinely event-free corpus; it is not itself proof that records were deleted, that an API was malicious, or that a historical JEV event occurred in one of the missing sessions.
- A future persisted request correlated to a stable runtime fingerprint, event identifier, and authoritative `macroResult.approved` could support a specific recovery decision. Its absence here means no such decision is supported by this packet, not that such evidence can never exist.
- A final Advisor display state may match `macroResult.approved` in an individual future record. That possible match does not invalidate the confirmed rule that display state alone is insufficient without the authoritative native result.

## Falsifying checks

The following checks would test, and could narrow or overturn, the inferences above. They are not represented as performed by this assessment.

1. Obtain a reproducible, access-controlled accounting of the seven API-reported but undiscovered sessions, then re-run the same read-only extraction with stable identifiers and a documented inclusion/exclusion result. A recovered recognized event would falsify the inference that the *currently available cohort* contains no event evidence; it would not retroactively turn the current packet into that evidence.
2. For any proposed recovery, require a source-backed linkage among a persisted request or authoritative event record, its runtime fingerprint/origin, its threshold and comparison semantics, and the native `macroResult.approved` result. A complete linkage could falsify the conclusion that this packet alone cannot authorize that specific recovery.
3. Expand redaction/export validation with representative allowed and disallowed fields, Unicode/control-character variants, nested JSON, and archive/session formats actually selected by the harness. A leak from an allowlisted export path or a structural-breakout result would falsify the present containment assumption; continued fixture success alone would not establish historic data completeness.
4. Independently verify whether any action is authorized by the displayed Advisor state rather than `macroResult.approved`. Evidence of a distinct authorization contract, tied to the relevant runtime version, could qualify the current-source authority inference; absent that linkage it must not be projected onto historical events.

## Verdict — CAUTION

**CAUTION:** Do not authorize, replay, attribute, or remediate a historical JEV/Advisor decision from this packet alone. The packet supports a defensive handling posture: preserve untrusted transcript data as data, retain minimal redacted exports, and require independent, source-backed authorization evidence before conditional recovery. A GO verdict is supportable only for such non-decision-preserving evidence collection or hardening that does not assert historical identity, outcome, causation, calibration, or pairwise agreement. A STOP verdict would be warranted for any proposed recovery that treats an escaped excerpt, a Gate 1/resolver/API-key failure, a displayed Advisor state alone, or current workspace source as historical authorization.
