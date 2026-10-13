# ADR-20261013-typesafe-bicameral-judge-alignment: Bicameral Advisor-JEV Consensus, Threshold Elimination, and Non-Blocking Adaptive Remediation

Status: Decided
Date: 2026-10-13
Council: ai domain, 4 lenses (docs-fidelity, engineering, security, cost) + research

## Question

How should Oh-My-Pi (OMP) and TypeSafe System One (JEV) govern task verification and lifecycle transitions (such as dropping obsolete tasks and completing deliverables) without relying on arbitrary client-side floating-point thresholds (e.g., 0.80 / 0.30), while ensuring autonomous agent progress, strict human sovereignty, and non-blocking plan adaptation?

## Context

In the current implementation, OMP's `typesafe-planner` extension and `cook-expert-judge` rely on hardcoded local numerical thresholds (`TYPESAFE_AUTO_APPROVAL_THRESHOLD = 0.80`, `DROP_REJECT_FLOOR = 0.30`) applied over remote JEV Bayesian `noul` probabilities.

This architecture has caused severe operational friction in real-world workflows:
1. **Double-Guessing the Model**: When JEV calculates calibrated confidence (e.g. $P=0.75$ on code deliverables or $P=0.35$ on drop justification), client-side code forces the evaluation into an ambiguous "undecided gray zone" $[0.30, 0.80)$ or throws blocking exceptions.
2. **Terminal Agent Deadlocks ("omp bị lỗi không thoát ra được")**: When an agent legitimately finishes work or seeks to drop redundant tasks after a successful clean build (e.g., DataGuard build without MSBuild errors), the client interceptor throws unrecoverable errors rather than synthesizing next actions or respecting human intent.
3. **Configuration Sprawl**: Developers and users are forced to tune arbitrary environmental threshold variables (`TYPESAFE_AUTO_APPROVAL_THRESHOLD`) to bypass client-side barriers.

The user mandates an architecture where:
- Numerical thresholds are eliminated in favor of autonomous model intelligence.
- An Advisor evaluation stream and the OMP JEV Judge reach consensus.
- Human escalation occurs **only** when there is a genuine conflict between Advisor and Judge.
- Human decisions are sovereign, binding, and immediately unblocking.
- Judge/Advisor findings and `nextaction` requirements are synthesized into adaptive plan updates rather than terminal execution blocks.

## Options considered

| Option | Description |
|---|---|
| **Option 1: Static Threshold Adjustment (Status Quo with Relaxed Defaults)** | Keep client-side numerical arithmetic; lower default threshold from 0.80 to 0.50 or allow arbitrary env overrides. |
| **Option 2: Pure JEV Unicameral Authority (Direct Choice / Bayes Cutoff)** | Eliminate all client thresholds; convert JEV queries to categorical choice (`APPROVE`, `REJECT`) or standard Bayes majority ($P \ge 0.50$), with JEV acting as the single gatekeeper. |
| **Option 3: Bicameral Advisor-JEV Consensus with Sovereign Human Override & Adaptive Next-Action Remediation (Recommended)** | Establish dual evaluation: **Advisor** (contextual work-log and user intent evaluation) + **TypeSafe JEV** (ground-truth Git diff, AST verification, and deliverable evaluation). If both agree $\implies$ auto-execute. If they conflict $\implies$ escalate to human. Human verdict is permanently authoritative and binding. Low scores or missing criteria trigger structured plan adaptation rather than terminal blocking errors. |

## Lens verdicts

| Lens | Verdict | Confidence |
|---|---|---|
| **docs-fidelity** | **Option 3.** TypeSafe official documentation (`skill://typesafe-ai`, `docs.typesafe.ai`) explicitly warns: *"Treat cookbook thresholds and demo results as examples to evaluate, not universal rules or permanent model limitations"*. It recommends using JEV for programmable common sense and typed judgments, delegating uncertainty to human or reasoning agents rather than hardcoded client filter bands. OMP's native judge (`xd://eval/judge`) is designed around typed categorical choices and clean fallbacks. | 0.95 |
| **engineering** | **Option 3.** Eliminates the fragile arithmetic layer in `src/verification-gate.ts` and `src/cook-expert-judge.ts`. Replaces terminal `throw new Error(...)` exceptions with constructive plan/todo reconciliation loops. Resolves the recurring `omp bị lỗi không thoát ra được` bug by providing deterministic unblocking pathways. | 0.92 |
| **security** | **Option 3.** Preserves the tighten-only lattice without artificial numbers. Requiring consensus between two independent lenses (Advisor checking intent/history and JEV checking ground-truth diff/AST) prevents single-agent spoofing (Attack 1 & 8). Sovereign human approval provides cryptographic and procedural fail-safe. | 0.90 |
| **cost** | **Option 3.** Dramatically lowers $/completed-task economics. Prevents token-wasting retry storms where an agent repeatedly fails against a rigid 0.80 barrier. Single JEV pass + local Advisor evaluation costs substantially less than multiple failed cycles followed by stall ratchet escalations. | 0.94 |

## Evidence

| Claim | Source | Date | Type | Supports |
|---|---|---|---|---|
| TypeSafe thresholds are illustrative examples, not permanent model limits | `https://docs.typesafe.ai`, `skill://typesafe-ai` | 2026-10-13 | official | Option 3 |
| OMP `judge` is designed as a typed primitive (`choice`, `bool`, `score`) returning direct verdicts | `xd://eval/judge` | 2026-10-13 | official | Option 2, Option 3 |
| OMP TypeSafe judge supports automatic graceful fallback chains (`@tiny`, `@smol`, `@default`) | `skill://omp-typesafe-judge-setup` | 2026-10-13 | official | Option 3 |
| Deleting numerical thresholds without a consensus replacement broke 10 test suites in target deployment | `tools/sync-baseline.bat` build log | 2026-10-13 | measured | Option 3 |
| Human authorization bypass allows legitimate task drops when host context proves intent | `tests/todo-drop-gate.test.ts:400-430` | 2026-10-12 | measured | Option 3 |

