# Git Semantic Gateway Boundary Implemented

## Summary

The Git semantic gateway slice is implemented for `@asdl/planned-branch`. Planned-branch core workflows now consume a planned-branch-owned `PlannedBranchGitGateway` for Git repository facts, source/implementation/default branch facts, origin URL lookup, HEAD commit lookup, target branch validation, local branch presence, and branch creation at `HEAD`.

## Objective Impact

This advances the roadmap row, "Semantic gateway boundary for planned-branch core," while intentionally leaving Branch Memory attachment/loading and Graphite tracking gateway extraction as follow-up slices. The implementation preserves user-visible planned-branch behavior and narrows raw Git command ownership to the real adapter:

- `RealPlannedBranchGitGateway` owns the exact Git subprocess protocols previously spread across `planned-branch-creation.ts`, `source-plan-file.ts`, `attached-plan.ts`, and `plan-persistence.ts`;
- planned-branch create/source-plan/load-plan flows now accept optional semantic Git gateway injection while preserving existing `PlanCommandExecApi` call compatibility;
- the CLI context carries both the command executor and semantic Git gateway, allowing scenario tests to model Git state without scripting raw Git calls;
- core and scenario tests use an in-memory Git fake for Git facts and branch state;
- gateway tests preserve exact Git command protocol expectations, including timeouts and missing-branch/default-origin behavior.

Evidence considered: working-tree diff on `planned-branch-git-gateway-boundary` with Graphite parent `shared-content-slug-derivation-planned-branch`. The branch contains local uncommitted implementation changes in `ts/packages/planned-branch/src/`, new planned-branch gateway tests/fakes, and this Objective update. No PR exists for this branch yet; PR evidence was unavailable and not required.

Verification: `cd ts/packages/planned-branch && bun test`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue the semantic gateway row with the remaining planned-branch-owned Branch Memory attachment/loading and Graphite tracking gateway slices. The Objective remains open because those gateway slices and the public skills/docs accuracy pass remain active work.
