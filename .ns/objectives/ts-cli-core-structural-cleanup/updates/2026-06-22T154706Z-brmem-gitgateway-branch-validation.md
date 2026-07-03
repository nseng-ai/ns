# brmem GitGateway Composition and Branch Validation Unification

## Summary

The brmem/core GitGateway structural cleanup slice is implemented on branch `brmem-core-gitgateway-branch-validation`.

`RealGitBrmemGateway` now requires an options object with explicit `cwd`, `commands`, and `git` seams. Production contexts in brmem, branch-context, and handoff construct one stdin-capable command executor, pass it to core `RealGitGateway`, and share both seams with brmem so generic Git branch facts are delegated while Branch Memory Snapshot object/ref plumbing remains local to brmem.

Branch validation policy is now split by ownership:

- core `GitGateway.validateBranchRef` is the Git branch-ref validity check;
- brmem `validateBranchName` remains a Branch Memory Snapshot Ref encoding pre-check, including the `---` rejection;
- branch-context's handwritten target-branch validator was removed, and branch-context validates target branches through `GitGateway.validateBranchRef` before plan-file I/O, branch creation, or Branch Memory attachment.

## Objective Impact

This completes the roadmap row for composing core `GitGateway` inside `brmem/real-git-gateway.ts` and removes the branch-context duplicate Git branch-name policy covered by this slice. The broader cross-package dedup row for `resolveBranchOrCurrent` and other remaining helpers stays open.

The brmem tests now prove current branch and Git branch-ref validation delegation, preserve the brmem `---` pre-check short-circuit, and keep Snapshot tree/object operations on the injected command executor. Branch-context tests now prove invalid target branches stop before source-file resolution, local branch creation, Graphite tracking, or Branch Memory attachment.

## Follow-Ups

- Continue with the remaining cross-package dedup row: add `resolveBranchOrCurrent` to core and retire the remaining per-package copies.
- Keep brmem's `validateBranchName` documented/treated as Branch Memory Snapshot Ref encoding validation, not as a universal Git branch-name validator.
- If future work broadens core `GitGateway`, do not route brmem's Snapshot tree/ref/object plumbing through high-level Git facts unless there is a separate storage-semantics plan.

Validation evidence: focused `@sdl/brmem`, `@sdl/branch-context`, `@sdl/handoff`, and `@sdl/core` package tests passed; full gates passed with `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-deps-check`, and `just ts-guard`.
