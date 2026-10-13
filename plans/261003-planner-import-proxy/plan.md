## Context
The `typesafe-planner.ts` OMP extension fails to load at session startup because it attempts to import `./src/plan-evaluator` (and 3 other modules). These are relative modules that do not exist in the global `~/.omp/agent/extensions/` directory. This breaks the TypeSafe judge functionality.

## Red-Team Analysis & Attack Findings (ck:problem-solving)
During red-team validation, multiple critical flaws were identified in the original plan:
1. **Incomplete Scope:** The original plan only targeted `plan-evaluator.ts`, but there are four dependent imports (`plan-evaluator`, `verification-gate`, `evidence-collector`, `cook-expert-judge`). Fixing one would just cause the next to fail.
2. **Architectural Violation (Contingency):** The original contingency suggested inlining the ~1400 lines of `src/` modules. This strictly violates `typesafe-planner.ts` lines 75-81, which mandate a single source of truth for redaction/validation logic to prevent silent drift between OMP, MCP, and CLI.
3. **Brittle Deployment Strategy:** Manually patching or hardcoding absolute paths directly into the workspace source file (`~/tmp/typesafe-planner.ts`) is unsound and breaks portability.
4. **Missing TDD Automation:** The original plan relied on manual OMP restarts. It lacked a programmatic test to verify load and evaluate extension logic.

## Upgraded Approach (The Proxy/Trampoline Pattern)
Instead of brittle regex patching or copying files, we will use the **Proxy Pattern** for the deployed extension.

1. **Preserve Upstream:** Leave `~/tmp/typesafe-planner.ts` completely untouched. It remains portable with relative `./src/` imports.
2. **Deploy Proxy Extension:** Write a 1-line proxy file to `~/.omp/agent/extensions/typesafe-planner.ts`:
   `export { default } from "C:/Users/thant/tmp/typesafe-planner.ts";`
3. **Native Resolution:** The Bun/Node module resolver will natively resolve the absolute path, and then correctly resolve the relative `./src/...` imports against the `~/tmp` directory.
4. **TDD Verification:** Execute `bun test tests/e2e-workflow.test.ts` to guarantee the underlying logic is intact, and run a programmatic `import()` against the deployed `~/.omp` extension to verify load without restarting the OMP host.

## Critical files & anchors
- `~/tmp/typesafe-planner.ts`: Upstream source (portable, relative paths).
- `~/.omp/agent/extensions/typesafe-planner.ts`: Deployed proxy file.

## Verification Steps
- [x] **Test Suite**: Run `bun test tests/e2e-workflow.test.ts` to ensure 100% PASS.
- [x] **Proxy Load Test**: Execute a Node/Bun script that imports the proxy from `~/.omp/...` to confirm the `Cannot find module` error is permanently resolved.
- [x] **Zero Duplication**: Verify the `src/` directory is not copied or inlined, maintaining the architectural constraint.