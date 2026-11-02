---
title: "Existing plan implementation inventory"
status: completed
---
# Existing plan implementation inventory

Read-only audit checkpoint:33 existing plan indexes and83phasefiles before the new execution master. Declared status is not implementation proof. No source edits/tests/commands were performed by the scout.

Inventoried all 33 existing plans/**/plan.md indexes and 83 phase files. Index frontmatter: 13 completed, 3 complete, 4 pending, 4 in-progress, 9 missing. Found substantive status conflicts, 29 explicitly open/missing-status unfinished phase files, and 9 additional completed phase files with unchecked acceptance criteria. Important older leftovers include incomplete debate consolidation, accepted key-isolation work that is visibly unimplemented, missing fan-out question limits, and an unfulfilled per-tool trusted-policy configuration decision. Numerous historical objectives are already implemented and must not be rebuilt. Several historical instructions are unsafe or superseded: synthetic ops[] support, agent reset/authorization flags, global proxy edits, default passing debate fallbacks, and unvalidated threshold changes. Read-only source/test inspection only; no commands, tests, native tools, API evaluations, trackers, or edits were executed.

# Complete 33-plan inventory and reconciliation

## Evidence conventions and scan coverage

- Exact discovery scope: **33 plan indexes**, **83 phase files**. No newly created master plan was included.
- Index frontmatter: **13 `completed`; 3 `complete`; 4 `pending`; 4 `in-progress`; 9 absent**. `complete` is a legacy completion spelling, not a reason to omit the index. No malformed explicit index status value was observed. One child uses noncanonical `in_progress`; preserve it as an open status, normalize only through deliberate bookkeeping later.
- All phase frontmatters and unchecked acceptance markers were scanned. All 29 explicitly unfinished/missing-status unfinished phases were read, plus the nine `completed` children with unchecked acceptance. Three auth children have no status but checked acceptance and are separately noted below.
- **S = source inspected**, **T = test source inspected/existence located**, **D = document-declared historical verification**, **NV = not executed/independently runtime-verified by this audit**. Tests were not run. Existing checked boxes and passing-count prose are not fresh implementation proof.
- Latest supplied contract is authoritative over older docs: bounded three-file evidence repair and 25 tests are already complete; parent observed 387/0 and callback success; mapping/source-fix/verification native targets are complete. Do not recreate an activation prerequisite for those targets. Current source/deployment mismatch is 17/20 equality with three repaired files differing; current dry-run was clean. Historical pointer-blocker text is not current proof of a blocker.

## Inventory: every index, original scope, actual evidence and leftovers

### 1. `plans/261001-auth-error-visibility/plan.md`
**Title:** Auth Error Visibility Enhancement. **Status:** `completed`; index phases 1–3 Completed (`:19-25`). Children have no frontmatter but checked success criteria: `phase-01-update-interfaces.md:23-25`, `phase-02-implement-out-of-band-notification.md:22-24`, `phase-03-test-and-verify.md:18-21`.
**Owns:** `typesafe-planner.ts` error result shape/auth UI; health/auth tests.
**Evidence:** S: auth outcome emits visible `typesafe-auth-recovery` then `shortError('unauthorized')`, `typesafe-planner.ts:2404-2410`. T: `tests/health-watchdog.test.ts:258-299`; later auth recovery suites exist. NV: fresh auth UI/live behavior and exact historical throwaway verification.
**Leftovers / replacement:** No established reason to rebuild dual-channel auth alerts. Preserve behavior in shared transport work. Missing child status metadata is bookkeeping, not missing feature proof. Modern host-message shape supersedes the obsolete example in phase 2.

### 2. `plans/261001-typesafe-concerns/plan.md`
**Title:** TypeSafe Judge Concerns Resolution. **Status:** `complete`; four children `completed` (`:34-41`).
**Owns:** shared policy wrapper, adversarial routing criteria, expert consultation records; legacy root `typesafe-adversarial.test.cjs`.
**Evidence:** S: bundled `src/typesafe-policy-client.cjs:23-49,65-132` implements `checkPolicy`/`judgeWithPolicy`. D: role-validation Session 11 records Branch B lattice rejection and explicit `triage` routing, `plans/261001-typesafe-role-judge-validation/plan.md:625-646`. Expert response exists locally. Legacy root test file was not found by repo glob; do not invent it as a current local test target.
**Leftovers / replacement:** Keep completed lattice/triage objectives; no new confidence model/API isolation parameter is required by these closed objectives. Current per-tool policy gap belongs to item 9, not rebuilding this wrapper. External historic callsites/live claims remain NV.

### 3. `plans/261001-typesafe-role-judge-validation/plan.md`
**Title:** TypeSafe Role Judge Validation Plan (TDD & Cross-Workspace). **Status:** **missing frontmatter**; final prose COMPLETE at `:599-601,643-646`, superseding earlier DONE_WITH_CONCERNS at `:587-595`.
**Phases:** inline 0–4; final log claims executable phases and 7/7 adversarial matrix closed. No separate phase files.
**Owns:** resolver/provider/prelude/native activation, external models.yml/models.db and shared hooks, historical adversarial matrix.
**Evidence:** current bundled resolver/policy/client files and `tests/typesafe-resolver.test.ts` exist; D final historical outcomes above. NV current global provider configuration, prelude/core backend identity, historic external test suite, cross-workspace execution.
**Leftovers / replacement:** Do not repeat claimed completed routing/lattice fixes. The original edits to `~/.omp/agent/models.yml`, SQLite cache and `~/.claude` are **outside latest editable workspace** and require separately owned/operator work if newly necessary. Neither old config assertions nor Gate 1/2 passes prove current loaded memory or model provenance.

### 4. `plans/261002-cook-mandatory-typesafe-verification/plan.md`
**Title:** Mandatory TypeSafe Judge & Expert Evaluation in Cook Workflow. **Status:** `completed`; four children completed and index acceptance checked (`:82-110`).
**Owns:** cook reference contracts, `src/cook-expert-judge.ts`, extension expert tool/interception, adversarial tests.
**Evidence:** S: `evaluateScopeArbiter`, `evaluateDriftGuard`, `evaluateRiskSecurityTriage`, `src/cook-expert-judge.ts:485-599`; registered expert tool `typesafe-planner.ts:2827-2912`; native deterministic/macro path `:1774-1856`. T: cook expert/bridge/adversarial suites. External cook reference scope is explicitly `phase-01-workflow-specification-review-gate-upgrade.md:18-40`.
**Leftovers / replacement:** Do not implement expert roles or mandatory native gates again. Global skill `references/typesafe-judgments.md`, `workflow-steps.md`, `review-cycle.md` updates are **outside this repo** and NV, not automatic editing authorization. Latest real Advisor/same-gate orchestration is instruction contract plus new atomic runtime work, not proof these older guarantees cover all consumers.

### 5. `plans/261002-typesafe-compliance-elevation/plan.md`
**Title:** TypeSafe Plan Compliance & Elevation System. **Status:** `completed`; four completed phases (`:137-144`).
**Owns:** evidence collection, payload safety/redaction, plan rubric, dual gate, isolation/adversarial tests.
**Evidence:** S: `src/evidence-collector.ts:448-666`, `src/plan-evaluator.ts:102-168,264-309`, `src/verification-gate.ts:291-389`. Gate 1 exits before model call. T: evidence, plan, payload, verification/adversarial suites. NV execution.
**Leftovers / replacement:** Retain completed foundational modules. Original numeric rubric table (`:109-118`) is historical and conflicts with current defaults; do not restore its thresholds. Broad compliance claims do not close task-relative preimage/commit coverage, authority or child/parent synthesis gaps in item 33.

