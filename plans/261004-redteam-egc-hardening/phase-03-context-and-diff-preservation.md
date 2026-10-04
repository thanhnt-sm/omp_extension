---
phase: 3
title: "Context and Diff Preservation"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Context and Diff Preservation

## Overview
Remediate "Jev blind diff" and "fabricated evidence" flaws. Ensure unified diffs retain essential function bodies, stub definitions, and structural changes up to the 32KB TypeSafe boundary. Prevent the verification harness from fabricating passing assertions when real evidence is missing.

## Requirements
- Functional:
  - Eliminate synthetic placeholders like `"Tests passed"` or `"+ // No diff"` when verification data is absent. Absence of evidence must be reported honestly as unobserved / missing.
  - Upgrade `summarizeUnifiedDiff`: prioritize files explicitly specified in plan/task requirements. Retain full hunks including function bodies for priority files up to 32,000 characters.
  - Implement intelligent chunking that only strips non-plan large collateral files (e.g. lockfiles, generated assets) rather than truncating implementation bodies.
  - Ensure secret / token scrubbing (`scrub`) retains syntactical code structure without breaking AST context for semantic judging.
- Non-functional:
  - Total outbound payload strictly capped at 32KB (`MAX_SAFE_PAYLOAD_BYTES`).
  - Zero regex runaway / DoS vulnerabilities during diff processing.

## Architecture
- In `typesafe-planner.ts` and `src/evidence-collector.ts`:
  - Refactor diff collection and truncation to accept priority file paths.
  - Replace line-based truncating regex with AST/hunk-aware preservation:
    - Retain diff headers (`diff --git`, `---`, `+++`, `@@`).
    - Keep addition/deletion hunks verbatim for prioritized implementation files.
    - Omit or collapse low-priority files only when total payload exceeds 28KB.

## Related Code Files
- Modify: `typesafe-planner.ts`
- Modify: `src/evidence-collector.ts`
- Modify: `src/payload-safety.ts`
- Test: `tests/redteam-vulnerabilities.test.ts`

## Implementation Steps
1. Audit and remove default fallback mock strings in evidence collectors (`evidence-collector.ts`).
2. Update diff compaction to budget up to 28KB for priority source files instead of hard truncating at 4,000 characters.
3. Add stub/hardcode detection heuristic: ensure hunks containing return literals (`return true;`, `return 3;`, `TODO`, `throw new Error("unimplemented")`) are never stripped.
4. Run red-team regression tests covering diff preservation.

## Success Criteria
- [ ] Diff summarizer preserves function implementations for modified files up to 28KB.
- [ ] Stubs and mock returns are explicitly visible in the payload dispatched to Jev / TypeSafe judge.
- [ ] No fabricated evidence injected into macro-check state.

## Risk Assessment
- *Risk*: Exceeding the 32KB payload boundary will cause TypeSafe System One API to reject the request with HTTP 413.
- *Mitigation*: Hard stop with `Buffer.byteLength` check before dispatch in `payload-safety.ts`.
