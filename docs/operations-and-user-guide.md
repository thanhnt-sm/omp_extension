# Developer & Operations Manual

## 1. Developer Onboarding & Local Setup

### 1.1 Prerequisites
- **Runtime:** [Bun](https://bun.sh) ($\ge 1.0$)
- **Node.js:** ($\ge 18$) (for baseline sync utility)
- **Git:** Git CLI configured and accessible via PATH

### 1.2 Installation
Clone the repository and install dev dependencies:
```bash
git clone https://github.com/thanhnt-sm/omp_extension.git
cd omp_extension
bun install
```

### 1.3 Running Tests
Run the repository suite from a clean, identified checkout:
```bash
bun test
```
A result is meaningful only with its commit/worktree revision, operating system and Bun version. Passing local tests do not establish live model-quality, host UI, deployment, or loaded-runtime behavior.

---

## 2. Linking Extension to OMP

The standard linking pattern uses a thin TypeScript loader in the OMP extensions directory:

**Location:** `C:\Users\<user>\.omp\agent\extensions\typesafe-planner.ts` (or `~/.omp/agent/extensions/typesafe-planner.ts` on Linux/macOS)

```typescript
export { default } from "D:/100.Software/Github/omp_extension/typesafe-planner.ts";
```

---

## 3. Operational Baseline Synchronization (`sync-baseline`)

For the guided Windows path, double-click:

```cmd
tools\sync-baseline.bat
```

It runs `tools/promote-omp-global.ps1`, which validates the immutable loader, opens it for an external operator to repair when required, then runs the read-only preflight and managed transaction. The helper never writes the loader proxy itself.

The underlying deployment entry point remains:

```bash
node tools/sync-baseline.cjs
```

Use `node tools/sync-baseline.cjs --dry-run` first whenever the target's managed state is uncertain. A dry run performs the complete read-only preflight and reports managed actions/conflicts, but **does not** create a lock, backup, stage, journal, or modify any path.

For a one-time migration from an existing unmanifested runtime, an operator may explicitly use `--bootstrap` (or `promote-omp-global.ps1 -Bootstrap`). Bootstrap is rejected after a manifest exists, snapshots every managed preimage, adopts only the managed allowlist, and still runs target verification. It is not a general force mode.

### 3.1 Managed transaction boundaries

- The deployment manifest is `<target>/.sync-manifest.json`. It records SHA-256 hashes only for files managed by the transaction.
- Managed destinations are the target inventory plus the exact allowlisted resolver, TypeSafe MCP files, and `advisor.md`/`ck-advisor.md` agent files. It never manages or deletes `.claude` configuration, skills, or the OMP extension proxy.
- Existing byte-identical files can be recorded as managed without content mutation. Differing unowned files, or files modified since their recorded deployment hash, are conflicts and abort the run. The sole exception is the explicit one-time `--bootstrap` migration before any manifest exists.
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

### 4.2 Configuring the runtime environment
Set `TYPESAFE_API_KEY` before starting the OMP process when remote TypeSafe judgments are required. A new key can clear credential cooldown when the extension actually observes that new value; changing a parent shell does not alter the environment of an already-running process. Restart the host after changing its inherited environment.

For infrastructure source mutations, use only the authenticated host-owned, exact-scope grant workflow described above. No environment override or tool payload substitutes for that grant.

**`TYPESAFE_PREDICT_MODEL`** may override the dedicated analysis model for the multi-persona predict loop (canonical default: `jev-latest`). Set it before starting the host.

---

## 5. Emergency Troubleshooting Runbook

### 5.1 Rejected destructive todo operation
- **Cause:** A `drop`, `rm`, or replacing `init` did not receive a verified `AUTO_APPROVE`, or its native result did not apply the exact staged target effect.
- **Recovery:** Do not pass `authorized`, `isHuman`, or `resetFailures` in the todo payload. `AUTO_REJECT` and `RECONCILE_PLAN` remain rejected. For `HUMAN_ESCALATION`, use the trusted host UI for fresh exact-target confirmation; no UI, denial, throw, stale state, or mismatched result does not mutate or clear debt.

### 5.2 Rejected task needs to be blocked
- **Cause:** Gate 1 or Gate 2 rejected `done`; failure/remediation debt remains attached to the task.
- **Recovery:** Use the host UI to confirm blocking the exact task/phase target set. `block` records an obstacle but preserves the unfinished task and its debt. Later `unblock` or `start` does not authorize `done`; provide task-scoped evidence and obtain a valid matching native completion result.

### 5.3 Credential rotation and recovery
- Set the replacement `TYPESAFE_API_KEY` in the environment inherited by the OMP process and restart OMP so it observes the new value.
- Credential cooldown is keyed to the observed key; transport recovery does not itself approve or reject a task. Re-run the same operation only after the service/key status is refreshed and the evidence remains current.

### 5.4 Actionable remediation guidance on blocked or rejected tasks
- **Overview:** A rejected `todo done`/`todo drop` records its actual outcome category and concrete next action. The planner injects only deterministic, machine-actionable guidance tied to the rejected operation.
  - **Deterministic micro-check failure:** Names the failed test command/exit status and requires a real clean run; deleting or weakening assertions is not a fix.
  - **Semantic or evidence shortfall:** Names the uncovered criterion or missing proof and requires actual completion/evidence, not a prose rewrite or scope reduction.
  - **Lifecycle authority:** The exact-target lifecycle change needs the trusted host surface; retrying with model-supplied authorization flags is invalid.
  - **Service unavailable:** Distinguishes transport outage from an implementation defect and does not create rejection debt or license source edits.
  - **Prompt injection defense:** Dynamic entities are escaped before remediation text enters the steering stream.

## 6. Source-Only Boundary Changes (2026-10-22)

These were verified against the workspace source only; none is a live host or deployment claim.

- **Process-tree cancellation:** POSIX verification commands are spawned as an owned process group and timeout/abort terminates the group. Windows tree termination remains the `taskkill /t /f` branch. POSIX behavior was not exercised in this Windows session.
- **Advisor public envelope:** `authorizedFiles` and `evidenceRefs` are redacted as part of the final prompt. If any reference would change under redaction (for example a path containing the active credential), preparation fails with `advisor_public_reference_redaction_required` instead of publishing or silently rewriting the exact-SHA binding.
- **Path privacy matching:** private path segments use a prototype-free lookup, so ordinary names such as `constructor` or `__proto__` are not falsely classified as private while `.env`, `.ssh`, `.claude` and session files still are.
- **Lifecycle provenance:** the planner currently does not wire the lower-level automatic verified-drop callback, so this path is not enabled through the registered planner. If connected later, host-owned policy provenance must remain distinct from human confirmation and be verified end to end before enabling it.
- **Limits:** real host UI, provider reasoning, deployed-runtime origin and Windows process-tree behavior need their own authorized evidence. Do not infer activation from workspace source changes.
