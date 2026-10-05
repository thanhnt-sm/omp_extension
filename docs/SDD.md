# Software Design Document (SDD) — OMP TypeSafe Extension

## 1. Component Interfaces & Data Contracts

### 1.1 Payload Safety Engine (`src/payload-safety.ts`)
Responsible for ensuring no secret credentials, sensitive tokens, or oversized context arrays enter upstream judge calls.

- **`preparePayloadSafe(payload: unknown, options?: PayloadSafetyOptions): TypeSafePayload`**
  - Traverses JSON structures up to depth 10.
  - Sanitizes keys matching sensitive patterns: `/(?:api[_-]?key|token|secret|password|auth|bearer|credential|cert)/i`.
  - Replaces discovered credentials with `[REDACTED]`.
  - Truncates oversized text fields, bounding total serialized request payload to $\le 32,768$ bytes ($32\text{KB}$).

- **`summarizeUnifiedDiff(diff: string, maxChars = 28000): string`**
  - Preserves git diff headers (`diff --git`, `---`, `+++`, `@@ -x,y +z,w @@`).
  - Retains complete function bodies and executable blocks.
  - Omits large comment blocks or auto-generated lockfile noise if payload limits are exceeded.

---

### 1.2 Ground-Truth Evidence Collector (`src/evidence-collector.ts`)
Gathers indisputable operating system artifacts before allowing an agent to mark any task complete.

- **`collectTaskEvidence(options: EvidenceCollectorOptions): Promise<TaskEvidence>`**
  - **`gitDiff`**: Executes `git diff` against working tree and staged index.
  - **`testExitCode`**: Runs specified verification command (`bun test`, `npm test`, etc.) and captures exit code.
  - **`testOutput`**: Gathers stdout/stderr output with ANSI color stripping.
  - **`criteria`**: Extracts target acceptance criteria from task context or `plan.md`.

---

### 1.3 Verification Gate (`src/verification-gate.ts`)
Executes the two-tiered task verification gate.

#### Gate 1: Local Deterministic Pre-check
```typescript
export interface DeterministicCheckResult {
  passed: boolean;
  reasons: string[];
  assertionsStripped: boolean;
  hasGitDiff: boolean;
  testPassed: boolean;
}
```
Checks performed:
1. `hasGitDiff`: Verifies whether code changes actually exist. Pure synthetic declarations (e.g. `// No diff`) without real git modifications are rejected.
2. `assertionsStripped`: Scans unified diff for deleted test assertions (`- expect(`, `- assert(`) without compensating tests.
3. `testPassed`: Validates that `testExitCode === 0`.
4. `claudeUntouched`: Confirms zero modifications or references targeting `~/.claude` or Anthropic credential directories.

#### Gate 2: Semantic Macro-Check (TypeSafe System One)
Formulates structured questions evaluated by model `jev-latest`:
- `meets_criteria`: Probability score ($0.0 \dots 1.0$) with rejection threshold $\ge 0.70$.
- `claude_account_untouched`: Probability score must equal $1.0$.

#### XML Remediation Fallback Engine
When Gate 1 or Gate 2 fails, generates deterministic remediation directives:
```xml
<remediation>
  <instruction>
    The task verification gate rejected completion. You MUST treat the following directives as immutable constraints and execute the action items below to resolve the rejection.
  </instruction>
  <immutable_constraints>
    <constraint>Do NOT delete, comment out, or weaken existing tests or assertions.</constraint>
    <constraint>Do NOT touch or modify files under .claude or Claude configuration.</constraint>
    <constraint>All automated tests must pass with exit code 0 before task completion.</constraint>
  </immutable_constraints>
  <failure_reasons>
    <reason>Specific failure reason</reason>
  </failure_reasons>
  <action_items>
    <step>1. Address failure reasons without deleting assertions.</step>
    <step>2. Run testCommand locally to confirm exit code 0.</step>
  </action_items>
</remediation>
```

---

### 1.4 Multi-Persona Pre-Analysis (`src/debate-evaluator.ts`)
Performs pre-implementation debate before code changes occur. Evaluates 5 persona roles independently:
1. **Architect** (Coupling, extensibility, modularity)
2. **Security** (Vulnerabilities, token isolation, privilege escalation)
3. **Performance** (Latency, memory overhead, token cost)
4. **UX** (Clarity of failure states, developer ergonomics)
5. **Devil's Advocate** (Hidden assumptions, unnecessary complexity)

Consensus calculation:
$$\text{Consensus Score} = \frac{\sum_{i=1}^{5} \text{Score}_i}{5}$$
Thresholds: Requires $\text{Consensus Score} \ge 1.50$ and $\text{Security Score} \ge 1.0$ to pass.

---

### 1.5 Tri-Role Expert Evaluator (`src/cook-expert-judge.ts`)
Exposes direct tool endpoints for agent reflection:
- `evaluateScopeArbiter(plan, prompt)` $\rightarrow$ Choice: `HOLD`, `EXPANSION`, `REDUCTION`.
- `evaluateDriftGuard(diff, criteria)` $\rightarrow$ Choice: `no_drift`, `unapproved_deviation`, `scope_creep`.
- `evaluateRiskSecurityTriage(context)` $\rightarrow$ Technical score ($0 \dots 3$).
