# Technical Journal: Fixing Advisor & `ck:advisor` Decision Answering

**Date**: 2026-10-14  
**Scope**: `src/bicameral-consensus.ts`, `src/cook-expert-judge.ts`, `src/evidence-collector.ts`, `typesafe-planner.ts`, `.omp/agents/`, `agents/`, `tools/sync-baseline.cjs`  
**Verification**: 285/285 workspace tests passing; 300/300 target tests passing

---

## 1. Problem Statement

When the coding agent needed a technical or workflow decision (via `ask` interception, `typesafe_expert_review`, `todo` mutations, or `task(agent="advisor" | "ck:advisor")`), `advisor` and `ck:advisor` failed to return a concrete decision answer—either returning `UNCERTAIN` ("Unrecognized mutation operation" / "Agent work log is incomplete"), omitting recommendations on `ask` prompts, or failing subagent discovery in OMP.

## 2. Root Causes Identified

1. **Transcript Context Starvation (`collectConversationContext` in `typesafe-planner.ts`)**:
   - Skipped all `custom_message` entries (`customType: "skill-prompt"` containing the user's `User: ...` prompt on `/ck:*` invocations, and `customType: "advisor"` containing native OMP `<advisory>` notes).
   - Extracted only `b.type === "text"` from `assistant` messages while ignoring `thinking` and `toolCall` blocks, pushing empty `""` strings for tool-only turns so `assistantMessages.slice(-3)` became empty.
   - Ignored `msg.role === "toolResult"`, stripping test execution outputs (`285 pass, 0 fail`) from `agentWorkLog`.
2. **Missing Decision & Option Evaluation in Lobe 1 (`src/bicameral-consensus.ts`)**:
   - `evaluateAdvisorIntent` only handled `operation === "drop"` and `"done"`, falling through to `UNCERTAIN` for `"decision"`, `"ask"`, and `"mutate"`.
   - Lacked candidate option scoring/ranking (`recommendedOption`, `recommendedIndex`, `rankedOptions`), the fixed 6-section `ck:advisor` contract formatter (`formatCkAdvisorReport`), and `runBicameralDecisionCheck`.
3. **Missing Advisor Handoff in `ask` Interception & `typesafe_expert_review` (`typesafe-planner.ts`)**:
   - `toolName === "ask"` only queried TypeSafe JEV for `risk_posture` and `decision_clarity` without invoking `evaluateAdvisorIntent` to attach an Advisor / `ck:advisor` recommendation or pre-fill `recommended` option index.
   - `typesafe_expert_review` only accepted `scope_arbiter`, `drift_guard`, and `risk_security_triage` roles, and no `typesafe_advisor` tool was registered.
4. **Missing OMP Task-Agent Definitions (`.omp/agents/`, `agents/`)**:
   - OMP intentionally skips `.claude/agents` (`TASK_AGENT_CONFIG_SOURCE = ".omp"`), so `task(agent="advisor")` and `task(agent="ck:advisor")` failed without `.omp/agents/advisor.md` and `.omp/agents/ck-advisor.md`.
5. **False Commit Attribution on Read-Only Tasks (`src/evidence-collector.ts`)**:
   - `WorkspaceSnapshot` did not track `headSha`, causing read-only scouting/diagnosis tasks with no file changes to inherit `HEAD~1..HEAD` from prior commits.

## 3. Resolution

- **`src/bicameral-consensus.ts`**: Implemented `evaluateAdvisorDecision`, option ranking (`rankedOptions`, `recommendedOption`, `recommendedIndex`), `formatCkAdvisorReport` (6-section `ck:advisor` contract: `Verdict`, `Recommendation`, `Ranked options`, `Findings`, `Confidence`, `Open questions`), and `runBicameralDecisionCheck`. Expanded `operation: "done"` and `"mutate"` to recognize scouting/diagnosis tasks, tool execution logs, test evidence, and Vietnamese completion phrasing.
- **`typesafe-planner.ts`**: Fixed `collectConversationContext` to extract `skill-prompt` user requests, `advisor` notes, `thinking`/`toolCall` blocks, and `toolResult` outputs; integrated `evaluateAdvisorIntent` into `ask` interception (including offline/error fallback and `recommended` index population); added `"advisor"` and `"ck:advisor"` roles to `typesafe_expert_review`; registered `typesafe_advisor`.
- **`src/evidence-collector.ts` & `src/cook-expert-judge.ts`**: Added `headSha` tracking to `WorkspaceSnapshot` and aligned `deliverables_verdict` `APPROVE` criteria when `testCommand` is not specified.
- **`.omp/agents/`, `agents/`, `tools/sync-baseline.cjs`**: Added `advisor.md` and `ck-advisor.md` definitions and synced them to target and `~/.omp/agent/agents/`.
