---
title: "JEV Session Forensics Evidence Audit"
description: "JEV session forensics plus TDD recovery for blocked todos, gated deletion and task-scoped completion evidence."
status: in-progress
priority: P2
effort: 
branch: master
tags: [typesafe, jev, forensics, planning, tdd, todo-recovery]
blockedBy: []
blocks: []
created: 2026-10-18
---

# JEV Session Forensics Evidence Audit

## Overview

Analyze up to the latest 15 eligible OMP sessions per locally archived workspace at a frozen execution cutoff. Deliver a Vietnamese diagnosis and five independent ck:predict assessments (Phases 1–3, complete). User-requested extension: native todo recovery and completion-evidence fixes (Phase 4 complete; Phase 5 workspace/deployment verified, live runtime proof pending host restart).

Input: [reviewed source brief](../../JEV_SESSION_FORENSICS_PLAN_JEV_PLAN.md). This index and its phases are the canonical execution plan. [Todo recovery research](./reports/todo-recovery-research.md) records source-backed causes, the synthetic runtime smoke and the selected block policy.

## Scope and cross-plan scan
- Scanned all 31 discovered plan indexes, including legacy entries without frontmatter and `complete` status variants.
- Pending/in-progress overlap: `261004-redteam-egc-hardening`, `261006-red-team-hardening`, `261012-todo-drop-judge-fidelity`, `261012-judge-threshold-lifecycle-alignment`, `261015-advisor-judge-jev-true-calibration`, `261015-judge-baseline-audit-cook`. Legacy judge/key/stability briefs are implementation history, not prerequisites.
- Original forensic scope has observational overlap only. The added recovery slice owns the current native AUTO_APPROVE/UI fallthrough, rejected-block confirmation, boundary false positive and scoped completion evidence. Cross-notes are added to todo-drop fidelity and baseline audit plans; their statuses and existing dependencies are preserved. No external plan output is prerequisite, so blockedBy/blocks stay empty; do not create a false cycle or wait for all-workspace forensics to fix the local deadlock.
- Snapshot current source and archive inputs independently; source hashes, commit dates and active deployment equality alone do not identify older loaded runtime code.
- TaskCreate/TaskList are unavailable here; phase files remain the persistent handoff. No task hydration was fabricated.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Cohort and parser TDD](./phase-01-cohort-and-parser-tdd.md) | Complete |
| 2 | [Source provenance and paired analysis](./phase-02-source-provenance-and-paired-analysis.md) | Complete |
| 3 | [Vietnamese diagnosis and independent challenge](./phase-03-vietnamese-diagnosis-and-independent-challenge.md) | Complete |
| 4 | [Todo rejection recovery and deletion](./phase-04-todo-rejection-recovery-and-deletion.md) | Complete |
| 5 | [Completion evidence fidelity and runtime proof](./phase-05-completion-evidence-fidelity-and-runtime-proof.md) | In progress — host restart/live proof pending |

### Execution order and scope boundary
- Recovery-first: **4 → 5**; Phase 4 has no dependency on archive analysis. Phase 5 depends on 4 for end-to-end smoke.
- Forensics independently: **1 → 2 → 3**. Freeze/relabel source/runtime provenance if recovery changes occur before the cohort is captured; never attribute the new fix to old events.
- Preserve original ephemeral parser TDD for Phases 1–3. Phases 4–5 instead require retained behavioral regression tests for permanent fixes.
- Do not lower thresholds, bypass rejected done, allow agent flags to grant authority, erase failure maps before native commit, modify the immutable global proxy or deploy during planning.
- The user selected **human confirmation for blocking a rejected task**. AUTO_APPROVE drop/rm must not require confirmation; unresolved escalation remains fail-closed without UI.

## Red Team Review
Two independent reviewers: Security Adversary and Assumption Destroyer; source fact-checking included. Nine deduplicated findings accepted by user. Severity normalized to 7 High / 2 Medium: the supplied brief already qualifies historical causation, so reviewers' Critical attribution language was not adopted.

