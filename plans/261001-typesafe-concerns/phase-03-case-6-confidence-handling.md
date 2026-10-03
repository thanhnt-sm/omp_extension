---
phase: 3
title: "Case 6 Confidence Handling"
status: completed
priority: P2
effort: "2h"
dependencies: [phase-01]
---

# Phase 3: Case 6 — Confidence Handling for Ambiguous Input

## Overview
The model returns `confidence = 0.95` on `"Payment failed and server threw a 500 error"`,
a genuinely ambiguous two-department input. The plan's `< 0.8` assertion is a real
contract — callers using confidence to gate automation will trigger incorrectly.
This phase implements a solution that surfaces ambiguity rather than hiding it.

## Requirements
- Functional: Ambiguous multi-signal inputs must return either `confidence < 0.8`
  or an explicit ambiguity signal (e.g. a `"triage"` choice or multi-score result)
  so callers can escalate to human review.
- Non-functional: Solution must be testable with existing adversarial suite.

## Architecture

**Status Update (Phase 1 response):** Branch B selected. Expert consultation confirmed `jev-latest` has no `score-per-option` API mode and does not reliably output calibrated confidence on multi-signal inputs. Proceeding with Branch B (criteria redesign with explicit `triage` option).

Four branches originally considered:
**Branch A — score-per-option API mode**
```
judge({ state, questions: { role: { type: "score-per-option", … } } })
→ { role: { billing: 0.45, engineering: 0.55 } }
Caller: if max - second_max < 0.2 → escalate to triage
```

**Branch B — criteria redesign with explicit `triage` option**
```
criteria: {
  billing:     "Payment, invoice, or subscription issues only",
  engineering: "Technical errors or infrastructure issues only",
  triage:      "Input contains signals for two or more departments — route to human review",
  sales:       "New product inquiries or upgrades"
}
→ model chooses "triage" on ambiguous input
Caller: treats "triage" as human-review escalation
```

**Branch C — confidence-floor instruction**
```
questions.role.instructions += " If confidence < 0.8, return confidence ≤ 0.75."
→ tests whether model honours self-reported uncertainty instruction
```

**Branch D — client-side confidence floor (fallback, no expert input needed)**
```
if (result.confidence > 0.85 && stateContainsMultipleDeptSignals(state)) {
  result.requiresHumanReview = true;
}
```
Branch D requires a heuristic signal detector — fragile; use only if A/B/C unavailable.

## Related Files
- Modify: `~/.claude/mcp/typesafe/typesafe-api-client.cjs` (Branch A: score-per-option support)
- Modify: `~/.claude/mcp/typesafe/typesafe-adversarial.test.cjs` (Case 6 assertion update)
- Modify: `~/tmp/TYPESAFE_ROLE_JUDGE_VALIDATION_PLAN.md` (Case 6 updated to ✅)

## Implementation Steps
1. From Phase 1 response: select Branch A, B, C, or D.
2. Implement the chosen branch.
3. Live re-run Case 6: `"Payment failed and server threw a 500 error"` →
   must produce either `confidence < 0.8` OR `choice == "triage"` OR multi-score near-tie.
4. Update `typesafe-adversarial.test.cjs` Case 6 test to assert the new behavior.
5. Update plan Case 6 assertion from FAILED to ✅ PASS with evidence.

## Success Criteria
- [x] Case 6 live re-run produces ambiguity signal (`choice == "triage"`, confidence=0.98) via Branch B criteria redesign.
- [x] Case 6 assertion in plan Phase 3.1 table updated to ✅ PASS with evidence.
- [x] Unit suite 23/23 pass (17 baseline + 6 new).

## Risk Assessment
- Branches A/B/C depend on model behaviour — must be verified live, not just locally.
- Branch B (triage criterion) may cause regressions in Case 1/5 (clear single-dept input);
  re-run full adversarial matrix after implementing.
- Branch D is the fallback but requires a multi-signal heuristic — scope-creep risk;
  keep it simple or use a keyword list with explicit false-positive tolerance.
