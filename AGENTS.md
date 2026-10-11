# Agent Guidelines: TypeSafe Extension Workspace

## 1. Golden Invariant: Never Modify Global OMP Extensions Directly
- **File**: `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`
- **Purpose**: This file is an **immutable single-line proxy trampoline**:
  ```typescript
  export { default } from "C:/Users/thant/Projects/omp_extension/typesafe-planner.ts";
  ```
- **Rule**: **NEVER modify or write to `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts` directly**.
- **Reason**: Modifying this file directly breaks the module resolution of `./src/*` relative imports and destroys the single source of truth.

---

## 2. Workspace & Deployment Flow

```
[Development Workspace] (e.g. D:/100.Software/Github/omp_extension)
       │
       │  (Code edits, feature development, unit testing)
       ▼
   bun test
       │
       │  node tools/sync-baseline.cjs
       ▼
[Active Deployment Target] (C:/Users/thant/Projects/omp_extension)
       ▲
       │  (Loads via proxy trampoline)
[OMP Global Loader] (C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts)
```

1. **Development & Testing**:
   - All code edits (`typesafe-planner.ts`, `src/*`, `tests/*`, `plans/*`) MUST be made in this workspace.
   - Run tests locally using `bun test`.
2. **Synchronization to Global Runtime**:
   - Run `node tools/sync-baseline.cjs` (or `tools\sync-baseline.bat`).
   - The script creates an automated timestamped backup in `C:\Users\thant\Projects\omp_extension_backup_<timestamp>`, deploys the baseline files, checks the OMP loader pointer, and verifies the target with test suites.
3. **OMP Session Restart**:
   - The host OMP process loads and caches extension code in memory upon startup.
   - To reload updated extension logic or reset in-memory safety ratchet state, the user must restart the OMP session.
