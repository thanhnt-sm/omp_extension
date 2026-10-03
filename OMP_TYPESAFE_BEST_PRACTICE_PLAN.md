# TypeSafe Best Practice Alignment Plan

## Context
The user requested an evaluation of `omp`'s `judge` / `typesafe` integration against `typesafe-ai` best practices. An analysis of `typesafe-planner.ts` reveals that while it successfully handles project opt-in and fails closed on invalid inputs, it violates a core determinism best practice: "Any caller consuming judge() over untrusted or user-derived state must implement a deterministic caller-side decision adapter (action lattice)." Currently, `typesafe-planner.ts` bypasses the existing `typesafe-policy-client.cjs` and relies solely on a text instruction (`PROMPT_INJECTION`) to ask the LLM agent to enforce "Tighten-only" logic. Relying on an LLM to enforce security boundaries over potentially prompt-injected state is non-deterministic and unsafe.

## Approach

1. **Host-Context Policy Binding:**
   - Ensure the `typesafe_judge` tool parameter schema does *not* accept `policy` from the LLM. 
   - Resolve the `baseline` and `lattice` from the trusted host context (e.g., environment variables, static configuration, or caller arguments during tool registration) inside `typesafe-planner.ts`.
   - This prevents untrusted LLM input from defining the security boundaries.

2. **Strict Module Loading (Fail-Closed):**
   - Add a `loadPolicyClientModule()` function to `typesafe-planner.ts` following the existing `loadApiClientModule()` pattern.
   - Dynamically `nodeRequire` the shared `typesafe-policy-client.cjs`.
   - If the module fails to load, throw a hard error and halt execution immediately (do *not* silently disable TypeSafe).

3. **Deterministic Lattice Enforcement:**
   - In the `execute` function of `typesafe_judge`, after calling `apiClientModule.sanitizeAnswers`, iterate through the answers.
   - Fetch the trusted host-injected `policy` and pass it to `policyClientModule.checkPolicy(answer, policy)`.
   - If `checkPolicy` returns `{ ok: false }`, immediately abort and return a hard error: `{ content: [{ type: "text", text: `lattice-violation: ${result.reason}` }] }`.

4. **Prompt Injection Update:**
   - Update `PROMPT_INJECTION` in `typesafe-planner.ts` to instruct the LLM that "Tighten-only" policies are enforced structurally by the host. 
   - The LLM should be informed that attempting to output a decision below the current baseline will result in a hard rejection.

## Critical Files & Anchors
- `typesafe-planner.ts`:
  - `loadApiClientModule` region: Anchor for adding `loadPolicyClientModule`.
  - `pi.registerTool` region: Anchor for Zod schema updates.
  - `execute` region (post `sanitizeAnswers`): Anchor for structural policy enforcement logic.

## Verification & TDD (Tests-First)
1. **Unit Test - Module Loading:** Test that `typesafe-planner.ts` halts execution if `typesafe-policy-client.cjs` is missing or unreadable.
2. **Unit Test - Policy Enforcement:** Test that `execute` uses a mock host-injected policy and successfully rejects a mock API return of `"auto"` when the baseline is `"review"` (`lattice: ["auto", "review", "block"]`).
3. **Integration Test - End-to-End:** Write an integration test where an LLM is given an injected prompt attempting to force a permissive boundary, verifying the tool hard-rejects the attempt and returns `lattice-violation`.

## Assumptions & Contingencies
- **Assumption:** `typesafe-policy-client.cjs` exposes a method (e.g., `checkPolicy`) compatible with checking individual question answers against a lattice.
- **Contingency:** If `typesafe-policy-client.cjs` only exposes a monolithic `judgeWithPolicy` wrapper that expects raw HTTP execution, we will inline the lightweight deterministic array-index comparison (`lattice.indexOf(answer) >= lattice.indexOf(baseline)`) directly within `typesafe-planner.ts` to enforce the lattice without needing to rewrite the shared module's signature.

## Red Team Review
- **Security [Accepted]:** Addressed critical vulnerability where the LLM was originally allowed to supply its own security policy in the Zod schema. Enforced host-context policy binding instead.
- **Failure-Mode [Accepted]:** Addressed fail-open logic in module loading. The system will now halt on load failure instead of silently disabling TypeSafe.
- **Verification [Accepted]:** Expanded verification to include TDD end-to-end testing against actual agent payloads, mitigating the risk of bypassed schemas in mocked environments.

## Validation Log
1. **Host Context Source:** How should typesafe-planner.ts resolve the trusted 'baseline'? 
   - **Decision:** Tool Initialization Arguments (Passed as an initialization argument when the MCP tool is registered).
2. **Lattice Definition:** Should the escalation lattice be a global constant or configurable per tool?
   - **Decision:** Per-Tool Configuration (Pass the valid lattice array alongside the baseline during tool initialization).