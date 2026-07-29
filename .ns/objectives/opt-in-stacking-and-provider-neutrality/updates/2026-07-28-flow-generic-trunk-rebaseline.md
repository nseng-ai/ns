# Flow generic trunk discovery rebaselined to landed Git facts

## Summary

Objective refresh found that the roadmap and orientation lagged landed ground truth: generic Flow trunk discovery had already moved off Graphite before this Objective record was created. Commit `7fefcbd3ce9042bf02dc53efb885b2c5f04e4d0f` (`Switch Flow Trunk Resolution from Graphite to Cached Git Remote HEAD`) is an ancestor of the refresh target and supplies the implementation provenance.

Current durable behavior is narrower and clearer than the stale row implied:

- Flow `pull-trunk` resolves the trunk through `GitGateway.cachedOriginHeadBranch`, inspects that branch's configured upstream, and performs only git worktree/fetch/pull operations.
- Flow `cp` and submit checkpointing compare the current branch with the same cached `origin/HEAD` fact and fail closed on a missing or unreadable fact before model generation or mutation.
- The scoped trunk-pull/checkpoint source paths construct no Graphite gateway and invoke no `gt` command. Exact-transcript scenarios cover the git-native paths and fail-closed cases; refresh verification ran all 93 Flow test files (863 tests) successfully.
- Flow land still obtains `gt trunk` within its explicitly Graphite stack preflight, and its command path always selects a stack target. That is not generic trunk discovery; it remains work for the discriminated-target and neutral-topology slices.

Provenance: objective-refresh basis target=9ca5f3349633893f542c0e503ed7937eaf3588f7 from=d96a832ac4c74493181b2083f94f3bf741b3317d

## Objective Impact

The Flow generic-trunk roadmap row is complete. The active slice advances to Branch Context's eager provider construction: plain-git is already the default and avoids Graphite calls during execution, but the production composition root still constructs `RealGraphiteBranchGateway` before policy selection.

The refresh also corrected the durable current-state narrative: submit and land remain Graphite-assuming, no provider-selection setting exists in `ns.toml`, neutral capability interfaces and conformance suites have not landed, and the documented neutral vocabulary remains direction rather than implementation evidence.

## Follow-Ups

- Make Branch Context provider construction policy-selected and prove the plain-git production path constructs no Graphite gateway.
- Audit user-facing behavior with no stack provider configured before choosing the broader implementation sequence.
- Keep Flow land's `gt trunk` coupled to the later stack-target/topology migration rather than reopening the completed generic trunk-discovery row.
