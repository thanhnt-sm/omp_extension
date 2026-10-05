# Technical Solution Interpretation & Design Rationale

## 1. Problem Statement & Architecture Goals
Autonomous coding agents operating on complex software systems encounter specific classes of critical failures:
1. **Completion Hallucination:** Agents claiming a task is done when no git diff exists, tests were not executed, or assertions were commented out to pass.
2. **Scope Reduction:** Agents subtly dropping difficult requirements or edge cases from the task contract to achieve false completion.
3. **Infrastructure Tampering:** Agents editing their own guardrail files or resetting task lists to escape constraints.
4. **Latency & Token Explosion:** Calling heavy, multi-turn LLMs for every single micro-step.

The **TypeSafe Extension** solves these issues through a layered defense-in-depth architecture.

---

## 2. Solution Architectural Decisions

### 2.1 The Two-Tier Verification Gate (Fast Local + Semantic Remote)
- **Why not evaluate everything locally?**
  Local regex and exit codes cannot verify whether complex architectural criteria or qualitative prompt constraints have been met.
- **Why not evaluate everything via remote LLM?**
  Remote LLM calls introduce 1–3s latency, token costs, and can be fooled by prompt injection in git diffs or synthetic comments.
- **Decision:** Dual-cadence gating:
  - **Gate 1 (<150ms, 0 tokens):** Deterministically verifies OS-level proof (did git diff actually change? did `bun test` return 0? were test assertions deleted?).
  - **Gate 2 (Remote System One):** Only runs if Gate 1 passes cleanly.

### 2.2 Strict XML Tagging for Model Remediation
- **Why?** Less capable models (7B/8B or fast-tier models) get confused by free-form markdown error messages and repeat previous errors.
- **Decision:** All gate rejections generate structured `<remediation>` blocks with explicit `<immutable_constraints>` and `<action_items>`. The agent parses these as rigid instructions rather than loose suggestions.

### 2.3 File & Code Integrity Shield
- **Why?** In high-autonomy modes, an agent encountering a gate error might attempt to edit `typesafe-planner.ts` to bypass the check.
- **Decision:** `write` and `edit` tool calls are strictly intercepted. If a target file matches `PROTECTED_INTEGRITY_PATTERNS`, the extension immediately returns an invariant violation error unless human authorization is present.
