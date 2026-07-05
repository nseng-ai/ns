# Semantic Update: Kit git worktree-state consolidation

## Summary

The second-wave kit-git row landed on local branch `kit-git-worktree-state-consolidation`.

## Objective Impact

What changed:

- Added kit-owned `git/worktree-state.ts` with fs-seam-injected worktree git-dir resolution, common-dir resolution, HEAD presence facts, operation marker detection, bisect support, and rebase head-name branch recovery.
- Added additive `GitGateway.gitCommonDir` and `GitGateway.previousBranch` methods with real and in-memory implementations.
- Migrated slots operation occupancy detection, previous-branch lookup, and common-dir lookup to kit surfaces.
- Migrated hosts/pi worktree-status admin-dir resolution to the kit helper while preserving the footer's HEAD-required policy and avoiding new marker detection.
- Migrated flow land operation detection to kit fs-state detection, removed the scripted `rev-parse` probe path, threaded the test fs seam through land runtime/context, and added deliberate bisect refusal behavior.
- Updated flow/ccc scenario baselines to remove the retired operation-detection subprocess probes.

Corrected assumption:

- The roadmap row described "triplicate" operation/admin-state logic, but implementation confirmed the duplication was asymmetric: slots had full marker detection plus admin-dir resolution, flow had partial marker detection, and hosts/pi had only admin-dir resolution. The implementation kept that distinction: hosts/pi adopted admin-dir resolution only, while slots and flow adopted operation detection.

Behavior note:

- `flow land` now refuses during an in-progress bisect, matching the user-confirmed fail-safe behavior change. Flow marker semantics now come from file/state existence instead of `rev-parse --verify`, so corrupt or empty marker files refuse in the safe direction.

Validation evidence:

- `pnpm --dir ts --filter @nseng-ai/capability-kit test`
- `pnpm --dir ts --filter @nseng-ai/slots test`
- `pnpm --dir ts --filter @nseng-ai/flow test`
- `pnpm --dir ts --filter @nseng-ai/pi test`
- `pnpm --dir ts --filter @nseng-ai/ccc test`
- `just ts-check`
- `just`
- grep verification: no remaining references to `GIT_OPERATION_MARKERS`, `resolveWorktreeAdminDir`, `gitPathsFromGitFile`, `DetectInProgressOperationOptions`, `defaultPathExists`, or `resolveGitPath` in the touched kit/slots/pi/flow areas.

## Follow-Ups

- None recorded for this semantic update.
