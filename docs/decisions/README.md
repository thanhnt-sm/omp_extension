# Architecture Decision Records (ADRs)

Decision log for Oh-My-Pi (OMP) architecture and extension design choices. Each record captures the context, evaluation lenses, empirical evidence, decision, and reopen triggers.

| ADR | Title | Status | Date | Decision Summary |
|---|---|---|---|---|
| [ADR-2026-10-05-predict-model-tier](ADR-2026-10-05-predict-model-tier.md) | Fast-Tier Model Routing & Multi-Persona Pre-Analysis (`ck:predict`) | Accepted | 2026-10-05 | Decoupled debate module into `src/debate-evaluator.ts`, supported flexible model tiers with safe fallback to `jev-latest`, and integrated integrity shields. |
| [ADR-20261012-typesafe-jev-alignment](ADR-20261012-typesafe-jev-alignment.md) | Improving TypeSafe JEV Semantic Judge Application and Agent Alignment | Decided | 2026-10-12 | Adopted Tier 1 Contextual Injection (Option A) and Tier 2 Task-Aware Multi-Label Rubrics (Option C); relegated Pre-Flight Verification (Option B) to an optional, bounded advisory hook. |
| [ADR-20261013-typesafe-bicameral-judge-alignment](ADR-20261013-typesafe-bicameral-judge-alignment.md) | Bicameral Advisor-JEV Consensus, Threshold Elimination, and Non-Blocking Adaptive Remediation | Decided | 2026-10-13 | Eliminated client-side numerical threshold walls (0.80/0.30); introduced Bicameral Advisor-JEV consensus, sovereign human override, and adaptive plan reconciliation without blocking exceptions. |
