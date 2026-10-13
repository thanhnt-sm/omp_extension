# Phase 2: Implement Out-of-band Notification

## Overview
Implement an out-of-band alert directly to the user's UI using `pi.sendMessage` when a 401/403 is received. This guarantees the auth error is visible and prevents the LLM from silently swallowing the failure.

## Requirements
- Functional: Catch 401/403 status codes in `executeTypeSafe`.
- Functional: Invoke `pi.sendMessage` to display a high-visibility text message to the user.
- Non-functional: Do not throw a fatal runtime exception; allow the agent to receive the `isError: true` flag and continue.

## Architecture
Utilize OMP's `ExtensionAPI.sendMessage` method. By setting `{ display: true }`, the host is instructed to render the message in the user's terminal/UI, bypassing the LLM's interpretation layer completely. This implements the "Dual-Channel Notification" strategy recommended by the ck:predict assessment.

## Related Code Files
- Modify: `typesafe-planner.ts`

## Implementation Steps
1. In `typesafe-planner.ts`, locate the HTTP response check in `executeTypeSafe`: `if (res.status === 401 || res.status === 403)`.
2. Import or access the `pi` object within `executeTypeSafe`. (Note: Since `executeTypeSafe` is defined inside the default export, it has access to `pi`).
3. Add a non-blocking call: `pi.sendMessage({ type: "text", text: "🚨 [TypeSafe] API Key is invalid or expired. The safety gatekeeper is DISABLED!" }, { display: true }).catch(() => {});`

## Success Criteria
- [x] A 401/403 response triggers the out-of-band message.
- [x] The message bypasses the LLM and appears directly to the user.

## Risk Assessment
- **Risk:** If `pi.sendMessage` throws, it could crash the tool execution unexpectedly.
- **Mitigation:** Ensure the Promise returned by `pi.sendMessage` has a `.catch(() => {})` handler appended.
