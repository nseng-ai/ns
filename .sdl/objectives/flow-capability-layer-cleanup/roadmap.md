# Roadmap

## Work

- [x] Inventory and classify current misplaced surfaces.
  - Evidence recorded in `updates/20260628T220604Z-misplaced-surface-inventory.md`: runtime/test imports, package export maps, manifest tiers, style-guard graph membership, and jiti aliases were classified. The inventory confirms Flow-owned PR-description/submit/autobranch policy currently leaks through `@sdl/core/submit`, `@sdl/graphite/submit`, and `@sdl/autobranch/*`; shared result/error helpers should move to Capability Kit; low-level Graphite/GitHub/Git mechanics need deliberate split decisions during the move slices.

- [ ] Design the Flow Capability API seam for CCC.
  - Decide the cohesive API shape for CCC-needed submit/autobranch behavior, keeping command faces separate from in-process Capability API consumption. Evidence should show CCC can consume Flow as a provider capability without direct imports of `@sdl/autobranch/*` or private Flow internals.

- [ ] Move submit and PR-description policy from `@sdl/core/submit` into Flow ownership.
  - Flow should own PR-description generation policy, generated-region behavior, prompt/model env handling, Flow-facing `GithubPrGateway` seam usage, and regenerate/submit orchestration. Keep only policy-free reusable protocol mechanics in neutral infra when justified. Evidence: Flow command/API tests pass and stale neutral-infra submit-policy exports are gone.

- [ ] Move Graphite submit orchestration from `@sdl/graphite/submit` into Flow ownership.
  - Submit/restack orchestration, PR metadata prewrite, and submit failure transcript shaping belong with Flow. Preserve Graphite-neutral metadata/stack/status helpers in `@sdl/graphite`. Evidence: Flow submit tests cover the moved behavior and `@sdl/graphite` no longer exports Flow submit policy.

- [ ] Fold `@sdl/autobranch` into Flow and repoint consumers.
  - Move autobranch branch creation/latest-commit/checkpoint-message policy to Flow, repoint Flow command code and CCC consumers through the Flow Capability API, and remove or reclassify obsolete package-tier/style-guard treatment for `@sdl/autobranch`. Evidence: stale import searches for `@sdl/autobranch` are clean or only historical/test fixtures explicitly accepted during migration.

- [ ] Move shared capability gateway result/error substrate into `@sdl/capability-kit`.
  - Extract capability-oriented `ErrorInfo` / `GatewayResult` / command-failure helpers from submit-specific or neutral-infra locations into Capability Kit. Keep `@sdl/core/result` minimal and generic only where standalone tools need it. Evidence: capability packages import capability gateway shapes from `@sdl/capability-kit`, not `@sdl/core/submit` aliases.

- [ ] Rebaseline package tiers, import guards, and docs/context.
  - Update `sdl.tier`, dependency manifests, export maps, TypeScript style-guard/package-tier expectations, and forward-looking context/docs so they match the new Flow/Capability Kit boundary. Evidence: relevant guard checks pass and parent `sdl-extension-architecture` can be updated with the child completion evidence if needed.

## Parked

- `@sdl/cmux` Pi-shaped type placement review. Keep `CmuxGateway` neutral; split host-shaped types later only if a separate Objective chooses that cleanup.
- `@sdl/core/brmem-cli` process-boundary cleanup. Consider moving/absorbing into `@sdl/brmem` later; not part of this Flow/Capability Kit migration unless it blocks the result/error substrate move.
- Generic GitHub capability package. ADR 0016 rejected this; do not revive it as part of this Objective.
- Moving neutral Git/exec/Graphite metadata/stack/status/Branch Memory storage primitives into Capability Kit. These remain neutral unless future evidence proves otherwise.
