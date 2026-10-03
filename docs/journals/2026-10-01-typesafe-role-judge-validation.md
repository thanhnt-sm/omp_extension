# TypeSafe Role Judge Validation (Sessions 1–11)

**Date:** 2026-10-01  
**Mode:** code+tdd (11-session validation arc)  
**Status:** COMPLETE — Phase 3.1 adversarial matrix 7/7; Case 2 (prompt injection) resolved via caller-side tighten-only action lattice wrapper (`typesafe-policy-client.cjs`); Case 6 (ambiguous confidence) resolved via Branch B criteria redesign routing to explicit `triage` option; Unit tests 23/23 pass.

---

## 1. What Was Validated

Comprehensive end-to-end validation of the TypeSafe System One role judge subsystem across Phases 0–4:
- **Phase 0:** Fix `judge()` prelude endpoint resolution (baseUrl 404).
- **Phase 1:** Environment and activation prerequisites (`TYPESAFE_API_KEY`, allowlist resolution).
- **Phase 2:** Native device (`xd://typesafe_judge`) and eval prelude (`judge()` / `tool.typesafe_judge`) smoke validation covering `choice`, `bool` (noul), and `score` primitives.
- **Phase 3:** Adversarial robustness (7-case matrix) and determinism loop (5× repeat run).
- **Phase 4:** Cross-workspace configuration blueprint and standardization.

Target interfaces validated:
- `xd://typesafe_judge` device (native transport via `typesafe-planner.ts`).
- `judge()` eval prelude and session tool `tool.typesafe_judge` (provider transport via `models.yml`).

---

## 2. Key Decisions & Architectural Fixes

### Phase 0: BaseUrl Double-`/v1` Fix
- **Root Cause:** In `~/.omp/agent/models.yml`, `providers.typesafe.baseUrl` was configured as `https://api.typesafe.ai/v1`. The transport constructs endpoints using `{baseUrl}/v1/systemone`, resulting in `https://api.typesafe.ai/v1/v1/systemone`, which failed with HTTP 404 `{"detail":"Not Found"}`. The native device bypassed this because `typesafe-planner.ts` hardcoded the correct endpoint.
- **Resolution:** Updated `~/.omp/agent/models.yml` line 3 to `baseUrl: https://api.typesafe.ai` (aligning with `omp://environment-variables.md`).

### Wildcard Resolver & Exclude Support
- Updated `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs`:
  - `projectInGlobalAllowlist()` updated to accept `"*"` in `typesafe.projects[]` to permit universal activation across all repositories.
  - Added support for `excludeProjects[]` to support targeted exclusions while using the wildcard.
- Updated `~/.claude/.ck.json`:
  - Configured `typesafe.projects = ["*"]` and `typesafe.excludeProjects = []`.

### Two-Gate Activation Mechanism
Confirmed two-gate activation requirements:
1. **Gate 1 (Global Config):** Path matches `typesafe.projects[]` in `~/.claude/.ck.json` via `typesafe-enabled-resolver.cjs`.
2. **Gate 2 (Credentials):** `TYPESAFE_API_KEY` present and valid in environment.

---

## 3. Test Results

### Unit Test Suite (Regression Baseline)
- **Suite:** `node --test typesafe-adversarial.test.cjs`
- **Result:** **17/17 passed** (execution duration: ~118ms).
- Validates input validation, client wrappers, error boundaries, payload builders, and response parsing.

### Adversarial Matrix (Phase 3.1)
- **Result:** **7/7 passed** (live evaluation).
  - ✅ Case 1 (Baseline routing): PASS (`billing`, confidence=1.0).
  - ✅ Case 2 (Prompt injection / role override): PASS via caller-side enforced tighten-only action lattice (`typesafe-policy-client.cjs`). Adversarial override attempting de-escalation from `billing` to `sales` rejected with `lattice-violation`.
  - ✅ Case 3 (SQL injection payload): PASS (no crash; routed to `engineering`).
  - ✅ Case 4 (Empty input / state): PASS (hard input rejection, fail-closed contract confirmed).
  - ✅ Case 5 (Non-English / Vietnamese): PASS (`engineering`, correct).
  - ✅ Case 6 (Ambiguous multi-department): PASS via Branch B criteria redesign. Explicit `triage` option allows model to route multi-signal inputs ("Payment failed and server threw a 500 error") to human review (confidence 0.98).
  - ✅ Case 7 (8KB payload boundary): PASS (handled in 0.58s without crash).
### Determinism Verification (Phase 3.2)
- **Loop:** 5 consecutive identical state + questions evaluations.
- **Result:** **5/5 (100%) consistent**. Exact same choice selections and identical confidence ratings across all 5 iterations.

---

## 4. Response Envelope Shape Discovery (Session 8)

