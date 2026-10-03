---
phase: 1
title: "Expert Consultation Prompt"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Expert Consultation Prompt

## Overview
Deliver `expert-prompt.md` to TypeSafe experts and collect structured answers
for Case 2 (prompt injection) and Case 6 (confidence calibration). This phase
gates Phases 2 and 3 — the implementation approach depends on whether an API
solution exists.

## Requirements
- Functional: Expert answers classify each case as API solution / prompt pattern /
  architectural recommendation / roadmap item.
- Non-functional: No implementation committed until expert response received.

## Architecture
Gate: expert answers determine which branch Phases 2/3 take.

```
Expert response
  ├─ Case 2: API isolation param? → use it in typesafe-api-client.cjs
  ├─ Case 2: No API param?        → enforce lattice via required wrapper
  ├─ Case 6: score-per-option?    → use multi-label mode
  └─ Case 6: No such mode?        → criteria redesign + confidence instruction
```

## Related Files
- Read: `plans/261001-typesafe-concerns/expert-prompt.md`
- Modify (after response): `plans/261001-typesafe-concerns/plan.md` (update Phase 2/3 approach)

## Implementation Steps
1. Send `expert-prompt.md` to TypeSafe support / Slack / API docs team.
2. Collect answers; record in `plans/261001-typesafe-concerns/expert-response.md`.
3. For each case, record chosen answer type (API / prompt / architectural / roadmap).
4. Update Phase 2 and Phase 3 `## Architecture` sections with the chosen approach
   before marking this phase complete.

## Success Criteria
- [x] `expert-response.md` exists with answers to all 5 Case 2 questions and all
      5 Case 6 questions (or explicit "no solution" per question).
- [x] Phase 2 and Phase 3 architecture sections updated to reflect chosen approach.
- [x] No implementation started in Phase 2/3 until this phase is complete.
