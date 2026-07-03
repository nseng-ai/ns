# Worktree Refresh Options Narrowing

## Summary

Completed a minimal `worktree-status` refresh-channel cleanup slice.

Removed redundant explicit `| undefined` from `WorktreeStatusRefreshOptions.remoteRefresh`. The construction and consumption path models omission as the only meaningful absent state: callers default options to `{}`, `combineRefreshOptions` returns `{}` for skip/no pending remote refresh, and `remoteRefreshMode` maps omission to `"skip"`. No producer needs to preserve a present-key `undefined` state for this internal refresh option.

Current scoped grep evidence for the active seed areas reports 51 remaining `?: ... | undefined` matches after this slice. The touched `worktree-status` subtree now reports 17 remaining matches with the same grep pattern; those remaining candidates are concentrated in extension dependency/options bags, signals, loaders, diagnostic callbacks, and identity/status seams that need separate normalization or preservation rationale before narrowing.

## Objective Impact

This advances the standing roadmap row to continuously reduce semantically redundant optional-undefined declarations with a small, review-coherent local edit. The reusable classification finding is that internal refresh-mode options can use omission-only optional properties when construction already omits absent refresh state and consumers normalize omission to the default mode.

Validation evidence:

- `just ts-check` passed.
- `just ts-format-check` passed.

## Follow-Ups

- Preserve or defer remaining `worktree-status` option/dependency/signal/loading candidates unless a local construction path can first prove omission-only semantics.
- Continue choosing one coherent internal cluster at a time rather than batching all remaining candidates by syntax.
