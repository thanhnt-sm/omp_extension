# Baseline Deployment Tools

This directory contains utility scripts to back up and deploy the verified TypeSafe baseline from this workspace to the active OMP projects directory.

## Files

- **`sync-baseline.cjs`**: Automated Node.js deployment script.
- **`sync-baseline.bat`**: Windows batch launcher for single-click execution.

## What it does

1. **Backs up** `C:\Users\thant\Projects\omp_extension` to a timestamped directory (`C:\Users\thant\Projects\omp_extension_backup_<TIMESTAMP>`).
2. **Deploys** all modified and decoupled code from this workspace (`typesafe-planner.ts`, `src/debate-evaluator.ts`, test suites, and documentation).
3. **Verifies** the OMP global extension pointer (`C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`) points to the target.
4. **Executes** `bun test` in the target directory to verify 100% test pass rate and stability before completion.

## How to run

In terminal:
```bash
node tools/sync-baseline.cjs
```

Or double-click:
```cmd
tools\sync-baseline.bat
```