### 6. `plans/261002-typesafe-judge-alignment-fix/plan.md`
**Title:** TypeSafe System One Judge Definitive Alignment and Zero-Conflict Architecture. **Status:** `completed`; **all five completed children retain unchecked success criteria**.
**Owns:** shared extension adapter, question normalization, state budgets, rerank/multilabel and provider configuration.
**Evidence:** S: `typesafe-planner.ts:2332-2449,2451-2625`; T: `tests/typesafe-planner-integration.test.ts:196-499` contains endpoint/model, noul parsing, state, rerank and multilabel regressions. Configuration/restart claims NV.
**Concrete reconciliation:** Phase 1 endpoint/adapter and phase 2 normalization largely exist; phase 4 candidate-specific question text/multilabel exists. Phase 3's **8KB state cap/signature-centric summarization** is superseded by evidence-preserving 32,768-byte transport and relevant-artifact repair; do not implement both. All five phases' **'src/ unmodified'** requirements describe old extension-layer isolation, not the present repo's allowed source tree. Preserve zero upstream-core edits, not a prohibition on fixing this repo's src/. Phase 5 old permanent auth-disable flag is replaced by credential-generation recovery. Checklist conflict must be reconciled with evidence, not blindly completed or rerun.

### 7. `plans/261003-planner-import-proxy/plan.md`
**Title:** no explicit title; filename-derived Planner Import Proxy. **Status:** missing frontmatter; all three verification boxes checked (`:24-27`).
**Owns:** historical external `~/tmp` source relocation and global extension trampoline.
**Evidence:** D original import-resolution objective; S current bundle-only runtime loading and managed pointer preflight, `typesafe-planner.ts:2338-2355`, `tools/sync-baseline.cjs:97-104,160-170`; T bundled-dependency tests `tests/typesafe-planner-integration.test.ts:500+`.
**Leftovers / replacement:** Old proposed global write points to `C:/Users/thant/tmp/typesafe-planner.ts` (`:14-16`) and is **obsolete/outside scope/forbidden to replay**. Keep portable relative imports and current sole managed deployment target. Existing pointer must only be read/validated. A new import smoke is a release check, not a reason to recreate the loader.

### 8. `plans/261003-rerank-orchestrator/plan.md`
**Title:** no explicit title; filename-derived Rerank Orchestrator. **Status:** missing frontmatter, no completion marker.
**Owns:** shared execution helper, rerank/multilabel tools, auth visibility, parallel-question bound.
**Evidence:** S execution helper and tools already exist, `typesafe-planner.ts:2332-2449,2657-2742`; T integration tests `:377-499`. **`src/typesafe-api-client.cjs:149-200` validates nonempty questions but never rejects excessive question count.** Literal search also found no MAX_QUESTIONS.
**Concrete unfinished:** Accepted fan-out rate/budget protection in index `:33-46` is not implemented. Select a source-backed safe host question limit (old '20' is an example/assumption, not verified API truth), enforce it in shared validation and every fan-out caller, add behavioral boundary coverage in current local test conventions. Do not invent the absent legacy root adversarial test. Preserve already built tools; do not implement speculative batching simply because old contingency mentions it. Connect limit output to item 33 shadow batching/quota work when that work uses the tools.

### 9. `plans/261003-typesafe-best-practice-alignment/plan.md`
**Title:** TypeSafe Best Practice Alignment Plan. **Status:** missing frontmatter; no completion declaration.
**Owns:** trusted host policy binding, policy loader and deterministic lattice enforcement.
**Evidence:** S loader/check at `typesafe-planner.ts:328-351,2354-2355,2419-2434`; T integration enforcement tests `tests/typesafe-planner-integration.test.ts:69-161`. **Selected requirement** is per-tool configuration passed at initialization (`plan.md:47-51`); actual `HOST_POLICY` is one module-level environment-backed policy (`typesafe-planner.ts:349-351`).
**Concrete unfinished:** Reconcile and, if still accepted, deliver trusted per-tool initialization policy binding across actual tool/client consumers without exposing policy to model parameters. Existing global lattice enforcement is not proof of selected per-tool contract. Preserve it; no duplicate inlined policy convention. Missing loader behavior is currently visible short-error handling, not literal host termination; reconcile fail-closed intent rather than introducing session crashes. Authority/contract design output in item 33 should define the trusted policy binding that this work consumes.

### 10. `plans/261003-typesafe-stability-guardrails/plan.md`
**Title:** TypeSafe Stability Guardrails, Active Health Watchdog & Integrity Shield. **Status:** `completed`; all four children completed and index checked (`:30-51`).
**Owns:** protected-path tool interception, token generations, session health, hermetic tests.
**Evidence:** S shield `typesafe-planner.ts:372-390,1953+`, health `:1478-1555`, credential generation `src/typesafe-api-client.cjs:83-126,340-415`; T integrity, auth-recovery, health and environment-isolation suites.
**Leftovers / replacement:** Core features exist; avoid recreating watchdog/polling/second auth manager. Reuse bounded shared request policy. A marker saying EGC active is not verified enforcement; that separate remaining problem is item 33. Current health catch remains broad enough that a throwing `ui.notify` can enter network-warning catch (source `:1523-1553`); test/source reconciliation belongs with item 21, not repeating completed IPC-error suppression.

### 11. `plans/261004-redteam-egc-hardening/plan.md`
**Title:** Red-Team Hardening and EGC Harmonization. **Status:** `pending`; four pending children, all success boxes unchecked (`:25-32`).
**Owns:** todo operation normalization, anti-evasion, honest evidence/diff budgeting, EGC handoff/integrity, redteam tests.
**Evidence:** S current native path explicitly rejects `ops` before processing (`typesafe-planner.ts:1617-1620`), protects mutations by matching result (`:2163-2245`), artifact routing already repaired. T current `tests/redteam-vulnerabilities.test.ts:17-47` is native transaction security tests, not all old seven tests. `hasActiveEGC` remains env/file marker (`:985-989`) and preflight returns on it (`:1618`).
**Concrete unfinished / replacement:** Replace phase 1/2 **batch-acceptance** objectives with native-schema rejection/security coverage; item 31 expressly supersedes ops[]/singleton/pre-result state. Do not add compatibility path. Preserve no-fabrication/full implementation visibility objectives in phase 3; current macro fields still clamp and need criterion/evidence fidelity coverage, not a blind budget bump. Phase 4 EGC coexistence is genuinely unfinished: marker-only handoff must become host-attested actual enforcement per atomic prerequisite. Keep protected-modification authorization and bounded recovery; never implement phase 4's marker-based unconditional yielding as completion. This plan is not wholly completed or wholly obsolete.

