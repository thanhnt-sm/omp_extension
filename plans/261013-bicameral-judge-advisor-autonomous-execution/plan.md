---
title: "Bicameral Judge-Advisor Autonomous Execution & Friction Minimization"
description: "Maximize autonomous execution and deliverable quality by uniting Lobe 1 (Advisor Intent) and Lobe 2 (TypeSafe JEV Judge), eliminating premature stall ratchets, enabling committed-deliverable recognition, and reserving human escalation exclusively for irreconcilable consensus conflicts."
status: in_progress
priority: P1
effort: "1d"
branch: master
tags: [typesafe, bicameral-consensus, autonomous-execution, advisor-intent, jev-judge, zero-friction]
blockedBy: []
blocks: []
created: 2026-10-13
---

# Bicameral Judge-Advisor Autonomous Execution & Friction Minimization

## 1. Executive Summary
This architecture realizes the user's principle:
> *"Tôi muốn đã có judge và advisor rồi thì sử dụng tối đa để tự động tối đa và chất lượng tối đa, human ít phải xác nhận thủ công nhất, mà công việc vẫn hoàn thành chính xác. Agent phải bắt buộc thực thi theo phản hồi của advisor và judge, chạy tất cả skill liên quan để phân tích, nghiên cứu, làm giải pháp, làm plan, cập nhật todo, cập nhật plan để thực thi theo judge và advisor."*
3. **Diff-Body False Positives**: Static regex matching on `evidence.gitDiff` triggered false "Claude boundary violations" whenever markdown documentation mentioned Claude configuration paths.
Prior to this alignment, the OMP extension suffered from three critical friction points:
1. **Unilateral Done Interception**: Task completion (`op: "done"`) called only `runPhaseMacroCheck` (raw diff judge), completely omitting Lobe 1 (`Advisor Intent`). Legitimate completions with clean working trees (committed deliverables) were falsely scored as `meets_criteria=0.00` and `scope: REDUCTION`.
2. **Premature Stall Ratchets**: The 3-failure stall ratchet incremented and prompted the human before the current attempt was even evaluated, interrupting the user before the judge or advisor had executed.
3. **Diff-Body False Positives**: Static regex matching on `evidence.gitDiff` triggered false "Claude boundary violations" whenever markdown documentation mentioned `~/.claude/` paths.

---

## 2. Architecture & Truth Matrix

```
                      Agent Mutation Request (todo done, drop, plan status)
                                                 │
                      ┌──────────────────────────┴──────────────────────────┐
                      ▼                                                     ▼
         [Lobe 1: Advisor Intent]                               [Lobe 2: TypeSafe JEV Judge]
         - Analyzes conversation history                        - Analyzes git diff & status
         - Verifies user intent / task alignment                - Verifies test exit code & output
         - Checks agent work log credibility                    - Runs AST test-evasion detector
                      │                                                     │
               ALLOW | DISALLOW                                      APPROVE | REJECT |
                  | UNCERTAIN                                       NEXT_ACTION_REQUIRED
                      │                                                     │
                      └──────────────────────────┬──────────────────────────┘
                                                 ▼
                                     [Bicameral Consensus Engine]
                                                 │
          ┌──────────────────────────────────────┼──────────────────────────────────────┐
          ▼                                      ▼                                      ▼
    CẢ HAI ĐỒNG Ý                          CÓ MÂU THUẪN                           CÓ THIẾU SÓT
     (Consensus)                            (Conflict)                        (Next Actions Req)
          │                                      │                                      │
    AUTO-EXECUTE                           HUMAN ESCALATION                       ADAPTIVE RECONCILIATION
  - Zero confirmation popup              - Present both viewpoints              - DO NOT throw fatal error
  - Instant drop or done                 - Render full consensus card           - Synthesize plan delta
                                         - Human decision is SOVEREIGN          - Agent autonomously adapts
```

### Consensus Decision Matrix

| Advisor Intent | JEV Judge | Deterministic Gate 1 | Verdict | Action | Human Prompt? |
|---|---|---|---|---|---|
| **ALLOW** | **APPROVE** | PASS | `AUTO_APPROVE` | Task completed immediately | **NO (0 prompts)** |
| **ALLOW** | **REJECT** (Clean diff, committed) | PASS | `AUTO_APPROVE` | Committed evidence recognized | **NO (0 prompts)** |
| **ALLOW** / **UNCERTAIN** | **NEXT_ACTION_REQUIRED** | ANY | `RECONCILE_PLAN` | Synthesize `<plan_reconciliation>` delta | **NO (Agent fixes)** |
| **DISALLOW** | **REJECT** | ANY | `AUTO_REJECT` | Rejection with actionable remediation | **NO (Agent fixes)** |
| **DISALLOW** | **APPROVE** | PASS | `HUMAN_ESCALATION` | Render `formatConsensusEscalation` | Sovereign confirmation |
| **UNCERTAIN** | **ESCALATE** | PASS | `HUMAN_ESCALATION` | Render `formatConsensusEscalation` | Sovereign confirmation |

---

## 3. Implementation Phases

| Phase | Description | Deliverables | Status |
|---|---|---|---|
| **Phase 1** | Wire Bicameral Consensus into `todo done` | `typesafe-planner.ts`, `src/bicameral-consensus.ts`, `src/cook-expert-judge.ts` | Completed |
| **Phase 2** | Committed Deliverable Recognition & Boundary Safety | `src/evidence-collector.ts`, `src/verification-gate.ts` | Completed |
| **Phase 3** | Post-Evaluation Stall Ratchet & Autonomous Guidance | `typesafe-planner.ts` (`PROMPT_INJECTION`, `handleFailureEscalation`) | Completed |
| **Phase 4** | Verification Suite & Baseline Sync | `tests/bicameral-consensus.test.ts`, `tools/sync-baseline.cjs` | Completed |

---

## 4. Verification Evidence

1. **Unit & Adversarial Verification (`bun test`):**
   - 280 tests passed across 33 test files (0 failures).
   - `tests/bicameral-consensus.test.ts`: 15 pass, 0 fail.
   - `tests/todo-drop-gate.test.ts`: 14 pass, 0 fail.
   - `tests/redteam-vulnerabilities.test.ts`: 7 pass, 0 fail.
2. **Target Deployment Sync (`node tools/sync-baseline.cjs`):**
   - Automated timestamped backup: `omp_extension_backup_2026-10-13T11-03-26-075Z`.
   - 295 tests passed across 35 test files in target runtime (100% green).
