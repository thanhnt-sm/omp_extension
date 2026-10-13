---
phase: 4
title: "Remediation Feedback Loops"
status: pending
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 4: Remediation Feedback Loops

## Overview
Develop deterministic XML-based remediation feedback loops for small/fast models, preventing endless loops when Gate 1 or Gate 2 fails (Finding 3).

## Requirements
- Functional: Generate strict `<remediation>` XML blocks containing `<immutable_constraints>` and `<action_items>` when a verification gate rejects a completion.
- Non-functional: Must be actionable by "dumb" models (7B/8B class).
- TDD: Test suite must assert the exact structural presence of the remediation tags in error outputs.

## Architecture
- `src/remediation-generator.ts`: Constructs the structured XML feedback.
- Integrate into `src/verification-gate.ts` error handling.

## Related Code Files
- Create: `src/remediation-generator.ts`
- Create: `tests/remediation.test.ts`
- Modify: `src/verification-gate.ts`

## Implementation Steps
1. **[TDD] Write Failing Tests**: Create `tests/remediation.test.ts` to assert that verification failures return the exact XML schema.
2. **Implement Generator**: Build `src/remediation-generator.ts` using a typed builder pattern.
3. **Integrate**: Modify the gate's rejection path to format the `TypeSafeError` message using the generator.
4. **Run Tests**: Execute `bun test tests/remediation.test.ts`.

## Success Criteria
- [ ] Gate failures output strict `<remediation>` blocks.
- [ ] Output includes actionable steps (e.g., "Run bun test locally").
- [ ] Tests verify the exact XML schema of the error output.

## Risk Assessment
- Risk: Models hallucinate the remediation schema instead of following it.
- Mitigation: Keep the constraints explicitly simple and directive (e.g., "Do NOT delete tests").