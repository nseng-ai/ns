# Local Trunk Composability Supersedes Refresh

## Summary

Herdr launch workflows now use existing local Git state only. Named `main` or `master` selects the configured local Graphite trunk automatically; another named branch offers current branch or local trunk; detached HEAD and current-branch lookup failure offer confirmed local-trunk fallback. Herdr does not inspect an upstream, fetch, or refresh trunk.

This decision supersedes the refreshed-trunk behavior recorded by the earlier contextual-launch completion update. Those Semantic Updates remain immutable historical evidence.

## Objective Impact

The contextual command catalog remains unchanged: prompt-to-space, plan-to-space, and plan-to-tab still share one invocation-time branch-basis policy. The trunk basis now resolves the configured Graphite trunk and its exact existing local SHA, then supplies that coherent start point and Graphite parent to tracked-branch or Branch Context creation.

This reduces workflow complexity through composition: users update local trunk separately when desired, and Herdr launches from the state already present. Fake-driven tests prove local-trunk prompt and plan launches, both plan destinations, named trunk automatic selection, detached/failure fallback, no upstream inspection, and no fetch during execution or dry-run.

## Follow-Ups

No implementation follow-up remains for this decision. Objective closure remains blocked only by the known immutable legacy-update checker incompatibility.
