---
phase: 3
title: "Conditional cutover and runtime proof"
status: pending
priority: P1
dependencies: [2]
---

# Phase 3: Conditional cutover and runtime proof

## Overview
Execute only after authorized implementation and successful comparative evaluation. Migrate all callers to one coherent evidence/authority contract; preserve native task transaction ownership. This phase has not run.

## Requirements
- JEV judges bounded semantic claims; Advisor synthesizes parent/integration reasoning; deterministic policy owns side effects. Human authority follows existing exact-target policy, not task length.
- No auto-completion by averaging/multiplying semantic scores or counting completed children. A drop cancels an obligation; it does not prove parent success.
- Keep lifecycle pending/in-progress/blocked separate from verification evidence-required/rejected/unavailable/human-required/approved-pending-commit.
- Preserve trusted human confirmation for blocking rejected work. Headless sessions must name the limitation and retain debt, not spoof consent.
- No compatibility shims, parallel legacy gate routes, fake fallbacks, default JEV approval, rewritten Advisor verdicts or model-generated human permissions.

## Architecture
Existing planner preflight consumes a bound deterministic disposition and rechecks relevant identities before staging. A successful matching native `tool_result` commits task state. Advisory checks share evidence semantics but cannot commit or authorize a different native operation. Parent completion additionally requires original-contract coverage and task-appropriate integration evidence/review; reasoning review cannot substitute for tests where runtime behavior must be exercised.

## Related Code Files
- Integrate authorized changes across `typesafe-planner.ts`, shared evaluation modules, actual agent definitions in `agents/` and `.omp/agents/`, and their callers/tests.
- Update `docs/typesafe-operations.md`, `docs/operations-and-user-guide.md`, architecture/specification references affected by the cutover; remove obsolete claims.
- Deployment entrypoint remains `tools/sync-baseline.cjs`. Immutable proxy is never written by agents.

## Implementation Steps
1. Integration owner migrates all native/advisory/expert/plan consumers, removes obsolete duplicated paths and rechecks references. Preserve explicit operation identity and thresholds selected through the approved evaluation, not convenience.
2. Verify correct local fail reasons and bounded recovery. `insufficient evidence` asks for named missing proof; `unavailable` requests dependency recovery; semantic reject invokes real Advisor investigation with concrete evidence; human-required identifies exact authority/target. No generic code edits for outages.
3. Run complete affected test modules, then full `bun test`. Exercise actual changed paths in isolated host scratch sessions: approve pending native commit, reject, outage, stale revision, duplicate name, branch/restart, rejected block UI/headless, obsolete drop and parent integration failure.
4. Review resulting evidence with an independent Advisor. Re-evaluate the same authoritative gate/operation/targets using fresh relevant evidence; advisory or persona agreement is not approval. Record failures honestly; do not weaken verification assets.
5. Only when deployment is explicitly authorized, run `node tools/sync-baseline.cjs`. Inspect its actual verification result; ask the user to restart OMP because the host caches extension code. Do not change the global proxy or claim to restart the user's session automatically.
6. Capture fresh runtime-origin and changed-path native evidence after restart. Distinguish disk equality, load-time proof, semantic evaluation and actual native commit. Hold completion when a required prerequisite/authority remains unavailable.

## Success Criteria
- [ ] No remaining caller uses old evidence semantics or bypasses the composed authority disposition.
- [ ] All affected full modules and full suite pass without test weakening; actual native scenarios are observed.
- [ ] Child support cannot close a parent with failed integration or unfulfilled original obligations.
- [ ] Unavailable JEV cannot create approval; trusted-human policy and exact-target replay defenses hold.
- [ ] Matching native result, not staging/Advisor output, commits success.
- [ ] Deployment and host restart occur only with required authorization; post-restart proof is recorded before deployment completion is claimed.

## Risk Assessment
Host API may not provide atomic workspace/contract preconditions at mutation; document revision-scoped guarantees instead of inventing ACID semantics. A model alias can move; record actual response model. Imported TypeScript memory is not fully proven by the current five-file runtime-origin record. If the candidate fails evaluation or live proof, retain the unfinished contract and use managed deployment recovery, not score manipulation or task deletion.
