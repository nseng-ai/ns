# Flow API Seam and CCC Repoint

## Summary

The current branch adds the first curated Flow Capability API seam for CCC and moves CCC-owned orchestration entrypoints up into Flow ownership:

- `ts/packages/capabilities/flow/src/api.ts` introduces `sdl-flow/api` as the in-process Flow API for checkpoint autobranch orchestration. It defines the request/input/result vocabulary and a cohesive checkpoint operation that chooses dirty-worktree versus latest-commit behavior from the current worktree snapshot.
- CCC runtime command paths now import the Flow API or Flow-owned entrypoints rather than owning those implementations directly. `ts/packages/ccc/src/autobranch/flow.ts` and `ts/packages/ccc/src/cli.ts` consume `sdl-flow/api`; `ts/packages/ccc/src/autoslot.ts`, `land.ts`, `trunk-pull.ts`, and `land-stack/*` are reduced to compatibility re-exports from `sdl-flow/*`.
- Flow now owns autoslot, land, trunk-pull, CLI I/O adaptation, slot checkout, land-stack orchestration, and land-stack presentation modules under `ts/packages/capabilities/flow/src/*`.
- The branch updates Flow/CCC package dependencies and exports so those runtime paths resolve through Flow.

PR evidence:

- PR #2341: "Extract Flow orchestration into `ts/packages/capabilities/flow`" — open PR evidence for the Flow API seam and CCC runtime repoint to Flow-owned entrypoints.

## Objective Impact

This completes the roadmap row to design the Flow Capability API seam for CCC. The chosen initial seam is `sdl-flow/api` for checkpoint autobranch behavior, with command-facing orchestration kept separate under Flow's CLI/export subpaths. It also partially advances the autobranch fold row: CCC runtime consumers have been repointed through Flow, but the implementation remains transitional because `sdl-flow/api`, Flow command code, and CCC autobranch tests still import `@sdl/autobranch/*` while the package fold is incomplete.

The update de-risks the assumption that a Flow Capability API is the right CCC seam, but confirms the risk that migration needs intermediate compatibility exports: CCC has been made a compatibility layer first, while Flow still delegates to old autobranch internals until the next slice.

## Follow-Ups

- Move the `@sdl/autobranch` dirty-worktree/latest-commit implementation and tests under Flow ownership so `sdl-flow/api` no longer delegates to the old package.
- Repoint or relocate CCC autobranch tests that still import `@sdl/autobranch/*` directly.
- After the autobranch implementation moves, remove or reclassify stale `@sdl/autobranch` package exports, package-tier/style-guard treatment, kernel jiti aliases, and manifest edges.
- Keep submit/PR-description and Graphite submit movement as separate slices; this branch did not move `@sdl/core/submit` or `@sdl/graphite/submit` policy.
