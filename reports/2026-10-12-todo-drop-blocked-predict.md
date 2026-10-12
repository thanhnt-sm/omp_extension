## Prediction Report: Exemption of 'drop' and 'rm' from TypeSafe Verification Gates

## Verdict: STOP

### Agreements (all personas align)
- **Root Cause of Deadlock:** The `todo` operations `drop` and `rm` are currently missing from the `isSafeFastPath` array (`["init", "start", "view", "append"]`). Consequently, they fall through to the Dual Verification Gate (Gate 1 Micro-Check and Gate 2 Macro-Check). 
- **Logical Error:** Evaluating a `drop` (abandoning a task) as a task *completion* forces the agent to prove the task was implemented and that all tests pass. If tests are broken, the agent becomes deadlocked and cannot drop the task to fix them.
- **UX Frustration:** Users explicitly requesting to cancel/drop a task will see the agent fail repeatedly.

### Conflicts & Resolutions

| Topic | Architect | Security (Adversarial) | Performance | UX | Devil's Advocate | Resolution |
|-------|-----------|------------------------|-------------|-----|-----------------|------------|
| **Bypassing Gates** | `drop` is categorically not a completion; it should bypass Gates 1 & 2. | If `drop` bypasses Gates 1 & 2 AND removes the task from `activeContractedTasks` (Line 1002), a malicious agent can trivially evade all TypeSafe checks by dropping tasks instead of completing them. | Semantic checks on dropped tasks waste LLM tokens and API calls. | The agent must be able to clear stuck tasks immediately to recover from spirals. | Why not just complete the task? Because the task might be fundamentally flawed or abandoned by the user. | **STOP: Requires Architectural Mitigation.** We cannot simply add `drop` to `isSafeFastPath` without closing the evasion loophole. |
| **Contracted Tasks**| Track dropped tasks separately to ensure plan closure accounts for them. | Evasion is the primary threat. If a task is on the plan, it must be verified. | Keeping it simple: fast-path `drop` but log it. | Blocking `drop` breaks core agent workflows. | Just require a `todo(op: "block")` instead? But `drop` is a native tool feature. | **Recommendation:** Allow `drop` via fast-path, but trigger an out-of-band UI notification to the human operator indicating a contracted task was evaded/dropped. |

### Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Deadlock Loop** | High | Agent gets stuck trying to drop a task but failing the test/completion checks. |
| **Adversarial Evasion** | Critical | If `drop`/`rm` are fast-pathed, an agent can skip mandatory tasks by dropping them, bypassing the entire TypeSafe judge. |

### Recommendations
1. **Add `drop` and `rm` to `isSafeFastPath`**: This immediately unblocks the agent from the deadlock loop, stopping the inappropriate application of completion gates to task abandonment.
2. **Implement Evasion Guard**: In the `drop`/`rm` branch of `typesafe-planner.ts`, instead of silently deleting from `activeContractedTasks` and returning, dispatch a `pi.sendMessage` (UI notification) explicitly alerting the user: *"TypeSafe Alert: Agent dropped contracted task: [Task Name]"*.
3. **Alternative (Strict Mode)**: Introduce an `EGC` (Escalation Gate) for `drop` operations. If an agent attempts to drop a contracted task, the `todo` tool intercepts and suspends execution, requiring the human operator to click "Approve Drop" or "Reject".