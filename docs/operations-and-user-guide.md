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

Synchronize only from this workspace through the sole deployment entry point:

```bash
node tools/sync-baseline.cjs
```

Use `node tools/sync-baseline.cjs --dry-run` first whenever the target's managed state is uncertain. A dry run performs the complete read-only preflight and reports managed actions/conflicts, but **does not** create a lock, backup, stage, journal, or modify any path.

### 3.1 Managed transaction boundaries

- The deployment manifest is `<target>/.sync-manifest.json`. It records SHA-256 hashes only for files managed by the transaction.
- Managed destinations are the target inventory plus the exact allowlisted resolver, TypeSafe MCP files, and `advisor.md`/`ck-advisor.md` agent files. It never manages or deletes `.claude` configuration, skills, or the OMP extension proxy.
- Existing byte-identical files can be recorded as managed without content mutation. Differing unowned files, or files modified since their recorded deployment hash, are conflicts and abort the run. There is no force/adopt/repair mode.
- A disappeared workspace file is pruned only when the destination remains unchanged from its prior managed hash. Unknown target files are left intact.
- The OMP extension pointer remains immutable: preflight requires exactly the expected single export statement and the transaction never rewrites it.

### 3.2 Safety, recovery, and verification

- A sibling exclusive lock is taken after preflight; planning and ownership checks are repeated while it is held. A pre-existing lock is never stolen—perform operator recovery before retrying.
- Staging and retained backups/journals are outside all mutable roots. The journal records intent and verified preimages before each changed or pruned path; a failed apply, hash check, manifest write, or verification invokes reverse rollback only for transaction-touched paths.
- A completed run reports either `DEPLOYED_VERIFIED` or `DEPLOYED_UNVERIFIED` (`OMP_SKIP_VERIFY_TESTS=1`). The latter is not promotion evidence. `RECOVERED` means rollback completed after a failure; `RECOVERY_INCOMPLETE` means an external change or rollback failure requires operator intervention using the retained backup/journal.
- Normal deployment runs `bun test` in the isolated target after all writes and manifest verification. Do not use fault injection outside isolated fixtures; `OMP_FAULT_INJECT` exists only to test transaction recovery boundaries.

### 3.3 Restart requirement

After a verified deployment, stop and start the OMP host/session. Bun/Node cache extension modules in memory at host launch, so a successful filesystem transaction does not update an already-running OMP process.

### 3.4 P6 promotion audit status

The audited sync invocation was a read-only dry run. Immutable-pointer validation blocked it before any managed deployment transaction began. Consequently, it created no lock, staging area, backup, journal, manifest change, proxy change, or deployed files, and it left no transaction to roll forward, roll back, or recover.

This is an external operator-owned blocker, not a successful deployment or promotion. The audit did not modify the proxy, deploy content, or restart OMP. Workspace test results do not substitute for deployment verification: P6 remains pending until the operator corrects the immutable pointer, a supervised managed deployment succeeds, OMP is restarted, and a live native session supplies the required runtime-origin and lifecycle proof.
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

### 5.4 Actionable Remediation Guidance on Blocked / Rejected Tasks
- **Overview:** When a task operation (`todo done` or `todo drop`) is rejected by Gate 1 (Micro-Check) or Gate 2 (Macro-Check), TypeSafe Planner injects deterministic, machine-actionable instructions directly into the agent steering stream:
  - **Gate 1 Test Failures:** Specifies the exact test command (`$ <testCommand>`) and exit code, instructing the agent to run the test suite locally to verify clean exit code 0 before retrying.
  - **Gate 1 Test Evasion / Zero Evidence:** Forbids deleting or weakening assertions, requiring concrete code modifications or tests.
  - **Gate 2 Scope Reductions:** Identifies omitted deliverables and planned criteria, directing in-place completion.
  - **Gate 2 Architectural Drift:** Details drift dimensions and mandates confining modifications strictly to contracted task boundaries.
  - **Infrastructure / Connectivity Outages:** Distinguishes external failures (`unavailable`) from code defects, instructing the agent not to modify codebase or tests evasively.
  - **Prompt Injection Defense:** Dynamic XML entities (`&`, `<`, `>`, `"`) are automatically escaped in remediation blocks.
