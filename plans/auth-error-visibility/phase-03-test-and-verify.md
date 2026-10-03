# Phase 3: Test and Verify

## Overview
Verify that the Dual-Channel Notification strategy successfully exposes credential failures without crashing the agent.

## Requirements
- Functional: Must execute a tool call with an invalid API key.
- Functional: Must assert that the error is sent via the UI and the tool returns a non-fatal `isError` payload.

## Implementation Steps
1. Write an integration script using JS `eval`.
2. Temporarily set `process.env.TYPESAFE_API_KEY = "invalid"`.
3. Mock `pi.sendMessage` to capture the output string and ensure `display: true` is passed.
4. Call the `execute` method of `typesafe_judge` or `typesafe_evaluate_multi`.
5. Assert that the captured `sendMessage` output contains the "TypeSafe" alert.
6. Assert that the returned object from the tool execution contains `isError: true`.

## Success Criteria
- [ ] Mock `sendMessage` captures the intended red alert.
- [ ] Tool execution does not throw an unhandled exception.
- [ ] Tool return object has `isError: true`.

## Related Code Files
- Create: Throwaway JS eval script during verification.
