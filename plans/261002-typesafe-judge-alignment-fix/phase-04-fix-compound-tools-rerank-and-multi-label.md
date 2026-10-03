---
phase: 4
title: "Fix Compound Tools Rerank and Multi-label"
status: completed
priority: P1
effort: "1h"
dependencies: ["phase-02-api-contract-and-schema-alignment"]
---

# Phase 4: Fix Compound Tools Rerank and Multi-label

## Overview
Eliminate **Question ID Blindness** in `typesafe_rerank` and convert non-binary directives in `typesafe_evaluate_multi` into calibrated yes/no verification questions, ensuring compliance with TypeSafe System One primitive definitions without modifying any files in `src/`.

## Requirements
- **Functional:**
  1. **Fix Question ID Blindness in `typesafe_rerank`:**
     - TypeSafe System One does not transmit question IDs (keys in `questions` map) to the underlying Jev model.
     - Rewrite the question generator in `typesafe_rerank` to explicitly reference candidate elements via backticks:
       ```ts
       instructions: `Rate how relevant candidate \`candidates[${i}]\` is to the target \`query\`.`
       ```
     - Upgrade Score criteria to concrete, descriptive levels:
       ```json
       [
         "Level 0: Completely irrelevant or unrelated to `query`.",
         "Level 1: Partially relevant, touches adjacent topics but does not resolve `query`.",
         "Level 2: Highly relevant, directly and accurately addresses `query`."
       ]
       ```
  2. **Fix Non-Binary Instructions in `typesafe_evaluate_multi`:**
     - Replace the ambiguous instruction `"Evaluate this state for the dimension: ${dim}."` with an unambiguous yes/no proposition:
       ```ts
       instructions: `Does the content in \`state\` clearly satisfy, demonstrate, or exhibit "${dim}"?`
       ```
     - Supply structured Noul criteria for sharp boundary definition:
       ```json
       {
         "true": `The content clearly exhibits or satisfies "${dim}".`,
         "false": `The content does not satisfy or exhibit "${dim}".`
       }
       ```
  3. **Preserve Speculative Fan-out Performance:**
     - Both tools must continue sending all candidate/dimension questions in a single batched API call to achieve the documented 10x-12x latency and cost advantage.
- **Non-Functional:**
  1. **Zero Base Code Modifications:** All changes implemented exclusively within `typesafe-planner.ts`.
  2. **Strict Output Sorting:** `typesafe_rerank` continues to sort results descending by score and format output cleanly.

## Architecture
```
[typesafe_rerank(query, candidates)]
                 |
                 v
+--------------------------------------------------------------------------+
|  Question Generator (fixes Question ID Blindness)                        |
|                                                                          |
|  candidate_0: "Rate relevance of `candidates[0]` to `query`" [Score:0..2]|
|  candidate_1: "Rate relevance of `candidates[1]` to `query`" [Score:0..2]|
|  ...                                                                     |
|  candidate_N: "Rate relevance of `candidates[N]` to `query`" [Score:0..2]|
+--------------------------------------------------------------------------+
                 |
                 v (Single Speculative Fan-out Request)
    [executeTypeSafe() -> POST /v1/systemone]
                 |
                 v
+--------------------------------------------------------------------------+
|  Response Handler                                                        |
|  - Reads answers.candidate_i.score                                       |
|  - Maps back to original candidate strings                               |
|  - Sorts descending by score                                             |
+--------------------------------------------------------------------------+
```

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `typesafe-planner.test.ts`
- DO NOT Modify: `src/*`

## Implementation Steps
1. **Refactor `typesafe_rerank` Tool Registration in `typesafe-planner.ts`:**
   - Replace generic instruction string with backtick template `candidates[${i}]`.
   - Update criteria array with concrete level descriptions.
2. **Refactor `typesafe_evaluate_multi` Tool Registration in `typesafe-planner.ts`:**
   - Replace open-ended instruction with explicit yes/no question.
   - Inject structured `criteria: { true, false }`.
3. **Add Tests for Compound Tools in `typesafe-planner.test.ts`:**
   - Test `typesafe_rerank` with 5 candidates: verify that the generated payload contains `candidates[0]`, `candidates[1]`, etc., in instructions and results are correctly sorted by score.
   - Test `typesafe_evaluate_multi`: verify that questions have yes/no instructions and structured `{ true, false }` criteria.

## Success Criteria
- [ ] In `typesafe_rerank`, every question's `instructions` contains the exact candidate backtick index `candidates[${i}]`.
- [ ] In `typesafe_evaluate_multi`, every question is framed as a verifiable yes/no question with `{ true, false }` criteria.
- [ ] `src/` directory is unmodified.
- [ ] Verification command: `bun test typesafe-planner.test.ts` passes with 0 failures.

## Risk Assessment
- **Risk:** Existing callers might expect unranked raw scores.
- **Mitigation:** The return shape `{ ranked: [{ candidate, score }] }` is preserved, maintaining exact interface compatibility.
