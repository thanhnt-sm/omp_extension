---
phase: 4
title: "Regression and live verification"
status: pending
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Regression and live verification

## Overview
Author exhaustive automated tests verifying threshold boundary conditions, fail-closed drop gates, plan-completion invariant enforcement, and deployment sync integrity to the global runtime.

## Requirements
- Functional:
  - Add explicit unit tests covering all score boundary conditions:
    - `noul = 0.29`: Auto-reject.
    - `noul = 0.30`: Enter undecided gray zone.
    - `noul = 0.35`: Undecided gray zone (matches reported user case).
    - `noul = 0.79`: Undecided gray zone.
    - `noul = 0.80`: Auto-approve.
    - `noul = 0.95`: Auto-approve.
  - Test plan-completion closure attacks:
    - Attempting `bash` tool call running `plan-cli check` while contracted task active -> blocked.
    - Attempting `write` or `edit` writing `status: completed` to `plan.md` -> blocked.
  - Test agent guidance output:
    - Rejection messages match the actionable checklist format.
    - Next steps contain concrete tool invocation commands.
  - Verify synchronization:
    - Run `node tools/sync-baseline.cjs` to backup, deploy, and verify target.
- Non-functional:
  - Full suite `bun test` passes with zero regressions.
  - Never edit `C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts` directly.

## Architecture
```
[Local Workspace: D:/100.Software/Github/omp_extension]
       │
       ▼
   bun test ──► All suites green (Zero regressions)
       │
       ▼
 node tools/sync-baseline.cjs
       │
       ├── 1. Create timestamped backup at C:/Users/thant/Projects/omp_extension_backup_<TS>
       ├── 2. Copy modified extension files to C:/Users/thant/Projects/omp_extension
       ├── 3. Validate C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts pointer
       └── 4. Execute test validation in deployment target
       │
       ▼
[OMP Session Restart] ──► Host loads refreshed extension logic from target
```

## Related Code Files
- Modify: `tests/todo-drop-gate.test.ts`
- Modify: `tests/cook-expert-judge.test.ts`
- Modify: `tests/typesafe-lifecycle-gating.test.ts`
- Reference: `tools/sync-baseline.cjs`

## Implementation Steps
1. In `tests/cook-expert-judge.test.ts`:
   - Add boundary matrix test for `runDropJustificationCheck`:
     - Assert `0.29` returns `{ decision: "reject" }`.
     - Assert `0.30` returns `{ decision: "undecided" }`.
     - Assert `0.35` returns `{ decision: "undecided" }`.
     - Assert `0.79` returns `{ decision: "undecided" }`.
     - Assert `0.80` returns `{ decision: "approve" }`.
2. In `tests/typesafe-lifecycle-gating.test.ts`:
   - Add test verifying that `plan-cli.cjs check` is intercepted and cancelled when `activeContractedTasks` has elements.
   - Add test verifying that attempting to write `status: completed` to `plan.md` throws when tasks are unfinished.
3. In `tests/todo-drop-gate.test.ts`:
   - Assert that rejected drop messages contain the formatted `NEXT ACTIONS FOR AGENT` guidance block.
4. Run test suites:
   ```text
   bun test tests/cook-expert-judge.test.ts tests/todo-drop-gate.test.ts tests/typesafe-lifecycle-gating.test.ts
   bun test
   ```
5. Deploy to global runtime:
   ```text
   node tools/sync-baseline.cjs
   ```
6. Document live verification scenario for the user:
   - Restart OMP session to clear in-memory extension cache.
   - Run task drop scenario; observe prompt with full context.
   - Run plan completion check; observe strict gating until tasks are resolved.

## Success Criteria
- [ ] Boundary tests pass for 0.29, 0.30, 0.35, 0.79, 0.80, 0.95.
- [ ] Plan-completion backdoor tests pass and confirm fail-closed behavior.
- [ ] Full test suite passes cleanly with zero failures.
- [ ] `sync-baseline.cjs` completes successfully with target validation verified.

## Risk Assessment
- Risk: Changes in local workspace not taking effect in active OMP session.
  - Mitigation: User MUST restart OMP session after `sync-baseline.cjs` to reload extension code into memory.
