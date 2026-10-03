# Phase 1: Update Interfaces

## Overview
Update the OMP extension tool interfaces to support a standardized error flag, and modify the `shortError` utility to utilize it. This allows the host and the agent to programmatically distinguish system faults from normal tool outputs.

## Requirements
- Functional: `ExtensionToolResult` must support an optional `isError` boolean property.
- Functional: The `shortError` helper must attach `isError: true` to its return object.
- Non-functional: Must not break existing tool returns that lack the `isError` flag.

## Architecture
The change is purely typing and object shape adjustment within `typesafe-planner.ts`. By returning `isError: true`, we align with standard MCP error signaling, informing the agent that a system-level fault occurred.

## Related Code Files
- Modify: `typesafe-planner.ts`

## Implementation Steps
1. Locate the `ExtensionToolResult` interface in `typesafe-planner.ts`.
2. Add `isError?: boolean;` to the interface definition.
3. Locate the `shortError(code: string)` function.
4. Modify its return statement to: `return { content: [{ type: "text", text: \`TypeSafe error: ${code}\` }], isError: true };`

## Success Criteria
- [ ] `ExtensionToolResult` successfully compiles with the new property.
- [ ] All calls to `shortError` return an object containing `isError: true`.

## Risk Assessment
- **Risk:** The OMP extension runtime might not fully parse or utilize the `isError` flag yet.
- **Mitigation:** The change is backward-compatible. If the host ignores it, the text content still conveys the error.
