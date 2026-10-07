# TypeSafe Key Isolation Plan

## Context
The requirement is to guarantee within the `omp_extension` project that the `TYPESAFE_API_KEY` is strictly confined to environment variables (`process.env.TYPESAFE_API_KEY`), never persisted to disk, never exported into configuration files like `.ck.json` or `models.yml`, and actively redacted from any accidental output.

## Approach & Findings
1. **Key Ingestion**: Audited `typesafe-planner.ts` and core execution modules (`executeTypeSafe`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `src/verification-gate.ts`, `src/egc.ts`). 
   - *Finding:* The system correctly reads `process.env.TYPESAFE_API_KEY?.trim()` and passes it directly into the memory space of `fetch` HTTP clients. There are zero instances of this variable being assigned to a serializable configuration object or file system write payload.
2. **Egress Redaction**: Inspected payload and log scrubbing logic (e.g., the inline `scrub` function in `src/egc.ts` and documentation of `payload-safety.ts`).
   - *Finding:* The global string scrubber applies regex matchers including `\b(api[_-]?key|secret|token|passw(?:or)?d)\b(\s*[:=]\s*)["']?[^\s"',;]{6,}` and generic bearer token filters. This successfully catches and redacts `TYPESAFE_API_KEY` strings from payload states before they leave the environment or are persisted to debug logs.
3. **Configuration Persistence**: Examined file writing behaviors (`fs.writeFileSync`, `fs.writeFile`) across the codebase.
   - *Finding:* The extension executes writes only for deterministic state files (`status.json`, `.omp/egc.json` template, `contract.lock`) and script deployment artifacts. It does not possess any snapshotting routines that serialize the Node.js `process.env` to disk.
4. **Crash Dump Hardening**: Verified global error handling and `console.error` usages.
   - *Finding:* No global handlers (`uncaughtException`, `unhandledRejection`) were discovered that blindly dump `process.env` to the terminal or error logs. Error boundaries are secure.

## Critical files & anchors
- `typesafe-planner.ts`: Central integration file. Continues strictly calling `process.env.TYPESAFE_API_KEY`.
- `src/egc.ts`: Contains the regex string scrubber `scrub(x: any)` that guarantees any accidental leakage in state payloads is replaced with `[REDACTED]`.

## Verification
- **Execution 1:** Trigger a mock HTTP request failure while providing the TypeSafe API Key. Observe the output standard error stream to ensure no API key string is present.
- **Execution 2:** Pass the active API Key explicitly inside the `state` context dictionary of an `executeTypeSafe` or `evaluate` call. Confirm that the egress scrubber outputs `[REDACTED]` in the outgoing request body.

## Assumptions & Contingencies
- **Assumption:** Host environments (Git Bash, PowerShell) do not write their exported shell variables into persistent unencrypted debug logs outside the scope of OMP.
- **Contingency:** If the regex scrubber in `src/egc.ts` is bypassed by an abnormally formatted token, we rely on the host's `TYPESAFE_API_KEY` rotation system that transparently handles 401s if a key needs to be rapidly rotated due to suspected exposure.

## Prediction Report: TypeSafe Key Isolation Plan

## Verdict: CAUTION

### Agreements (all personas align)
- **Good foundational architecture**: Relying strictly on `process.env.TYPESAFE_API_KEY` in memory and rejecting configuration serialization adheres to 12-factor application security principles.
- **Mandatory error boundary defense**: Auditing global handlers (`uncaughtException`, `unhandledRejection`) to prevent accidental core/stack dumping of environment variables is necessary.
- **Redaction is required**: Any egress payload logging or debugging must pass through a sanitization step before output.

### Conflicts & Resolutions

| Topic | Architect | Security (Red-Team) | Performance | UX | Devil's Advocate | Resolution |
|-------|-----------|---------------------|-------------|-----|------------------|------------|
| **Regex Scrubber vs. Exact Value** | Prefers generalized regex pattern matching for multi-token coverage across providers. | **Vulnerability:** Regex `\b(api-key)...\s*=\s*[token]` only redacts keyed pairs. Bare token values (e.g., in stack traces, raw error messages, or URL query parameters) completely bypass this regex. | Exact value `replaceAll()` or hash-set lookup is $O(N)$ string scan, much faster than complex regex evaluations on large strings. | Prevents accidental redaction of benign user content (like "password-reset-link") that regex might falsely catch. | Why guess token patterns with brittle regex when the runtime process already knows the exact secret string value? | **Resolution:** Supplement regex heuristics with exact-value string replacement: if `process.env.TYPESAFE_API_KEY` is set and non-empty, perform literal value replacement with `[REDACTED]` across all outbound logs and state payloads. |
| **Child Process Environment Leakage** | Env inheritance is standard default behavior in Node.js runtimes. | **Critical Risk:** Standard `child_process.spawn()` or `exec()` automatically inherits parent `process.env`. Subprocesses, third-party CLI tools, and linters gain full read access to `TYPESAFE_API_KEY`. | Negligible overhead to strip a single key during child environment preparation. | Eliminates silent credential exposure during external CLI interactions. | If child processes need shell access, why are they being given root-level API secrets? | **Resolution:** Explicitly sanitize child execution environments: strip `TYPESAFE_API_KEY` from `env` options before invoking child processes, unless explicitly whitelisted for trusted TypeSafe workers. |
| **Deep Recursive Sanitization Overhead** | Needs all nested state dictionaries sanitized before persistence or transmission. | Demands recursive scrubbing of arbitrarily nested objects to eliminate payload smuggling. | Recursive sanitization on large ASTs or LLM context buffers causes event loop blocking and latency spikes. | Slow responses and lag during heavy code evaluations. | Don't log or serialize multi-megabyte payloads in the first place; log only truncated metadata. | **Resolution:** Bound recursive scrubber depth (e.g., maximum depth of 5) and string length, while ensuring top-level key/value scrubbing is guaranteed. |

### Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Bare Value Leakage** (Error throws token without key name) | High | Implement exact-value literal replacement of `process.env.TYPESAFE_API_KEY` in `scrub()` alongside regex heuristics. |
| **Child Process Environment Leak** | High | Sanitize `env` in child process spawners to delete `TYPESAFE_API_KEY`. |
| **ReDoS / Event Loop Blocking** | Medium | Cap traversal depth and string lengths in `scrub(x: any)` to prevent event loop starvation on large payloads. |

## Red Team Review

| # | Finding | Severity | Evidence | Disposition |
|---|---------|----------|----------|-------------|
| 1 | Regex string scrubber misses bare token values that lack parameter context (e.g. `api_key=`), leaving raw tokens in stack traces or raw errors vulnerable. | High | `src/egc.ts:18` (Regex heuristics only) | Accept |
| 2 | Subprocess invocation (`child_process.spawn`/`exec`) automatically inherits parent `process.env`, leaking `TYPESAFE_API_KEY` to external tools or linters. | High | Standard Node.js `child_process` env inheritance | Accept |
| 3 | Arbitrarily deep JSON serialization in egress payload redactor poses ReDoS / Event Loop starvation vector. | Medium | `src/egc.ts:15` (unbounded recursive traversal) | Accept |

## Validation Log

| Question | Topic | Options Presented | Selected Answer |
|----------|-------|-------------------|-----------------|
| How should we proceed with the 3 Red Team vulnerability findings? | Finding Review | A) Apply all 3 accepted findings (Recommended)<br>B) Review findings individually<br>C) Reject all findings | **A) Apply all 3 accepted findings** |
| How should child processes (`spawn`/`exec`) be isolated from inheriting `process.env.TYPESAFE_API_KEY`? | Subprocess Isolation | A) Clone env & delete `TYPESAFE_API_KEY` prior to spawn<br>B) Centralized execution wrapper with env allowlist<br>C) Rely on process isolation without pruning | **B) Centralized execution wrapper with env allowlist** |
| If a secret token is detected in an outgoing egress payload or sanitization fails, what should the fallback behavior be? | Egress Failure Mode | A) Fail closed: abort egress and throw integrity error (Recommended)<br>B) Best-effort: sanitize partial match and proceed | **A) Fail closed: abort egress and throw integrity error** |

## TDD Implementation Phases

### Phase 1: Exact-Value Literal Scrubbing & Fail-Closed Guard (`src/egc.ts`)
1. **Red**:
   - Add failing test in `tests/egc.test.ts` asserting that bare tokens matching `process.env.TYPESAFE_API_KEY` without parameter prefixes are sanitized to `[REDACTED]`.
   - Add failing test asserting that if an egress payload contains an unredacted token or scrubbing fails, the egress call immediately throws an integrity violation error instead of transmitting.
2. **Green**:
   - Update `scrub(x: any)` in `src/egc.ts` to execute exact literal replacement for `process.env.TYPESAFE_API_KEY` prior to regex fallback.
   - Implement a post-scrub validation assert in `src/egc.ts` that enforces a fail-closed throw if any residual key string is detected.
3. **Refactor**:
   - Ensure null-safety and optimize string replacement for high-throughput evaluation loops.

### Phase 2: Centralized Execution Wrapper with Env Allowlisting (`src/exec-wrapper.ts`)
1. **Red**:
   - Write a unit test `tests/exec-wrapper.test.ts` verifying that subprocess executions run with an allowlisted environment that strictly excludes `TYPESAFE_API_KEY`.
   - Assert that unexpected or foreign environment variables are omitted unless explicitly whitelisted.
2. **Green**:
   - Implement `safeExec` / `safeSpawn` in a dedicated helper `src/exec-wrapper.ts`.
   - Migrate existing direct `child_process` calls in the extension to use `safeSpawn` / `safeExec`.
3. **Refactor**:
   - Audit all modules to ensure zero direct `child_process` imports exist outside `src/exec-wrapper.ts`.

### Phase 3: Egress Recursion Bounds & Performance
1. **Red**:
   - Add a test in `tests/egc.test.ts` passing a deeply nested structure (depth > 10) asserting it terminates within 5ms without stack overflow or blocking the event loop.
2. **Green**:
   - Implement a depth limiter (max depth 5) in `scrub(x: any)`. If depth exceeds threshold, truncate/redact sub-trees.
3. **Refactor**:
   - Benchmark sanitized payloads to guarantee zero-token Gate 1 latency (<150ms).
