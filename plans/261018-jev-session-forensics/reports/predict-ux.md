# UX assessment — JEV session forensics

## Scope and method

This assessment considers only the sanitized evidence packet. It does not assert that any operator saw, interpreted, or acted on the diagnostic material, and it does not attribute historical behavior to the current workspace source.

## Confirmed facts

- Archive discovery returned 82 of 89 API-reported sessions. Eighty zero-message sessions were excluded; two stable non-empty files produced 1,198 parsed records with no parse errors.
- No structurally recognized TypeSafe evaluation events were found. Accordingly, there are no Native Gate 1, Native Gate 2, Advisor, or explicit-verification events; there are zero direct comparable pairs, and the direct disagreement rate is N/A rather than zero.
- The packet confirms that Gate 1 runs before Gate 2; a Gate 1 failure or enabled-resolver/API-key failure does not establish that a JEV request occurred.
- The current macro output can mutate returned Advisor state, while native authority is `macroResult.approved`, not the displayed Advisor state alone.
- At the current source snapshot, the default auto-approval threshold is `0.50` using `>`; configured thresholds use `>=`. An archived event without its threshold and comparison has unknown operational classification.
- The packet distinguishes the current workspace source from runtime identity and provides no persisted runtime-origin record for the selected archive events or loaded host module graph.
- The frozen corpus was reproducible across two unchanged-input extraction runs, both yielding the same empty identity ledger and accounting.

## Inferences

- **Diagnostic comprehension risk:** If an operator is shown an Advisor state as if it were the final decision, the current-source distinction between mutable displayed Advisor state and `macroResult.approved` creates a plausible ambiguity. This is a presentation risk inferred from the mechanism, not evidence that it confused any operator.
- **Uncertainty communication risk:** A presentation that says “no disagreement” for this corpus would be misleading. The packet supports only that no direct pairs exist and the disagreement rate is N/A; it does not support agreement, calibration, or absence of a historical problem.
- **Recovery-expectation risk:** Recovery guidance that asks an operator to retry, rotate credentials, or alter a threshold on the premise that JEV ran would be inadequately supported when Gate 1 or resolver/API-key failure can prevent Gate 2 from being reached. A useful diagnostic must distinguish “not reached / request unproven” from an evidenced Gate 2 outcome.
- **Historical-versus-current risk:** Displaying current workspace fixes or source hashes as an explanation of archived behavior could cause an operator to over-trust an unproven causal narrative. The packet supports current-source facts only, not historical runtime attribution.
- **Evidence-boundary risk:** The reproducible empty extraction is useful as an accounting result, but it should be presented as coverage-limited: seven API-reported sessions were absent and no current investigation session was independently identified among the non-empty candidates.

## Counterexamples

- A UI may already show `macroResult.approved` prominently and label Advisor state as advisory. If so, the inferred displayed-state ambiguity does not apply to that UI.
- An operator may never encounter the archive or macro diagnostics. In that case, the inferred comprehension and recovery risks are not observed user harms.
- An independently captured runtime-origin record, persisted request, or direct paired event could establish a historical path that this packet cannot establish. The current absence of evidence is not proof that no evaluation ever occurred outside the frozen corpus.
- A system may intentionally use “N/A” and explicit coverage limits in its diagnostics. That would counter the inferred uncertainty-communication risk.
- A support workflow may collect threshold, comparator, route-reached status, and runtime identity before prescribing remediation. That would counter the inferred recovery-expectation risk.

## Falsifying checks

1. Inspect the actual operator-facing diagnostic rendering for a case containing both a mutable Advisor state and `macroResult.approved`. The displayed-state inference is falsified if it unambiguously labels the native authority and cannot present the mutable Advisor state as final.
2. Inspect the empty-cohort rendering and exported summary. The uncertainty inference is falsified if it renders direct disagreement as N/A, states that there are zero pairs/events, and exposes the returned-versus-reported session gap and unidentified-current-session limit.
3. Trace a failure from Gate 1 or enabled-resolver/API-key handling through the recovery guidance. The recovery inference is falsified if the guidance first distinguishes whether Gate 2/JEV was reached and does not prescribe a Gate-2 remedy without request evidence.
4. Inspect any historical attribution shown to operators. The historical-versus-current inference is falsified if current source hashes/fixes are visibly labeled as current snapshot information and are not used as historical runtime proof without a runtime-origin record.
5. Obtain a packet extension that includes a structurally recognized evaluation event, persisted request, threshold/comparator, runtime fingerprint, or direct pair. Such evidence could supersede the current no-attribution and no-pair limits; without it, it cannot.

## Verdict: CAUTION — conditional remediation

Proceed only with narrowly scoped diagnostic and recovery presentation improvements after the falsifying checks. The packet supports making uncertainty explicit: distinguish Gate 2 not reached or request unproven from a recorded JEV outcome; show native approval authority separately from mutable Advisor state; preserve N/A for disagreement when no pairs exist; and label current-source facts as non-historical. Do not present these measures as remediation for an observed user failure, a proven historical rejection, or a calibrated model disagreement: the packet supplies none of those facts.
