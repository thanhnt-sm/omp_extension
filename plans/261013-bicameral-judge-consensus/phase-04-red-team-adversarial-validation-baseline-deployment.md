---
phase: 4
title: "Red-Team Adversarial Validation & Baseline Deployment"
status: completed
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Red-Team Adversarial Validation & Baseline Deployment

## Overview
Perform exhaustive red-team adversarial stress testing across the 7-attack security matrix, verify full backward compatibility across all 31 test suites, and execute automated deployment to the global runtime target via `tools/sync-baseline.bat`.

## Requirements
- Functional:
  - Run adversarial validation across all 7 attack vectors in `tests/adversarial-compliance.test.ts` and `tests/cook-verification-adversarial.test.ts`:
    * Attack 1: Superficial Completion (Scaffolds/stubs exiting 0) $\implies$ must be blocked by JEV AST & Categorical Deliverable evaluation.
    * Attack 2: Assertion Deletion / Test Evasion $\implies$ must be blocked by Gate 1 AST diff analyzer.
    * Attack 3: Unauthorized Scope Reduction $\implies$ must be blocked unless human or bicameral consensus approves.
    * Attack 4: Large Diff Flood (>200KB) $\implies$ safely clamped to $\le 32\text{KB}$.
    * Attack 5: Credential Revocation & Network Drop $\implies$ fails closed to `unavailable` without crashing.
    * Attack 6: Loop Exhaustion & Escalation $\implies$ bounded to at most 2 retry/reconciliation loops before user escalation.
    * Attack 7: Claude Credential & Boundary Violation $\implies$ strictly scrubs secrets and rejects `.claude` access.
  - Run full regression testing across all 31 test files in the development workspace (`bun test`).
  - Deploy baseline using `node tools/sync-baseline.cjs` (or `tools\sync-baseline.bat`).
- Non-functional:
  - 100% test pass: 0 failures, 0 syntax errors, 0 regressions across both workspace and target deployment.
  - Immutable loader pointer preserved at `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`.

## Related Code Files
- Modify: `tests/adversarial-compliance.test.ts`
- Modify: `tests/cook-verification-adversarial.test.ts`
- Modify: `tests/todo-drop-gate.test.ts`
- Modify: `tests/verification-gate.test.ts`
- Execute: `tools/sync-baseline.bat`
- Verify: `tools/sync-baseline.cjs`

## Implementation Steps
1. **Adversarial Matrix Validation**:
   - Run `bun test tests/adversarial-compliance.test.ts`.
   - Run `bun test tests/cook-verification-adversarial.test.ts`.
   - Ensure that with numerical thresholds eliminated, JEV's categorical verdict and AST analysis maintain full defense against superficial completions and test evasions.
2. **Full Workspace Regression Run**:
   - Execute `bun test` across the entire workspace (`D:/100.Software/Github/omp_extension`).
   - Verify that all 31 test files pass with 0 failures and 0 errors.
3. **Automated Baseline Deployment & Target Verification**:
   - Run `node tools/sync-baseline.cjs`.
   - Verify automated timestamped backup creation (`C:\Users\thant\Projects\omp_extension_backup_<timestamp>`).
   - Verify baseline file deployment to `C:\Users\thant\Projects\omp_extension`.
   - Verify immutable OMP loader pointer (`C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`).
   - Verify 100% pass on target directory test suites.
4. **End-to-End Live Verification**:
   - Run controlled live simulation of drop request with verified clean build evidence, proving that sovereign human approval and non-blocking plan reconciliation function seamlessly.

## Success Criteria
- [ ] All 7 adversarial attack vectors successfully mitigated without numerical threshold crutches.
- [ ] 100% passing tests across all 31 test suites in both development workspace and target deployment.
- [ ] Automated backup created, loader pointer intact, and global extension ready for session restart.

## Risk Assessment
- Risk: In-memory OMP session caching old extension code.
  - Mitigation: Explicit post-deployment user instruction to restart OMP session to load updated bicameral extension logic into host memory.