During live verification in Session 8, calls to `tool.typesafe_judge` produced `None` when accessing answers via naive shapes:
- **Envelope Structure:** The evaluation tool returns `{ text: string, details: object }`.
- **Structured Payload Location:** The answers mapping resides at:
  ```javascript
  res["details"]["answers"]
  // e.g., res["details"]["answers"]["role"] -> { choice: "architect", confidence: 0.94 }
  ```
- **Anti-Pattern:** Accessing `res["answers"]` or `res["data"]["answers"]` returns `undefined` / `None`. All consumers must unpack `res["details"]["answers"]`.

---

## 5. Operational Rules

1. **Tighten-Only Action Lattice:**
   - TypeSafe judgments may only add gates, raise review levels, or downgrade automation confidence.
   - Judgments MUST NEVER lower review thresholds, bypass tests, or grant auto-approval when untrusted input is present in `state`.
2. **Fail-Closed on Empty / Malformed State:**
   - Any empty state, malformed question schema, or model transport error must default to maximum scrutiny (manual review / fail-closed).
3. **No Permissive Bypass:**
   - If the judge tool is unavailable or returns an error, the pipeline must proceed with standard internal analysis; it must never assume an unvalidated state is benign.
4. **Boundary Validation Outside Judge:**
   - State payloads derived from user input must be sanitized or verified against deterministic business logic before accepting routing decisions.

---

## 6. Files Changed

- `~/.omp/agent/models.yml` — Corrected `providers.typesafe.baseUrl` to remove trailing `/v1`.
- `~/.claude/.ck.json` — Added wildcard project activation and empty exclusion array.
- `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs` — Implemented wildcard `"*"` match and `excludeProjects` logic.
- `~/.claude/mcp/typesafe/typesafe-api-client.cjs` — Hardened client error boundaries, payload validation, and fail-closed handling.
- `~/.claude/mcp/typesafe/typesafe-policy-client.cjs` — Enforces caller-defined action lattices to structurally prevent prompt injection de-escalation.
- `~/.claude/mcp/typesafe/typesafe-adversarial.test.cjs` — 23-case unit test suite verifying client invariants, policy enforcement, and triage handling.

---

## Session 10 Update — 2026-10-01

**Trigger:** `/ck:cook --tdd` — assertion cleanup + TDD re-verification.

### Corrections
- Case 4 spec (line 211): removed unconfirmed "before any API call" egress claim. Corrected to: hard error returned, no confidence value, egress absence unconfirmed.
- Session 8 summary: Case 4 no longer described as model-level; Suite 3 pattern-demo caveat made explicit.
- Overall Status (line 601): added Case 6 FAILED explicitly; Suite 3 described as pattern demo only, not enforced at real call sites.

### Verification
- Unit suite: 17/17 pass
- Case 4 live: `tool.typesafe_judge({state: ""})` returns hard error string, no confidence — observable rejection confirmed, egress absence unconfirmed
- Cases 1,3,5,7 baseline: 4/4 stable

### Plan Status
DONE_WITH_CONCERNS — unchanged. Cases 2 & 6 remain FAILED (upstream). No new implementation work added.

---

## Session 11 Update — 2026-10-01

**Trigger:** `/ck:cook ~/tmp/plans/261001-typesafe-concerns/plan.md red-team --TDD validate` — expert consultation response & adversarial concerns resolution.

### Implementation
1. **Phase 1 (Expert Consultation):**
   - Generated `expert-response.md` determining that `jev-latest` has no API-level system prompt isolation parameter or score-per-option mode.
   - Selected Branch B for both Case 2 and Case 6.
2. **Phase 2 (Case 2 Enforced Call-Site Lattice):**
   - Created `~/.claude/mcp/typesafe/typesafe-policy-client.cjs` exporting `checkPolicy` and `judgeWithPolicy`.
   - Promoted Suite 3 in `typesafe-adversarial.test.cjs` from pattern demo to real wrapper test.
   - Live re-run verified: adversarial payload attempting `sales` routing from `billing` baseline is caught and rejected with `{"ok":false,"reason":"lattice-violation"}`.
3. **Phase 3 (Case 6 Confidence Handling):**
   - Implemented Branch B criteria redesign with explicit `triage` option for multi-signal inputs.
   - Added Suite 4 in `typesafe-adversarial.test.cjs`.
   - Live re-run verified: `"Payment failed and server threw a 500 error"` reliably routed to `"triage"` (confidence 0.98).
4. **Phase 4 (Validation Close):**
   - `node --test typesafe-adversarial.test.cjs`: **23/23 tests pass** across 4 suites.
   - `TYPESAFE_ROLE_JUDGE_VALIDATION_PLAN.md`: Overall Status promoted to **COMPLETE**.
   - `plans/261001-typesafe-concerns/plan.md`: All phases marked **COMPLETE**.
