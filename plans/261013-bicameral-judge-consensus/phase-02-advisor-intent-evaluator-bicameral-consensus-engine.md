---
phase: 2
title: "Advisor Intent Evaluator & Bicameral Consensus Engine"
status: completed
priority: P1
effort: "8h"
dependencies: [1]
---

# Phase 2: Advisor Intent Evaluator & Bicameral Consensus Engine

## Overview
Implement the independent Advisor Intent Evaluator (`evaluateAdvisorIntent`) and build the Bicameral Consensus Engine that balances user intent against ground-truth code evidence, triggering human escalation only when a genuine conflict arises.

## Requirements
- Functional:
  - Create `evaluateAdvisorIntent(ctx: AdvisorContext)`: parses user requests, conversation history, and agent work logs to determine whether an operation (done or drop) aligns with user goals. Emits `ALLOW` | `DISALLOW` | `UNCERTAIN`.
  - Create `evaluateBicameralConsensus(advisorResult, jevResult)`:
    - `ALLOW` + `APPROVE` $\implies$ `AUTO_APPROVE` (instant execution, zero prompts).
    - `DISALLOW` + `REJECT` $\implies$ `REJECT_WITH_REMEDIATION` (actionable feedback).
    - `DISALLOW` + `APPROVE` or `ALLOW` + `REJECT` or `UNCERTAIN`/`ESCALATE` $\implies$ `HUMAN_ESCALATION`.
  - Provide complete diagnostic transparency showing both Lobe 1 (Advisor) and Lobe 2 (JEV) reasoning in task reports.
- Non-functional:
  - Low latency: Advisor intent evaluation uses fast local heuristics / tiny prompt parsing; zero extra remote roundtrips when JEV is already evaluated or when user intent is explicit.
  - Fail-safe: Any unhandled parsing error defaults to `UNCERTAIN`, safely routing to human confirmation.

## Architecture
```
[Agent Action: todo drop / todo done]
                 │
  ┌──────────────┴──────────────┐
  ▼                             ▼
[Lobe 1: Advisor]             [Lobe 2: TypeSafe JEV]
User Intent & Context         Code, Diff & Tests
ALLOW | DISALLOW | UNCERTAIN  APPROVE | REJECT | NEXT_ACTION
  │                             │
  └──────────────┬──────────────┘
                 ▼
    [Bicameral Consensus Matrix]
                 │
  ┌──────────────┼──────────────┐
  ▼              ▼              ▼
Consensus      Conflict      Next Actions
(Auto-Execute) (Prompt User) (Adapt Plan)
```

## Related Code Files
- Create: `src/bicameral-consensus.ts`
- Modify: `src/debate-evaluator.ts`
- Modify: `src/cook-expert-judge.ts`
- Create: `tests/bicameral-consensus.test.ts`
- Modify: `tests/todo-drop-gate.test.ts`

## Implementation Steps
1. **TDD Test Suite First (`tests/bicameral-consensus.test.ts`)**:
   - Write tests for consensus scenarios:
     * User explicitly requested cancellation + JEV confirmed clean tests $\implies$ auto-drop approved.
     * Agent claims task obsolete but user never mentioned it + JEV finds unfulfilled requirements $\implies$ auto-rejected.
     * Agent claims task obsolete after clean build (DataGuard scenario) + JEV uncertain $\implies$ human escalation with both reasons formatted.
2. **Implement `src/bicameral-consensus.ts`**:
   - Define `AdvisorIntentVerdict`: `"ALLOW" | "DISALLOW" | "UNCERTAIN"`.
   - Define `BicameralConsensusDecision`:
     * `verdict: "AUTO_APPROVE" | "AUTO_REJECT" | "HUMAN_ESCALATION" | "RECONCILE_PLAN"`
     * `advisorReason: string`
     * `jevReason: string`
     * `escalationMessage?: string`
   - Implement `arbitrateConsensus(advisor: AdvisorResult, jev: JevResult): BicameralConsensusDecision`.
3. **Implement `evaluateAdvisorIntent`**:
   - In `src/debate-evaluator.ts` or `src/bicameral-consensus.ts`, implement semantic intent matching over `convo.userRequest` and `convo.agentWorkLog`.
4. **Integration with `cook-expert-judge.ts`**:
   - Expose `runBicameralDropCheck` and `runBicameralMacroCheck` returning `BicameralConsensusDecision`.
5. **Verification**:
   - Run `bun test tests/bicameral-consensus.test.ts`.

## Success Criteria
- [ ] Consensus matrix correctly arbitrates all 9 permutation combinations of Advisor (ALLOW/DISALLOW/UNCERTAIN) and JEV (APPROVE/REJECT/NEXT_ACTION).
- [ ] Conflicting viewpoints trigger clear human escalation detailing both perspectives.
- [ ] Unanimous approval executes without prompt.

## Risk Assessment
- Risk: Advisor falsely assumes user intent from ambiguous conversational phrasing.
  - Mitigation: Any confidence below 0.85 in intent mapping is classified as `UNCERTAIN`, forcing safe human confirmation.