| # | Finding and evidence | Severity | Disposition / applied to |
|---|---|---|---|
| 1 | Historical score-bearing notices cannot be explained solely by current scoreless proposed reports (`typesafe-planner.ts:1687-1693`) | High | Accept with qualification; Phase 2 stratifies version, decision and authority |
| 2 | Gate 1 precedes JEV; missing artifact field is not absence of markdown diff; `diffScope`/`planPath` omitted (`typesafe-planner.ts:1618-1667`, `src/evidence-collector.ts:425-436,501-548`) | High | Accept; Phase 2 traces early exits and separate evidence channels |
| 3 | Returned Advisor state may already incorporate JEV (`src/bicameral-consensus.ts:828-848,1142-1168`); native authority is macro result (`typesafe-planner.ts:1671`) | High | Accept; Phase 2 separates original/returned state and final action |
| 4 | Temporal proximity is not pairing (`typesafe-planner.ts:1651-1683` vs explicit advisor route) | High | Accept; only same-evaluation comparable pairs enter disagreement rates |
| 5 | Parser verification lacks executable negative controls (source brief original Verification; gate distinction at `typesafe-planner.ts:1637,1682`) | Medium | Accept; all phases define temporary RED/GREEN and corpus checks |
| 6 | Empty/current session contaminates selection (source brief prior cohort; archive API documents zero-turn exclusion) | High | Accept; Phase 1 filters before slicing and records coverage caps |
| 7 | Prose-only redaction is insufficient (`src/typesafe-redact-patterns.cjs:614,676`, `src/payload-safety.ts:59`) | High | Accept modified; allowlist exports and reuse verified scrubbers, never promise perfect privacy |
| 8 | Transcript text can spoof instructions/delimiters (`src/cook-expert-judge.ts:218-230`) | High | Accept scoped to investigation; structured escaped packet, no runtime security fix |
| 9 | Raw/outbound hashes lack stage definitions and may disclose low-entropy content (source brief prior provenance request; payload construction `src/cook-expert-judge.ts:217-230`) | Medium | Accept modified; no mandatory unlogged checkpoints or new telemetry; prefer metadata and explicit unknowns |

## Validation Log
### Session 1
Trigger: `--validate --red-team --tdd` on the supplied forensic brief. Three questions asked:
1. **Cohort:** Which session cohort should the revised plan require? The supplied 60-session totals have no linked selection manifest.
   - Options: Refresh latest sessions | Reproduce the original cohort.
   - Answer: **Refresh latest sessions**. Freeze a new cutoff; supplied totals are unreproduced prior claims, not targets.
2. **TDD scope:** How should --tdd apply to this read-only investigation?
   - Options: Ephemeral parser TDD | Retained forensic harness.
   - Answer: **Ephemeral parser TDD**. Temporary synthetic fixtures and RED/GREEN; retain sanitized evidence, no production tests.
3. **Red-team review:** Apply the nine accepted red-team findings to the revised plan? Remedies are limited to evidence handling, factual qualifications, pairing rules and offline verification; no production changes or mandatory recovery of unlogged payloads.
   - Options: Apply accepted findings | Review each finding | Reject findings.
   - Answer: **Apply accepted findings**.

### Verification results
- Source contracts verified: Gate 1 early exit, hardcoded native task type, empty default artifact list, omitted diffScope, optional planPath criteria, current scoreless proposed report, strict default probability comparison, post-JEV Advisor mutation, redaction helper availability, and archive API discovery/ordering contract.
- Failed original claims corrected: unconditional Gate 2 invocation; missing dedicated artifact means no markdown evidence; Advisor confidence is an independent unmodified heuristic; unqualified historical result provenance.
- Unverified historical claims: prior cohort totals, raw/native wire completeness, historical runtime identity and five-persona verdicts. These are execution work, not planning verification failures to hide.
- Session 1 scope: fact checking plus contract verification; no exported interface/caller changes were proposed then. Session 2 adds implementation planning; Phase 5 lists the MicroCheckEvidence consumers and reference-check requirements.
- Recommendation: execute the selected branch with its own evidence gates. The forensic findings are not repair proof; the new recovery specification is not a claim of a deployed fix.