### 12. `plans/261004-typesafe-judge-hardening/plan.md`
**Title:** no explicit title; filename-derived TypeSafe Judge Hardening. **Status:** missing frontmatter; all inline items checked (`:5-28`).
**Owns:** research/redteam docs, triage, XML remediation, multi-persona preanalysis.
**Evidence:** documents exist and inspected: `docs/typesafe-judge-research.md:6-41`, `docs/typesafe-red-team-report.md:18-80`; S triage `src/plan-evaluator.ts:102-168,286-300`, XML remediation `src/remediation-generator.ts:12-61`, debate `typesafe-planner.ts:1356-1435`.
**Leftovers / replacement:** Do not regenerate the same research/docs or triage. Implemented keyword/path triage is not formal executable-plan proof. 'Fast model only' declaration is stale relative to current `jev-latest` documented default and configurable model. Real unresolved debate policy duplication belongs item 13. Strict XML claims are bounded by item 15's actual limited escaping, not proof of neutralizing arbitrary prompt injection.

### 13. `plans/261005-predict-recommendations/plan.md`
**Title:** Implement Multi-Persona Predict Recommendations. **Status:** `complete` index/table **conflicts** with phase 2 `in_progress` and phase 3 `pending`; index explicitly lists pending host-level actions (`:26-27`).
**Owns:** extracted debate evaluator, integrity entry, real evaluateDebate adapter, model configuration, recovery runbook/schema.
**Evidence:** S protected path already includes `src/debate-evaluator.ts` (`typesafe-planner.ts:372-373`) and real adapter exists (`:2457-2498`). However **two implementations still exist**: production inline `:1296-1435`, extracted `src/debate-evaluator.ts:47-180`. Their policies differ: inline vetoes architect/security/devil <1; extracted policy has no architect veto and uses >0 for security/devil (`:155-172`). Model alias resolution also differs. T extracted tests and client-debate tests exist.
**Concrete unfinished:** Consolidate duplicate functions/types/callers onto a single reviewed policy, preserving stricter safety behavior and current real transport; migrate all consumers/tests. Do not redo already present protection/adapter. Phase 3 **adding resetFailures to native todo schema is superseded/unsafe**: extension does not own native todo registration, and current operations contract forbids payload flags clearing debt. Fulfill recovery usability through exact-target trusted UI/real evidence and update stale docs (`docs/data-flow-and-states.md:87-88`, `docs/system-architecture.md:212-213`, `docs/source-code-specification.md:66-70`, `docs/source-code-modeling.md:261-264`, `docs/codebase-summary.md:30`). Current runbooks already state the correct policy. No need for global host-modification permission to consolidate development source.

### 14. `plans/261005-typesafe-judge-enhancement/plan.md`
**Title:** no explicit title; filename-derived TypeSafe Judge Enhancement. **Status:** missing frontmatter, all prose objectives unmarked (`:5-26`).
**Owns:** same research/redteam/triage/remediation/debate areas as item 12.
**Evidence:** same inspected docs/source as item 12; enhancements are not absent merely because this duplicate index lacks boxes. NV original mock evaluation/latency.
**Concrete unfinished / replacement:** Map research, triage and remediation objectives to existing implementation and retain their limitations. Debate single-source ownership/strong policy is the real leftover, owned by item 13/atomic prerequisite. Do not research/rebuild another judge or add a parallel evaluator. Duplicate plan can be reconciled only after objective-level evidence mapping, not auto-closed from filename similarity.

### 15. `plans/261006-red-team-hardening/plan.md`
**Title:** Implement Red-Team Hardening & Community Solutions. **Status:** `pending`; all five pending children and acceptance unchecked.
**Owns:** domain types/error, test-evasion analyzer, XML boundaries, deterministic remediation, auth rotation.
**Evidence:** S `src/types/security.ts:1-30`, `src/errors/TypeSafeError.ts:1-15` and `tests/architecture.test.ts:10-45` already satisfy foundation existence. Analyzer is implemented, integrated at `src/cook-expert-judge.ts:186-188` and `src/verification-gate.ts:127-130`; `src/ast-analyzer.ts:78-82` explicitly disclaims AST proof. S XML utility `src/xml-enclosure.ts:1-15` only removes three phrases and escapes matching closing root tag; **not all `<`, `>`, `&` or arbitrary nested conflicting tags**. S remediation builder exists/escapes dynamic data. S AuthManager exists and verifier uses it; shared transport handles credential generations.
**Concrete unfinished / replacement:** Phase 1 should be reconciled as implemented, not new scaffolding. Phase 2 functionality already exists with conservative line heuristic and accepted identifier-boundary repair; latency <150ms is NV, do not promise AST completeness. Phase 3's strict conflicting-tag/input-isolation objective needs source-backed adversarial coverage and an explicitly safe contract; current limited sanitizer does not establish full strict-XML/injection immunity. Reuse current utility/callers, not a second boundary convention. Phase 4 XML remediation exists; preserve and ensure error taxonomy in item 33 does not prescribe source edits for outages. Phase 5's **exactly-one 401 refresh retry** is not implemented as specified and is superseded by newer shared policy explicitly never retrying 401/403 with the same credential (`src/typesafe-api-client.cjs:29-39`); retain credential-change recovery, no second retry owner. AuthManager tests prove state changes, not refresh-network retry. Avoid replaying entire five-phase plan.

### 16. `plans/261007-health-probe-analysis/plan.md`
**Title:** Session Start Health Probe Dual-Notification Analysis & ck:predict Review. **Status:** `completed`; four acceptance boxes checked, no child files.
**Owns:** root-cause journal and five-persona diagnostic of fetch success followed by IPC rejection.
**Evidence:** required `docs/journals/2026-10-07-health-probe-dual-notification-analysis.md` exists. Current safe-message health tests exist. NV historical observed messages/report conclusions.
**Leftovers / replacement:** Completed documentation objective; do not rerun analysis as unfinished implementation. Implementation is item 21; a remaining synchronous notification classification issue is a distinct source gap.

### 17. `plans/261007-key-isolation/plan.md`
**Title:** TypeSafe Key Isolation Plan. **Status:** missing frontmatter; three inline TDD phases, no completion declaration. **All three security findings accepted**, with centralized allowlist choice (`:63-67`).
**Owns:** EGC scrub/egress, centralized safe child execution, all child_process consumers, tests.
**Evidence of real unfinished work:** `src/egc.ts:38-49` runs `spawnSync` without env and recursively regex-scrubs without exact-key replacement, depth bound or residual-secret guard. `src/evidence-collector.ts:283-299` only removes ANTHROPIC_/CLAUDE_ variables; it **retains TYPESAFE_API_KEY and arbitrary foreign environment**, then spawns with that map (`:382-405`). No exec-wrapper/safeExec/safeSpawn found by source search, alternate repo glob or broad literal search. `tests/egc.test.ts:26-45` covers registration, not accepted secret/depth cases; environment-isolation tests test harness restoration, not child allowlisting.
**Concrete unfinished:** Implement accepted exact-value secret scrub plus fail-closed residual detection for EGC, centralized execution env **allowlist** (not another denylist), migrate all applicable direct child process callers, bounded recursive scrubbing and behavioral no-leak/depth/child-env regressions. Existing current evidence executor is a reuse candidate; avoid a second execution convention. Source-wide child_process caller enumeration remains an implementation prerequisite; the definite two production consumers are above. Performance <5ms/<150ms acceptance is NV. This older plan must get explicit master-plan coverage; it is not absorbed by recent report routing repair.

