# Current-worktree GS inventory corrected

## Summary

`ns gs list` now asks Git for the invoking worktree's absolute `--git-path gh-stack` instead of reading `<git-common-dir>/gh-stack`. Successful structured and human results include the canonical current-worktree provider Git directory as `providerWorktreeGitDir`, including when the current worktree has no provider state.

The focused research note `docs/research/gh-stack-v0.1.0-linked-worktree-inventory.md` records the reproducible v0.1.0 storage observations. Real linked-worktree integration tests prove that two worktrees over shared refs read distinct provider files and that a missing current-worktree file does not fall back to peer state.

## Objective Impact

This completes the inventory correction within the broader Provider-worktree architecture correction roadmap row, which is now active/partial. The experiment confirms the already-recorded three-authority model: repository-shared Git refs, worktree-private provider state, and separate GitHub authority. It does not introduce a repository-wide inventory, peer aggregation, ownership-transfer procedure, or lifecycle use of private provider files.

No new ADR is justified by this slice. ADR 0061's GS-native lifecycle boundary and the later immutable worktree-local-provider-state update already direct lifecycle code to supported provider commands and one explicit provider worktree. The inventory correction implements that current direction without changing the accepted architecture. A superseding ADR remains conditional on later mutating-workflow experiments materially changing it.

Focused validation passed:

- `pnpm --pm-on-fail=ignore --dir ts --filter @nseng-ai/gs run check`
- `pnpm --pm-on-fail=ignore --dir ts --filter @nseng-ai/gs run test` (7 files, 44 tests)
- focused integration Vitest for GS linked-worktree inventory and CLI scenarios (2 files, 11 tests)

The `--pm-on-fail=ignore` flag was needed because the Corepack-provided pnpm is 11.21.0 while the checkout pins 11.8.0; it does not change package behavior.

## Follow-Ups

- Revalidate `restack-resolve` from owning, missing-state, stale, and divergent peer worktrees.
- Characterize independent provider locks and shared-ref mutation during concurrent peer operations.
- Settle stable provider-worktree lifetime, initiating-worktree recovery, safe Slot destination establishment, and source disposition before implementing autobranch or autoslot changes.
