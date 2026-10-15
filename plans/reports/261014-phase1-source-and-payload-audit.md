# Audit: TypeSafe, Judge, JEV & Advisor Source Code and Payload Construction

Complete audit of `omp_extension` (`typesafe-planner.ts`, `src/*.ts`) and global OMP hooks/skills (`~/.claude/hooks/lib/typesafe-*.cjs`, `~/.omp/agent/extensions/typesafe-planner.ts`):

1. **Global OMP Hooks & Skills**:
   - `~/.omp/agent/extensions/typesafe-planner.ts`: Proxy trampoline re-exporting `C:/Users/thant/Projects/omp_extension/typesafe-planner.ts`.
   - `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs`: Two-Gate activation (`TYPESAFE_API_KEY` + `~/.claude/.ck.json` `typesafe.projects[]`).
   - `~/.claude/hooks/lib/typesafe-api-client.cjs` & `typesafe-payload-redactor.cjs`: 32KB cap, secret redaction, and `sanitizeAnswers` schema check for `POST https://api.typesafe.ai/v1/systemone` (`jev-latest`).

2. **Extension Interceptors & Payload Construction (`typesafe-planner.ts`)**:
   - `handleTodoInterception` (`1231-2177`): Intercepts `write`/`edit`/`ask`/`bash`/`todo`; builds `MacroCheckContext` from `collectTaskEvidence` (`src/evidence-collector.ts:275-474`), `collectDeliverableArtifacts` (`427-450`), and `collectConversationContext` (`569-672`).
   - `sanitizeStateForTypeSafe` (`493-567`): Summarizes diffs >14KB and head-clamps non-diff fields >2,000 chars (or >950 chars when state >28KB).
   - `executeTypeSafe` (`2202-2349`): Enforces 10s timeout and `HOST_POLICY` lattice (`auto < review < block`).

3. **Core Evaluators (`src/*.ts`)**:
   - `src/cook-expert-judge.ts:130-715`: Gate 1 `runTaskMicroCheck`, Gate 2 `runPhaseMacroCheck` (`deliverables_verdict`, `meets_criteria`, `architectural_drift`, `scope_mode`), and `runDropJustificationCheck`.
   - `src/bicameral-consensus.ts:162-1027`: Lobe 1 regex heuristics (`evaluateAdvisorDecision`, `evaluateAdvisorIntent`), `arbitrateConsensus`, and `runBicameralDecisionCheck` (`xd://typesafe_advisor`).
   - `src/verification-gate.ts:288-452` & `src/plan-evaluator.ts:259-372`: `xd://typesafe_verify_completion` and `xd://typesafe_elevate_plan`.
