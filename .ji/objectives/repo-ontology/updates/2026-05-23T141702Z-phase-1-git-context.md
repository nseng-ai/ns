# Phase 1 — asdl-core Git context landed

## Summary

Appended `## Git` to `packages/asdl-core/CONTEXT.md` as the second asdl-core subdomain context after Clinkr. The section records the Git gateway vocabulary around repo-wide vs worktree-local facts, including:

- `GitGateway`, Bound repo, Repository root, Git common dir, Worktree, and `WorktreeInfo`.
- Branch/current-branch/previous-branch/trunk/ref/start-point distinctions.
- `DetachedHead` and `GitCommandFailure` as `NonIdealState` arms.
- `FileStatus`, `LocalBranchTip`, `CommitSummary`, Patch ID, and `RestructuredFile`.
- Relationships explaining the `branch_exists("feat/x")` bound-repo question vs `get_current_branch(cwd)` worktree-at-cwd question, branch/ref/start-point usage, non-ideal-state handling, snapshot/history reads, and the boundary between Git worktrees and slots vocabulary.

Updated `/CONTEXT-MAP.md` to link `packages/asdl-core/CONTEXT.md#git` and mark the Git H2 as present.

Verification: `just dprint-check` passed; `git diff --check` passed. No production Python code changed.

## Objective Impact

- `roadmap.md`: Phase 1 `## Git` task marked `[x]` with completion evidence.
- `objective.md`: unchanged; durable scope, completion criteria, assumptions, risks, and open questions remain accurate.
- The Branch/ref/start_point ambiguity has a local Git resolution in `packages/asdl-core/CONTEXT.md`; Phase 4 should still decide what, if anything, survives as a map-level ambiguity after `Gt` and `slots` contexts land.

## Follow-Ups

- Next roadmap item: Phase 1 `## Gt` in `packages/asdl-core/CONTEXT.md`.
- During `## Gt`, keep Graphite parent/ancestor/descendant terminology explicitly separate from Git's branch/ref/start-point terms.
- During the future `asdl-slots` session, cross-reference Git **WorktreeInfo** without redefining slots-managed **SlotRecord** as a Git concept.