### 18. `plans/261007-typesafe-auto-completion/plan.md`
**Title:** Autonomous TypeSafe Task Completion & Remediation (inline context/prediction; no title frontmatter). **Status:** missing frontmatter. Inline phases 1–3; user-requirement validation boxes checked are **interview validation**, not implementation completion.
**Owns:** threshold config, deterministic precheck, automatic remediation/session lifecycle.
**Evidence:** S current resolver uses env midpoint and clamps [0,1], `src/verification-gate.ts:94-100`; Gate 1 preemption exists `:306-321`. No `omp.typesafe.autoApprovalThreshold` setting in package/current runtime found; only historical plan references. Rejection guidance and native debt preservation exist.
**Concrete unfinished / replacement:** Preserve objective of autonomous high-quality correction and reduced needless prompts. **Do not implement 0–100 permissive config or clearing todo on a low score** (`plan.md:36-48`), which would erase obligations. Current configurable policy is a different interface and needs explicit reconciliation, not reintroducing a second configuration system. Real Advisor-owned remediation + immutable contract + exact native commit in item 33 is the safe replacement. Do not claim this old objective already provides a background automatic research/implementation engine.

### 19. `plans/261007-typesafe-fix/plan.md`
**Title:** typesafe-fix. **Status:** missing frontmatter; completion log Fully Resolved & Verified Green, 167/167 declared (`:39-49`). Four inline phases.
**Owns:** elevation result shape, debate adapter, health IPC, safe native bootstrap and gated drop.
**Evidence:** S current real debate adapter fails unavailable rather than supplying default passing scores (`typesafe-planner.ts:2457-2498`), robust health safe-message path and native transaction code. T relevant historical suites persist.
**Leftovers / replacement:** Do not redo completed general repairs. **Reject old phase 2 recommendation to adjust source fallback mock scores to pass tests** (`:21-24`); current fail-closed path is correct. Old references to `src/typesafe-planner.ts` are stale; actual entrypoint is repo-root. Synthetic lifecycle fast paths are replaced by item 31 native semantics.

### 20. `plans/261007-typesafe-lifecycle-gating/plan.md`
**Title:** TypeSafe Lifecycle Gating & Human Authorization Fix. **Status:** `completed`; three children completed.
**Owns:** initial todo creation, closed-plan file/CLI guards, gating guidance and hermetic lifecycle tests.
**Evidence:** S closure rejects active/staged/uninitialized state (`typesafe-planner.ts:1240-1255`); direct status edit guard `:1909-1915`, plan-cli guard `:2149-2153`; T lifecycle tests include forged-flag rejection (`tests/typesafe-lifecycle-gating.test.ts:124-128`).
**Leftovers / replacement:** Keep implemented guards; do not re-add duplicate interception. Old recognized authorizers/allowJudgeModification/default-test fallback are superseded by native exact-target authority, no implicit tests and task-aware applicability. Ordinary history rehydration remains a distinct real gap despite old 'completed' label.

### 21. `plans/261009-health-probe-transport-isolation/plan.md`
**Title:** Session Pre-Flight Health Probe Transport Scoping & Dual-Notification Fix. **Status:** `completed`; inline phases 1–2, all index acceptance checked.
**Owns:** health network-vs-host-message error scoping, dev workspace detection, historical reset flags.
**Evidence:** S current health uses shared transport and safeSendMessage; T `tests/health-watchdog.test.ts:383+` explicitly tests HTTP200 followed by IPC rejection suppression. **Current `ui.notify` is invoked inside the broad try before its network-warning catch**, `typesafe-planner.ts:1523-1553`.
**Concrete unfinished / replacement:** Existing sendMessage rejection fix must not be rebuilt. Reconcile original 'UI errors do not become unreachable' requirement with throwing notify (source-supported unexercised gap); distinguish host notification failure from transport. **Retire checked bypass-flag acceptance at plan :23**, replaced by current trusted exact-target UI policy. No resetFlags compatibility implementation.

### 22. `plans/261012-judge-threshold-lifecycle-alignment/plan.md`
**Title:** TypeSafe judge threshold and todo lifecycle alignment. **Status:** `pending`; four pending children and unchecked acceptance.
**Owns:** noul semantics, drop/evaluation decision taxonomy, plan/todo closure and recovery guidance, release tests.
**Evidence:** S current thresholds are midpoint plus categorical (`src/verification-gate.ts:94-100,380-389`, `src/cook-expert-judge.ts:381-390`), not historical .30/.80 boundaries; closure guards already implemented above. `runPhaseMacroCheck` error result is unavailable (`:347-362`) but native path reports it through Gate 2 rejection/remediation (`typesafe-planner.ts:1845-1856`), so end-to-end taxonomy remains incomplete.
**Concrete unfinished / replacement:** Keep mathematical fixed-probability/no range-multiplier objective, failure-vs-insufficiency distinction, complete human context, safe actionable guidance and live closure acceptance. Retire original .29/.30/.79/.80 expected-decision matrix as superseded, not as missing tests to restore. Current threshold config allowing [0,1] differs from old [0.50,.99] requirement; any authority/policy change needs explicit approved design, not an incidental rewrite. Index declares drop-fidelity predecessor, but only particular authority/evidence outputs are needed; no need to block on all historical item 23 tasks.

### 23. `plans/261012-todo-drop-judge-fidelity/plan.md`
**Title:** TypeSafe todo drop gate and judge input fidelity. **Status:** `in-progress`. **All five separate phases are empty CLI boilerplate**, missing frontmatter and containing only two placeholder unchecked acceptance lines (`phase-*.md:1-21`). The substantive index, not templates, is the only usable contract.
**Owns:** automatic justified drop vs human undecided, every done/drop report, task-baseline evidence, no default tests, task criteria/artifacts/context, native recovery and deployment.
**Evidence:** S major mechanisms exist: snapshots/evidence `src/evidence-collector.ts:54-58,448-539`, inferred task/artifacts/macro wiring `typesafe-planner.ts:1781-1841`, native reports staged then committed `:1861-1883,2163+`. T todo-drop/judge-input-fidelity/evidence suites exist. **Still hash-only baseline plus HEAD-relative dirty diff/HEAD~1 fallback**, not true preimage-to-task interval (`src/evidence-collector.ts:465-523`). Native proposed reports contain kind/tasks/approved/decider/empty reasons but omit actual macro evidence/score details (`typesafe-planner.ts:1861-1867`).
**Concrete unfinished:** Preserve and deliver original task-relative evidence semantics, truthful every-operation reporting including rejection, actual criteria/contract binding and acceptance/live proof. Current source map report repair only addresses one artifact/applicability subset. Do not recreate singleton maps, synthetic ops support, arbitrary parameter auth, latest-plan guessing or pre-result state mutation from old step-by-step code. Forensics 4–5 explicitly owns narrow recovery subset (`plan.md:369-370`); atomic prerequisite owns remaining attribution/contract/consensus. Existing templates need real implementation coverage mapping, not executing `src/new-file.ts` placeholders.

