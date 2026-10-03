# Source Code Relocation & Stabilization

**Date**: 2026-10-03
**Context**: Upstream source stored in `C:/Users/thant/tmp`
**Goal**: Prevent data loss and align with developer expectations by moving the source to a permanent directory.

## The Problem
The `tmp` directory on Windows, while not the system `%TEMP%`, inherently carries semantic risk. A developer might accidentally delete or overwrite it, assuming its contents are ephemeral. Furthermore, it causes cognitive friction for a project meant to be maintained long-term.

## The Solution
Following a multi-persona risk assessment (`ck:predict`), the unanimous decision was to relocate the project to a formal workspace. 

1. **Relocation Target**: Created `C:/Users/thant/Projects/omp_extension` and copied the entire codebase from `tmp` to this durable location using Node's `fs` to prevent OS-level file lock issues on Windows.
2. **Proxy Update**: Updated the deployed OMP extension at `~/.omp/agent/extensions/typesafe-planner.ts` to export from the new directory:
   ```typescript
   export { default } from "C:/Users/thant/Projects/omp_extension/typesafe-planner.ts";
   ```
3. **Version Control**: Initialized a Git repository (`git init`, `add`, `commit`) in the new directory to ensure the codebase is tracked and protected against accidental loss.

## Verification
- Running `bun test` in `C:/Users/thant/Projects/omp_extension` passed 100% of the tests (83 tests across 11 files).
- The proxy extension loads flawlessly.
- The `tmp` directory is no longer the critical source of truth.