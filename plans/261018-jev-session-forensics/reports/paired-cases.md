---
title: "Phase 2 paired-case ledger"
status: completed
---
# Phase 2 paired-case ledger

## Classification contract

- **Direct pair:** same session, branch, and explicit evaluation/call identity, with both persisted Advisor and JEV outputs. Advisor state must be labeled pre-JEV, post-JEV, or unknown, and the proposition must match.
- **Contextual sequence:** distinct calls on the same explicitly recorded task alias and branch. This remains contextual even when no mutation is visible; hidden state, evidence, or question changes may exist.
- **Unmatched:** either side or a required identity is absent. Proximity, wording, timestamps, common workspace, and current source do not join a pair.

## Frozen-corpus result

| partition | count | treatment |
|---|---:|---|
| Direct comparable pairs | 0 | No disagreement-rate denominator |
| Direct disagreements | 0 | N/A; not a zero rate |
| Contextual sequences | 0 | None emitted from the sanitized ledger |
| Unmatched observations | 0 | No structurally recognized evaluation observations |
| Advisor pre-JEV observations | 0 | No persisted observation |
| Advisor post-JEV observations | 0 | No persisted observation |
| Advisor stage unknown observations | 0 | No persisted observation |

`events-redacted.jsonl` is empty after two stable extractions. Therefore there are no strongest low/high cases, no score-bearing report, no human override, no rejection-attempt sequence, and no valid direct disagreement or high-score agreement to present. The absence applies only to the selected, structurally recognized corpus; it does not assert absence of historical evaluations in unselected, unpersisted, compacted, differently shaped, or unloaded runtime data.

## Reproducibility

The disposable harness's pairing fixtures exercised one same-call direct pair, one same-task/different-call contextual sequence, a sibling branch, a missing Advisor, and pre/post-JEV labeling. Fixture behavior is not a historical observation and is excluded from every table above.
