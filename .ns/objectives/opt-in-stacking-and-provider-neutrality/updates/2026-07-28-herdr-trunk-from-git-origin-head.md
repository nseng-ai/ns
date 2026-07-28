# Herdr trunk discovery moved to the git origin/HEAD fact; gt trunk removed from the branch gateway

## Summary

Supersedes the design recorded in `2026-07-28-herdr-startup-graphite-decoupling.md` (kept as a historical record): the lazy Graphite-backed trunk resolver, its extension-lifetime success cache, and the `HerdrTrunkBranchResolver` contract were replaced before landing with direct use of the existing git-native trunk fact. Herdr no longer runs `gt trunk` at all.

Durable behavior now:

- Herdr implementation workflows derive the trunk branch from `GitGateway.cachedOriginHeadBranch` — the repository's cached `refs/remotes/origin/HEAD`, read locally with no network refresh — via a small Herdr helper (`src/core/trunk-branch.ts`, `resolveRepoTrunkBranch`). The lookup still happens only after invocation-time branch-basis selection chooses Local trunk, with the invoking command's repository cwd; registration performs no trunk or Graphite work.
- There is no cross-invocation cache: each trunk-selected invocation reads the repo's own cached git fact, which also removes the earlier cross-repository cache-reuse caveat.
- A missing origin/HEAD produces an actionable command-local error (`git remote set-head origin --auto`) and stops that invocation before branch creation, Branch Memory writes, Slot checkout, or Herdr destination mutation; lookup errors surface the git failure message.
- Accepted risk (explicit decision): Graphite's configured trunk is assumed to equal the repo's origin/HEAD default branch. If the two diverge, Herdr local-trunk implementation will use the git fact and misbehave relative to Graphite's view; no gt-based reconciliation is attempted.
- `GraphiteBranchGateway.trunkBranch` had no remaining consumers after this change and was deleted from `@nseng-ai/extension-kit` (interface, `RealGraphiteBranchGateway` implementation, `GraphiteTrunkBranch*` types, in-memory fake state/log, and its tests). The branch gateway now exposes only `checkBranchTracked` and `trackBranch`. Remaining direct `gt trunk` executions live only in explicitly Graphite-scoped surfaces: the Graphite stack loader, Flow land operations, and ns-dev release tooling.

## Objective Impact

This lands the Herdr coupling row in a stronger form than first recorded: Herdr trunk discovery is now fully de-Graphited (git/config fact), not merely lazy, matching the pattern already used by Flow trunk-pull/checkpoint/cp, Objectives, Slots, Branch Context, and Reviews via `cachedOriginHeadBranch`. Herdr's only remaining Graphite dependency is explicit local-trunk branch tracking (`gt track`) inside the selected trunk arm, which belongs to the later `BranchCreationProvider` seam rows. Shrinking `GraphiteBranchGateway` also removes a trunk-shaped method from the provider surface the later capability-split seams must reconcile.

Evidence: Herdr and extension-kit focused typecheck/tests pass (herdr 147 tests incl. new `trunk-branch.test.ts`; extension-kit 297); repo `just ts-check`, `just ts-test` (5921), style guard, format/lint pass; `rg` shows zero `gt trunk`/`trunkBranch(` references under `herdr/`. Local branch `remove-herdr-startup-graphite-coupling` (amends the same slice as the prior update; PRs #3968/#3971 track it).

## Follow-Ups

- The trunk-divergence risk (gt trunk ≠ origin/HEAD) is accepted here for Herdr only; when Flow's generic trunk-discovery row and the provider seams land, revisit whether one shared trunk-fact definition should be stated repo-wide.
- Herdr local-trunk branch creation still tracks through Graphite explicitly; provider selection for it is owned by the `BranchCreationProvider` seam rows.
