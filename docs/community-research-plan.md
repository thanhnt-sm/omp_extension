# Community Solutions Research Plan for OMP Extension (`ck:research`)

## 1. Objective & Scope
Systematically investigate, benchmark, and evaluate existing open-source and community-tested solutions across the VS Code, OMP (oh-my-pi), and autonomous coding agent ecosystems for reuse in `omp_extension`.

Every proposed integration candidate must pass the project's **Red-Team Security & Integrity Gate** defined in the architectural specifications (`docs/SAD.md`, `docs/SDD.md`, `docs/typesafe-red-team-report.md`).

---

## 2. Target Research Subsystems & Community Benchmarks

### Subsystem 1: Dual-Cadence Verification & Local Deterministic Pre-checks
- **Objective**: Identify static AST analyzers and diff-inspection libraries to detect assertion deletion, test weakening, and test evasion without invoking remote LLM tokens.
- **Current Baseline / Gap**: Basic regex matching (`- expect(`, `- assert(`) can be bypassed by commenting out assertions or deleting entire test fixtures (`- it("...", ...)`).
- **Target Candidates**:
  - `ts-morph` or `babel-traverse` lightweight visitors for diffed files.
  - Test runner hooks / reporter hooks from Vitest, Jest, or Bun test runners.
  - Mutation testing principles (e.g., Stryker Mutator) applied to git diff inspections.

### Subsystem 2: Prompt Injection Sanitization & Delimiter Boundary Isolation
- **Objective**: Establish structured context enclosure boundaries to eliminate delimiter confusion and prompt injection when formatting plan drafts and diffs for TypeSafe System One judgments.
- **Current Baseline / Gap**: Raw template string interpolation allows adversarial prompt overrides (Finding 1 in `typesafe-red-team-report.md`).
- **Target Candidates**:
  - Industrial prompt isolation frameworks (e.g., Guardrails AI, Guidance, LlamaIndex prompt guards).
  - Strict XML schema boundary escaping and defensive tag encoding.
  - System-level role segregation patterns in multi-turn judge evaluations.

### Subsystem 3: Remediation Protocols for Fast / Compact Models
- **Objective**: Formalize structured, machine-executable feedback loops (XML/JSON schema) that enable compact models (7B/8B or fast-tier LLMs) to remediate failed verification gates deterministically.
- **Current Baseline / Gap**: Vague probabilistic scores (e.g., `meets_criteria: 0.09`) cause weaker models to loop infinitely or attempt test stripping.
- **Target Candidates**:
  - Reflexion / Self-Refine agent feedback patterns.
  - DSPy assertions and backtrack repair primitives.
  - Aider repository-map lint/test feedback loop mechanics.

### Subsystem 4: Credential Protection, Key Rotation & Multi-Tier Fallback
- **Objective**: Ensure seamless API credential rotation with zero telemetry leakage and robust fallback across model tiers.
- **Current Baseline / Gap**: Need verified patterns for in-memory token hashing and resilient HTTP 401/403 recovery without process restarts.
- **Target Candidates**:
  - VS Code `SecretStorage` patterns.
  - LangChain / LlamaIndex resilient HTTP client interceptor implementations.
  - Upstream TypeSafe System One canonical client designs (`jev-latest`).

---

## 3. Red-Team Vetting Protocol for Candidate Solutions

Each candidate solution surfaced by `ck:research` must be scored against four non-negotiable architectural criteria:

| Criterion | Standard | Rejection Trigger |
|-----------|----------|-------------------|
| **Zero-Trust Supply Chain** | Minimal transitive dependencies; verified permissive license (MIT, Apache 2.0). | Network telemetry, hidden callbacks, or access to sensitive credential stores (`~/.claude`). |
| **Zero-Token Local Overhead** | Gate 1 evaluation must complete in $<150\text{ms}$ with zero remote LLM token cost. | Latency $>250\text{ms}$ or requirement of remote API calls for deterministic checks. |
| **Code & File Shield Integrity** | Compatible with the read-only guardrails in `typesafe-planner.ts`. | Attempts to monkey-patch or dynamically rewrite protected infrastructure files. |
| **Deterministic Data Contract** | Output is strictly typed (TypeScript interfaces) and verifiable. | Undocumented text parsing or probabilistic heuristic outputs. |

---

## 4. Deliverables Required from `ck:research`

For each evaluated ecosystem solution, `ck:research` must provide:
1. **Source Repository & Ecosystem Maturity**: Maintainer, license, release cadence, and dependency footprint.
2. **Mechanism & Architecture Fit**: How the library/pattern operates and maps to `src/verification-gate.ts`, `src/payload-safety.ts`, or `src/plan-evaluator.ts`.
3. **Red-Team Risk Assessment**: Exploitation surfaces, edge cases, and dependency vulnerabilities.
4. **Concrete Integration Recommendation**: Adopt verbatim, adapt pattern into zero-dependency local code, or reject.
