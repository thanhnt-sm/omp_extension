---
title: "Fix Advisor and ck:advisor Decision Answering & Context Extraction"
description: "Fix root causes preventing Advisor (Lobe 1) and ck:advisor from returning concrete decision answers when the agent needs a decision."
status: completed
priority: P1
effort: "2h"
branch: master
tags: [advisor, ck-advisor, bicameral-consensus, decision-gate, typesafe]
created: 2026-10-13
---

# Fix Advisor and ck:advisor Decision Answering & Context Extraction

## Root Causes Identified
1. **Context Starvation in `collectConversationContext` (`typesafe-planner.ts`)**:
   - Ignored `custom_message` entries (`skill-prompt` carrying `User: ...` prompts and `advisor` carrying native `<advisory>` notes).
   - Ignored `thinking` and `toolCall` blocks in `assistant` messages and pushed empty `""` strings, wiping out `agentWorkLog`.
   - Ignored `toolResult` messages, depriving Lobe 1 (`evaluateAdvisorIntent`) and Lobe 2 (`TypeSafe JEV`) of test/command evidence.
2. **Missing Decision & Option Evaluation in `evaluateAdvisorIntent` (`src/bicameral-consensus.ts`)**:
   - Only handled `operation: "drop"` and `"done"`, returning `UNCERTAIN` ("Unrecognized mutation operation") for `"decision"`, `"ask"`, and `"mutate"`.
   - Lacked option scoring/ranking (`recommendedOption`, `recommendedIndex`, `rankedOptions`), `ck:advisor` 6-section contract formatting (`formatCkAdvisorReport`), and `runBicameralDecisionCheck`.
3. **Missing Advisor Integration in `ask` Interception & `typesafe_expert_review` (`typesafe-planner.ts`)**:
   - `ask` tool interception did not invoke `evaluateAdvisorIntent` to provide an Advisor / `ck:advisor` recommendation or pre-select `recommended` option index.
   - `typesafe_expert_review` lacked `"advisor"` and `"ck:advisor"` roles, and no dedicated `typesafe_advisor` tool was registered.
4. **Missing OMP Agent Definitions for `advisor` and `ck:advisor` (`.omp/agents/`, `agents/`, `tools/sync-baseline.cjs`)**:
   - OMP skips `.claude/agents`, so `task(agent="advisor")` and `task(agent="ck:advisor")` could not resolve without `.omp/agents/advisor.md` and `.omp/agents/ck-advisor.md`.
5. **Unrelated Commit Attribution on Read-Only Tasks (`src/evidence-collector.ts`)**:
   - `WorkspaceSnapshot` did not track `headSha`, causing read-only scouting/diagnosis tasks with zero file edits to inherit `HEAD~1..HEAD` from prior commits.

## Acceptance Criteria & Tasks
- [x] Step 1: Scout codebase for advisor / ck:advisor implementations and callsites
- [x] Step 2: Diagnose why advisor / ck:advisor does not return answers when agent needs decisions
- [x] Step 3: Implement fix addressing root cause
- [x] Step 4: Verify with tests and smoke check
- [x] Step 5: Sync baseline to runtime target

## Verification Summary
- Workspace test suite: `285 pass, 0 fail` across 33 files (`bun test`).
- Target deployment test suite: `300 pass, 0 fail` across 35 files (`node tools/sync-baseline.cjs`).
- Smoke test: `runBicameralDecisionCheck` returned `SMOKE_VERDICT: proceed | OPTION: Fix root cause in bicameral-consensus and collectConversationContext`.
