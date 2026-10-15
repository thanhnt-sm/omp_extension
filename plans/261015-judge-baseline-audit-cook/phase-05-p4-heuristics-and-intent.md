---
phase: 5
title: "P4 Heuristics and intent"
status: completed
priority: P1
effort: "medium"
dependencies: [4]
---

# Phase P4: Heuristics and intent

## Overview

Use one diff classification for test-evasion gates and enforce task-scoped cancellation/user-intent precedence over clean-build inference.

## Requirements

- Extend `analyzeDiffForTestEvasion` to parse diff/header/untracked forms, old/new test paths, file deletion/rename behavior, no-header snippets, per-file assertion/suite deletion, comments, skips/todos, and literal tautologies without classifying docs prose or pure renames as evasion.
- Reuse that one classification in micro checks, deterministic checks, rejection flags, and remediations. Remove substring-based evasion signaling and tautological wording tests.
- Make bicameral consensus check explicit scoped cancellation and conflicting user request before clean-build inference. An unavailable judge/advisor cannot auto-approve; UI provenance exists only after verified yes/host authorization, and unsupported UI blocks.

## Related Code Files

- Modify: `src/ast-analyzer.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/bicameral-consensus.ts`, `typesafe-planner.ts`
- Modify tests: AST, cook/verification, todo/drop/block, bicameral consensus.

## TDD Steps

1. Add classification and state/provenance tests for deleted coverage, cross-file masking, rename/untracked/no-header, real versus unequal tautologies, scoped cancellation, UI outcomes, unavailable judge, and reappend authorization.
2. Run `bun test tests/ast-analyzer.test.ts tests/cook-expert-judge.test.ts tests/verification-gate.test.ts tests/todo-drop-gate.test.ts tests/todo-block-remediation.test.ts tests/bicameral-consensus.test.ts`; record RED.
3. Implement shared classification and intent precedence.
4. Re-run the named command GREEN.

## Success Criteria

- [x] All affected gates consume one semantic classification result.
- [x] Heuristics are conservative signals, not AST proof or wording requirements.
- [x] User conflicts/cancellation remain task-scoped and no unavailable path authorizes deletion.
- [x] The named module suite passes.
