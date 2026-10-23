# OMP TypeSafe Planner Extension (`omp_extension`)

An advanced quality, security, and verification extension for [oh-my-pi (omp)](https://github.com/can1357/oh-my-pi) coding agents, powered by **TypeSafe System One** (`jev-latest`) structured probability judgments.

---

## 🌟 Key Features & Architecture

```mermaid
flowchart TD
    Bind[Bind original task contract] --> Collect[Collect task-relative evidence]
    Collect --> Review[Prepare semantic and Advisor receipts]
    Review --> Stage[Preflight validates authority and freshness]
    Stage --> Native[Host executes exact native todo operation]
    Native -->|Matching successful result| Commit[Commit lifecycle and reports]
    Native -->|Failure, stale, or unavailable| Hold[Keep obligation and debt open]
```

* **Evidence and semantic review:** The extension binds review to the original task contract and task-relative evidence. Deterministic checks, semantic judgments, Advisor assessment and human lifecycle authorization remain separate; only the matching successful native result commits completion.
* **Configured approval policy:** The host-owned `TYPESAFE_AUTO_APPROVAL_THRESHOLD` is captured when the policy is created. Do not infer an approval threshold from historical documentation or change it to make a case pass.
* **Privacy and process isolation:** Evidence paths are checked against protected locations, child processes receive purpose-specific environments, and cancellation is tied to owned processes. These controls do not claim an OS sandbox or prove deployment/runtime activation.

### 2. Tri-Role Expert Evaluators (`typesafe_expert_review`)
On-demand expert evaluation tool exposed to the agent:
* **`scope_arbiter`:** Evaluates plan and prompt adherence; blocks requirement dropping.
* **`drift_guard`:** Inspects unified diffs for unapproved cross-boundary changes.
* **`risk_security_triage`:** Calibrated scoring (0 to 3) on security invariants, credentials, and technical trade-offs.

### 3. File & Code Integrity Shield
* Intercepts `write` and `edit` tool calls targeting protected TypeSafe infrastructure files (`typesafe-planner.ts`, `models.yml`, and shared kit modules).
* Intercepts infrastructure-sensitive writes and edits and requires an authenticated host-owned source mutation grant bound to the exact contract, path and operation. Environment variables and payload flags do not grant this authority.

### 4. Dynamic Auth Recovery & Health Watchdog
* Token-hash-aware self-healing: automatically recovers from temporary 401s when `TYPESAFE_API_KEY` is rotated, without requiring an OMP process restart.
* Pre-flight session health probe on `session_start` with proactive visibility into judge availability.

### 5. Human Decision Interception
* Intercepts the `ask` tool automatically to evaluate proposed decisions and attach risk/clarity scorecards directly to what the human sees (high risk increases human oversight, never blocks it).

---

## 🚀 Setup & Usage

### 1. Prerequisites
* [Bun](https://bun.sh) runtime ($\ge 1.0$)
* TypeSafe API Key set in environment:
  ```bash
  export TYPESAFE_API_KEY="your-typesafe-key"
  ```
* Workspace enabled in `~/.claude/.ck.json`:
  ```json
  {
    "typesafe": {
      "projects": ["*"]
    }
  }
  ```

### 2. Link to OMP
In your OMP extensions folder (`~/.omp/agent/extensions/typesafe-planner.ts`), proxy to this repository:

```typescript
export { default } from "D:/100.Software/Github/omp_extension/typesafe-planner.ts";
```

### 3. Running Tests
The suite covers unit, adversarial security and integration paths using controlled transport fixtures. Record the exact source revision, platform and Bun version with any result; a green run is not a live model-quality or deployed-runtime proof.

```bash
bun test
```

### 4. Evidence-Gated Completion (EGC) Extension Setup
The workspace provides a standalone Evidence-Gated Completion extension (`src/egc.ts`) for strict deterministic task verification:

1. **Initialize Contract**:
   Run the `/egc init` command in your OMP agent session to generate a `.omp/egc.json` template in the workspace:
   ```bash
   /egc init
   ```
2. **Edit Contract**:
   Configure verification commands, required tasks, and holdout suites in `.omp/egc.json`. Contract creation should be done by the user or planning model, not the executor agent.
3. **User Approval & Lock**:
   Before the agent can be bound by EGC, the user must review and approve the contract:
   ```bash
   /egc lock
   ```
   Alternatively, set the environment variable `EGC_TRUST_CONTRACT=1` for automated CI/CD environments.
4. **Run with OMP**:
   ```bash
   omp --extension ./src/egc.ts
   ```
5. **Commands**:
   - `/egc status`: View task ledger, verification evidence, and completion status.
   - `/egc lint`: Validate the active contract rules against lint checks.
   - `/egc lock`: Pin and approve the current contract SHA.
   - `/egc approve <id>` / `/egc reset <id>`: Human override to approve or reset a specific task.
   - `/egc selftest`: Test TypeSafe semantic judgment connectivity.

---

## 📁 Repository Structure

```text
.
├── src/
│   ├── cook-expert-judge.ts     # Tri-role evaluators & Dual-cadence verification engine
│   ├── evidence-collector.ts    # Deterministic OS state collection & Claude isolation
│   ├── payload-safety.ts        # Egress redaction & payload bound enforcement (<=32KB)
│   ├── plan-evaluator.ts        # Plan-time quality elevation engine
│   ├── verification-gate.ts     # Micro/Macro gate execution
│   └── egc.ts                   # Evidence-Gated Completion (EGC) standalone extension
├── tests/                       # Comprehensive test suites (18 suites, 123+ tests)
├── plans/                       # Architectural execution blueprints & compliance specs
├── docs/journals/               # Historical ADRs & technical change logs
├── typesafe-planner.ts          # Core OMP Extension entrypoint & hook bridge
└── README.md
```

---

## 📄 License

MIT
