---
phase: 1
title: "TDD Regression Suites"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: TDD Regression Suites

## Overview
Establish failing test cases for the 7 red-team attack vectors before modifying runtime code. Ensure tests accurately assert failure against current behavior and pass once remediation is complete.

## Requirements
- Functional:
  - Assert batch `{ ops: [{ op: "done" }] }` triggers verification gate.
  - Assert `drop`, `init`, `start`, `append` cannot bypass the task gate unmonitored.
  - Assert empty/unstaged git diff does not inject synthetic passing assertions (`"Tests passed"` / `"+ // No diff"`).
  - Assert unified diff retains function bodies and logic up to the 32KB payload boundary rather than stripping them.
  - Assert agent cannot pass `allowJudgeModification: true` via tool call parameters without authorization.
  - Assert `typesafe-planner.ts` detects active EGC and yields `todo` handling cleanly without double-gate deadlock.
- Non-functional:
  - 100% deterministic test execution via `bun test`.
  - Zero network calls during tests (mocked TypeSafe endpoints & git outputs).

## Architecture
Create `tests/redteam-vulnerabilities.test.ts` using Bun's test runner, exercising `typesafe-planner.ts` and `src/verification-gate.ts` against structured adversarial mocks.

## Related Code Files
- Create: `tests/redteam-vulnerabilities.test.ts`
- Modify: None (TDD phase)

## Implementation Steps
1. Write test asserting batch `ops: [...]` invocation of `todo` triggers gate interception.
2. Write test asserting `drop`, `init`, and `start` operations trigger task validation checks.
3. Write test asserting absence of git diff / tests results in explicit zero-evidence rejection rather than fabricated mock strings.
4. Write test asserting diff summarizer retains full function implementations for files in plan up to 32KB.
5. Write test asserting `allowJudgeModification` tool argument is rejected or gated by human approval.
6. Write test asserting `typesafe-planner` yields completion interception when EGC extension is present.

## Success Criteria
- [ ] `bun test tests/redteam-vulnerabilities.test.ts` executed.
- [ ] Tests cleanly identify current vulnerabilities (failing red-phase tests ready for implementation).

## Risk Assessment
- *Risk*: Tests might falsely pass if current code has partial guards.
- *Mitigation*: Verify each test asserts the exact exploit vector identified in the red-team audit.
