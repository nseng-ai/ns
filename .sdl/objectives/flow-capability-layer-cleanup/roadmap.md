# Roadmap

## Work

- [x] Inventory and classify current misplaced surfaces.
  - Evidence recorded in `updates/20260628T220604Z-misplaced-surface-inventory.md`: runtime/test imports, package export maps, manifest tiers, style-guard graph membership, and jiti aliases were classified. The inventory confirms Flow-owned PR-description/submit/autobranch policy currently leaks through `@sdl/core/submit`, `@sdl/graphite/submit`, and `@sdl/autobranch/*`; shared result/error helpers should move to Capability Kit; low-level Graphite/GitHub/Git mechanics need deliberate split decisions during the move slices.

- [x] Design the Flow Capability API seam for CCC.
  - Evidence recorded in `updates/20260628T222729Z-flow-api-seam-and-ccc-repoint.md`: `ts/packages/capabilities/flow/src/api.ts` now defines `sdl-flow/api`, the curated in-process checkpoint/autobranch seam for CCC. `ts/packages/ccc/src/autobranch/flow.ts` and `ts/packages/ccc/src/cli.ts` consume it, while CCC runtime compatibility surfaces such as `autoslot`, `land`, `trunk-pull`, and `land-stack/*` re-export Flow-owned entrypoints. The seam is intentionally transitional: `sdl-flow/api`, Flow command code, and CCC autobranch tests still import `@sdl/autobranch/*` until the package fold slice moves that implementation into Flow.

- [x] Move submit and PR-description policy from `@sdl/core/submit` into Flow ownership.
  - Evidence recorded in `updates/20260629T005506Z-submit-and-pr-description-flow-owned.md`: PR-description generation policy, generated-region behavior, prompt/model env handling, `GithubPrGateway`, and PR-description orchestration moved into `ts/packages/capabilities/flow/src/submit/`; Flow shared seams/tests consume the Flow-owned implementation; `@sdl/core` no longer exports `./submit`; stale package-reference and module-loader alias searches are clean; Flow/default/integration/type/dependency validation passed.

- [x] Move Graphite submit orchestration from `@sdl/graphite/submit` into Flow ownership.
  - Evidence recorded in `updates/20260629T005506Z-submit-and-pr-description-flow-owned.md`: submit/restack orchestration, PR metadata prewrite, submitted-PR formatting/parsing, and submit failure transcript shaping moved into `ts/packages/capabilities/flow/src/submit/`; Graphite-neutral command mechanics remain in `@sdl/graphite/branch`; `@sdl/graphite` no longer exports `./submit`; moved Flow submit tests cover the behavior.

- [x] Fold `@sdl/autobranch` into Flow and repoint consumers.
  - Evidence recorded in `updates/20260629T003527Z-autobranch-folded-into-flow.md`: the dirty-worktree and latest-commit implementation/tests moved under Flow-owned private internals, Flow commands and `sdl-flow/api` use relative Flow imports, CCC no longer carries raw autobranch-internal tests, the old package and manifest/lockfile edges were removed, kernel jiti aliases for `@sdl/autobranch/*` are gone, and style-guard graph membership no longer treats `@sdl/autobranch` as active. Validation included clean stale package-specifier search plus Flow, CCC, kernel module-loader, style-guard integration, typecheck, dependency, format, lint, default test, and integration test gates.

- [x] Move shared capability gateway result/error substrate into `@sdl/capability-kit`.
  - Evidence recorded in `updates/20260629T010702Z-capability-kit-gateway-result-substrate.md`: `@sdl/capability-kit/gateway-result` now exposes capability-facing `ErrorInfo` / `GatewayResult` / `Result` aliases and result constructors as a facade over `@sdl/core/result`, plus the generic `commandFailure` helper. Flow submit code sources the substrate from Capability Kit, and the Flow-local `submit/result.ts` and `submit/command-failure.ts` files were deleted. Validation included Capability Kit and Flow targeted tests, stale-edge searches, typecheck, default tests, integration tests, format, lint, and dependency checks.

- [ ] Rebaseline package tiers, import guards, and docs/context.
  - Update `sdl.tier`, dependency manifests, export maps, TypeScript style-guard/package-tier expectations, jiti aliases, and forward-looking context/docs so they match the new Flow/Capability Kit boundary. Current verified state has removed the old autobranch and submit package/export surfaces, their stale kernel aliases, and the Flow-local gateway result substrate; remaining rebaseline should verify the broader tier/import/docs/context story and prepare Objective closure if completion criteria are satisfied. Evidence: relevant guard checks pass and parent `sdl-extension-architecture` can be updated with the child completion evidence if needed.

## Parked

- `@sdl/cmux` Pi-shaped type placement review. Keep `CmuxGateway` neutral; split host-shaped types later only if a separate Objective chooses that cleanup.
- `@sdl/core/brmem-cli` process-boundary cleanup. Consider moving/absorbing into `@sdl/brmem` later; not part of this Flow/Capability Kit migration unless it blocks the result/error substrate move.
- Generic GitHub capability package. ADR 0016 rejected this; do not revive it as part of this Objective.
- Moving neutral Git/exec/Graphite metadata/stack/status/Branch Memory storage primitives into Capability Kit. These remain neutral unless future evidence proves otherwise.
