---
phase: 6
title: "Finish bounded transport and trusted tool policies"
status: pending
priority: P1
dependencies: [5]
---

# Phase 6: Finish bounded transport and trusted tool policies

## Overview

Finish C25/C26/C28/C29/C31: bound every question-producing/egress path, implement the selected trusted **per-tool initialization** policy, and separate startup notification failures from transport failures. Preserve the existing prepared-body retry runner, credential generations, bundled resolver and task-artifact delivery repair. This is an executable implementation contract; this document alone is DOCS-ready, not feature/runtime completion.

**Current state (2026-10-22) — re-verified, do not trust the older premise:** the EGC transport claim in earlier drafts is stale. `jevHttp` and `HOST_POLICY` do not exist anywhere in `src/` or `typesafe-planner.ts`; `src/egc-judge.ts:14-44` already routes EGC judgment through the canonical `typesafe-policy-client.cjs` (`judgeWithPolicy`, closure-bound purpose `"egc"`, count guard + bounded question map). Verify that seam and close the row if clean rather than demolishing working code.

Still real and in scope: `validateInput` accepts any nonempty question count; rerank/multilabel allocate unbounded maps; startup notification delivery is entangled with transport classification. Phase 4 owns EGC scrubbing; this phase owns transport limits and retry ownership.

