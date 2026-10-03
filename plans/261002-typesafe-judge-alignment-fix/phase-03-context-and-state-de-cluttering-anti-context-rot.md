---
phase: 3
title: "Context and State De-cluttering Anti-Context-Rot"
status: completed
priority: P1
effort: "1.5h"
dependencies: ["phase-02-api-contract-and-schema-alignment"]
---

# Phase 3: Context and State De-cluttering Anti-Context-Rot

## Overview
Implement an intelligent State Preprocessor and Diff Summarizer within `typesafe-planner.ts` to protect TypeSafe System One from **Context Rot** (accuracy degradation caused by large, noisy inputs, documented in the *Jev 1.13 Jaggedness* specification). Enforce backtick JSON path references in all question instructions, cap state payloads to 8KB (~2000 tokens), and eliminate monolithic stringified JSON without touching any files in `src/`.

## Requirements
- **Functional:**
  1. **Smart Diff Summarizer & State Truncator:**
     - In `typesafe-planner.ts`, implement `sanitizeStateForTypeSafe(state)`:
       - If `state` is an object (or parsed from a JSON string) containing `unified_diff`, inspect its byte size.
       - If `unified_diff` exceeds 4KB (~1000 tokens), extract a condensed AST summary: modified file paths, added/removed exports, function signatures, and modified test assertions, truncating repetitive internal hunk lines.
       - Ensure the total serialized `state` payload is strictly capped under 8KB (~2000 tokens), well beneath the 32k token limit.
  2. **Convert Stringified State to Native JSON Object:**
     - When base helpers pass `state` as a JSON string (e.g. `JSON.stringify({ phase_title, plan_requirements, ... })`), detect and `JSON.parse` it back into a native JSON object so Jev can resolve individual fields.
  3. **Enforce Backtick Path Referencing:**
     - Enhance question instructions inside `typesafe-planner.ts` to explicitly reference state keys using backticks (e.g., `"Does \`unified_diff\` satisfy the deliverables in \`plan_requirements\` without skipping requirements?"`).
- **Non-Functional:**
  1. **Zero Base Code Modifications:** Zero edits to `src/evidence-collector.ts`, `src/cook-expert-judge.ts`, or any other base file.
  2. **Preserve Test Evasion Detection:** The summarizer must NEVER strip deleted assertion signals (`expect` / `assert`) so security invariants remain strictly enforceable.

## Architecture
```
[Raw Incoming State (may be stringified JSON with 50KB git diff)]
                       |
                       v
         [typesafe-planner.ts: sanitizeStateForTypeSafe]
                       |
       +---------------+---------------+
       |                               |
       v                               v
[JSON Object Recovery]      [Diff Truncator / Summarizer]
(parse stringified JSON)    - Keeps: file paths, exports, asserts
                            - Truncates: large boilerplate hunks
                            - Hard cap: <= 8KB (~2000 tokens)
                       |
                       v
         [Sanitized, Structured Native State Object]
                       |
                       v
       [Question Instructions with Backtick Paths]
       (`unified_diff`, `plan_requirements`)
                       |
                       v
            [executeTypeSafe() -> Jev 1.13]
```

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `typesafe-planner.test.ts`
- DO NOT Modify: `src/*`

## Implementation Steps
1. **Implement `summarizeUnifiedDiff(diff, maxChars = 4000)` in `typesafe-planner.ts`:**
   - Retain file headers (`diff --git`, `--- a/`, `+++ b/`).
   - Retain hunk headers (`@@ ... @@`).
   - Retain lines with assertions (`expect(`, `assert(`, `test(`, `describe(`).
   - Retain changed function/class signatures.
   - Truncate large contiguous blocks of repetitive line additions with `[... N lines truncated ...]`.
2. **Implement `sanitizeStateForTypeSafe(state)` in `typesafe-planner.ts`:**
   - Detect if `state` is a string beginning with `{` and parse it safely with fallback.
   - If `state.unified_diff` exists, pass through `summarizeUnifiedDiff`.
   - Return clean native object representation.
3. **Hook State Sanitizer into `executeTypeSafe()`:**
   - Automatically apply `sanitizeStateForTypeSafe` at the top of `executeTypeSafe()`, ensuring all tool calls (`typesafe_judge`, `typesafe_expert_review`, etc.) benefit from anti-context-rot protection.
4. **Enforce Backtick Path Rewriting for Known Questions:**
   - In the question normalizer, if `instructions` is the legacy generic string `"Does this implementation satisfy all planned deliverables..."`, upgrade it to:
     `"Does \`unified_diff\` satisfy all deliverables in \`plan_requirements\` without skipping requirements or faking tests?"`.
5. **Add Anti-Context-Rot Tests in `typesafe-planner.test.ts`:**
   - Test that a 50KB git diff passed into `typesafe_expert_review` is summarized to under 8KB without losing assertion deletion signals.

## Success Criteria
- [ ] Any `state` passing through `executeTypeSafe` is capped to $\le 8\text{KB}$.
- [ ] No raw stringified JSON is sent as `state`; native JSON objects are sent whenever valid JSON is provided.
- [ ] Question instructions utilize backtick paths for nested state fields.
- [ ] `src/` directory is unmodified.
- [ ] Verification command: `bun test typesafe-planner.test.ts` passes with 0 failures.

## Risk Assessment
- **Risk:** Truncating a diff might accidentally remove context needed to judge `meets_criteria`.
- **Mitigation:** The summarizer preserves all function signatures, imports, exports, and assertions, providing the semantic shape of the diff while discarding low-information boilerplate.
