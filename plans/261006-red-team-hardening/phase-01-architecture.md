---
phase: 1
title: "Architecture & Foundation"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Architecture & Foundation

## Overview
Establish the foundational types, error classes, and test infrastructure required for the red-team hardening of `omp_extension`. This phase sets up the scaffolding for the subsequent zero-dependency security features.

## Requirements
- Functional: Define strict TypeScript interfaces for AST analysis results, XML enclosure schemas, and auth states.
- Non-functional: Must not introduce external npm dependencies.
- TDD: Test suites must be created to validate the shape of the domain errors and types before any logic is implemented.

## Architecture
- `src/types/security.ts`: Common types across the security subsystem.
- `src/errors/TypeSafeError.ts`: Base error class for all verification and security failures.

## Related Code Files
- Create: `src/types/security.ts`
- Create: `src/errors/TypeSafeError.ts`
- Create: `tests/architecture.test.ts`

## Implementation Steps
1. **[TDD] Write Tests**: Create `tests/architecture.test.ts` verifying that `TypeSafeError` correctly captures stack traces and formats messages.
2. **Implement Error Base**: Create `src/errors/TypeSafeError.ts`.
3. **Define Interfaces**: Create `src/types/security.ts` outlining the data contracts for AST diffing and XML boundaries.
4. **Run Tests**: Execute `bun test tests/architecture.test.ts`.

## Success Criteria
- [ ] `TypeSafeError` extends native `Error` and is instantiable.
- [ ] Security domain types compile without errors.
- [ ] `bun test tests/architecture.test.ts` passes with exit code 0.

## Risk Assessment
- Risk: Over-engineering the type system.
- Mitigation: Keep interfaces minimal, strictly scoped to the 4 target vulnerabilities identified in the red-team report.