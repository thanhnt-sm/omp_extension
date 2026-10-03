---
phase: 1
title: "Audit and Unify Network Transport"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Audit and Unify Network Transport via Extension-Level Client Injection

## Overview
Unify all outbound TypeSafe traffic through a single, hardened transport pipeline directly inside `typesafe-planner.ts`. By injecting a compliant `extensionJudgeClient` adapter into all base helpers (`runPhaseMacroCheck`, `evaluatePlanDraft`, `evaluateScopeArbiter`, `evaluateDriftGuard`, `evaluateRiskSecurityTriage`), we completely bypass and neutralize legacy/unreliable fallback clients without modifying a single line of code in `src/`.

## Requirements
- **Functional:**
  1. **Canonical Endpoint Routing:** Guarantee 100% of network requests go to `POST https://api.typesafe.ai/v1/systemone` with header `Authorization: Bearer ${apiKey}` and `Content-Type: application/json`.
  2. **Mandatory Model Parameter:** Ensure `{ model: "jev-latest" }` is included in every outgoing payload generated across all evaluation workflows.
  3. **Dependency Injection of Extension Client:**
     - Build an `extensionJudgeClient` object inside `typesafe-planner.ts` that implements the `ExpertJudgeClient` and `PlanJudgeClient` interfaces by calling `executeTypeSafe()`.
     - In `handleTodoInterception`, pass `extensionJudgeClient` to `runPhaseMacroCheck(ctx, extensionJudgeClient)`.
     - In `typesafe_elevate_plan`, pass `extensionJudgeClient` to `evaluatePlanDraft(params, extensionJudgeClient)`.
     - In `typesafe_expert_review`, pass `extensionJudgeClient` to `evaluateScopeArbiter`, `evaluateDriftGuard`, and `evaluateRiskSecurityTriage`.
  4. **Strict Isolation & Redaction:** Ensure all outbound calls pass through `typesafe-redact.cjs`, `typesafe-api-client.cjs`, and `typesafe-policy-client.cjs` before hitting the wire.
- **Non-Functional:**
  1. **Zero Base Code Modifications:** Zero edits to `src/*` or core oh-my-pi files (`packages/coding-agent/*`).
  2. **Fail-closed:** Abort after a 10-second timeout using `AbortSignal.timeout(10_000)` with short, non-descriptive error codes (`timeout`, `network_error`, `unauthorized`).

## Architecture
```
[typesafe-planner.ts Event & Tool Hooks]
  (handleTodoInterception, typesafe_expert_review, typesafe_elevate_plan)
                       |
                       v
         [extensionJudgeClient (Adapter)]
                       |
                       v
     [executeTypeSafe() in typesafe-planner.ts]
                       |
        +--------------+--------------+
        |                             |
        v                             v
[typesafe-redact.cjs]      [typesafe-api-client.cjs]
  (Egress Redactor)         (Pre-flight Validator)
        |                             |
        +--------------+--------------+
                       |
                       v
    [POST https://api.typesafe.ai/v1/systemone]
                 model: "jev-latest"
```

## Related Code Files
- Modify: `typesafe-planner.ts` (All changes isolated here)
- Modify: `typesafe-planner.test.ts`
- DO NOT Modify: `src/*`

## Implementation Steps
1. **Define Unified Adapter in `typesafe-planner.ts`:**
   - Implement `createExtensionJudgeClient(apiKey, signal, ctx)`:
     - Implements `evaluate({ state, questions })`: converts to `TypeSafeJudgeParams`, calls `executeTypeSafe()`, and parses `{ answers }`.
     - Implements `evaluatePlan({ state, questions })`: converts to `TypeSafeJudgeParams`, calls `executeTypeSafe()`, and parses `{ answers }`.
2. **Inject Adapter into Interceptor & Tools:**
   - In `handleTodoInterception`: pass the adapter to `runPhaseMacroCheck(macroContext, client)`.
   - In `typesafe_elevate_plan`: pass the adapter to `evaluatePlanDraft(params, client)`.
   - In `typesafe_expert_review`: pass the adapter to `evaluateScopeArbiter`, `evaluateDriftGuard`, and `evaluateRiskSecurityTriage`.
3. **Verify Rogue Endpoints are Bypassed:**
   - Ensure the rogue `/v1/judge` endpoint in `src/cook-expert-judge.ts` is never called because the default parameter is overridden by our injected client.
4. **Add Transport Tests in `typesafe-planner.test.ts`:**
   - Mock global `fetch` in test suite and assert that every intercepted tool call targets `https://api.typesafe.ai/v1/systemone` with body containing `model: "jev-latest"`.

## Success Criteria
- [ ] 100% of outgoing TypeSafe calls target `https://api.typesafe.ai/v1/systemone`.
- [ ] Zero calls are made to `/v1/judge`.
- [ ] All request payloads contain `"model": "jev-latest"`.
- [ ] `src/` directory is unmodified.
- [ ] Verification command: `bun test typesafe-planner.test.ts` passes with 0 failures.

## Risk Assessment
- **Risk:** Base helper functions might expect specific response shapes.
- **Mitigation:** Adapter maps the sanitized `{ answers }` object precisely to the `ExpertJudgeResponse` and `PlanJudgeResponse` formats expected by the callers.
