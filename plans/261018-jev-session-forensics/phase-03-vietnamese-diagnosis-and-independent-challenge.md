---
phase: 3
title: "Vietnamese diagnosis and independent challenge"
status: completed
priority: P2
effort: ""
dependencies: [1, 2]
---

# Phase 3: Vietnamese diagnosis and independent challenge

## Overview
Deliver an evidence-backed Vietnamese diagnosis and five independent ck:predict persona reports, distinguishing confirmed mechanisms from historical causal hypotheses.

## Requirements
- Diagnosis and synthesis in Vietnamese; retain exact API/symbol names and evidence anchors.
- Five independent lenses: Architect, Security, Performance, UX and Devil's Advocate, all given the same sanitized packet and no sibling conclusions until initial assessments finish.
- No external historical-payload replay, threshold reduction, production changes or deployment. Recommendations are conditional, not authorization.

## Architecture
Phase 1/2 sanitized evidence -> five independent read-only analyses -> conflict adjudication -> Vietnamese diagnosis plus prediction report. Packet contains aggregate tables, route/proposition definitions, source anchors, redacted cases, provenance gaps and explicit uncertainty. It contains no raw transcripts, keys or entire wire payloads.

Serialize excerpt values as JSON strings with `<`, `>`, `&` and delimiter-breaking control characters escaped. Put them in an explicitly labeled untrusted evidence data section; transcript-supplied XML/Markdown must not create new packet structure. Fixed persona instructions live outside that section and state that quoted instructions are data. Add a synthetic `</agent_work_log>` / forged-role fixture: exported packet must preserve one data field, never a new instruction block. Escaping mitigates structural breakout, not all semantic prompt injection; minimize excerpts and require source-backed conclusions.

## Related Code Files
- Read only: previous phase reports and cited source anchors.
- Create: `reports/evidence-packet.md`, `reports/predict-architect.md`, `reports/predict-security.md`, `reports/predict-performance.md`, `reports/predict-ux.md`, `reports/predict-devils-advocate.md`, `reports/diagnosis-vi.md`, `reports/predict-synthesis-vi.md`.
- Update execution evidence: `reports/verification.md`.
- Production/test/config/deployment changes: none.

## Tests Before
Before generating final reports, add synthetic checks for exported evidence: secret sentinel, private prose, unsupported causal label without event evidence, missing denominators, unknown threshold presented as known, and a contextual pair counted as direct. Keep these checks in the temporary harness; assert data/provenance contracts, not prose wording or source-text snapshots. For document completeness use a throwaway checklist, not permanent wording tests.

## Implementation Steps
1. Load the available ck:predict skill at execution. If independent agents are available, launch the five personas in one batch with identical packet and fixed read-only contract; do not share their initial conclusions. If unavailable, explicitly report inability to meet independent-persona acceptance; do not fake independence by writing five voices yourself.
2. Require each persona to identify confirmed facts, inferences, counterexamples, falsifying checks, and GO/CAUTION/STOP on proposed remediation. A vote is not empirical probability calibration.
3. After all initial assessments, compare conflicts and adjudicate from anchored facts. Retain disagreement if available evidence cannot resolve it.
4. Write diagnosis covering cohort/cutoff, extraction coverage, score populations, observed low/high cases, input/authority differences, current mechanisms, historical attribution limits and conditional next steps. Every numeric statement must name its denominator and ledger source. Prior supplied figures remain labeled unreproduced historical claims unless independently matched.
5. Write the five-persona synthesis with distinct verdicts, conflict resolution and remaining unknowns. Missing same-input pairs means the comparison is not identifiable, not that models agree or disagree.
6. Re-run the temporary fixture suite and corpus accounting/export checks. Re-read report-linked representative raw anchors locally, and verify all report links/line anchors exist. Record actual outputs and unavailable evidence, without raw secrets.
7. After smoke evidence is recorded, remove only the created temporary harness directory. Keep sanitized reports and execution ledger. Mark phase completion using plan-cli only when its acceptance criteria are met.

## Refactor
No production refactor. Remove duplicate claims/tables from final prose; maintain one authoritative evidence ledger and reference it.

## Tests After
Execute `node --test <temp>/forensics.test.mjs` and the frozen-cohort analysis command from Phase 1; run the export contract checks before removing temporary files. Use `node C:/Users/thant/.claude/skills/ck-plan/scripts/plan-cli.cjs status <absolute-plan-path>` for phase inspection. Do not run `bun test`, installs, builds, sync-baseline or real API replays for this investigation.

## Success Criteria
- [x] Vietnamese diagnosis has traceable statistics, representative cases or explicit absence, and qualified historical claims.
- [x] Five genuine independent initial persona assessments and evidence-backed synthesis exist.
- [x] No score normalization/calibration or identical-input claim is inferred from confidence or temporal proximity.
- [x] Actual parser RED/GREEN, corpus smoke and export checks are recorded; temporary scripts removed afterward.
- [x] All reachable investigation results delivered even if native wire provenance is unavailable; that limit remains explicit.

## Risk Assessment
Persona consensus can amplify a shared packet error: fixture/anchor checks remain authoritative. Do not send private historical material to remote tools; use sanitized minimal packet only. If a source or archive limitation prevents causal attribution, report it rather than adding telemetry or repair scope.
