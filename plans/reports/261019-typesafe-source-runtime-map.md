# TypeSafe source/runtime map

Original task (verbatim): "Map source callsites and verify workspace/runtime identity for TypeSafe judge and todo gates."

Graph below is source-confirmed, not an execution trace. W = D:/100.Software/Github/omp_extension; D = C:/Users/thant/Projects/omp_extension. Pre-repair disk snapshot: 20/20 equal, 0 mismatches. Five runtime-origin digests and baseline: [scratch](local://typesafe-map-evidence.md). Post-repair disk check: **17/20 equal**, differences in entrypoint, cook-expert-judge and evidence-collector; [full hashes](local://typesafe-postrepair-identity.json). Disk equality does NOT attest all imported TypeScript in loaded memory or any historical session. Original REJECT P=.13 remains undiagnosed: missing persisted map is a packaging gap, not proven cause. Historical pre-retry checkpoint: "No approval or native completion claimed." Subsequently this exact mapping target was actually native-approved/committed (`d309dc2a`) after fresh Advisor and relevant updated evidence; no deployment or historical-causality inference follows.

## Confirmed graph (paths relative to W unless absolute)

- Loader: C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts:1 exports D/typesafe-planner.ts. Workspace typesafe-planner.ts:1445 registers extension; resolver/redactor/API CJS load relative to entrypoint.
- Native interception: typesafe-planner.ts:2161 tool_call -> handleTodoInterception :1889 -> stageNativeTodoCall :1617. Done captures snapshot, optional test receipt and task baseline.
- Evidence: src/evidence-collector.ts:448 -> status/diff, changed paths, tests, optional plan criteria. Native caller still does not pass planPath.
- Micro: src/cook-expert-judge.ts:167 checks boundary/test exit/test evasion/evidence; failure cancels call.
- Macro: native stage -> src/bicameral-consensus.ts:811 -> src/cook-expert-judge.ts:218. Collector receives actual task.content; shared applicability and 4940-byte UTF-8 artifact budget apply. Native still reads macroResult.approved, not composed consensus; Advisor heuristic adjustment remains unchanged.
- Transport: createExtensionJudgeClient :2451 -> executeTypeSafe :2332 -> src/typesafe-api-client.cjs:340-464 retry/POST https://api.typesafe.ai/v1/systemone. Post-redaction proof loss now fails closed.
- Native commit: staged call/input/generation/revision/targets -> tool_result :2163 requires matching successful native result and semantic effect before mirror/checkpoint update. Preflight staging alone is not commit.

## Distinct branches

- Drop: native stage -> src/bicameral-consensus.ts:776-805; reject or exact-target human confirmation. Policy unchanged.
- Block with rejection debt: same trusted confirmation; not completed and debt not cleared.
- Explicit verify (advisory): typesafe_verify_completion registration :2794 -> src/verification-gate.ts:291-467; does not commit native todo.
- Advisor: typesafe_advisor registration :2915 -> src/bicameral-consensus.ts:1038-1223 heuristic + optional JEV, not a spawned reasoning agent or native commit.
- EGC marker/env bypass: typesafe-planner.ts:985,1618. History rehydration: :1556. Neither was used as remediation.

## Provenance and limits

Session 2026-10-19T02-18-55-333Z_01a151f4-6be4-7573-8bb7-e95974e16080.jsonl: runtime-origin line 5 (fce61237); prior isolated diagnostic/disk equality line 251 (85ef9afa); exact done attempt/reject lines 346-348 (7c86b82f). No captured exact rejection wire payload, so no causal attribution. Authorized repair changed W only; proxy/target not deployed or restarted. Recorded entrypoint digest still matches D, not repaired W; five recorded digests are not all-module memory attestation. Parent owns fresh checks, Advisor review and native authority; fixture approval cannot close this task.
