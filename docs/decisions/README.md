# Architecture Decision Records (ADRs)

Decision log for Oh-My-Pi (OMP) architecture and extension design choices. Each record captures the context, evaluation lenses, empirical evidence, decision, and reopen triggers.

| ADR | Title | Status | Date | Decision Summary |
|---|---|---|---|---|
| [ADR-2026-10-05-predict-model-tier](ADR-2026-10-05-predict-model-tier.md) | Fast-Tier Model Routing & Multi-Persona Pre-Analysis (`ck:predict`) | Accepted | 2026-10-05 | Decoupled debate module into `src/debate-evaluator.ts`, supported flexible model tiers with safe fallback to `jev-latest`, and integrated integrity shields. |
| [ADR-20261012-typesafe-jev-alignment](ADR-20261012-typesafe-jev-alignment.md) | Improving TypeSafe JEV Semantic Judge Application and Agent Alignment | Decided | 2026-10-12 | Adopted Tier 1 Contextual Injection (Option A) and Tier 2 Task-Aware Multi-Label Rubrics (Option C); relegated Pre-Flight Verification (Option B) to an optional, bounded advisory hook. |
| [ADR-20261013-typesafe-bicameral-judge-alignment](ADR-20261013-typesafe-bicameral-judge-alignment.md) | Bicameral Advisor-JEV Consensus, Threshold Elimination, and Non-Blocking Adaptive Remediation | Decided | 2026-10-13 | Eliminated client-side numerical threshold walls (0.80/0.30); introduced Bicameral Advisor-JEV consensus, sovereign human override, and adaptive plan reconciliation without blocking exceptions. |
| [ADR-20261014-typesafe-jev-advisor-overhaul](ADR-20261014-typesafe-jev-advisor-overhaul.md) | Multi-Session Forensic Audit of TypeSafe, Judge, JEV & Advisor | Decided | 2026-10-14 | Documented 7 root causes across 5 OMP sessions including off-by-one attemptCount escalation and state clamping defects. |
| [ADR-20261015-advisor-judge-jev-true-calibration](ADR-20261015-advisor-judge-jev-true-calibration.md) | True JEV-Backed Advisor Calibration, Complete 0.80/0.30 Threshold Purge, and Structured JEV State Fidelity | Decided | 2026-10-15 | Replaced hardcoded 0.90 Advisor regex confidences with multi-signal + JEV calibration; eliminated all remaining 0.80/0.30/0.70 threshold walls and messages; fixed task-scoped criteria extraction and JEV state fidelity. |