## Decision

**Adopt Option 3: Bicameral Advisor-JEV Consensus, Sovereign Human Override, and Adaptive Next-Action Remediation.**

1. **Eliminate Client Thresholds**: Remove hardcoded client numerical comparisons (`< 0.80`, `< 0.30`) and the ambiguous "gray zone".
2. **Bicameral Evaluation**:
   - **Lobe 1 (Advisor / ck:advisor)**: Evaluates semantic intent, conversation context, user prompts, and agent work log. Returns `ALLOW` | `DISALLOW` | `UNCERTAIN`.
   - **Lobe 2 (OMP Judge / TypeSafe JEV)**: Evaluates ground-truth Git diff, test execution exit codes, and AST boundaries via categorical verdict (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED`).
3. **Consensus & Escalation Engine**:
   - Both agree on approval $\implies$ **Auto-Approve** (proceed immediately, zero human intervention).
   - Both agree on rejection $\implies$ **Synthesize Remediation** (actionable plan delta, no terminal exception).
   - Dissent/Conflict between Advisor and JEV $\implies$ **Escalate to Human** with both viewpoints presented concisely.
4. **Sovereign Human Invariant**:
   - When the human confirms/approves (e.g. clicking Yes on drop or approving a plan change), the decision is recorded as authoritative `host-authorization`.
   - The engine MUST immediately execute the approved mutation; subsequent gates are prohibited from re-blocking human-approved operations.
5. **Non-Blocking Plan & Todo Reconciliation**:
   - If JEV or Advisor identifies missing requirements (`NEXT_ACTION_REQUIRED`), the engine generates concrete `nextaction` items, automatically drafts updates to `todo` and `plan.md`, presents the proposed plan revision to the human, and continues execution upon approval.

## Rationale

The council unanimously agrees that mathematical filtering on the client side ($P \ge 0.80$) was an architectural misstep that contradicted both TypeSafe's official design philosophy and OMP's agent autonomy goals.

JEV System One models are trained for calibrated common-sense judgments. Second-guessing JEV with floating-point bands created a "bureaucratic filter" that locked agents into unrecoverable failure loops.

By pairing JEV's ground-truth code verification with the Advisor's intent understanding:
- False positives (scaffolds/stubs with passing exit codes) are caught because JEV examines the AST and diff deliverables.
- False negatives (reasonable drops of obsolete tasks after build success) are resolved because the Advisor verifies user intent and success conditions.
- Human escalation is reserved exclusively for genuine ambiguity, eliminating notification fatigue.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Agent hallucinating Advisor consensus** | High | Advisor evaluation runs in a controlled extension context or independent subagent sandbox; it cannot be spoofed by raw prompt text. |
| **Breaking existing test assertions** | High | Progressively refactor existing unit test suites (`tests/todo-drop-gate.test.ts`, `tests/cook-expert-judge.test.ts`) to assert bicameral decision states rather than numeric 0.80 boundaries. |
| **Unbounded plan update loops** | Medium | Cap automated plan adaptation cycles to at most 2 iterations before mandating human intervention. |
| **Silent drop of critical tasks** | Critical | Enforce sovereign human confirmation whenever a contracted task has non-zero diff evidence unless JEV and Advisor both emit unconditional approval. |

## Implementation checklist

- [ ] **Phase 1: Decision Contract Refactoring**:
  - Update `src/cook-expert-judge.ts` to convert `runDropJustificationCheck` and `runPhaseMacroCheck` questions to categorical verdicts (`APPROVE`, `REJECT`, `NEXT_ACTION_REQUIRED`).
  - Deprecate `resolveAutoApprovalThreshold` and `DROP_REJECT_FLOOR`.
- [ ] **Phase 2: Bicameral Evaluator Integration**:
  - Implement `evaluateAdvisorIntent(ctx)` in `src/debate-evaluator.ts` or `src/plan-evaluator.ts`.
  - Harmonize Advisor and JEV Judge outputs into `BicameralConsensusResult` (`auto_approve`, `auto_reject`, `human_escalation`).
- [ ] **Phase 3: Sovereign Human Authority & Plan Reconciliation**:
  - Update `handleTodoInterception` in `typesafe-planner.ts` to enforce unconditional execution when human approval is present.
  - Implement non-blocking plan synthesis: on rejection or next-action directive, generate updated todo items and present for human review without throwing fatal errors.
- [ ] **Phase 4: Regression Alignment & Deployment**:
  - Update test suites in `tests/` to validate bicameral scenarios.
  - Deploy baseline via `node tools/sync-baseline.cjs` and verify 100% pass across all target suites.

## Reopen conditions

- TypeSafe releases a breaking API revision to `/v1/systemone` or alters primitive semantics.
- Measured telemetry indicates an increase in unauthorized task drops under bicameral consensus.
- Host human users report notification fatigue from conflict escalation rate exceeding 10% of total tool calls.

## Owners

- Architectural Owner: OMP TypeSafe Core Extension Team
- Runtime Security: Red-Team & Verification Gate Maintainers

## Council metadata

- Models used: 4 lenses (docs-fidelity, engineering, security, cost) + research (built-in harness analysis)
- Cost estimate: ≈$0.50 (cached harness evaluation)
- Lenses run: docs-fidelity, engineering, security, cost (domain: ai)
- Generated by: `/ck:council` on 2026-10-13
