---
phase: 3
title: "XML Boundaries"
status: pending
priority: P2
effort: "6h"
dependencies: [1]
---

# Phase 3: XML Boundaries

## Overview
Implement strict XML enclosure boundaries for untrusted input (plans and diffs) to eliminate prompt injection and delimiter confusion (Finding 1).

## Requirements
- Functional: Wrap user prompts and plan content in strict XML tags (e.g., `<plan_content>`) and sanitize any conflicting internal tags.
- Non-functional: Must not break existing prompt evaluation logic.
- TDD: Test suite must attempt prompt injection (e.g., injecting override instructions).

## Architecture
- `src/xml-enclosure.ts`: Utility to encode, sanitize, and wrap untrusted text.
- Update `src/plan-evaluator.ts` and `src/cook-expert-judge.ts` to use the enclosure utility.

## Related Code Files
- Create: `src/xml-enclosure.ts`
- Create: `tests/xml-enclosure.test.ts`
- Modify: `src/plan-evaluator.ts`
- Modify: `src/cook-expert-judge.ts`

## Implementation Steps
1. **[TDD] Write Failing Tests**: Create `tests/xml-enclosure.test.ts` with malicious prompt injection strings.
2. **Implement Enclosure**: Build `src/xml-enclosure.ts` to escape `<` and `>` inside untrusted content and wrap it in root tags.
3. **Refactor Call Sites**: Update the evaluator files to pass inputs through the enclosure utility before sending to TypeSafe System One.
4. **Run Tests**: Execute `bun test tests/xml-enclosure.test.ts`.

## Success Criteria
- [ ] Malicious overrides injected into `planContent` are neutralized.
- [ ] The judge evaluates the payload without delimiter confusion.
- [ ] Test suite covers multiple injection vectors.

## Risk Assessment
- Risk: Over-sanitization breaking valid code diffs in the payload.
- Mitigation: Use CDATA-like boundaries or Base64 encoding for code diffs if raw XML escaping corrupts syntax.