**New requirement (red-team #9):** `src/advisor-native-budget.ts:37-41` awaits an abort-signalled operation *after* the scheduler returns, with no bound. Bound that drain (race against the deadline or reject on abort) so a non-cooperative operation cannot extend the review episode past the declared 300000 ms deadline.

## Requirements

- **Operational policy, not vendor truth:** default and hard local ceiling `maxQuestionsPerRequest = 128`; trusted per-purpose initialization may lower it to a positive safe integer, never exceed 128 without a separately reviewed code/policy change. This ceiling bounds map/answer work, permits the illustrative 80-question comparison, and remains conservative alongside a fixed 32,768-byte final-body limit and initially serial evaluation scheduling. It is not a proven optimum, throughput quota or vendor maximum. Historical `20` was illustrative, not a specification.
- The completed `EvaluationAdoptionDesign` advisor captured official [context documentation](https://docs.typesafe.ai/models.md#context-length): **no separate question-count maximum**, subject to model context. Earlier audits correctly treated the vendor count as unknown; do not turn their uncertainty or an example into an API limit. Captured defaults are 64k tokens/request and 32k tokens/question; state participates in both applicable budgets. Preserve the captured-source/date in documentation; make no additional external calls for this phase's planning.
- Official [HTTP rules](https://docs.typesafe.ai/api.md#request-rules) allow **32 MiB**; repository operational policy remains **32 KiB = 32,768 UTF-8 serialized bytes**, including model, question keys, instructions, criteria, JSON escaping and post-redaction expansion. No test/production 32/64-KiB split, danger-zone header, byte-to-token equivalence or automatic context expansion.
- Reject excess requests before normalizing/building question maps and again after preparation/before POST. No silent dropping, duplicate dimension overwrites, automatic chunking, question rewrites or truncation that changes question meaning. Mandatory proof loss remains `EVIDENCE_REQUIRED`; body/count policy failures are typed local-policy outcomes, never semantic rejection/approval. A topology infeasible under bytes/context/count is reported infeasible with full coverage accounting.
- Bound the whole semantic-review job as well as each request. Trusted local registration defaults: maximum128packets,384HTTPdispatches including retries,300000ms admission-to-terminal JEV-review deadline,1active review and1queued review. These are local resource ceilings, not vendor quotas, measured latency/SLOs or limits on original task size; trusted initialization may lower them. Freeze the finite coverage manifest first, consume bodies lazily, propagate cancellation to actual fetch/queue work and stop before another dispatch when exhausted. Preserve uncovered criteria as insufficient, never trim/approve them. Actual reasoning tasks retain their supported host cancellation/limits separately; do not claim an unenforced provider timer.
- Trusted initialization supplies per-tool/purpose budget, action-lattice and provider restrictions. Neither tool arguments, state, questions, model responses nor corpus JSON can set/raise policy or grant consent. No global consent provisioning, provider/config/model-cache/hash mutation, source fallback approvals, periodic probe daemon or second retry manager.

## Architecture

### Planned public interfaces (not asserted existing APIs)

Extend existing `ExtensionRuntimeOptions` with `toolPolicies?: Partial<Record<JudgePurpose, TrustedToolPolicy>>`. Define shared TypeScript contracts beside `TypeSafePayload` in `src/payload-safety.ts`; the existing CJS policy module owns runtime validation/resolution using matching JSDoc, not a parallel framework:

```ts
type JudgePurpose =
  | "judge" | "rerank" | "multi" | "plan" | "debate" | "advisory"
  | "expert" | "advisor" | "native_done" | "native_drop"
  | "decision" | "health" | "egc" | "evaluation";
interface TrustedToolPolicy {
  readonly maxQuestionsPerRequest: number;
  readonly provider: { readonly allowedModels: readonly string[] };
  readonly routing?: {
    readonly baseline: string;
    readonly lattice: readonly string[];
    readonly questionKeys?: readonly string[];
  };
}
```

Registration resolves built-in purpose defaults plus explicit host initialization overrides once, validates and copies/freezes nested arrays/objects. Invalid supplied policy disables the affected purpose with `policy_invalid` and zero POST, not silent defaulting/session termination. Existing trusted environment baseline/lattice may supply the **registration-time default only**; remove module-global `HOST_POLICY` and never reread untrusted/model input as policy. Separate registrations cannot mutate each other. Missing/corrupt required bundled policy returns visible `policy_client_missing`, not enabled-without-policy or a host crash. `allowedModels` constrains any retained requested-model selector; it cannot change endpoint, policy or provider settings. Do not change the accepted semantic approval thresholds.

The initial host map binds all purposes explicitly, including non-lattice numeric/rubric consumers. General `judge` retains the current review baseline and auto/review/block tighten-only default. Domain-specific routing may use its own trusted lattice and an explicit uncertainty/triage action **only where that consumer is a routing/triage decision**; noul, score, plan-quality and arbitrary expert categorical rubrics do not acquire a universal business-domain `triage` choice. For configured routing keys require the expected choice question/answer. For general action-lattice detection, preserve enforcement of known routing options and reject mixed known-action/unknown-action option sets instead of allowing a new option to bypass the lattice. Reuse `checkPolicy`; non-routing choices remain governed by their existing rubric/composer.

### Planned private/shared seams

- Existing CJS API client: extend `validateInput(args, trustedLimits)` and add `validateQuestionCount(count, trustedLimits)` plus `prepareRequest(args, trustedLimits, redactionOptions)`. Return discriminated success with `{body, questions, bodyBytes, questionCount}` or short typed failure. Validate raw count, redact with existing bundled code, revalidate prepared count/keys/meaning, measure final JSON bytes; compare mandatory-evidence coverage through the Phase 2 packet contract. Do not bypass secret-key rejection. No new classes/modules are required.
- `requestWithRetry` stays the only retry runner. Its existing low-level `body` contract remains byte-identical across attempts; every production caller must obtain the body from `prepareRequest` and pass a final bounded-body assertion before egress. The low-level runner also rejects above-32-KiB bodies before fetch, so direct use cannot evade the byte invariant. It does not infer semantic question count from arbitrary non-judgment fixture bodies.
- `judgeTypeSafe` and `judgeWithPolicy` accept trusted policy/limits as host options **outside `args`**, reuse shared validation/preparation and the existing runner. `judgeWithPolicy` validates before either injected judge or real transport; selected routing answer must match its configured key, not the first unrelated choice answer.
- `executeTypeSafe(..., boundPolicy)` and `createExtensionJudgeClient(..., purpose)` are private closure-bound adapters; callers supply a constant purpose from host code, never model parameters. Standalone default clients use the same built-in trusted purpose defaults; host/evaluation integration injects a bound client when custom policy is needed, without mutable process-global setters.
- Preserve canonical response model/usage/attempt metadata through these adapters for Phases 7/8 using the Phase 1 receipt contract. Policy identity, effective question cap, question IDs/count, final bytes and coverage are receipt fields; unknown provider usage/resolved model stays unknown, not copied from requested model. No extra accounting/retry service.
- Add the small trusted `semanticReviewLimits` object to purpose-policy initialization and frozen identity, outside model arguments. Count actual shared-runner attempts once; orchestration owns no retry loop. Multi-packet preparation occurs through the explicit review/verifier path outside the22-second mutation callback; native staging only revalidates current receipts/composes policy. Missing total-budget metadata or exhausted coverage is a typed pending/unavailable/evidence outcome, not implementation rejection.

Startup becomes **resolve dependencies/enablement → one bounded transport try/catch → classify result → independently deliver UI/messages**. A small private notification function awaits `Promise.resolve(ui.notify(...))` inside its own catch, tolerates absent/synchronous/asynchronous hosts and never changes the captured transport result. Keep `safeSendMessage` for origin/online/injection/auth/warnings, including the current auth path's unsafe direct `.catch()` call. Notification failure is a host-delivery failure, not `API unreachable`; genuine network/timeout failures still produce transport diagnostics. Health remains diagnostic, once per startup event, skipped for subagents/no-key/disabled/cooldown, with one attempt and a 3-second total budget; no completion authority.

## Related Code Files

All paths below are workspace paths; actions are for future implementation only.

- Modify `D:/100.Software/Github/omp_extension/src/typesafe-api-client.cjs`: count/body/prepared-request guards, trusted limits, metadata preservation; retain retry/auth generations and replace stale duplicated-policy comment.
- Modify `D:/100.Software/Github/omp_extension/src/typesafe-policy-client.cjs`: validated immutable per-purpose policy resolution, keyed lattice enforcement and bounded wrapper.
- Modify `D:/100.Software/Github/omp_extension/src/payload-safety.ts`: shared policy types and explicit uniform 32-KiB default/preparation integration; preserve bundled redaction and Phase 2 evidence contract.
- Modify `D:/100.Software/Github/omp_extension/typesafe-planner.ts`: factory policy options, all registration/internal purpose bindings, early fanout rejection, startup taxonomy and safe auth delivery. Parent is the single integration owner of this shared entrypoint.
- Modify `D:/100.Software/Github/omp_extension/src/cook-expert-judge.ts`, `D:/100.Software/Github/omp_extension/src/plan-evaluator.ts`, `D:/100.Software/Github/omp_extension/src/verification-gate.ts`: standalone defaults use canonical guards/body/policy, no direct unguarded prepared POST.
- Verify `D:/100.Software/Github/omp_extension/src/egc-judge.ts` (already canonical): count guard, purpose binding, typed failure codes. Do not rewrite it as part of this phase; `src/egc.ts` owns scrubbing (phase 4) and authority (phase 3), not a second transport.
- Modify `D:/100.Software/Github/omp_extension/src/advisor-native-budget.ts`: bound the post-scheduler drain of an abort-signalled operation (red-team #9).
- Full policy-client consumer inventory for interface changes: `src/advisor-native-budget.ts`, `src/atomic-evaluation.ts`, `src/atomic-judge.ts`, `src/debate-evaluator.ts`, `src/egc-judge.ts`, `src/plan-evaluator.ts`, `src/semantic-judge-client.ts`, `src/typesafe-api-client.cjs`, `typesafe-planner.ts`, `tools/jev-paired-workspace.ts`, `tools/sync-baseline.cjs`.
- Preserve/read `D:/100.Software/Github/omp_extension/src/typesafe-enabled-resolver.cjs`; extend resolver tests only if a real new contract case is missing. No global configuration edits or automatic wildcard provisioning.
- Modify tests `D:/100.Software/Github/omp_extension/tests/typesafe-transport-retry.test.ts`, `D:/100.Software/Github/omp_extension/tests/health-watchdog.test.ts`, `D:/100.Software/Github/omp_extension/tests/typesafe-planner-integration.test.ts`, `D:/100.Software/Github/omp_extension/tests/payload-safety.test.ts`, `D:/100.Software/Github/omp_extension/tests/egc.test.ts`, and relevant existing client/rubric modules named below. First three paths were directly inspected and exist.
- Update `D:/100.Software/Github/omp_extension/docs/typesafe-operations.md` and `D:/100.Software/Github/omp_extension/docs/source-code-specification.md`: exact local/vendor limits, trusted init examples, error ownership, no-retry-to-pass behavior and actual verified outcomes; parent owns consolidated changelog/history reconciliation.
- No new production modules/classes, external packages, or deployment/global files.

## Implementation Steps

1. **Transport/policy owner — RED contracts first.** Add behavioral cases to the three actual regression modules above; use injected fetch/timer/home/env fixtures, restoring globals. Test callback execution, sent body, zero POST and state outcomes, not source-string/wiring assertions. Preserve positive known requests and the current F16 artifact tests. Before exported signature edits, obtain actual language-server references and enumerate every production egress consumer, including EGC and Phase 7/8 additions.
2. **Transport/policy owner — canonical limits and configuration.** Implement CJS policy validation/snapshot and shared count/prepared-body guards. Validate 0/128/129 questions; trusted lower cap 2 permits 2/rejects 3. Reject invalid caps (NaN, fractions, zero, negative, >128), malformed lattices/unknown baselines, disallowed models and missing required policy before fetch. Apply identical local caps in test and production. Keep optional evidence reduction explicitly manifested; never treat altered mandatory proof/question semantics as coverage.
3. **Entrypoint owner — migrate all actual callers.** Raw `typesafe_judge` checks count before normalization. Rerank checks candidate length before allocation; multi checks dimension length and uniqueness before object construction (reject duplicate keys, never collapse inputs). Bind plan/debate, advisory completion, expert roles, Advisor tools, ask/decision risk evaluation, native done and drop/replacing-init to the correct constant purpose. Re-resolve `createExtensionJudgeClient` callsites at cook time; the last verified set is `typesafe-planner.ts:1227` (adapter/factory), `:1780`, `:2231`, `:2252`, `:2287`, with the factory at `:2066`. Preserve native call/hash/generation/revision/result staging guarantees and advisory non-authority.
4. **Standalone/EGC owner — verify, then close only real bypasses.** Confirm `egc-judge.ts` already uses the canonical client and one transport owner; record `I` if clean. Route default cook/plan/gate clients and the CJS policy wrapper through the same limits. Carry Phase 2 evidence insufficiency and Phase 3 availability taxonomy unchanged. Phase 7 atomic construction and Phase 8 evaluation preflight consume this API before packet-map allocation; no evaluation-owned retry loop. If global80 cannot preserve coverage under 32 KiB/context or a lower host cap, report its exact infeasibility, not chunked "global" success. Bound the advisor budget drain before declaring the review deadline enforced.
5. **Entrypoint owner — isolate startup delivery.** Narrow network catch to request work; classify real outcomes once; independently safe-await notify and safe-send messages. Verify successful online/injection continues even when notify throws/rejects, failed delivery cannot arm auth/cooldown or trigger another probe, and real auth/404/429/529/network/timeout results retain their own meaning.
6. **Parent — integrated GREEN and handoff.** After all changes land, run full affected modules and actual changed-path smokes below once; inspect updated receipts/body coverage and send fresh evidence to the read-only Advisor if the authoritative gate rejected. Re-evaluate through the same gate, not weaker fallback. Update docs with exercised evidence only. Phase 9 covers full-suite/consumer integration; Phase 10 alone owns authorized promotion/restart/live proof.

## Success Criteria

- [ ] One-question known-good judge, indexed rerank and structured binary multi-label still POST to `/v1/systemone` and preserve every requested ID/answer; native/advisory/expert/plan/debate/EGC paths use the same bound policy without changing their authority.
- [ ] Exactly 128 compact questions passes count validation; 129 and trusted-cap 2/3 boundaries fail with typed `question_limit_exceeded`, zero POST, no partial result/native staging and no map-allocation fanout. Empty/malformed inputs remain invalid. Duplicate dimensions are explicitly rejected.
- [ ] Final prepared bodies at 32,768 bytes are accepted when otherwise valid; 32,769 fail with zero POST. Include multibyte UTF-8, JSON escapes, long identifiers, model overhead, redaction expansion and oversized mandatory-artifact controls. Raw oversize that only fits by losing mandatory proof is evidence-required, not success. Context-limit responses remain infeasible; no long-context enablement.
- [ ] Two registrations with different trusted baseline/lattice/caps stay isolated; mutation of the original initialization object after registration has no effect. Forged top-level/state/nested `policy`, `baseline`, `lattice`, `maxQuestions`, provider settings and model-selected policy cannot loosen the trusted binding. Invalid/missing/corrupt policy makes zero POST, never mock approval.
- [ ] Known routing `auto` below `review` fails; `review`/`block` remain valid; unknown/mixed routing choices fail; an unrelated legitimate categorical rubric is not forced into the routing lattice. Domain triage exists only for a configured routing purpose.
- [ ] HTTP 200 plus synchronous notify throw or asynchronously rejected notify remains transport-online, delivers safe host messages where possible, emits no network warning, performs one probe and produces no unhandled rejection. Repeat with auth/404/429 outcomes and absent/sync/rejected sendMessage: original classification survives; genuine fetch rejection/timeout still reports transport failure.
- [ ] Real 429/529 retry remains bounded to three attempts/15 seconds by default, byte-identical prepared body, bounded Retry-After/cooldown/cancellation; 401/403 and other 5xx/network errors do not gain retries. Preserve A→B→A stale-generation immunity, auth alert/debounce and safe sendMessage. EGC cannot retain its separate 5xx loop.
- [ ] No-key/kill-switch/exclusions and bundled-only/missing/corrupt dependency behavior remain fail-closed; poisoned globals are ignored and consent/global configuration/model hashes are unchanged. Startup remains diagnostic and event-driven, not a daemon or permission to complete a task.
- [ ] A multi-packet job is bounded across packet count, all HTTP attempts, admission/queue/deadline and cancellation; no over-limit dispatch or unbounded eager body allocation occurs. Native completion consumes valid receipts without that HTTP loop; missing/stale/exhausted coverage leaves staging empty.
- [ ] Full modules and actual callback smokes pass in the implementation session with commands/results recorded; this planning session claims none were run. Receipt cap/bytes/coverage metadata is ready for Phases 7/8; no deployment/equality inference closes acceptance.

## Verification

Future **parent-only** commands from `D:/100.Software/Github/omp_extension`, after implementation/integration; do not execute during this planning phase:

```text
bun test tests/typesafe-transport-retry.test.ts tests/health-watchdog.test.ts tests/typesafe-planner-integration.test.ts tests/payload-safety.test.ts tests/auth-recovery-watchdog.test.ts tests/typesafe-resolver.test.ts tests/cook-expert-judge.test.ts tests/plan-evaluator.test.ts tests/verification-gate.test.ts tests/client-debate.test.ts tests/egc.test.ts
bun test tests/typesafe-planner-integration.test.ts --test-name-pattern "bounded fanout actual callbacks"
bun test tests/health-watchdog.test.ts --test-name-pattern "notify failures preserve probe classification"
bun test tests/egc.test.ts --test-name-pattern "canonical bounded judge transport"
bun test tests/typesafe-planner-integration.test.ts --test-name-pattern "bundled modules ignore poisoned globals"
```

The first command runs **whole modules**. Add the three named changed-path smoke cases during RED: invoke real registered tool/event/EGC callbacks against isolated injected transport, observe request bodies/outcomes/staging, and prove over-cap/missing-policy makes zero POST. These are deterministic runtime smokes, **not** live vendor/model-quality/native-UI proof. The existing copied-bundle subprocess smoke tests actual bundled loading. No network API probe is required to confirm documented limits. Parent's Phase 9 full `bun test` and Phase 10 authorized changed-path runtime checks remain separate.

## Risk Assessment

- **128 is an operational choice, not performance evidence:** retain explicit 32-KiB/context guards and observed quotas; evaluation records the effective host cap/infeasible arms. No unsupported saving/latency claim or silent count reduction.
- **Shared entrypoint/EGC ownership:** sequence the parent-owned patches after Phase 4/5 contracts; avoid duplicate policy types, competing scrub changes or a second transport runner. Any helper that becomes a new module must be a bounded domain helper (~200 lines), not a new framework.
- **Lattice overreach or spoofing:** exact host purpose binding plus keyed/action-option validation preserves routing enforcement without applying business triage to arbitrary primitives. Policy is immutable initialization data, never an agent authority parameter.
- **Coverage lost by redaction/capping:** compare complete mandatory artifacts and question semantics, preserve F16 handling and Phase 2 omission manifest, reject insufficient requests before POST. No chunking or summaries masquerade as complete coverage.
- **Notify catch hides transport errors:** capture transport outcome first, isolate only delivery failures, and assert positive/negative diagnostics and fetch counts. Do not suppress real failures or fabricate online/approval results.
