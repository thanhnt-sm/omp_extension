---
phase: 2
title: "P1 Bundled loading"
status: completed
priority: P1
effort: "medium"
dependencies: [1]
---

# Phase P1: Bundled loading

## Overview

Cut all entrypoint and payload safety loading over to adjacent bundled modules so global files cannot alter the judge security contract.

## Requirements

- Load resolver, redact, API client, and policy client only from `path.join(__dirname, "src", filename)`.
- Validate resolver `resolveTypeSafeEnabled`, redaction `preparePayload`, API `validateInput`/`sanitizeAnswers`, and policy `checkPolicy` exports. Missing policy reports `policy_client_missing` plus a safe health warning; other local dependency failures disable/fail closed before fetch.
- Remove global-first and hardcoded workspace candidates from `typesafe-planner.ts` and global fallback from `src/payload-safety.ts`.
- Port resolver behavior coverage to workspace tests using isolated fixtures; do not use personal configuration.

## Related Code Files

- Modify: `typesafe-planner.ts`, `src/payload-safety.ts`, lifecycle/integration/health tests
- Create: `tests/typesafe-resolver.test.ts`

## TDD Steps

1. Add poisoned-global and missing/corrupt-local subprocess behavior tests plus wildcard/exclusion resolver fixtures.
2. Run `bun test tests/typesafe-planner-integration.test.ts tests/typesafe-lifecycle-gating.test.ts tests/typesafe-resolver.test.ts tests/health-watchdog.test.ts` and record RED.
3. Remove alternate loaders and enforce local exports.
4. Re-run the named command GREEN.

## Success Criteria

- [x] A stale global module cannot influence bundled behavior.
- [x] Missing/corrupt bundled dependencies produce no fetch/approval.
- [x] Resolver wildcard/exclusion behavior is fixture-backed.
- [x] The named module suite passes.