### 24. `plans/261012-typesafe-jev-alignment-fix/plan.md`
**Title:** TypeSafe JEV Alignment Fix. **Status:** `complete`; four children `complete`.
**Owns:** enriched payload/task artifacts, task-aware rubrics, advisory completion tool and regressions.
**Evidence:** S advisory tool is registered and explicitly nonmutating (`typesafe-planner.ts:2793-2825`); native task type/artifacts supplied `:1812-1841`, macro effective applicability `src/cook-expert-judge.ts:224-254`. T existing fidelity/rubric/verification tests.
**Leftovers / replacement:** Do not add another preflight tool or reconstruct already present task types. **Advisory verifier still builds a separate packet without native artifact/task/baseline semantics**, `src/verification-gate.ts:295-332`; current native collection supplies no planPath. Shared preparation/all-consumer alignment belongs atomic prerequisite/cutover, preserving advisory non-authority. Closed historical label is not proof of current parity.

### 25. `plans/261013-bicameral-judge-consensus/plan.md`
**Title:** TypeSafe Bicameral Judge Consensus, Threshold Elimination, and Adaptive Plan Reconciliation. **Status:** `completed`; four children `completed` but **every child success checklist unchecked**.
**Owns:** categorical verdicts, Advisor/JEV arbitration, sovereign confirmation, adaptive plan reconciliation, adversarial deployment.
**Evidence:** S categorical verdicts and arbitration types exist; `runBicameralMacroCheck` evaluates local Advisor then mutates it from JEV (`src/bicameral-consensus.ts:811-869`), duplicated done adapter mutates similarly (`:875-938`). Native done accepts **macroResult.approved**, not composed decision (`typesafe-planner.ts:1845`). T consensus/plan-reconciliation/adversarial suites exist.
**Concrete unfinished / replacement:** Preserve working categorical schemas/reconciliation, but independence and consumption of composed disposition are real unfulfilled objectives, owned by atomic prerequisite. Pure 'remove every numerical decision' is not implemented/current policy; do not remove safety policy simply for literal-zero acceptance. Original permanent broad human authorization, instant state clearing, and no-throw-as-success must be replaced with operation/target/revision-bound trusted human policy and matching native commit. Gate rejection is allowed to cancel a tool without ending all productive work; never suppress it as approval. Current post-restart acceptance remains NV.

### 26. `plans/261013-bicameral-judge-advisor-autonomous-execution/plan.md`
**Title:** Bicameral Judge-Advisor Autonomous Execution & Friction Minimization. **Status:** `completed`; inline four phases Completed and historical test/sync declarations (`:70-90`).
**Owns:** native bicameral done, committed evidence/boundary safety, post-evaluation ratchet/guidance, verification.
**Evidence:** S current native and heuristic consensus routes exist; actual evidence commit fallback includes only most recent commit (`src/evidence-collector.ts:508-523`), so original committed-deliverable objective is partial for multi-commit tasks. Native still consumes macro only.
**Concrete unfinished / replacement:** Do not rebuild existing wiring. Preserve intended fewer needless prompts, but **explicit matrix row ALLOW + JEV REJECT + clean diff => AUTO_APPROVE** (`:62`) is unsafe/obsolete: clean tree cannot prove obligations; no default override of semantic rejection. Replace with actual baseline commit-interval evidence, independent Advisor, explicit disposition and original-contract coverage. Test counts are historical D/NV, not quality calibration proof.

### 27. `plans/261013-fix-advisor-decision-answering/plan.md`
**Title:** Fix Advisor and ck:advisor Decision Answering & Context Extraction. **Status:** `completed`; all five index acceptance checked.
**Owns:** conversation evidence extraction, option ranking/decision answers, advisor tool/roles, four project agent definitions, snapshot head identity.
**Evidence:** S `collectConversationContext` exists (`typesafe-planner.ts:722-848`), decision tool/roles `:2857+,2914+`, fixed six-section report `src/bicameral-consensus.ts:964-1030`; `.omp/agents/{advisor,ck-advisor}.md` and `agents/{advisor,ck-advisor}.md` exist. Snapshot tracks headSha (`src/evidence-collector.ts:54-58`). D test/smoke/sync record `plan.md:37-40`.
**Leftovers / replacement:** Do not implement tools, aliases, definitions or headSha again. These definitions/instruction contracts are not proof a live runtime invokes a real reasoning Advisor before native completion; current function remains heuristic. Latest explicit runtime reasoning integration is item 33. Source/runtime identity completed administrative target must not be reopened to activate item 27 retroactively.

### 28. `plans/261014-typesafe-jev-advisor-overhaul/plan.md`
**Title:** TypeSafe, JEV & Bicameral Advisor Full Overhaul. **Status:** `completed`; four children completed and checked objective set.
**Owns:** off-by-one escalation, inverted reject escalation, clamping/tail evidence, untracked diff, phased init/rm, option ranking.
**Evidence:** S current macro receives failure count and gates first; categorical/noul handling `src/cook-expert-judge.ts:381-478`; native phased target/result logic `typesafe-planner.ts:1640+,2163+`; untracked diff synthesis `src/evidence-collector.ts:528-539`. T fidelity/consensus/drop suites.
**Leftovers / replacement:** Preserve completed targeted fixes, but phase 1's post-JEV rewriting workaround must not be retained as an independent Advisor implementation. Phase 3 primitive confidence inversion is historical compatibility, not justification to infer missing raw calibrated noul. Current boundary/report/contract fidelity shortcomings are not solved by merely repeating larger clamping limits. Consolidate with items 30/33.

### 29. `plans/261014-typesafe-todo-done-verdict-fidelity/plan.md`
**Title:** TypeSafe Todo Done Verdict Fidelity and Calibration Alignment. **Status:** `completed`; four children completed, all four task acceptance checked (`:53-88`).
**Owns:** dual primitive results, cognitive classifier/work log, scaffold exclusion/phase matching, report telemetry/tests/sync.
**Evidence:** S dual fields in current macro, `src/cook-expert-judge.ts:365-410`; scaffold filter `src/evidence-collector.ts:302-310`; T `tests/evidence-collector.test.ts:214-305` stub/phase collision coverage. Current newly added `tests/task-artifact-routing.test.ts:207-384` binds actual competing report JSON/UTF-8 proof to the right rubric and target.
**Leftovers / replacement:** Do not redo bounded applicability/artifact repair or stub/phase guards. Current native report construction does not pass scored detailed telemetry despite formatter support (`typesafe-planner.ts:1861-1867`); accepted every-done/drop reporting needs real caller data, not cosmetic formatter rebuild. Historical 'synced' does not establish current three-file runtime identity after later repair. Whole atomic prerequisite still open.

### 30. `plans/261015-advisor-judge-jev-true-calibration/plan.md`
**Title:** Advisor 0.90 Calibration, Zero 0.80 Thresholds, and JEV State Fidelity. **Status:** `in-progress`; **index phase table all Completed, all four child frontmatters pending, all four index success criteria unchecked** (`:23-36`).
**Owns:** Advisor evidence/negative signals, categorical/current threshold policy, scoped criteria/valid schema/budgets, tests/sync/journal.
**Evidence:** S variable overlap-based confidence and first-class failures exist (`src/bicameral-consensus.ts:521-648`), but broad worklog keyword ALLOW and no-work cognitive ALLOW remain; post-JEV blend/reject mutation persists (`:827-847`). Current default .50/categorical checks exist. Macro upstream task fields are clamped at 1950 (`src/cook-expert-judge.ts:235-251`), contradicting original 3000-char requirement; native vs advisory preparation still diverges. Journal `docs/journals/2026-10-15-advisor-judge-jev-true-calibration.md` exists (not missing deliverable).
**Concrete unfinished / replacement:** Phase 1 real evidence-backed independent reasoning/negation, phase 3 original-contract/explicit-criterion fidelity and packet parity remain. Binding Advisor confidence to JEV is **not independence** and is unsafe to use as two-lobe approval proof; replace under item 33. Phase 2 literal-zero threshold campaign partly implemented but **do not lower current gates, assume .50 Bayes is universally safe, or restore old .80 walls**; hold accepted runtime policy fixed while evaluating changes. Phase 4 blanket tests/live/sync acceptance is not independently verified; execute only integrated approved candidate with current deployment authority, not duplicate historical rollout. Child statuses must be reconciled objective-by-objective.