### Session 2 — Todo recovery extension
Trigger: user requested research and additions to handle blocked/undeletable todos.
- Question: Với todo đã bị Gate 1/2 từ chối, plan nên cho phép `block` theo chính sách nào?
- Options: **Xác nhận người dùng** | **Cho block, giữ nợ khắc phục**.
- Answer: **Xác nhận người dùng**. Restore UI recovery bound to the exact operation/targets; keep rejection and open contract. Automatic rm/drop on AUTO_APPROVE remains automatic.
- Verified source: unconditional confirm after AUTO_APPROVE (`typesafe-planner.ts:1561-1576`); rejected block without UI recovery (`:1587-1592`); current native transaction cleanup (`:1986-2100`).
- Observed synthetic smoke: a docs-only diff mentioning `.claude/hooks` yields native micro `claudeSafe=false`, explicit verification `claudeSafe=true`; a real `.claude/settings.json` modification remains unsafe. This does not prove the historical session changed no config.
- LSP reference request returned no language server; grep fallback enumerated native micro/precondition consumers and tests.
- Phases added through plan-cli: 4 (recovery/deletion), 5 (boundary/evidence/live proof). Existing phase statuses unchanged.
- Implementation/docs/deployment are still unexecuted; runtime promotion depends on clean managed preflight, immutable proxy prerequisite and user restart. Native current-session errors are not retried to manufacture proof.

### Execution reconciliation — skipped-suite false positive
- Native completion bookkeeping exposed a reachable Gate 1 defect: the shared analyzer matched `xit(` inside the existing `process.exit(1)` fixture when missing-baseline fallback supplied full-working-tree evidence.
- A lexical-filter repair was tested locally but rejected by independent quality/security review for introduced false negatives involving regex/division and incomplete template context. The unshipped source/test experiment was rolled back, not deployed or accepted as a fix; reproduction evidence is retained in the verification report.
- The detector defect remains open. Drop authorization is evaluated through a separate bicameral route, not by passing completion Gate 1/2. Canonical Phase 5 obligations and human-UI acceptance remain outstanding; Phase 5 stays in progress.

### User addition — Advisor owns rejection remediation
- User requested mandatory research, agent coordination and execution after judge rejection until approval. Add the requirement consistently to both Advisor aliases and their project copies, plus the existing extension-injected orchestration policy.
- Preserve the read-only Advisor boundary: Advisor supplies evidence-backed research and executable assignments; the parent dispatches agents, verifies actual changes/full affected module/smoke, and re-evaluates the same gate with fresh evidence.
- No unchanged retries, manufactured approval, threshold/assertion/rubric weakening or cancellation of required work to escape rejection. Real unavailable prerequisites and sovereign human authority remain explicit unfinished blockers. Test success or attempt exhaustion cannot substitute for judge approval.
- Verify emitted session policy, all four agent-contract copies and a real read-only Advisor scenario; run the existing targeted/full suites and isolated smoke before managed synchronization. This requirement does not itself satisfy Phase 5 live-human-UI acceptance or repair the open detector defect.

### Final boundary-only detector repair
- Follow the Advisor's minimal recommendation: change only the identifier boundary in the shared skipped-suite matcher. Do not restore lexical masking or add a parser; conservative literal/comment matches remain an explicit limitation.
- Retain behavioral RED/GREEN for the exact `process.exit(1)` fixture and unrelated identifier suffixes, with positive controls for actual disabled runners and the adversarial contexts that invalidated the earlier experiment.
- Both deterministic consumers must accept the real harmless fallback evidence while still rejecting an actual disabled suite. Full-suite, independent quality/security review and managed synchronization precede any runtime claim; the cached host must restart before native completion is re-evaluated.

## Handoff
Use `/ck:cook --tdd D:/100.Software/Github/omp_extension/plans/261018-jev-session-forensics/plan.md` in a fresh session. For immediate todo recovery, explicitly execute Phase 4 → 5 first; Phase 1 → 2 → 3 remains the forensic branch. Interactive mode preserves approval/evidence review. Workspace recovery does not require runtime promotion, but deployed end-to-end completion does.

## Execution reconciliation — 2026-10-19

Residual C06/C12/C13/C14/C19/C33/C35 ownership: [consolidated master](../261019-research-to-cook-execution/plan.md), with [source-evidenced dispositions](../reports/261019-research-to-cook-coverage.json). Preserve the bounded null cohort, accepted boundary-only analyzer fix and actual native receipts. No historical wire attribution, automatic archive replay or lexical-mask resurrection. Remaining actual trusted UI/reload/native criteria close only from their own authorized observed proof.

