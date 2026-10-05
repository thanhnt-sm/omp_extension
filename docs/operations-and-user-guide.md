# Developer & Operations Manual

## 1. Developer Onboarding & Local Setup

### 1.1 Prerequisites
- **Runtime:** [Bun](https://bun.sh) ($\ge 1.0$)
- **Node.js:** ($\ge 18$) (for baseline sync utility)
- **Git:** Git CLI configured and accessible via PATH

### 1.2 Installation
Clone the repository and install dev dependencies:
```bash
git clone https://github.com/can1357/omp_extension.git
cd omp_extension
bun install
```

### 1.3 Running Tests
Run the deterministic test suite:
```bash
bun test
```
To run specific subsystems:
```bash
bun test tests/typesafe-planner.test.ts     # Main extension interception
bun test tests/verification-gate.test.ts    # Dual-cadence gates
bun test tests/debate-evaluator.test.ts     # Multi-persona debate
bun test tests/redteam-vulnerabilities.test.ts # Adversarial security suite
```

---

## 2. Linking Extension to OMP

The standard linking pattern uses a thin TypeScript loader in the OMP extensions directory:

**Location:** `C:\Users\<user>\.omp\agent\extensions\typesafe-planner.ts` (or `~/.omp/agent/extensions/typesafe-planner.ts` on Linux/macOS)

```typescript
export { default } from "D:/100.Software/Github/omp_extension/typesafe-planner.ts";
```

---

## 3. Operational Baseline Synchronization (`sync-baseline`)

When you develop or fix code in this workspace, you must synchronize it to the deployment directory linked by OMP.

### 3.1 Using Automated Script
Run the automated batch script:
```cmd
tools\sync-baseline.bat
```
Or execute the Node.js runner:
```bash
node tools/sync-baseline.cjs
```

### 3.2 What `sync-baseline` Executes:
1. **Timestamped Backup:** Automatically captures a full snapshot of the target directory to `omp_extension_backup_<TIMESTAMP>`.
2. **Atomic Sync:** Deploys modified runtime files (`src/`, `typesafe-planner.ts`, `tests/`, etc.).
3. **Pointer Validation:** Verifies that `~/.omp/agent/extensions/typesafe-planner.ts` is correctly linked.
4. **Verification Run:** Runs `bun test` in the target directory to ensure 100% test pass before completion.

---
## 4. Operational Readiness & Session Management

### 4.1 Khởi động lại session OMP (Nếu đang mở OMP CLI khác)
- **Lý do kỹ thuật:** Vì Node.js và Bun thực hiện in-memory caching cho các modules/extensions khi khởi chạy process. 
- **Thao tác:** Sau khi chạy `sync-baseline.bat`, bạn **phải tắt và mở lại terminal/session của OMP** để runtime nạp phiên bản code mới nhất vừa đồng bộ.

### 4.2 Cấu hình môi trường vận hành (Environment Setup)
Đảm bảo các biến môi trường sau được cấu hình trước khi chạy OMP session:

1. **`TYPESAFE_API_KEY` (Bắt buộc cho remote judgments):**
   - Khóa API của TypeSafe System One dùng cho Gate 2 semantic checks và tri-role evaluations.
   - PowerShell: `$env:TYPESAFE_API_KEY="sk-..."`
   - Bash: `export TYPESAFE_API_KEY="sk-..."`

2. **`TYPESAFE_PREDICT_MODEL` (Tùy chọn mô hình phân tích):**
   - Ghi đè mô hình chuyên biệt cho vòng phân tích tranh biện Multi-Persona `ck:predict` (mặc định canonical: `"jev-latest"`).
   - PowerShell: `$env:TYPESAFE_PREDICT_MODEL="jev-latest"`
   - Bash: `export TYPESAFE_PREDICT_MODEL="jev-latest"`

3. **`TYPESAFE_ALLOW_MODIFICATION` (Cấp quyền can thiệp hạ tầng):**
   - Bắt buộc khi cần chỉnh sửa file hạ tầng của extension (`typesafe-planner.ts`, `src/debate-evaluator.ts`, `models.yml`) hoặc cần reset danh sách task (`todo(op="init")`).
   - PowerShell: `$env:TYPESAFE_ALLOW_MODIFICATION="1"`
   - Bash: `export TYPESAFE_ALLOW_MODIFICATION=1`

---

## 5. Emergency Troubleshooting Runbook

### 5.1 Invariant Violation: "Dropping or resetting contracted tasks requires human authorization"
- **Cause:** An agent tried to call `todo(op="init")` or drop an existing task without authorization.
- **Solution:** Set `TYPESAFE_ALLOW_MODIFICATION=1` in your host shell:
  - PowerShell: `$env:TYPESAFE_ALLOW_MODIFICATION="1"`
  - Bash: `export TYPESAFE_ALLOW_MODIFICATION=1`
  - CMD: `set TYPESAFE_ALLOW_MODIFICATION=1`

### 5.2 Consecutive Failure Ratchet Lockout
- **Cause:** Task verification failed 3 consecutive times, locking execution to prevent looping.
- **Solution:** Inspect test errors, resolve the code bug, and execute `todo` with `"resetFailures": true`:
  ```json
  {
    "op": "done",
    "task": "Target Task Name",
    "resetFailures": true
  }
  ```

### 5.3 Key Rotation & Dynamic 401 Recovery
- If the TypeSafe API key expires or is rotated:
  1. Update `TYPESAFE_API_KEY` in your environment.
  2. The extension automatically computes the SHA-256 token hash prefix, detects the new key, and flushes stale HTTP connections without requiring an OMP process restart.
