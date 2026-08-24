# Worktree-local provider state reframes the GS lifecycle

## Summary

Source inspection and an observed autoslot incident establish that `github/gh-stack` v0.1.0 stores its topology, recorded heads and bases, PR associations, checksum, and lock under the invoking worktree's private Git directory. Linked worktrees share Git branch refs but do not share this provider state or lock. Two worktrees can therefore hold different gh-stack definitions over the same refs and can run provider operations without a repository-wide provider critical section.

The immediate incident initialized a stack in one worktree, moved its branch into a managed Slot, and then attempted submission from the Slot. Git checkout ownership transferred, but stack membership did not, so the destination correctly reported that the branch was not part of a stack. The existing `ns gs list` implementation and documentation also use `<git-common-dir>/gh-stack`, which is not the v0.1.0 provider storage location in a linked worktree.

## Objective Impact

The initial architecture baseline remains valid single-worktree evidence but is no longer sufficient as the complete lifecycle baseline. The Objective now distinguishes repository-shared Git refs, worktree-local provider state and locks, and GitHub remote authority. Every provider observation, mutation, completion claim, and recovery path must be scoped to one provider worktree.

Near-term policy is one stack with one stable provider worktree. Moving a branch is not ownership transfer. A new one-branch stack may be established in a destination Slot only if public-command experiments prove the ordering and postconditions. Existing multi-layer branch-level autoslot must refuse until complete-stack destination establishment, PR-association preservation, and stale-source disposition are proven. Lifecycle code still must not read, copy, merge, mutate, or reconstruct private provider files.

The roadmap adds a provider-worktree architecture correction before further lifecycle expansion and reopens the linked-worktree safety questions around `restack-resolve`. Reconciliation, submit, PR targeting, landing, Pi recovery, and owner-Slot cleanup must all account for peer metadata staleness and independent provider locks. `ns gs list` must stop presenting common-directory state as repository-wide provider inventory.

## Follow-Ups

- Reproduce the storage and lock model in linked disposable worktrees and capture public-command behavior from owning, missing-state, stale, and divergent peer contexts.
- Correct `ns gs list` to current-worktree inventory with explicit provenance, unless a separately designed aggregate inventory defines duplicate and divergence semantics.
- Decide whether the provider-worktree authority change requires a new ADR superseding the affected part of ADR 0061; do not rewrite the accepted ADR.
- Revalidate restack start and continuation from the wrong worktree, branch occupancy, peer shared-ref mutation, and concurrent provider processes before finishing its portable skill and Pi router.
- Redesign autoslot ordering for a new one-branch stack and refuse multi-layer movement until provider-native adoption and source disposition are proven.
- Extend reconciliation, submit, land, and everyday-loop tests with linked-worktree state, lock, recovery, and owner-Slot cleanup scenarios.
