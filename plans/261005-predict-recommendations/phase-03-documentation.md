---
phase: 3
title: "Schema Update and Documentation"
status: pending
priority: P2
effort: "45m"
dependencies: [2]
---

# Phase 3: Schema Update and Documentation

## Overview
Add the `resetFailures` flag to the `todo` tool schema and document the stall ratchet escape command.

## Requirements
- Functional: Update the `todo` tool registration to officially support the `resetFailures?: boolean` property.
- Documentation: Create or update operational documentation for humans on how to rescue a locked agent.

## Architecture
N/A

## Related Code Files
- Modify: `typesafe-planner.ts` (tool registration)
- Modify: `README.md` or `docs/typesafe-operations.md`

## Implementation Steps
1. In `typesafe-planner.ts`, locate the `todo` tool registration and add `resetFailures: z.boolean().optional()` to its parameter schema.
2. Identify the best location for operational runbooks (e.g., `docs/typesafe-operations.md`).
3. Add a section detailing the "Stall Ratchet Escapes", explicitly mentioning the `resetFailures: true` flag and the requirement for human authorization (`TYPESAFE_ALLOW_MODIFICATION`).
4. Ensure `jev-fast` token usage tracking is visible or logged.

## Success Criteria
- [ ] Tool schema correctly reflects the backend capability.
- [x] Documentation explains how to recover from a 3-consecutive-failure ratchet lock.

## Risk Assessment
- Risk: Schema update is rejected by the host. Mitigation: Ensure the Zod validation exactly matches the expected shape in the extension host.