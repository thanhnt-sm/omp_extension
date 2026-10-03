# TypeSafe Extension Deployment: The Proxy Pattern

**Date**: 2026-10-03
**Context**: OMP Extension Startup Failure (`typesafe-planner.ts`)
**Goal**: Resolve relative import failures in the global `~/.omp/agent/extensions/` directory without violating architectural constraints against code duplication.

## The Problem
The `typesafe-planner.ts` extension relies on multiple modules from the `src/` directory (`plan-evaluator`, `verification-gate`, `evidence-collector`, `cook-expert-judge`). When the extension is deployed to the global `~/.omp/agent/extensions/` directory, the relative imports (`./src/...`) fail because the `src/` directory does not exist globally. 

## Rejected Alternatives
1. **Inlining/Bundling**: The initial contingency plan suggested inlining the ~1400 lines of `src/` modules directly into the extension file. This was strictly rejected because it violates the architectural constraint (lines 75-81) that mandates a single source of truth for redaction and validation logic. Duplicating this code introduces a severe risk of silent logic drift between OMP, MCP, and CLI.
2. **Regex Patching/Hardcoding Paths**: Modifying the upstream workspace source file (`~/tmp/typesafe-planner.ts`) to hardcode absolute paths (`C:/Users/thant/tmp/...`) was rejected because it destroys the portability of the source repository.

## The Solution: Proxy (Trampoline) Pattern
To satisfy all constraints (no code duplication, preserve upstream portability, successful global loading), we adopted the **Proxy Pattern** for the deployed extension.

The deployed global extension file (`~/.omp/agent/extensions/typesafe-planner.ts`) is now a single-line proxy:
```typescript
export { default } from "C:/Users/thant/tmp/typesafe-planner.ts";
```

### Why This Works
1. **Native Resolution**: The Bun/Node module resolver loads the proxy file, immediately resolves the absolute path to the upstream workspace, and then executes the original file in its native context.
2. **Relative Imports Intact**: Because the executed file is physically located in `~/tmp/`, its relative `./src/...` imports resolve flawlessly to `C:/Users/thant/tmp/src/...`.
3. **Zero Maintenance**: The deployment script/process never needs to parse or regex-replace import statements. The upstream repository remains pristine and portable.

## Outcomes
- The `Cannot find module` startup error is permanently resolved.
- The TypeSafe judge tool (`typesafe_judge`) executes successfully and connects to the API.
- End-to-end tests (`bun test tests/e2e-workflow.test.ts`) pass with 100% compliance.
- Architectural integrity is preserved.