### 31. `plans/261015-judge-baseline-audit-cook/plan.md`
**Title:** Judge Baseline Audit Implementation. **Status:** `in-progress`; phases P0–P5 completed; P6 in-progress/source proof complete/runtime pending.
**Owns:** hermetic factory/bundled loader, prepared bounded transport, native call/result transaction, heuristic intent, deployment compensation and runtime proof.
**Evidence:** S shared transport, factory state and native result checks, and transactional sync implementation; T integration/isolation/transport/native/sync suites. P0–P5 completion is declared and substantially supported by code. **P6 pointer failure declaration in plan :39-41/phase :24-30 is stale** relative to later successful managed sync and latest clean dry-run in supplied contract. It must not block source planning by assumption.
**Concrete unfinished:** Integrated candidate promotion with clean current preflight, proper authority, target tests, host reload/origin and actual native lifecycle/denial/branch/reappend/UI-headless acceptance. Existing newer scratch evidence supports subsets, not entire matrix. Preserve all call-ID/hash/generation/revision/result guarantees and owned-manifest rollback; do not rebuild deployment framework or reopen completed P0–P5. There is no current evidence requiring external proxy repair. If fresh pointer/ownership preflight fails later, operator action is the conditional dependency; never agent-repair it.

### 32. `plans/261018-jev-session-forensics/plan.md`
**Title:** JEV Session Forensics Evidence Audit. **Status:** `in-progress`; phases 1–4 completed, phase 5 in-progress.
**Owns:** fresh cohort/parser/redacted analysis/Vietnamese diagnosis/independent review, native recovery and rejected-task UI policy, task-appropriate evidence, boundary-only detector fix, runtime proof.
**Evidence:** retained forensic outputs include cohort-manifest, events-redacted, extraction/analysis summaries, paired-cases, source-provenance, verification, diagnosis and five persona reports. S accepted detector fix `src/ast-analyzer.ts:12`, with explicit positive/negative controls `tests/ast-analyzer.test.ts:168-201`; **not the rejected lexical mask**. D repair deployment/357-pass report `reports/todo-recovery-verification.md:239-271`; scout did not rerun. Fresh native record `reports/fresh-native-runtime-evidence.json:11-77` captures successful judge-attributed rm/drop, retained control and rejected docs completion. Separate startup observer does not attest that earlier scenario or all imported TypeScript memory (`docs/journals/261018-1125-deployment-evidence-phase-five-blocker.md:71-79`).
**Concrete unfinished:** Successful legitimate native docs completion, real trusted-human rejected block→unblock and escalation accept/deny proof, integrated loaded provenance as required. Existing headless deletion is **already observed**, not a missing implementation to rebuild. Do not repeat historical cohort work, accepted source detector fix, recovery policy or agent-contract instruction updates. Preserve final accepted boundary-only repair over stale 'detector remains open' intermediate paragraphs. Mapping/source-repair/verification administrative targets are now complete under latest contract, not future activation gates. Full phase-5 UI/runtime acceptance remains separate and unproven.

### 33. `plans/261019-jev-atomic-review/plan.md`
**Title:** JEV Atomic Evidence Review and Advisor Synthesis. **Status:** `pending`; all three child phases pending and unchecked.
**Owns:** repaired-current evidence/authority baseline; candidate atomic semantic packets/criterion coverage and real Advisor parent synthesis; paired shadow evaluation; conditional cutover/native proof.
**Evidence of actual remaining defects:** hash-only/HEAD dirty evidence and last-commit-only range (`src/evidence-collector.ts:54-58,465-523`), rolling conversation rather than durable contract (`typesafe-planner.ts:722-848`), EGC marker bypass (`:985-989,1618`), ordinary history restoration assumptions (`:1556-1575`), heuristic/post-JEV-mutated Advisor (`src/bicameral-consensus.ts:417-648,811-938`), native macro-only approval (`typesafe-planner.ts:1845`), duplicate debate policy (`:1296-1435` vs extracted module). No atomic predicate/parent synthesis workflow was observed.
**Already complete subset:** bounded task-aware report applicability and artifact delivery in three sources, 25 permanent tests, callback verification and same-target authoritative administrative completion under latest contract. Do not implement that again or mark all phase 1 complete from it.
**Concrete unfinished:** Phase 1 genuine dirty preimages/full task commit interval, durable user contract and explicit criterion IDs, independent Advisor/negation/authority, unavailable/insufficient/rejected/human-required taxonomy and transport-vs-semantic recovery, native disposition consumption, real native-history rehydration, host-attested EGC handoff, shared all-consumer packet semantics and duplicate debate consolidation. Phase 2 criterion-to-source packet/receipt design and implementation, deterministic-vs-semantic allocation, original parent coverage and genuine read-only reasoning integration, representative independently adjudicated held-out evaluation, actual usage/latency/cost/false-approve/reject/abstention/integration metrics. Phase 3 only conditional on successful comparison and adoption/deployment authority: migrate every native/advisory/expert/plan caller, remove old parallel routes, exact native commit, integrated host scenarios and authorized managed promotion/restart. Synthetic arithmetic/persona agreement/child passes are not model-quality evidence.

## Relevant phase-path inventory

Paths below are exact. A grouped directory prefix applies only within that bullet; suffixes are literal files, not inferred phases.

### 29 explicitly unfinished phase files

