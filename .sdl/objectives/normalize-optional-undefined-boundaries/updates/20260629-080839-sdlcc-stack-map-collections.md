# SDLCC Stack Map Collections

## Summary

Completed the SDLCC stack-map internal collection normalization slice. PR #2391 / the current branch diff from `flow-optional-undefined-boundary-pass...HEAD` makes `StackMapBranchNode` require `children`, `slots`, and `cmuxTabs` arrays, initializes empty arrays in the graph and unavailable-model builders, and removes downstream branch-tree `?? []` / optional-chain compensation in traversal, filtering, activation planning, and rendering.

The slice intentionally preserves loader option/input and external parsed cmux tab surfaces, such as `cmuxTabs?: readonly StackMapParsedCmuxTab[] | undefined`, because those are boundary inputs rather than internal branch-node collection facts.

Validation evidence recorded from implementation: `pnpm --dir ts/packages/hosts/sdlcc run test`, `pnpm --dir ts/packages/hosts/sdlcc run check`, `just ts-check`, `just ts-test`, `just ts-format-check`, and `just ts-lint` passed.

## Objective Impact

This completes the `Normalize SDLCC stack-map internal collections` roadmap row. The SDLCC branch-tree modeling question is resolved for this Objective: empty arrays now represent loaded-empty `children`, `slots`, and `cmuxTabs`; omitted collections no longer encode a separate internal state.

This also advances the candidate rebaseline row with SDLCC-specific rationale: the three target optional collection fields and their downstream collection compensation were removed, while option/input surfaces and parsed external payload mirrors remain intentionally out of scope.

Objective PR evidence:

- PR #2391: Require stack-map branch nodes to always include arrays — completes the SDLCC stack-map branch-node collection normalization slice.

## Follow-Ups

- Continue with the remaining non-completed Objective clusters: PR feedback watch state/event normalization and the remaining small internally constructed diagnostics/result model classification.
- Keep the final candidate rebaseline row open until remaining clusters have before/after counts and preserved/deferred rationale.
