# Flow Graphite Ownership Disposition

## Summary

A6 chooses lower-package delegation for Graphite/stack-ops rather than introducing a flow-local `gt` seam. The project-local flow extension should keep treating Graphite behavior as owned by narrower packages and orchestration layers:

- `sdl flow submit` delegates through `@sdl/sdl/submit`, which constructs `@sdl/graphite/submit` gateways for submit, restack, current-PR, branch-info, and metadata-prewrite behavior.
- `sdl flow land` delegates stack landing orchestration to `@sdl/ccc/land` instead of promoting a public landing or Graphite-stack SDK.
- `sdl flow autobranch` and `sdl flow branch-latest-commit` delegate branch-creation flows to `@sdl/autobranch` with injected command execution.

This is a decision-only update. No production code moved, no public `@sdl/sdl/sdk` Graphite helper was added, and no `.sdl/extensions/flow/src/shared/gt.ts` or equivalent flow-local Graphite helper was introduced.

## Objective Impact

This completes A6 for the flow shared-code track. The accepted flow-level disposition is that Graphite/stack behavior remains behind lower owners rather than becoming a new project-local shared helper:

- Flow submit is already a readable wrapper over `@sdl/sdl/submit`; Graphite submit mechanics remain owned by `@sdl/graphite/submit`.
- Flow land remains an accepted lower-orchestration delegation to CCC.
- Flow autobranch remains an accepted dependency on `@sdl/autobranch` from the extension boundary.
- The current direct `gt` calls inside `@sdl/autobranch` are recorded as lower-package ownership debt, not as a precedent for flow owning direct `gt` execution.
- A7 remains the next open flow shared-code row and should address only CCC CLI delegation boilerplate.

## Evidence

Targeted source inspection confirmed the current ownership paths:

- `.sdl/extensions/flow/src/commands/submit.ts` describes `gt submit` behavior to users but delegates execution to `runSubmitCommand()` from `@sdl/sdl/submit`.
- `ts/packages/sdl/src/submit.ts` constructs `RealSubmitGateway` and `RealSubmitMetadataGateway` from `@sdl/graphite/submit`, while keeping GitHub PR access in `@sdl/core/submit`.
- `ts/packages/graphite/src/submit/submit.ts` owns the real Graphite submit/restack/current-PR command adapter behavior.
- `.sdl/extensions/flow/src/commands/land.ts` delegates to `runLandCli()` from `@sdl/ccc/land`.
- `.sdl/extensions/flow/src/commands/autobranch.ts` delegates to `runDirtyAutobranchFlow()` from `@sdl/autobranch/dirty-worktree`.
- `.sdl/extensions/flow/src/commands/branch-latest-commit.ts` delegates to `createLatestCommitAutobranchFlow()` from `@sdl/autobranch/latest-commit`.
- `ts/packages/autobranch/src/latest-commit-preparation.ts`, `dirty-transaction.ts`, and `latest-commit-transaction.ts` still contain direct `gt` mechanics through injected execution or `@sdl/graphite/branch` helpers.
- `ts/packages/graphite/CONTEXT.md` still says direct `gt` invocation conceptually belongs in `@sdl/graphite`.

The important distinction is that flow itself is not the Graphite gateway owner. The remaining mismatch is lower-package debt in `@sdl/autobranch`, which should be resolved by routing direct `gt` mechanics through `@sdl/graphite` later rather than by adding a flow-shared Graphite seam now.

## Rejected Alternatives

- **Create `.sdl/extensions/flow/src/shared/gt.ts`.** Rejected because submit already delegates to package-owned Graphite submit gateways, land delegates to CCC, and autobranch is already a lower-package flow dependency. A flow helper would duplicate or bypass the package boundary that `@sdl/graphite` is meant to own.
- **Promote a public `@sdl/sdl/sdk` Graphite helper.** Rejected because this Objective has not proven a portable author API for Graphite stack operations. The command-first rule keeps SDK promotion behind repeated evidence or a documented single-command necessity.
- **Migrate `@sdl/autobranch` direct `gt` operations immediately.** Rejected for this slice because A6 was a steer-first disposition row. The autobranch routing issue is real ownership debt, but moving it belongs in a focused lower-package follow-up.
- **Treat CCC as the generic Graphite owner.** Rejected because CCC owns orchestration such as landing, while lower primitive Graphite command adapters belong in `@sdl/graphite`.

## Follow-Ups

- Route remaining `@sdl/autobranch` direct `gt` mechanics through `@sdl/graphite` in a future lower-package cleanup.
- Keep A7 focused on extracting the repeated CCC CLI delegation adapter pattern from `land`, `autoslot`, and `pull-trunk`; do not reopen A6 by creating a Graphite helper there.
- Leave broader docs/context readiness refresh to the later Objective row; this update only records the A6 ownership decision.