1. `plans/261004-redteam-egc-hardening/phase-01-tdd-regression-suites.md:15-44` — pending; original seven-vector coverage needs native-schema replacement, not re-add ops acceptance.
2. `plans/261004-redteam-egc-hardening/phase-02-todo-batch-and-op-normalization.md:15-47` — pending; synthetic batch compatibility superseded by native-only transaction.
3. `plans/261004-redteam-egc-hardening/phase-03-context-and-diff-preservation.md:15-48` — pending; honest evidence/implementation-body preservation still accepted; source-aware bounded packet replacement.
4. `plans/261004-redteam-egc-hardening/phase-04-deconfliction-and-privilege-guard.md:15-53` — pending; actual EGC attestation, trusted modification authority and recovery; marker yielding must not be executed as designed.
5. `plans/261005-predict-recommendations/phase-02-decouple-evaluator.md:15-40` — `in_progress`; protection and real adapter exist; duplicate implementation/caller/policy removal remains.
6. `plans/261005-predict-recommendations/phase-03-documentation.md:15-34` — pending; resetFailures schema recommendation retired; correct real recovery documentation replaces it.
7. `plans/261006-red-team-hardening/phase-01-architecture.md:15-38` — pending metadata; types/error/test already exist; reconcile evidence.
8. `plans/261006-red-team-hardening/phase-02-ast-diffing.md:15-39` — pending metadata; heuristic analyzer and integration exist; performance/semantic claims not proven.
9. `plans/261006-red-team-hardening/phase-03-xml-boundaries.md:15-39` — pending; strict input/tag boundary acceptance only partially supported by actual utility.
10. `plans/261006-red-team-hardening/phase-04-remediation.md:15-38` — pending metadata; XML generator exists; current end-to-end taxonomy/coverage still requires reconciliation.
11. `plans/261006-red-team-hardening/phase-05-auth-rotation.md:15-38` — pending; original automatic 401 retry superseded by bounded generation-aware shared transport.
12. `plans/261012-judge-threshold-lifecycle-alignment/phase-01-research-and-prediction.md:15-63` — pending; preserve fixed probability/no range scaling and lifecycle root-cause requirements.
13. `plans/261012-judge-threshold-lifecycle-alignment/phase-02-threshold-and-decision-contract.md:15-59` — pending; historical .30/.80 matrix superseded; typed unavailable and complete human context retained.
14. `plans/261012-judge-threshold-lifecycle-alignment/phase-03-todo-enforcement-and-agent-guidance.md:15-87` — pending; guards already present, genuine authority/context/history gaps retained.
15. `plans/261012-judge-threshold-lifecycle-alignment/phase-04-regression-and-live-verification.md:15-92` — pending; translate obsolete expected decisions to approved policy; source/release/live verification still required where applicable.
16. `plans/261012-todo-drop-judge-fidelity/phase-01-failing-tests.md:1-21` — missing status, placeholder-only.
17. `plans/261012-todo-drop-judge-fidelity/phase-02-drop-gate-and-ratchet-escalation.md:1-21` — missing status, placeholder-only.
18. `plans/261012-todo-drop-judge-fidelity/phase-03-judge-input-fidelity.md:1-21` — missing status, placeholder-only.
19. `plans/261012-todo-drop-judge-fidelity/phase-04-reports.md:1-21` — missing status, placeholder-only.
20. `plans/261012-todo-drop-judge-fidelity/phase-05-regression-and-deploy.md:1-21` — missing status, placeholder-only. For 16–20 substantive acceptance is index :57-367.
21. `plans/261015-advisor-judge-jev-true-calibration/phase-01-advisor-jev-multi-signal-calibration.md:15-42` — pending vs Completed index table; independent evidence reasoning/negation remains, JEV-binding-as-independence rejected.
22. `plans/261015-advisor-judge-jev-true-calibration/phase-02-zero-0-80-0-30-threshold-walls.md:15-45` — pending vs Completed index; much current policy already exists; do not change approval policy to chase literal-zero checklist.
23. `plans/261015-advisor-judge-jev-true-calibration/phase-03-jev-state-criteria-fidelity-pipeline.md:15-48` — pending vs Completed index; scoped packet/budget/schema/caller parity partly implemented, substantive gaps listed above.
24. `plans/261015-advisor-judge-jev-true-calibration/phase-04-tdd-suite-baseline-sync.md:15-44` — pending vs Completed index; journal exists; integrated actual evidence/live rollout not established by table.
25. `plans/261015-judge-baseline-audit-cook/phase-07-p6-runtime-promotion.md:16-49` — in-progress; runtime promotion matrix; old pointer-failure claim stale, no automatic proxy edit.
26. `plans/261018-jev-session-forensics/phase-05-completion-evidence-fidelity-and-runtime-proof.md:15-98` — in-progress; source subset/repair done, live docs/UI/loaded provenance incomplete.
27. `plans/261019-jev-atomic-review/phase-01-evidence-and-authority-prerequisites.md:14-45` — pending; broad remaining source/authority prerequisites after narrow completed repair.
28. `plans/261019-jev-atomic-review/phase-02-shadow-evaluation-of-atomic-judgments.md:14-46` — pending; actual atomic/Advisor design+implementation and falsifiable held-out experiment.
29. `plans/261019-jev-atomic-review/phase-03-conditional-cutover-and-runtime-proof.md:14-43` — pending; complete consumer migration, exact native authority and conditional release proof.

### Nine completed children with unchecked acceptance (not permission to ignore)

- `plans/261002-typesafe-judge-alignment-fix/phase-01-audit-and-unify-network-transport.md:73-77`
- `plans/261002-typesafe-judge-alignment-fix/phase-02-api-contract-and-schema-alignment.md:84-87`
- `plans/261002-typesafe-judge-alignment-fix/phase-03-context-and-state-de-cluttering-anti-context-rot.md:81-85`
- `plans/261002-typesafe-judge-alignment-fix/phase-04-fix-compound-tools-rerank-and-multi-label.md:92-95`
- `plans/261002-typesafe-judge-alignment-fix/phase-05-configuration-hardening-and-zero-conflict-verification.md:69-73`
- `plans/261013-bicameral-judge-consensus/phase-01-decision-contract-categorical-verdict-refactoring.md:65-67`
- `plans/261013-bicameral-judge-consensus/phase-02-advisor-intent-evaluator-bicameral-consensus-engine.md:76-78`
- `plans/261013-bicameral-judge-consensus/phase-03-sovereign-human-authority-non-blocking-plan-reconciliation.md:74-76`
- `plans/261013-bicameral-judge-consensus/phase-04-red-team-adversarial-validation-baseline-deployment.md:57-59`

These require objective-level attribution: existing code/tests can satisfy parts; incompatible old 8KB/no-src-edits/instant clearing/permanent authorization objectives must be explicitly replaced rather than silently ignored.

## Evidence-based dependency proposals (acyclic output needs, not overlapping paths)

### Work-package outputs to preserve scope

- **A — Objective/authority contract reconciliation:** Original obligations, completed objective evidence, retired unsafe wording, stable task/criterion identity, trusted human policy and exact caller ownership. Integration owner produces actual interfaces/caller map, not an invented scheduler.
- **B — Evidence correctness:** Actual baseline preimages + full baseline-to-current commit interval, explicit task criteria/artifacts/test provenance, coherent payload budgets and truthful omissions. Owners: collector and shared evidence modules; consumes A contract identity. Covers real remaining item 23/24/28/29/30/33 evidence objectives.
- **C — Authority and reasoning:** Preserve independent Advisor results, negation, actual enforcement attestation, typed availability/disposition, native composed-policy consumption/history and exact result commit. Consumes A and B's evidence semantics; covers remaining 11/18/22/25/26/27/30/33 authority objectives.
- **D — Debate/input boundary consolidation:** One production debate policy/call graph, real adapter retained, stricter behavior preserved; shared untrusted-enclosure behavioral requirements. Consumes A policy decisions, not entire unrelated security plans. Covers 12–15.
- **E — Credential/process isolation:** Exact known-secret scrub, fail-closed residual guard, bounded traversal, centralized env-allowlisted child execution/caller migration. Can proceed independently of JEV reasoning after caller ownership assignment. Covers all accepted item 17 objectives, not just token regex.
- **F — Transport/fan-out/notification leftovers:** Shared question-count bound/current caller coverage and genuine transport-vs-notification taxonomy. Reuse existing retry client; no second auth retry owner. Covers item 8 and remaining item 21 requirements; consumes agreed limit/policy requirements, not full B/C.
- **G — Atomic workflow candidate and real Advisor synthesis:** Criterion/evidence packets, typed receipts, deterministic-vs-semantic allocation, preserved original-parent integration, non-authoritative shadow candidate. Consumes A/B/C/D relevant contracts and F request budgeting. Existing functions named EvidencePacket/ReviewReceipt in the plan are proposed types, not implemented API claims.
- **H — Comparative evaluation:** Independently adjudicated held-out whole tasks, repaired M vs H (and appropriate input baseline), actual model/rubric/evidence identities and usage, errors/abstentions/escalations/integration recall/cost/latency. Consumes repaired baseline + G candidate + representative labels and authorized API evaluation. Labels/API authority are external deliverables to obtain, not excuses to skip candidate implementation.
- **I — Conditional all-caller cutover and integrated verification:** Only if H passes predeclared acceptance/adoption authority; otherwise retain repaired M and accurately close/reject the candidate claim. Migrate all native/advisory/expert/plan callers and remove duplicates. Consumes accepted G/H decision; includes E/F when they alter the integrated candidate.
- **J — Managed promotion/live acceptance:** Current clean dry-run, correct managed target, backup/manifest transaction, target tests, allowed sync, user host restart, fresh origin and native docs/rejected-block UI/headless/stale/duplicate/branch/parent integration proof. Consumes exact integrated source/test candidate, not all historical indexes being marked complete.

