---
title: "TypeSafe Judge Concerns Resolution"
description: "Resolve two DONE_WITH_CONCERNS items from the TypeSafe role judge validation: Case 2 (prompt injection via state) and Case 6 (overconfident routing on ambiguous input). Gate on expert consultation; implement enforced call-site lattice and confidence handling; promote plan status to COMPLETE."
status: complete
priority: P2
effort: "7h"
tags: []
blockedBy: []
blocks: []
created: 2026-10-01
---

# TypeSafe Judge Concerns Resolution

## Overview

Two adversarial validation cases in `TYPESAFE_ROLE_JUDGE_VALIDATION_PLAN.md` remain FAILED after 10 sessions:

- **Case 2 — Prompt injection:** TypeSafe System One follows adversarial instructions embedded in `state`. No client-side sanitization is sufficient. Suite 3 in `typesafe-adversarial.test.cjs` demonstrates the tighten-only lattice pattern but does not enforce it at any real call site.
- **Case 6 — Overconfident routing:** Ambiguous multi-signal input (`"Payment failed and server threw a 500 error"`) yields `engineering`, confidence=0.95. The `< 0.8` threshold assertion (a real contract) is not met.

This plan gates on expert consultation (Phase 1) to determine whether API-level solutions exist before committing to client-side workarounds. Phases 2–4 may fork depending on the expert response.

## Dependencies
- Phase 1 must complete before Phases 2 and 3 begin (expert response determines implementation branch).
- Phase 4 requires both Phase 2 and Phase 3 complete.

## Success Criteria
- Case 2 live re-run: injection payload does not produce `sales` at any call site using the enforced wrapper.
- Case 6 live re-run: ambiguous input produces `confidence < 0.8` or explicit ambiguity signal.
- `node --test typesafe-adversarial.test.cjs` → 100% pass with real enforcement (no demo mocks).
- `TYPESAFE_ROLE_JUDGE_VALIDATION_PLAN.md` Overall Status → `COMPLETE`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Expert Consultation Prompt](./phase-01-expert-consultation-prompt.md) | Complete (Branch B selected) |
| 2 | [Case 2 Enforced Call-Site Lattice](./phase-02-case-2-enforced-call-site-lattice.md) | Complete |
| 3 | [Case 6 Confidence Handling](./phase-03-case-6-confidence-handling.md) | Complete |
| 4 | [Test Suite Update to COMPLETE](./phase-04-test-suite-update-to-complete.md) | Complete |
