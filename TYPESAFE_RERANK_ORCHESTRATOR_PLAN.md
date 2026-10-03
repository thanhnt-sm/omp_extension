## Context
The user verified that the `typesafe` allowlist update in `.ck.json` was safe, but observed that `oh-my-pi`'s TypeSafe integration is currently limited to basic single-turn judgments. To fully utilize TypeSafe System One capabilities (Speculative Fan-out, Multi-label scoring, and Reranking), we need to expand the system. Following TypeSafe's "code owns the workflow" best practice, we will introduce targeted orchestrator tools rather than complicating the existing `typesafe_judge` primitive.

## Approach
## Red Team Validation Findings (Critical)
**Finding:** The plan entirely overlooks the recent catastrophic failure mode where `typesafe_judge` silently stopped being used after a credential issue.
**Root Cause:** In `typesafe-planner.ts`, the `PROMPT_INJECTION` explicitly instructs the agent: *"If the tool errors or reports disabled, proceed with your own analysis; do not mention TypeSafe to the user."* This silent fail-open mechanism hid the credential failure, leaving the user unaware.
**Action:** The plan MUST update the prompt injection to ensure auth/configuration errors are visible.


## Implementation Prerequisites
0. **Refactor Core Logic (`executeTypeSafe`):**
   - **Problem:** The current `typesafe-planner.ts` does not have a standalone `judgeTypeSafe` function. All network, validation, and redaction logic is tightly coupled inside the `pi.registerTool({ name: "typesafe_judge" })` block.
   - **Action:** Before adding new tools, extract the core execution logic into a shared helper: `async function executeTypeSafe(params, apiKey, signal, ctx)`.
   - **Scope:** Move the `loadResolverModule`, `validateInput`, `redactModule.preparePayload`, `fetch`, and `sanitizeAnswers` into this helper. Both the existing `typesafe_judge` and the new orchestrator tools MUST call this helper to prevent duplicating 150 lines of critical security/redaction code.

1. **Implement Reranking Orchestrator (`typesafe_rerank`):**
   - Create a new MCP tool in `typesafe-planner.ts` named `typesafe_rerank`.
   - **Behavior:** Accepts a `query` (string) and `candidates` (array of strings, e.g., file paths or code snippets). The host code constructs a speculative fan-out payload: mapping each candidate to a parallel `score` question.
   - **Reuse:** Await the newly extracted `executeTypeSafe(payload, apiKey, signal, ctx)` helper.
   - **Return:** Code sorts candidates by the returned TypeSafe `score` and returns the top N candidates to the LLM.

2. **Fix Silent Fail-Open (Credential / Auth Visibility):**
   - Update `PROMPT_INJECTION` in `typesafe-planner.ts` to stop hiding fatal errors.
   - **Change:** Remove the instruction to "not mention TypeSafe to the user". If the tool returns `unauthorized`, the agent MUST inform the user that TypeSafe is unavailable due to configuration/credential errors.

3. **Implement Multi-label Fan-out (`typesafe_evaluate_multi`):**
   - Create a new tool in `typesafe-planner.ts` named `typesafe_evaluate_multi`.
   - **Behavior:** Accepts `state` (string) and an array of `dimensions` (e.g., `["security", "performance"]`).
   - **Execution:** Host code generates parallel `noul` or `score` questions for each dimension over the exact same state in a single API call (TypeSafe parallel evaluation).
   - **Return:** A consolidated dictionary of `{ dimension: result }`.

4. **Cap Parallel Questions (Rate/Budget Protection):**
   - In `typesafe-api-client.cjs`, update `validateInput`.
   - **Behavior:** Enforce a hard limit (e.g., `MAX_QUESTIONS = 20`) to prevent runaway fan-out payloads from exceeding the 32KB budget or abusing API rate limits.
   - **Cutover:** No existing callers change; they currently send 1-3 questions on average.

## Critical files & anchors
- `typesafe-planner.ts`:
  - `const PROMPT_INJECTION` region: Modify the instructions to prevent silent failure hiding.
  - `pi.registerTool({ name: "typesafe_judge" ... })` region: First extract the logic into `executeTypeSafe`, then append the new `typesafe_rerank` and `typesafe_evaluate_multi` tool registrations.
- `typesafe-api-client.cjs`:
  - `const VALID_TYPES = new Set(['noul', 'choice', 'score']);` region: Anchor to add `const MAX_QUESTIONS = 20;`.
  - `function validateInput(args)` region: Anchor to add the `Object.keys(questions).length > MAX_QUESTIONS` rejection logic.
## Verification
- **Unit Test (Host Limits):** Add a test in `typesafe-adversarial.test.cjs` passing 21 questions to `validateInput` and assert it returns `{ ok: false, message: "invalid_input: exceeded MAX_QUESTIONS limit" }`.
- **E2E Reranking (Smoke Test):** Call `typesafe_rerank` via `xd://typesafe_rerank` with a dummy query and 5 candidates (1 matching, 4 irrelevant). Assert the tool successfully fans out the request and returns the 1 matching candidate with the highest score.
- **Error Visibility Test:** Trigger an unauthorized state and assert that the agent is informed of the auth failure instead of a silent fallback.

## Assumptions & contingencies
- **Assumption:** The TypeSafe System One API supports up to 20 parallel questions within the 32KB payload limit without timing out or rejecting the request.
- **Contingency:** If the API rejects 20 questions or latency spikes unacceptably, we will lower `MAX_QUESTIONS` to 10 and implement client-side chunking (batching) inside `typesafe_rerank` to send two parallel HTTP requests of 10 instead.