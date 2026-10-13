# TypeSafe Extension for oh-my-pi (omp): Source Code Specification

## 1. Executive Summary & System Overview

The **omp-typesafe-extension** connects the [oh-my-pi (omp)](https://github.com/can1357/oh-my-pi) coding harness with the **TypeSafe System One** evaluation engine (`api.typesafe.ai/v1/systemone`). It acts as an active semantic firewall and verification supervisor over AI agents, providing:

1. **Dual Verification Gate (Gate 1 & Gate 2)**:
   - **Gate 1 (Deterministic Micro-Check)**: Local, zero-token verification enforcing test passing, non-evasion (AST diffing), Claude account safety, and todo proof requirements.
   - **Gate 2 (Semantic Macro-Check)**: Remote evaluation using TypeSafe System One (`jev-latest`), assessing plan drift (`no_drift`, `unapproved_deviation`, `scope_creep`), criteria fulfillment (`meets_criteria` probability), and credentials safety.
2. **Tool Call & Lifecycle Interception**:
   - Intercepts `todo`, `todo_write`, and `bash` calls before execution.
   - Blocks premature task completion (`todo done`), task drops/re-initializations without human authorization, and unverified plan closure.
   - Enforces a **Stall Ratchet** halting autonomous loops after 3 consecutive failures.
3. **Plan-Time Quality Elevation**:
   - Pre-execution validation of implementation plans using multi-rubric evaluation (Scope, Algorithm, Actionability).
4. **Multi-Persona Debate & Expert Roles**:
   - Consensus scoring across 5 specialized personas (Architect, Security, Performance, UX, Devil's Advocate).
   - Dedicated expert roles: `scope_arbiter`, `drift_guard`, and `risk_security_triage`.
5. **Fail-Closed Security & Hermetic Isolation**:
   - Protects `.claude/` credentials and tokens via redaction and AST boundary enforcement.
   - Zero-trust fallback with strict XML remediation blocks.

---

## 2. Source Code Inventory & Module Specifications

```
omp_extension/
├── typesafe-planner.ts           # OMP extension entrypoint, lifecycle interception & tools
├── package.json                  # NPM manifest (Bun runtime, dependencies)
├── src/
│   ├── verification-gate.ts      # Dual Verification Gate orchestration (Gate 1 + Gate 2)
│   ├── evidence-collector.ts     # OS ground-truth signals (Git status/diff, test runner, criteria)
│   ├── plan-evaluator.ts         # Plan draft elevation against System One rubrics
│   ├── cook-expert-judge.ts      # Expert roles evaluation (Scope, Drift, Risk) & scorecards
│   ├── debate-evaluator.ts       # Multi-persona debate evaluation & consensus calculation
│   ├── ast-analyzer.ts           # Diff analysis for test evasion, assertion deletion, tautologies
│   ├── auth-manager.ts           # API key hashing, failure tracking, and dynamic recovery
│   ├── payload-safety.ts         # Secret redaction (Anthropic/Claude), payload truncation (32KB)
│   ├── xml-enclosure.ts          # XML text sanitization and injection boundary defense
│   ├── remediation-generator.ts  # Structured XML remediation directives for rejected tasks
│   ├── egc.ts                    # Evidence-Gated Completion (EGC) alternative arbiter
│   ├── errors/
│   │   └── TypeSafeError.ts      # Standardized TypeSafe exception hierarchy
│   └── types/
│       └── security.ts           # TypeScript interfaces for AST, Auth, Remediation, and XML
├── tools/
│   └── sync-baseline.cjs         # Workspace backup, sync, and regression deployment tool
└── scripts/
    ├── update-planner-jev-latest.cjs # Model update script for TypeSafe judge
    └── safe-update-planner-model.cjs # Safe updater script
```

---

### 2.1. Root Extension: `typesafe-planner.ts`

- **Role**: Primary extension entrypoint for OMP. Implements the `ExtensionAPI` contract (`on`, `registerTool`, `sendMessage`).
- **Key Responsibilities**:
  1. `session_start` Handler:
     - Runs pre-flight health probe against `https://api.typesafe.ai/v1/systemone` using a tightly scoped `fetch()` try-catch block.
     - Suppresses false-positive "API unreachable" warnings caused by downstream IPC errors.
     - Emits `TypeSafe: ONLINE (jev-latest)` or failure warnings.
  2. `before_tool_call` & `tool_call` Interception:
     - **Todo Interception (`handleTodoInterception`)**: Normalizes todo operations (`init`, `append`, `start`, `done`, `drop`, `rm`).
     - **Privilege & Authorization Guard**: Requires human authorization to drop or re-init active contracted tasks. Recognized authorizers are `ctx.isHuman`, `ctx.authorized`, `params.allowJudgeModification === true`, and a recent `ask` tool approval within 300s (`Date.now() - lastHumanAskTimestamp < 300_000`). Note: `Boolean(params.reason)` also evaluates as authorized, allowing any non-empty string in `params.reason` to bypass the human authorization guard without calling `ask`.
     - **Stall Ratchet Timing**: On every `todo done` attempt, `consecutiveFailuresByTask` increments immediately *before* Gate 1 or Gate 2 runs. If `currentFailures >= 3`, execution halts immediately. Passing `params.resetFailures === true` deletes the map entry only *after* evaluating `currentFailures`, meaning a 3rd attempt still halts.
     - **Plan Closure Guard**: Intercepts `plan-cli check` commands and rejects them if uncompleted contracted tasks exist.
     - **Two Dual-Gate Implementation Paths**:
       * **Live `todo done` Interception**: Calls `cook-expert-judge.ts` (`runTaskMicroCheck` for Gate 1 and `runPhaseMacroCheck` for Gate 2). Formats actionable, deterministic remediation instructions via `buildGateRejectionMessage` detailing failing test commands, omitted deliverables, architectural drift, or service unavailability, and delivers them directly into the agent steering stream via `pi.sendMessage(..., { deliverAs: "steer" })` and the cancellation exception. The counter clears (`consecutiveFailuresByTask.delete(taskId)`) only after Gate 2 approval.
       * **Standalone Tool (`typesafe_verify_completion`)**: Calls `verification-gate.ts:verifyTaskCompletion`, which includes `<remediation>` blocks and evaluates `claude_account_untouched >= 0.95`.
  3. Tool Registration: Exposes 6 OMP tools (`typesafe_judge`, `typesafe_rerank`, `typesafe_evaluate_multi`, `typesafe_elevate_plan`, `typesafe_verify_completion`, `typesafe_expert_review`).
---

### 2.2. Dual Verification Gate: `src/verification-gate.ts`

- **Exports**:
  - `checkDeterministicPreconditions(evidence: TaskEvidenceResult): Gate1Result`
  - `constructGateQuestions(criteria: string[]): Record<string, GateQuestion>`
  - `verifyTaskCompletion(context: TaskVerificationContext, judgeClient?: GateJudgeClient): Promise<DualGateVerificationResult>`
- `resolveAutoApprovalThreshold(): number` (reads `TYPESAFE_AUTO_APPROVAL_THRESHOLD`, defaults to `0.80`)
  - `generateFallbackRemediation(reasons: string[], options?: RemediationOptions): string`
- **Gate 1 Checks**:
  1. **Claude Boundary**: Verifies no files under `.claude/` or `.claude.json` are modified.
  2. **Test Execution**: Verifies `testExitCode === 0` (or `null` if no test command specified).
  3. **AST Diff Evasion**: Runs `analyzeDiffForTestEvasion(evidence.gitDiff)` to catch deleted assertions or commented-out tests.
  4. **Task Completion Proof**: Ensures `taskDoneProven !== false` and `todoCompleted !== false`.
- **Gate 2 Evaluation**:
  - Constructs 3 questions for TypeSafe System One:
    - `meets_criteria` (`noul`): Probability code satisfies task deliverables (threshold $\ge 0.80$).
    - `plan_drift` (`choice`): Must be `no_drift`. Rejects `unapproved_deviation` and `scope_creep`.
    - `claude_account_untouched` (`noul`): Probability of zero Claude credential touchpoints ($\ge 0.95$).

---

### 2.3. Evidence Collector: `src/evidence-collector.ts`

- **Exports**:
  - `collectTaskEvidence(options: TaskEvidenceOptions): Promise<TaskEvidenceResult>`
  - `executeTestCommand(command: string, cwd: string, timeoutMs: number): Promise<{ exitCode: number; output: string }>`
  - `extractCriteriaFromPlan(planContent: string, taskId?: string): string[]`
  - `assertPathIsClaudeSafe(pathStr: string): void`
- **Implementation Highlights**:
  - Runs `git status --porcelain` and `git diff HEAD` (falling back to `git diff`) concurrently via `Promise.all` to eliminate execution latency.
  - Enforces path safety: throws an exception if `options.planPath` points into `.claude/`.
  - Parses Markdown task criteria (`- [ ]`, `- [x]`, `### Deliverables`).

---

### 2.4. Plan Evaluator: `src/plan-evaluator.ts`

- **Exports**:
  - `evaluatePlanDraft(input: PlanEvaluationInput, client?: PlanJudgeClient): Promise<PlanEvaluationResult>`
  - `checkClaudePlanIsolation(planContent: string): { safe: boolean; violations: string[] }`
  - `triagePlanStructuralCompleteness(planContent: string): TriageResult`
- **Plan Rubrics**:
  - `scope_mode`: Choice between `HOLD`, `EXPANSION`, and `REDUCTION`. `EXPANSION` or `REDUCTION` trigger escalation.
  - `algorithm_depth`: Score (1-4) evaluating algorithm and technical implementation depth.
  - `task_actionability`: Noul probability that tasks are concrete, atomic, and actionable.
  - `claude_isolation_adherence`: Noul probability enforcing boundary isolation.

---

### 2.5. Expert Judge: `src/cook-expert-judge.ts`

- **Exports**:
  - `runTaskMicroCheck(evidence: MicroCheckEvidence): Promise<MicroCheckResult>`
  - `runPhaseMacroCheck(context: MacroCheckContext, client?: ExpertJudgeClient): Promise<MacroCheckResult>`
  - `evaluateScopeArbiter(context: MacroCheckContext, client?: ExpertJudgeClient)`
  - `evaluateDriftGuard(context: MacroCheckContext, client?: ExpertJudgeClient)`
  - `evaluateRiskSecurityTriage(context: MacroCheckContext, client?: ExpertJudgeClient)`
  - `generateVerificationScorecard(results: ...): string`
- **Functionality**:
  - Implements the dual-cadence verification engine for the Cook workflow.
  - Combines individual specialist verdicts into a cohesive Markdown scorecard with emoji status indicators.

---

### 2.6. Multi-Persona Debate Evaluator: `src/debate-evaluator.ts`

- **Exports**:
  - `evaluateDebate(params: { state: string; model?: string }, client?: DebateJudgeClient): Promise<MultiPersonaDebateResult>`
  - `constructMultiPersonaQuestions(): Record<string, TypeSafeQuestion>`
  - `resolveDebateModel(): string` (defaults to `jev-latest`)
- **Five Personas**:
  1. `architect`: Structural modularity, separation of concerns, and component boundaries.
  2. `security`: Threat surface, boundary isolation, attack resilience, and secret management.
  3. `performance`: Computational complexity, latency, memory footprint, and token waste.
  4. `ux`: Operator cognitive friction, CLI clarity, and error messages.
  5. `devils_advocate`: Edge-case discovery, failure modes, and unstated assumptions.
- **Consensus Logic**: Scores are integer ratings from 0 to 3 (4 levels per persona). Calculates `consensusScore = sum(scores) / 5`. Task is approved if and only if `consensusScore >= 1.5 && securityScore > 0 && devilsScore > 0`.

---

### 2.7. AST Analyzer: `src/ast-analyzer.ts`

- **Exports**: `analyzeDiffForTestEvasion(diff: string): ASTAnalysisResult`
- **Implementation**: Operates via line-oriented regular expressions over the unified git diff (not a full ECMAScript AST parser).
- **Verbatim Regex Patterns**:
  - `deletedAssertionRegex`: `/(?:^|\n)-[ \t]*(?:expect\(|assert\(|assert\.[a-zA-Z]+\()/g`
  - `deletedTestBlockRegex`: `/(?:^|\n)-[ \t]*(?:it\(|test\(|describe\()/g`
  - `commentedAssertionRegex`: `/(?:^|\n)\+[ \t]*(?:\/\/|\/\*)[ \t]*(?:expect\(|assert\()/g`
  - `tautologyRegex`: `/(?:^|\n)\+[ \t]*expect\((?:true|false|1|0)\)\.toBe\((?:true|false|1|0)\)/g`
- **Known Limitations**: Any refactoring or modification of existing test assertion lines produces a `- expect(...)` deletion hunk, triggering a false-positive test evasion rejection at Gate 1.
---

### 2.8. Authentication & Watchdog: `src/auth-manager.ts`

- **Exports**: `AuthManager` class
- **Methods**:
  - `hashToken(token: string): string`: Computes SHA-256 (first 16 hex chars) to avoid logging plaintext secrets.
  - `canAttempt(token: string): boolean`: Allows execution if key changed or failure retries $< 1$.
  - `recordFailure(token: string, status: number)`: Records 401/403 rejections.
  - `recordSuccess(token: string)`: Clears failure state upon successful HTTP 200 OK.
  - `getState(token: string): AuthState`: Returns `"authenticated" | "refreshing" | "revoked"`.

---

### 2.9. Payload Safety & Secret Redaction: `src/payload-safety.ts`

- **Exports**:
  - `redactAnthropicSecrets(text: string): string`
  - `truncatePayloadSafe<T>(payload: T, maxBytes?: number): T` (defaults to 32,768 bytes / 32KB)
  - `preparePayloadSafe(payload: unknown, opts?: SafePayloadOptions): unknown`
  - `isSecretInKey(key: string, value: unknown): boolean`

---

### 2.10. XML Enclosure & Prompt Boundary Defense: `src/xml-enclosure.ts`

- **Exports**:
  - `sanitizeXmlText(raw: string): string`: Strips `CRITICAL SYSTEM OVERRIDE`, `IGNORE ALL PREVIOUS INSTRUCTIONS`, etc.
  - `encloseUntrusted(content: string, tag: string): string`: Escapes closing tags `</tag>` as `&lt;/tag&gt;` and wraps content.

---

### 2.11. Remediation Generator: `src/remediation-generator.ts`

- **Exports**: `generateRemediationBlock(params: RemediationDirective): string`
 - **Structure**: Generates `<remediation>` blocks containing `<instruction>`, `<immutable_constraints>`, `<failure_reasons>`, and `<action_items>`, with XML entity escaping (`escapeXml`) applied to dynamic fields to prevent tag injection.

---

### 2.12. Evidence-Gated Completion (EGC): `src/egc.ts`

- **Role**: Standalone evidence-gated completion harness for oh-my-pi.
- **Invariants**:
  - Protected paths (`DEF_PROTECTED`): tests, configurations, `package.json`, `.github`.
  - Disallowed escape hatches (`HARD`): `.skip(`, `sys.exit(0)`, `--no-verify`.
  - Soft warnings (`SOFT`): `TODO`, `pass`, `@ts-ignore`.
  - Focus diff ranking (`focusDiff`): ranks plan-relevant files first, lockfiles last.
