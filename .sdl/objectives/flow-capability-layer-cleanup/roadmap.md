# Roadmap

## Work

- [x] Inventory and classify current misplaced surfaces.
  - Evidence recorded in `updates/20260628T220604Z-misplaced-surface-inventory.md`: runtime/test imports, package export maps, manifest tiers, style-guard graph membership, and jiti aliases were classified. The inventory confirms Flow-owned PR-description/submit/autobranch policy currently leaks through `@sdl/core/submit`, `@sdl/graphite/submit`, and `@sdl/autobranch/*`; shared result/error helpers should move to Capability Kit; low-level Graphite/GitHub/Git mechanics need deliberate split decisions during the move slices.

- [x] Design the Flow Capability API seam for CCC.
  - Evidence recorded in `updates/20260628T222729Z-flow-api-seam-and-ccc-repoint.md`: `ts/packages/capabilities/flow/src/api.ts` now defines `sdl-flow/api`, the curated in-process checkpoint/autobranch seam for CCC. `ts/packages/ccc/src/autobranch/flow.ts` and `ts/packages/ccc/src/cli.ts` consume it, while CCC runtime compatibility surfaces such as `autoslot`, `land`, `trunk-pull`, and `land-stack/*` re-export Flow-owned entrypoints. The seam is intentionally transitional: `sdl-flow/api`, Flow command code, and CCC autobranch tests still import `@sdl/autobranch/*` until the package fold slice moves that implementation into Flow.

- [ ] Move submit and PR-description policy from `@sdl/core/submit` into Flow ownership.
  - Flow should own PR-description generation policy, generated-region behavior, prompt/model env handling, Flow-facing `GithubPrGateway` seam usage, and regenerate/submit orchestration. Current verified state still has these symbols exported from `ts/packages/infra/core/src/submit` and consumed by Flow/Graphite submit code. Evidence: Flow command/API tests pass and stale neutral-infra submit-policy exports are gone.

- [ ] Move Graphite submit orchestration from `@sdl/graphite/submit` into Flow ownership.
  - Submit/restack orchestration, PR metadata prewrite, and submit failure transcript shaping belong with Flow. Current verified state still has submit orchestration under `ts/packages/infra/graphite/src/submit` and imports from `@sdl/core/submit`. Preserve Graphite-neutral metadata/stack/status helpers in `@sdl/graphite`. Evidence: Flow submit tests cover the moved behavior and `@sdl/graphite` no longer exports Flow submit policy.

- [~] Fold `@sdl/autobranch` into Flow and repoint consumers.
  - CCC runtime consumers have been repointed through `sdl-flow/api` and Flow-owned `sdl-flow/*` exports, but Flow itself still delegates to `@sdl/autobranch/*`, Flow command code still imports autobranch internals, CCC autobranch tests still exercise the old package directly, and `@sdl/autobranch` remains declared as `neutral-infra`. Next work is to move the autobranch implementation and tests under Flow ownership, then remove or reclassify obsolete package-tier/style-guard treatment for `@sdl/autobranch`. Evidence: stale import searches for `@sdl/autobranch` are clean or only historical/test fixtures explicitly accepted during migration.

- [ ] Move shared capability gateway result/error substrate into `@sdl/capability-kit`.
  - Extract capability-oriented `ErrorInfo` / `GatewayResult` / command-failure helpers from submit-specific or neutral-infra locations into Capability Kit. Current verified state still exports submit-specific result aliases from `ts/packages/infra/core/src/submit/result.ts` and command-failure helpers from `ts/packages/infra/core/src/submit/command-failure.ts`, while `ts/packages/sdl-capability-kit/src` does not yet own these shapes. Keep `@sdl/core/result` minimal and generic only where standalone tools need it. Evidence: capability packages import capability gateway shapes from `@sdl/capability-kit`, not `@sdl/core/submit` aliases.

- [ ] Rebaseline package tiers, import guards, and docs/context.
  - Update `sdl.tier`, dependency manifests, export maps, TypeScript style-guard/package-tier expectations, jiti aliases, and forward-looking context/docs so they match the new Flow/Capability Kit boundary. Current verified state still has `@sdl/autobranch` tiered as `neutral-infra`, stale kernel module-loader aliases for submit/autobranch subpaths, and style-guard graph membership for `@sdl/autobranch`. Evidence: relevant guard checks pass and parent `sdl-extension-architecture` can be updated with the child completion evidence if needed.

## Parked

- `@sdl/cmux` Pi-shaped type placement review. Keep `CmuxGateway` neutral; split host-shaped types later only if a separate Objective chooses that cleanup.
- `@sdl/core/brmem-cli` process-boundary cleanup. Consider moving/absorbing into `@sdl/brmem` later; not part of this Flow/Capability Kit migration unless it blocks the result/error substrate move.
- Generic GitHub capability package. ADR 0016 rejected this; do not revive it as part of this Objective.
- Moving neutral Git/exec/Graphite metadata/stack/status/Branch Memory storage primitives into Capability Kit. These remain neutral unless future evidence proves otherwise.
