---
phase: 5
title: "Consolidate debate and input boundary policies"
status: pending
priority: P1
dependencies: [4]
---

# Phase 5: Consolidate debate and input boundary policies

## Overview
Finish the genuinely unimplemented older debate/input objectives without rebuilding working transport or adding an AST/agent framework. Coverage C19–C22/C27 and the contradictory completed/pending predict plans.

## Requirements
- One debate implementation and reviewed policy; production and tests must not select different veto rules or model aliases.
- Preserve the stricter existing safety behavior. Real adapter/unavailable handling stays real; no default3/3 scores or source mock success.
- Structured source evidence is data, never permission. Escaping/enclosures protect syntax, not absolute semantic prompt-injection immunity.
- Distinguish forbidden mutation targets from safe references and negative constraints. Do not reject “never modify ~/.claude/settings.json” merely for mentioning the boundary.
- Preserve the accepted boundary-only anti-evasion fix and honest heuristic limitations; no revived lexical masks or unapproved parser dependency.

## Related Code Files
- Modify: `D:/100.Software/Github/omp_extension/src/debate-evaluator.ts` — sole debate implementation/types and source-backed model policy.
- Modify: `D:/100.Software/Github/omp_extension/typesafe-planner.ts` — migrate production callers, remove obsolete inline debate/types/exports after references are migrated.
- Modify: `D:/100.Software/Github/omp_extension/src/plan-evaluator.ts`, `src/xml-enclosure.ts`, `src/ast-analyzer.ts`, and shared evidence/path helpers only where the accepted residual objective requires it.
- Extend: `D:/100.Software/Github/omp_extension/tests/debate-evaluator.test.ts`, existing client-debate/plan-evaluator/XML/AST modules; resolve actual filenames before commands.
- Update: `D:/100.Software/Github/omp_extension/docs/system-architecture.md`, `docs/data-flow-and-states.md`, `docs/source-code-specification.md` and relevant older predict plan notes with actual policy, not false universal XML/AST claims.

## Architecture
The existing debate module is the single domain implementation; the entrypoint retains transport/registration only. Migrate every importer directly—no duplicate implementation, deprecated re-export or mock-only alias.

Shared state is a named JSON object wherever the API supports it. Dynamic code/quotes remain bounded data fields. Trusted rubric, authority policy, criteria and model selection remain separate from source material. For any retained textual/XML consumer, escape structural delimiters consistently and preserve source meaning; do not equate escaping with authorization or evidence completeness.

Plan isolation reads explicit action/target records and normalized mutation paths, not whole-document keyword coincidence. Reuse provenance-aware path checks. Ambiguous free prose requests a named clarification/structured target, not guessed permission or arbitrary rejection.

## Implementation Steps
1. Run references for all debate functions/types/importers and record current production/extracted verdict differences. Freeze a conservative single truth table preserving existing architect/security/devil vetoes and all stronger boundaries; do not choose the permissive branch to make tests pass.
2. Implement canonical result validation in `src/debate-evaluator.ts`: finite bounded scores for every required role, real requested/resolved model identity when returned, unavailable for missing/invalid remote output. Reuse shared real client and generation-aware retry; do not add another fallback model/probe.
3. Move production and tests onto that implementation. Remove obsolete inline code, types, aliases and stale model-config comments. Default/override model names must be supported/documented; do not invent `jev-fast` availability.
4. Add actual structural nonempty ordered-work validation in `preEvaluationTriage`, including dependency references and task-appropriate verification. Prose with a filename plus the word verification is not an executable plan. Research plans are not forced to create code or run irrelevant tests.
5. Replace raw boundary-name matching with explicit mutation-intent/target handling. Normalize quoted/encoded paths and both rename endpoints with bounded decoding/canonicalization. Test safe mentions/negative constraints, invalid encoding, traversal, Windows/URI forms and genuine protected mutations. Do not remove references from real plans to appease a detector.
6. Align named-object state and retained enclosures with the phase2 packet contract. Verify closing-tag/boundary characters, nested conflicting tags and untrusted instructions cannot alter trusted fields/options. Retain visible original proof and omissions; no blind data stripping or dummy fallback.
7. Preserve the shared anti-evasion heuristic and accepted identifier-boundary repair. Cover real skip/delete/test-block reduction positives and legitimate update/rename/net-count negatives. Document conservative quoted/comment limitations; never reintroduce the rejected lexical masking experiment or claim parser-level guarantees.
8. Replace stale docs asserting resetFailures, permanent authorization, absolute XML isolation or fabricated default approvals. Retain historical provenance with a current replacement note rather than erase inconvenient evidence.

## Success Criteria
- [ ] Real production and extracted consumers use one debate policy; known low architect/security/devil cases cannot disagree between callers.
- [ ] Missing/invalid role output or transport failure never becomes passing scores, model claims or approval.
- [ ] Empty/no-step/dependency-invalid plans fail structural triage while genuine research plans remain applicable.
- [ ] Safe negative boundary references pass isolation; encoded/renamed actual forbidden mutation is rejected.
- [ ] Dynamic source cannot break retained structural wrappers or become trusted policy; semantic injection remains an explicit separate risk.
- [ ] Existing accepted anti-evasion boundaries remain; no new false-negative lexical masking or package/framework creep.
- [ ] All importers/docs are migrated cleanly, without compatibility re-exports or wording-only tests.

## Verification
Run complete actual debate/client/plan/XML/AST modules after integration; resolve current filenames first. Exercise production entrypoint debate through actual injected transport and validate discriminating verdict/error cases—not score forwarding. Smoke structured plan/source inputs through the real tool path; then parent runs full `bun test` at the integrated gate. Delete incidental wording tests instead of re-pinning them.

## Risk Assessment
XML/JSON formatting cannot make hostile content trustworthy. Domain scores are not calibrated probabilities; no averaging is evidence of independence. File normalization must not broaden global write permission. Stronger safety consolidation can expose prior false approvals; investigate real behavior rather than lowering vetoes.
