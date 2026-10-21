# TypeSafe Operations & Emergency Runbook

## Overview
This runbook provides emergency operational procedures for TypeSafe System One extensions and the `typesafe-planner` integrity shield.

---

## 1. Model Configuration (`jev-latest` vs Custom Model)

### Default Model Alignment
Theo tài liệu chuẩn của TypeSafe AI, model mặc định được sử dụng cho toàn bộ các tác vụ (Plan Elevation, Gate 2 Verification, và Multi-Persona Debate) là:
- **`jev-latest`** (Standard System One canonical model)

### Cấu hình linh hoạt qua biến môi trường (Options)
Bạn có thể ghi đè model cho từng tác vụ bằng các biến môi trường:
- **`TYPESAFE_DEFAULT_MODEL`**: Ghi đè model mặc định chung cho toàn bộ extension (mặc định: `jev-latest`).
- **`TYPESAFE_PREDICT_MODEL`**: Ghi đè model riêng cho vòng phân tích tranh biện Multi-Persona `ck:predict` (ví dụ: `jev-latest`, `jev-1.13`, hoặc mô hình thử nghiệm).

Nếu không đặt biến môi trường, hệ thống luôn mặc định gọi `jev-latest` theo đúng chuẩn API TypeSafe.

---

## 2. Rejected Todo Recovery

`resetFailures`, `authorized`, and `isHuman` values supplied in a todo payload never clear verification debt or grant completion/deletion authority.

- A rejected `done` remains rejected until matching task-scoped evidence satisfies Gate 1, Gate 2, and the native `tool_result` commits that completion.
- A rejected task may be `block`ed only after a trusted host UI confirms the exact phase/task target set. Blocking preserves the task, failure reason, remediation, and unfinished contract.
- `unblock` and `start` reactivate a task but do not erase debt or permit a later `done` to bypass either gate.
- `drop`, `rm`, and replacing `init` stage automatically only for a verified `AUTO_APPROVE`; `AUTO_REJECT` and `RECONCILE_PLAN` do not prompt or mutate; `HUMAN_ESCALATION` requires fresh exact-target UI confirmation. No UI or a declined/failed/stale confirmation leaves state unchanged.

Do not retry a rejected operation with agent-supplied flags. Correct the stated evidence gap or use the host-owned UI recovery path. A matching native result is required before any staged state commits.

The skipped-suite heuristic recognizes complete runner identifiers, not suffixes inside `process.exit(...)` or other identifiers. It still scans raw test-file diff lines conservatively: quoted/commented text that literally contains a supported skip/todo call can still be flagged. Do not rewrite real fixtures, weaken assertions or invent a task baseline to evade a rejection; inspect the evidence scope and record detector limitations separately from actual disabled tests.

### Advisor-led judge rejection recovery

After a judge rejection or `NEXT_ACTION_REQUIRED`, Advisor must inspect the operation, targets, acceptance criteria and actual evidence, research the cause, and return concrete changes, dependency-ordered agent assignments and verification checks in its fixed `Recommendation` section. A generic rejection is not evidence of a particular missing implementation.

Advisor remains read-only. The orchestrating parent dispatches the implementation agents, inspects their results, runs the full affected module and a changed-path smoke, then sends fresh evidence for Advisor review and the same authoritative gate's re-evaluation. Repeat this cycle while actionable work remains; passing tests, an Advisor recommendation or an exhausted attempt count are not judge approval.

Never retry unchanged evidence, weaken assertions, lower thresholds, alter the rubric or drop required work to obtain approval. An unavailable dependency, unresolved intent conflict or required human authority remains an explicit unfinished blocker. Completion still requires the gate to approve the same operation/targets and the matching native commit where applicable; `drop` is cancellation, not completion.

The workspace `advisor`/`ck:advisor` definitions and extension-injected host policy carry this requirement. Synchronize through `tools/sync-baseline.cjs` and restart OMP to load updated agent/prompt contracts. This is an agent instruction contract, not a new background retry service or a guarantee that a legitimate rejection will become approval.

### Task-scoped research evidence packaging

Research data JSON under canonical root `reports/` or `plans/reports/` does not by itself select the implementation rubric. Product/configuration manifests, executable files, mixed product changes and implementation-led tasks remain implementation work. Both inference and macro anti-spoofing use the same applicability rules; rubric classification never grants authority.

Native completion supplies the actual target task to artifact collection. A line-bound `Task: ...`, `Original task (verbatim): ...`, or JSON top-level `task` string can associate a report with that exact normalized task. Mere prose references do not make another task's roadmap mandatory. This association is a retrieval aid, not authenticity or acceptance proof.

Task-bound reports are retained whole, including tail limitations, within the existing **4,940 raw UTF-8 byte** artifact budget. Collector and macro share that limit; selection metadata reports omissions, unreadable files and truncation. Optional relevance-based evidence may be truncated with an explicit marker and is not completeness proof. Mandatory evidence that cannot fit fails with `insufficient_deliverable_evidence` before semantic approval rather than silently losing proof.

Later sanitization must not silently reclamp this artifact field. Transports compare the prepared field with the expected permitted redaction and reject additional delivery loss before POST. Redaction remains enabled; these checks do not raise payload limits, lower approval thresholds or make synthetic transport responses valid approvals.

Source-only verification does not update the active deployment or cached OMP modules. Keep post-edit workspace/deployment identity distinct; deployment requires its own authorization, the existing sync flow and an OMP restart. A fixture's staging result cannot complete Main's original native task.


## 3. Infrastructure Modification Authorization (`TYPESAFE_ALLOW_MODIFICATION`)

### Protected Infrastructure Files
The following files are guarded by the TypeSafe File & Code Integrity Shield:
- `typesafe-planner.ts`
- `src/debate-evaluator.ts`
- `models.yml`
- `typesafe-policy-client.cjs`
- Contracted task lists managed via `todo` (`init`, `drop`)

### Authorization Requirement
Autonomous agents are prohibited from modifying protected infrastructure files or dropping contracted tasks without verified human authorization.

To authorize modifications:
1. Set `TYPESAFE_ALLOW_MODIFICATION=1` in the host shell/environment before launching or running the agent process:
   - **PowerShell**:
     ```powershell
     $env:TYPESAFE_ALLOW_MODIFICATION="1"
     ```
   - **Bash / Zsh**:
     ```bash
     export TYPESAFE_ALLOW_MODIFICATION=1
     ```
   - **Command Prompt**:
     ```cmd
     set TYPESAFE_ALLOW_MODIFICATION=1
     ```
2. Restart the agent session to inherit the environment variable.
