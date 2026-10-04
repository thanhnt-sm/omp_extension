---
phase: 4
title: "Deconfliction and Privilege Guard"
status: pending
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: Deconfliction and Privilege Guard

## Overview
Deconflict `typesafe-planner.ts` with `src/egc.ts` to prevent overlapping interception deadlocks, and eliminate privilege escalation loopholes (such as agent self-granting `allowJudgeModification`).

## Requirements
- Functional:
  - Add cooperative detection: If `src/egc.ts` is active (or `.omp/egc.json` exists / `EGC_ACTIVE=1`), `typesafe-planner.ts` must yield its `todo` verification hook while retaining `ask` decision scoring, auth recovery, and expert review tools.
  - Fix privilege escalation in `PROTECTED_INTEGRITY_PATTERNS`: remove unauthenticated caller-supplied `allowJudgeModification: true`. Only allow modifications if explicitly initiated by a human command or verified authorization context.
  - Implement loop guard & stall ratchet in `typesafe-planner.ts` fallback: track consecutive failed verification attempts and provide truthful failure state instead of looping infinitely.
  - Handle missing policy client / auth failures gracefully without throwing unhandled exceptions that trap the agent.
- Non-functional:
  - Zero disruption to existing `typesafe_expert_review`, `typesafe_rerank`, and `typesafe_evaluate_multi` tools.
  - Clear notification output explaining which extension is governing task completion.

## Architecture
- In `typesafe-planner.ts`:
  - Before registering or handling the `todo` hook, check `hasActiveEGC(cwd)`:
    ```typescript
    function hasActiveEGC(cwd: string): boolean {
      return existsSync(join(cwd, ".omp", "egc.json")) || process.env.EGC_ACTIVE === "1";
    }
    ```
  - When EGC is active, skip `todo` interception with a single informative log message: `"TypeSafe Planner: EGC extension detected; delegating task gating to EGC."`
  - In tool call interceptor: verify caller credentials before honoring `allowJudgeModification`. Disallow agent prompt injection of `allowJudgeModification: true`.

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `src/egc.ts`
- Test: `tests/redteam-vulnerabilities.test.ts`, `tests/typesafe-integrity.test.ts`

## Implementation Steps
1. Add `hasActiveEGC` check in `typesafe-planner.ts` and guard the `todo` tool-call handler.
2. Tighten `allowJudgeModification` verification to prevent bypass via tool call arguments.
3. Add retry/stall counter with max attempts limit in `typesafe-planner.ts` completion gate.
4. Catch `loadPolicyClientModule` errors and notify rather than throwing fatal exception.
5. Run full test suite across both `typesafe-planner` and `egc`.

## Success Criteria
- [ ] No hook collision when both extensions are enabled.
- [ ] Self-granted `allowJudgeModification` is strictly rejected.
- [ ] Unhandled exceptions in policy loading are eliminated.
- [ ] All red-team regression tests pass.
- [ ] Full project suite (`bun test`) passes completely.

## Risk Assessment
- *Risk*: Disabling `todo` in `typesafe-planner` when EGC is present might leave tasks ungated if EGC is not properly locked.
- *Mitigation*: Verify that EGC emits explicit notice if the contract is unlocked or missing.