### Proposed edges and reasons

1. **A → B/C/D**: criterion IDs, original/amended contract authority and policy must be defined before collectors, Advisor and duplicate consumers can agree. Shared files alone are not the reason.
2. **B → C's evidence-consumption integration**: independent reasoning/dispositions must read the correct evidence identity/omission model; local authority/negation work can begin in parallel against A's interface.
3. **B+C+D+F → G**: candidate must compare coherent actual evidence and preserved authority, not test decomposed judgments atop known broken packets/duplicate policies/unbounded fan-out.
4. **G + repaired-baseline proof + adjudicated labels + evaluation authority → H**: a model-quality comparison requires real runnable candidate and ground-truth whole-task labels; mocks/persona consensus cannot replace inputs.
5. **H accepted decision → I**, and **E/F accepted changes → I integration proof**: no unconditional migration of an unevaluated semantics candidate; security fixes can ship independently with their own correct verification/authority.
6. **Exact integrated candidate + deployment authority + clean current managed preflight → J**, then **user restart → origin/native live acceptance**. Existing 31/P6, 32/phase5 and 33/phase3 release objectives can share one integrated release evidence packet, but each original acceptance must be explicitly mapped; headless deletion alone does not cover human UI or docs completion.
7. **Forensics phase 4 → phase 5 recovery acceptance** is an actual narrow output dependency already in the plan and substantially source-complete. **Forensics 1→2→3** is its separate completed research branch, not a prerequisite for further source recovery.

### Explicit non-edges / stale dependency claims

- Do **not** require all of item 23 before item 22 just because frontmatter says blocks; only task contract/authority evidence needed by its particular work is a dependency.
- Do **not** require every older pending plan to finish before atomic prerequisite; reconcile inherited objectives into B–F instead of cycles.
- Do **not** add P6→forensics source fix→P6 cycles. Source implementations are independent; a later **shared integrated promotion** needs current candidate proof.
- Do **not** make runtime promotion a prerequisite for source-map/evidence-plumbing administrative targets already authoritatively completed. Deployment is separately authorized, not their original criterion.
- Do **not** block all source work on an old pointer failure. Latest contract has clean dry-run; conditional operator action exists only if a future preflight actually fails, never by replaying obsolete text.
- E process/secret isolation does not depend on model calibration or semantic evaluation. D debate consolidation does not depend on enabling resetFailures. F health/fan-out does not depend on runtime Advisor architecture.

## Completed objectives the master must not rebuild

1. Shared endpoint/model transport, answer validation/redaction, generation-aware bounded retry and real debate transport adapter.
2. Existing rerank/multilabel tools, candidate-specific question wording and structured primitives (separate remaining question-count objective retained).
3. Structural plan triage, expert roles, XML remediation builder, advisory completion tool and basic native dual-gate preflight.
4. Factory-owned native staging/result transaction, target/call/hash/generation/revision checks, tombstones and no pre-result debt clearing.
5. Managed transactional deployment/preflight/manifest ownership/compensation and immutable pointer validator; remaining release proof is not framework implementation.
6. Task classifier/scaffold filter/phase-boundary guards, no-default-test behavior and the narrow task-aware artifact applicability/delivery repair already verified by parent.
7. Accepted minimal identifier-boundary detector repair and retained adversarial controls; rejected lexical masking is not a candidate to resurrect.
8. Forensic cohort/extraction/paired evidence/Vietnamese diagnosis/persona report branch, and four Advisor definition/injected-policy instruction updates.
9. Observed native scratch judge-attributed obsolete rm/drop, plus completed exact mapping/source repair/verification administrative targets. Neither is proof of all phase-5/atomic runtime acceptance.

## Scope and safety dispositions to include explicitly in handoff

- **Outside latest workspace:** old global proxy creation; ~/tmp migration; global models.yml/models.db/hooks/MCP config/provider cleanup; external skill-reference edits; deployment target direct modifications. Do not execute through the historical plan. Only managed authorized deployment may write its owned outputs, and never the immutable proxy.
- **Retire/replace:** ops[] compatibility; exported singleton/pre-result deletion; payload isHuman/authorized/advisorApproved/allowJudgeModification/resetFailures as authority; clearing todo to remediate; default passing debate mock/fallback; blanket permanent human authorization; ALLOW+REJECT clean-tree auto-approval; marker-only EGC delegation; blind score averaging/blending as independent evidence; arbitrary threshold scaling/lowering/restoration; blanket 8KB/body-stripping anti-context-rot; same rejected input repeated until pass.
- **Preserve original accepted goals:** real completion/no hidden scope loss, justified obsolete removal with native commit, rejected block only trusted human confirmation, honest task-relative evidence and every-operation reports, secret/process isolation, safe external-call bounds, real reasoning review and parent integration.
- **Fresh checks for parent/implementation owner, not run here:** full relevant existing modules for each changed area; retained behavioral RED/GREEN only for real defects; actual-source changed callback smoke; full repo suite once integrated; managed isolated deployment rehearsal/dry-run; authorized target suite/sync; post-restart native scenarios with provenance. Existing test source is evidence of coverage intent, not executed success.

## Exact remaining information/authority gaps

- Representative adjudicated whole-task evaluation corpus, task/project holdouts and predeclared risk/cost acceptance are not established in existing source; H owner must produce them.
- Safe question-count policy and selected trusted per-tool initialization binding require source-backed design reconciliation; old numeric/API guesses are not facts.
- Latest complete human-UI/native recovery and successful docs-completion proof is missing; available headless/subprocess evidence cannot fabricate host-owned UI authority.
- Current loaded origin covers a limited record, not all imported TypeScript memory or every historical scenario. Disk equality and separate observer records must remain distinct.
- Legacy external tests/global skills/config work are NV; absence of those artifacts locally does not authorize global edits or imply all historical objectives should be reimplemented.

No blocker prevents creating the complete master coverage/dependency plan now. These are named execution inputs, conditional release gates and objective-level reconciliation decisions—not permission to omit older scope or stop at another partial recent-only proposal.
