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

## 2. Stall Ratchet Escapes (`resetFailures`)

### Problem Statement
The TypeSafe task completion gate (`Gate 2: Semantic Macro-Check`) includes a consecutive failure ratchet. If a task or completion verification fails consecutively 3 times, the extension enters a fail-closed hard stop to prevent continuous unauthorized loops or test falsification.

### Recovery Procedure
To rescue an agent locked by the consecutive failure ratchet:
1. Locate the `todo` tool invocation.
2. Provide the explicit flag `resetFailures: true` in the tool parameter payload:
   ```json
   {
     "op": "done",
     "task": "Target task name",
     "resetFailures": true
   }
   ```
3. Setting `resetFailures: true` clears the failure counter and allows execution to proceed cleanly once underlying acceptance criteria are met.

---

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
