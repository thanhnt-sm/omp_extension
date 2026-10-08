# Technical Journal: Session Start Health Probe Dual-Notification Analysis & ck:predict Review

**Date:** 2026-10-07  
**Author:** AI Coding Assistant  
**Topic:** Pre-Flight Probe Exception Scoping & Event-Driven Health Lifecycle

---

## 1. Issue Description

When starting a new session with the TypeSafe extension installed, users observe two consecutive and contradictory notifications:

```
╭────────────────────────────────────────────────────────╮
│ 📦 typesafe-health                                     │
│ TypeSafe: ONLINE (jev-latest)                          │
╰────────────────────────────────────────────────────────╯

╭────────────────────────────────────────────────────────╮
│ 📦 typesafe-health                                     │
│ TypeSafe warning: TypeSafe API unreachable. Check      │
│ internet connection or proxy settings.                │
╰────────────────────────────────────────────────────────╯
```

After these two notifications appear on startup, no further health notifications are displayed throughout the session.

---

## 2. Root Cause Analysis

### A. Why Two Contradictory Notifications Fire Sequentially
The issue resides in `typesafe-planner.ts` lines 606–675 within the `pi.on("session_start")` event listener:

1. **Step 1 (HTTP Probe Succeeded):**
   The pre-flight probe executes `fetch("https://api.typesafe.ai/v1/systemone", ...)` with an ultra-compact ping payload.
   The TypeSafe server responds with **HTTP 200 OK**.
   This triggers the `if (probeRes.ok)` branch:
   ```typescript
   extCtx.ui?.notify?.("TypeSafe: ONLINE (jev-latest)", "info");
   await pi.sendMessage({
     customType: "typesafe-health",
     content: "TypeSafe: ONLINE (jev-latest)",
     display: true,
   }).catch(() => {});
   ```
   Notification 1 (`TypeSafe: ONLINE (jev-latest)`) is posted successfully.

2. **Step 2 (Unhandled Internal IPC Rejection):**
   Immediately after posting the online status, the code attempts to inject internal steering instructions into the conversation turn queue:
   ```typescript
   await pi.sendMessage(
     { customType: "typesafe-planner", content: PROMPT_INJECTION, display: false },
     { deliverAs: "nextTurn" }
   );
   ```
   Unlike the previous `pi.sendMessage` calls, this call is **not protected by `.catch(() => {})`**.
   At the exact moment `session_start` fires, the host chat turn queue may not yet be initialized to receive messages with `{ deliverAs: "nextTurn" }`. This causes `pi.sendMessage` to reject with an unhandled Promise exception.

3. **Step 3 (Broad Catch Block Misclassification):**
   Because this unhandled rejection occurs inside the overarching `try { ... }` block of the pre-flight probe, control jumps directly to the outer `catch` block (line 667):
   ```typescript
   } catch {
     const extCtx = ctx as unknown as { ui?: { notify?: (msg: string, type: string) => void } };
     extCtx.ui?.notify?.("TypeSafe warning: TypeSafe API unreachable. Check internet connection or proxy settings.", "warning");
     await pi.sendMessage({
       customType: "typesafe-health",
       content: "TypeSafe warning: TypeSafe API unreachable. Check internet connection or proxy settings.",
       display: true,
     }).catch(() => {});
   }
   ```
   The outer catch block erroneously assumes that any caught exception is a network failure (`fetch` timeout or proxy error), and posts the second, contradictory notification.

### B. Why No Further Notifications Appear
1. **Single-Shot Pre-Flight Hook:** The probe is bound exclusively to `pi.on("session_start")`. It executes exactly once per session initialization.
2. **Zero Polling Daemon:** The extension intentionally avoids `setInterval` or background daemons to prevent CPU, network, and token churn.
3. **Event-Driven Interception:** For the remainder of the session, TypeSafe operates on-demand:
   - Throttling and evaluating human decisions via `ask` interception.
   - Dual Verification Gating via `todo done` interception.
   - Explicit tool calls (`typesafe_judge`, `typesafe_rerank`, `typesafe_evaluate_multi`).

---

## 3. Multi-Persona Pre-Analysis (`ck:predict`)

## Prediction Report: Decouple Internal IPC Message Rejection from Session Pre-Flight Network Probe

## Verdict: GO

### Agreements (all personas align)
- Conflating host IPC message bus rejections with external network errors creates false positive alerts that harm user trust.
- The pre-flight probe must isolate `fetch()` network errors from subsequent `pi.sendMessage` operations.

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|-----|-----------------|------------|
| **Catching `PROMPT_INJECTION` Failure** | Clean separation of concerns between transport and IPC. | Safe: doesn't compromise token auth or task verification gates. | Zero impact on latency or memory. | Eliminates false alarm; UI shows true online status. | If injection fails silently, does the agent lose guidance? | **Resolved**: Gating is enforced structurally in TypeScript hooks; prompt injection is purely advisory. Catching delivery failure is safe. |

### Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| False offline alert confuses user | Medium | Wrap `pi.sendMessage(PROMPT_INJECTION)` in `.catch(() => {})`. |
| Self-tampering with core security infrastructure | Critical | Preserve File Integrity Shield and Vector 5 anti-tamper safeguards; perform patch as manual operator edit. |

### Recommendations
1. In `typesafe-planner.ts` line 654–657, attach `.catch(() => {})` to `pi.sendMessage(PROMPT_INJECTION)`.
2. Keep the File Integrity Shield intact to prevent autonomous agent self-modification of security hooks.

---

## 4. Manual Patch for Operator

Apply the following change to `typesafe-planner.ts`:

```typescript
// Replace lines 654-657:
await pi.sendMessage(
  { customType: "typesafe-planner", content: PROMPT_INJECTION, display: false },
  { deliverAs: "nextTurn" }
).catch(() => {});
```
