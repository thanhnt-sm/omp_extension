---
phase: 5
title: "Auth Rotation & Resiliency"
status: pending
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 5: Auth Rotation & Resiliency

## Overview
Implement resilient HTTP client logic to handle 401/403 responses by dynamically refreshing hashed credentials in-memory, without requiring process restarts.

## Requirements
- Functional: Intercept 401/403 errors, trigger a secure token refresh, and retry the upstream request.
- Non-functional: Zero telemetry leakage of raw API keys.
- TDD: Test suite must mock HTTP 401 responses and verify retry behavior.

## Architecture
- `src/auth-manager.ts`: Manages secure key hashing and rotation state.
- Update `src/typesafe-policy-client.cjs` (or TS equivalent) to use the auth manager's interceptor.

## Related Code Files
- Create: `src/auth-manager.ts`
- Create: `tests/auth-manager.test.ts`
- Modify: `src/typesafe-policy-client.cjs`

## Implementation Steps
1. **[TDD] Write Failing Tests**: Create `tests/auth-manager.test.ts` simulating expired tokens.
2. **Implement Auth Manager**: Build the in-memory hashed storage and retry interceptor.
3. **Integrate**: Wrap the fetch calls in `typesafe-policy-client.cjs`.
4. **Run Tests**: Execute `bun test tests/auth-manager.test.ts`.

## Success Criteria
- [ ] 401 responses trigger exactly one retry with a new token (if available).
- [ ] Raw keys are never logged in stack traces or error messages.
- [ ] Test suite successfully mocks and recovers from a 401 error.

## Risk Assessment
- Risk: Infinite retry loops on permanently revoked keys.
- Mitigation: Implement a strict 1-retry limit and backoff mechanism.