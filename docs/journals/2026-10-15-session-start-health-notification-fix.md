# Technical Journal: Session-Start Health Notification Fix

- **Date**: 2026-10-15
- **Workspace**: `D:/100.Software/Github/omp_extension`
- **Scope**: Session-start TypeSafe health-origin notification transport.

---

## Root Cause and Fix

The session-start notification directly used `await pi.sendMessage(...).catch(...)`, assuming the host returned a Promise. It crashed when the host returned `undefined`.

The notification paths now use the existing `safeSendMessage`. It checks that the transport is callable, awaits `Promise.resolve(...)`, and swallows notification-transport failures at that boundary.

## Regression Coverage and Verification

`tests/health-watchdog.test.ts` covers absent `sendMessage`, synchronous `undefined`, rejected transport results, and successful health notifications. The health module passed 9 tests; the full suite passed 321 tests across 35 files; `node tools/sync-baseline.cjs` reported `DEPLOYED_VERIFIED`.

OMP must restart to load the deployed extension.
