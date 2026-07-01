# Roadmap

## Work

- [ ] Land the pilot rename on branch `core-time-topology-circle-consolidation` (PR #2677): the manifest fields are `sdl.subpackages` and `sdl.remainder`, `@sdl/core` declares `subpackages: ["time"]` with `remainder: true`, `extract-graph.mjs` splits only declared subpackages plus the declared remainder, and the TypeScript style guard reads the same config instead of hardcoding `@sdl/core`.
  - Policy: direct execution; field names, the term "remainder subpackage", and pilot scope are all user-confirmed.
  - Evidence: topology report shows `@sdl/core/time` and no auto-discovered directory circles; guard tests and `just` pass.
- [ ] Document the vocabulary: add **Subpackage**, **Container package**, and **Remainder subpackage** headwords to root `CONTEXT.md`, reconcile the **Topology circle** entry's "source component" phrasing, and record the end-state ADR (published packages as containers; `sdl.subpackages` as manifest source of truth; the declared remainder as the explicit transitional state; properly formed = no remainder).
  - Policy: steer first on final wording, including confirming the remainder mechanic and term; this is the deliberate domain-language slice.
- [ ] Implement the rules-of-the-road guard: every source file in a declaring package must belong to a declared unit (named subpackage or declared remainder); named subpackages must exist as `src/<name>/` directories; a package with no remainder declaration fails on any unassociated code. Keep the check lightweight — declared-state conformance, not new import-graph analysis.
- [ ] Build the upfront decision inventory: one row per workspace package recording containerize (with a proposed subpackage split) or keep flat (with rationale), appended to this roadmap for user approval in a single review pass.
  - Policy: propose splits from code evidence; the user approves the inventory before any conversion slice runs.
- [ ] Execute approved conversion slices package by package: move code under subpackage directories, update exports/imports, declare `sdl.subpackages`, opt into container status, one PR per package via Graphite.
  - Policy: direct execution for approved inventory rows; steer when code reality contradicts the approved split.
  - Evidence: per-package PR; style guard green; `just` passes.

## Parked

- Per-subpackage tier declarations.
- Requiring every subpath export of a properly formed container to resolve into a declared subpackage, repo-wide.
