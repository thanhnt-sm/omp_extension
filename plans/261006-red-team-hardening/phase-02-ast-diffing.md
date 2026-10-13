---
phase: 2
title: "AST Diffing"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: AST Diffing

## Overview
Implement a zero-dependency, lightweight AST traversal utility or enhanced diff parser to robustly detect test evasion (e.g., commenting out assertions or deleting test blocks), replacing the fragile regex checks.

## Requirements
- Functional: Must parse unified git diffs and identify if test assertions (`expect`, `assert`) have been deleted, commented out, or structurally bypassed.
- Non-functional: Execution time $<150\text{ms}$ (Gate 1 budget). Zero external LLM token cost.
- TDD: Test suite must include known evasion techniques (commented tests, removed suites) from `typesafe-red-team-report.md`.

## Architecture
- `src/ast-analyzer.ts`: Contains the parsing logic for diff chunks.
- Integrates into `src/verification-gate.ts` to replace the existing `deletedAssertions` regex.

## Related Code Files
- Create: `src/ast-analyzer.ts`
- Create: `tests/ast-analyzer.test.ts`
- Modify: `src/verification-gate.ts`

## Implementation Steps
1. **[TDD] Write Failing Tests**: Create `tests/ast-analyzer.test.ts` with mocks of git diffs that represent test evasion (Finding 4 in the red-team report).
2. **Implement Analyzer**: Build `src/ast-analyzer.ts` using a lightweight typescript compiler API wrapper or a robust zero-dependency diff semantic analyzer.
3. **Integrate**: Hook the analyzer into `src/verification-gate.ts` Gate 1 checks.
4. **Run Tests**: Execute `bun test tests/ast-analyzer.test.ts` and ensure all evasion vectors are caught.

## Success Criteria
- [ ] Deletion of `it(...)` blocks containing assertions triggers a failure.
- [ ] Commenting out `expect(...)` inside a diff triggers a failure.
- [ ] Execution latency remains under $150\text{ms}$.
- [ ] `bun test` passes.

## Risk Assessment
- Risk: Memory/CPU overhead of parsing large test files.
- Mitigation: Only parse the specific diff hunks, falling back to full file AST only when a test block deletion is detected.