# TypeSafe Expert Consultation Response

**Date:** 2026-10-01
**Respondent:** TypeSafe Integration Support Team

---

## Case 2 — Prompt Injection via `state` Field

**1. System prompt / instruction isolation:** Does the `jev-latest` API support a parameter to isolate the system prompt from the untrusted state?
**Response:** No. The `jev-latest` model processes the state and system prompt together. There is currently no API-level isolation mechanism to prevent the model from evaluating instructions embedded within the `state` text.

**Recommendation:**
**[Branch B] No API param.** You must implement a caller-side tighten-only action lattice. The API cannot reliably ignore adversarial instructions embedded in the payload. Enforce routing baselines structurally before returning results to the caller.

---

## Case 6 — Overconfident Routing on Ambiguous Multi-Signal Input

**1. Calibrated confidence:** Does `jev-latest` return calibrated confidence scores that reliably drop when multiple conflicting signals are present?
**Response:** Not consistently. When strong keywords for one department are present, the model may confidently choose that department, even if conflicting signals exist.

**2. Score-per-option:** Does the API support returning a score for each option rather than a single choice?
**Response:** No. The current API only returns the single most likely choice and its associated confidence.

**Recommendation:**
**[Branch B] Criteria redesign with explicit `triage` option.** Since `score-per-option` is unsupported and confidence isn't reliably low for ambiguous inputs, you must provide the model with an explicit way to handle ambiguity. Add a `triage` option to your criteria definition specifically for multi-signal or ambiguous inputs.