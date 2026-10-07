# Prediction Report: omp_extension Codebase Architecture & Integrity Evaluation

## Verdict: CAUTION

### Agreements (all personas align)
- **Zero-Token Gate 1 Validation**: Gate 1 deterministic execution (`checkDeterministicPreconditions` in `verification-gate.ts`) provides sub-150ms zero-overhead protection, ensuring non-negotiable baselines (e.g. test passing, clean working tree) are verified without model latency or token consumption.
- **Payload Size Capping**: The 32KB payload boundary in `src/payload-safety.ts` successfully prevents context bloat, JSON serialization crashes, and unbounded token usage during upstream evaluations.
- **Regex Isolation Vulnerabilities**: Relying solely on static regex checks (`CLAUDE_PROHIBITED_PATTERNS`, `ANTHROPIC_KEY_REGEX`) leaves security gaps against path normalization bypasses, URL query parameter embedding, and encoded secrets.
- **Elevated Review Requirement**: Gate 2 semantic evaluator adjustments and planner integration hook modifications must require elevated/expert sign-off to prevent accidental security regressions.

---

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| **Dumb Model XML Fallback Remediation** | Encapsulated in `generateFallbackRemediation`; keeps interface clean. | Critical prompt injection risk if unvetted test errors or agent inputs are enclosed verbatim in XML blocks. | Low overhead; purely local string templating. | Provides guidance to weak models to prevent terminal failure loops. | False assumption: weak/dumb models routinely ignore XML tags and hallucinate compliance anyway. | **Mitigate & Restrict**: Sanitize all error strings and test outputs before XML interpolation. For repeat violations (attempt > 2), abort and require human intervention rather than continuing semantic remediation. |
| **Monolithic Planner File (`typesafe-planner.ts`)** | 1,545 lines violates single-responsibility principle; hooks and tool bridges should be decoupled. | Centralizes privilege guards, making policy audit easier in one spot. | Negligible runtime performance penalty in Node.js runtime. | Harder for contributors to navigate and identify error origin points. | Splitting into many small modules risks import circularity and regression in tight hook lifecycles. | **Staged Decoupling**: Keep execution hooks intact while extracting state machine handlers and validation listeners into dedicated helpers. |
| **External Dependency on `~/.claude/mcp/typesafe`** | High environmental coupling; fails in pure CI or isolated docker containers if files are missing. | Essential for centralized redaction rules if MCP server manages key store. | Dynamic `createRequire` check is cached; no repeated disk lookups. | Silent failure mode defaults to weak fallback regex without user warning. | Over-engineering to build a complete fallback redaction engine locally when standard environment guarantees exist. | **Self-Contained Hardening**: Bundle core AST and byte-level token sanitizers locally in `src/payload-safety.ts` so zero degradation occurs in containerized or CI environments. |

---

### Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| **Regex Scrubber & Path Traversal Bypass** | High | Augment static regex in `src/plan-evaluator.ts` and `src/payload-safety.ts` with URI decoding, path normalization (`path.resolve`), and Shannon entropy checks for bare tokens. |
| **Prompt Injection via Fallback Remediation** | High | Sanitize and escape all error outputs interpolated into `generateFallbackRemediation` XML blocks to prevent prompt hijacking by malicious code output. |
| **Monolithic State & Event Coupling** | Medium | Progressively modularize `typesafe-planner.ts` (1,545 lines) into discrete dispatchers (tool hooks, session lifecycle, macro-checks). |
| **Silent Fallback Degradation in CI/CD** | Medium | Log visible diagnostic warnings if `typesafe-redact.cjs` or `typesafe-redact-patterns.cjs` cannot be located, rather than silently falling back to basic regex. |

---

### Recommendations
1. **Sanitize Dynamic Strings in XML Enclosures**: Ensure `xml-enclosure.ts` escapes closing tags (e.g. `</remediation_protocol>`) in dynamically ingested error messages and test outputs before returning remediation prompts.
2. **Path Normalization for Claude Isolation**: Update `checkClaudePlanIsolation` to normalize file paths using `path.normalize` and `decodeURIComponent` before applying `CLAUDE_PROHIBITED_PATTERNS`.
3. **Entropy-Based Secret Detection**: Incorporate an entropy-based or multi-format token detector in `src/payload-safety.ts` to capture bare secrets in query strings, stack traces, and base64 encodings.
4. **Enforce Hard Failure on Remediation Exhaustion**: If a weak model fails Gate 1 or Gate 2 more than twice consecutively, fail immediately and trigger an out-of-band alert rather than continually issuing remediation prompts.
