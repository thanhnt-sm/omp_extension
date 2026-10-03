---
phase: 2
title: "API Contract and Schema Alignment via Extension-Layer Normalization"
status: completed
priority: P1
effort: "1.5h"
dependencies: ["phase-01-audit-and-unify-network-transport"]
---

# Phase 2: API Contract and Schema Alignment via Extension-Layer Normalization

## Overview
Enforce 100% compliance with TypeSafe System One API specifications (`docs.typesafe.ai/api.md`) exclusively within the extension (`typesafe-planner.ts`), without modifying any underlying base code in `src/`. All payload auto-normalization, criteria mapping, question transformation, and client adapter injection are encapsulated directly in `typesafe-planner.ts`.

## Requirements
- **Functional:**
  1. **Extension-Level Criteria Normalizer:** Implement `normalizeTypeSafePayload(params)` inside `typesafe-planner.ts` that intercepts outgoing questions before `validateInput()` and upstream dispatch:
     - **Choice Normalization:** When a `choice` question provides criteria as an array of strings (e.g. `["HOLD: description", "EXPANSION: description"]`), auto-convert it into a compliant Dictionary:
       ```json
       {
         "HOLD": "description",
         "EXPANSION": "description"
       }
       ```
     - **Noul Normalization:** When a `noul` question provides criteria as a 2-element array `[trueDesc, falseDesc]`, auto-convert it into a compliant `{ "true": trueDesc, "false": falseDesc }` object.
     - **Score Normalization:** Ensure `score` criteria is preserved as an ordered array of strings (2..10 levels).
  2. **Client Adapter Injection:** In `typesafe-planner.ts`, instantiate an `extensionJudgeClient` that delegates directly to `executeTypeSafe()`. Pass this adapter into all base helpers that accept a custom client:
     - `evaluatePlanDraft(params, extensionPlanJudgeClient)` in `typesafe_elevate_plan`
     - `runPhaseMacroCheck(context, extensionExpertJudgeClient)` in `handleTodoInterception`
     - `evaluateScopeArbiter(plan, prompt, extensionExpertJudgeClient)` in `typesafe_expert_review`
     - `evaluateDriftGuard(diff, criteria, extensionExpertJudgeClient)` in `typesafe_expert_review`
     - `evaluateRiskSecurityTriage(context, extensionExpertJudgeClient)` in `typesafe_expert_review`
  3. **Eliminate Phantom Noul Confidence Reads:** In `typesafe-planner.ts`'s adapter, ensure Noul results are handled strictly via `answer.noul` (0..1 float); do not pass through or rely on nonexistent `.confidence` fields on Noul answers.
- **Non-Functional:**
  1. **Zero Base Modifications:** Zero edits to `src/payload-safety.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, or any core oh-my-pi files.
  2. **100% Validation Compliance:** All normalized payloads pass `validateInput()` from `typesafe-api-client.cjs` with `{ ok: true }` and pass `sanitizeAnswers()` without silent drops.

## Architecture
```
[Base Helpers (src/*) or Tool Invocations]
              |
              | (calls with legacy or un-normalized payloads)
              v
[Extension Layer: typesafe-planner.ts]
  |
  +---> normalizeTypeSafePayload()
  |       - Converts Choice string array -> Dict { [key]: desc }
  |       - Converts Noul string array -> Dict { true: desc, false: desc }
  |       - Validates Score levels array
  |
  +---> extensionJudgeClient Adapter
  |       - Injected into evaluatePlanDraft, runPhaseMacroCheck, etc.
  |       - Routes directly to executeTypeSafe()
  |
  +---> executeTypeSafe()
          - Pre-flight validateInput()
          - Egress secret redaction
          - POST /v1/systemone (model: jev-latest)
          - sanitizeAnswers()
          - Lattice checkPolicy()
```

## Related Code Files
- Modify: `typesafe-planner.ts` (All changes isolated here)
- Modify: `typesafe-planner.test.ts` (Unit tests for extension normalization)
- DO NOT Modify: `src/*` (Base codebase untouched)

## Implementation Steps
1. **Implement `normalizeQuestionForTypeSafe` in `typesafe-planner.ts`:**
   - Detect `q.type === 'choice'` and check if `q.criteria` is an array. If so, parse each entry (`KEY: Description` or `KEY - Description`) into `{ [KEY]: Description }`.
   - Detect `q.type === 'noul'` and check if `q.criteria` is an array. If so, map `criteria[0]` to `true` and `criteria[1]` to `false`.
   - Keep string and object instructions intact, supporting both string and JSON object instructions.
2. **Hook Normalizer into `executeTypeSafe`:**
   - Run normalization on `params.questions` before `apiClientModule.validateInput(params)`.
   - This ensures `validateInput` receives 100% compliant dictionary criteria and never rejects the payload.
3. **Build and Inject Extension Client Adapters:**
   - Construct `extensionExpertClient` satisfying `ExpertJudgeClient` interface by wrapping `executeTypeSafe`.
   - Pass this client to `runPhaseMacroCheck`, `evaluateScopeArbiter`, `evaluateDriftGuard`, and `evaluateRiskSecurityTriage`.
   - Construct `extensionPlanClient` satisfying `PlanJudgeClient` interface and pass to `evaluatePlanDraft`.
4. **Update Extension Test Suite (`typesafe-planner.test.ts`):**
   - Add test cases verifying that legacy array criteria passed into `typesafe_judge` or `typesafe_expert_review` are transparently normalized to TypeSafe-compliant payloads and evaluated without errors.

## Success Criteria
- [ ] `validateInput()` returns `{ ok: true }` for all tool calls and intercepted verification gates.
- [ ] Base directory (`src/`) has zero modified files (`git diff src/` is empty).
- [ ] `typesafe-planner.test.ts` passes all tests verifying normalization of Choice and Noul criteria.
- [ ] Verification command: `bun test typesafe-planner.test.ts` passes with 0 failures.

## Risk Assessment
- **Risk:** Complex regex parsing of `KEY: Description` might fail if criteria string has no colon.
- **Mitigation:** Fall back to generating clean keys (`option_0`, `option_1`, etc.) if no delimiter is found, ensuring an object with $\ge 2$ keys is always produced.
