# brmem-cli Runner Collapse Partially Recorded

## Summary

The current stack includes the `@sdl/core/brmem-cli` runner simplification that the roadmap still treated as future work. `ts/packages/sdl-core/src/brmem-cli.ts` now exposes a single `runBrmem` path instead of the previous single-candidate framework (`resolveBrmemCommandCandidates`, `runBrmemCandidate`, and `runFirstAvailableBrmemCommand`), and `ts/packages/ccc/src/worktree-status.ts` now calls that single runner directly instead of carrying its own candidate loop.

A repo grep no longer finds the removed candidate APIs or `graphqlErrorsFromJson`. `readOptionalBrmemBooleanField` still remains exported in `ts/packages/sdl-core/src/brmem-cli.ts`, so the roadmap row is now in-progress rather than complete.

## Objective Impact

This advances the separate Branch-Memory cleanup row that follows the branch-context in-process gateway migration. The durable state should no longer describe the whole `@sdl/core/brmem-cli` candidate-framework collapse as unstarted: the runner/candidate-loop pieces are present in the stack, while the remaining semantic work is deleting the last known dead export and then validating the affected consumers.

## Follow-Ups

- Delete `readOptionalBrmemBooleanField` if no consumer remains, and update/remove its focused tests.
- Re-run the relevant TypeScript validation gates for the final dead-export cleanup before marking this roadmap row complete.
