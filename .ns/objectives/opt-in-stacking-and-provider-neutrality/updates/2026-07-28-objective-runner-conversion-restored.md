# Objective Runner conversion restored to active scope

## Summary

The Objective Runner/autorunner Graphite conversion is active work in this Objective. The runner redesign is complete enough that removing its remaining unconditional Graphite dependency no longer risks hardening an interim mechanism.

Current implementation evidence identifies four coupled surfaces: the finish gate requires Graphite tracking, the runner core context requires a `GraphiteBranchGateway`, the ns composition root eagerly constructs `RealGraphiteBranchGateway`, and the child prompt prescribes Graphite-specific branch creation and navigation.

## Objective Impact

Objective Runner remains stack-required for now because the repository-configured provider supplies bookkeeping for the multiple PRs produced by successive steps. Repository configuration is the sole provider authority for all Runner work, so invocations cannot override it and create inconsistent bookkeeping across Objectives or steps. Conversion replaces hard-coded Graphite branch creation and membership with lazily resolved, provider-neutral capabilities; it does not make Runner available in plain-Git mode. With no provider selected, Runner must refuse clearly rather than constructing Graphite or inferring a provider from ambient metadata. If repository configuration later changes, Runner uses the current selection without inspecting, migrating, or rejecting bookkeeping created under the previous provider.

The existing Git-native checks for a non-trunk implementation branch, branch/report consistency, unchanged HEAD, a dirty worktree, a clean index, staging, and staged-diff validity remain independent safety invariants. The active sequence starts with this provider-selected conversion, then continues to Branch Context's eager provider construction and the broader no-provider audit.

## Follow-Ups

- Resolve repository-configured provider branch-creation and membership capabilities lazily at the Runner composition root, with no invocation override.
- Replace Graphite-specific child instructions with guidance supplied by the selected provider.
- Prove runner begin/finish through an injected provider adapter, explicit no-provider refusal, and no eager Graphite construction.
