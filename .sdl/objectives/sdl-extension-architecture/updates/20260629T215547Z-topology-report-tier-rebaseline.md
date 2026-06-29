# Topology report tier rebaseline

## Summary

The local working tree contains a focused update to `skills/architecture-topology-report/scripts/extract-graph.mjs` that aligns the architecture topology report with the current Phase 2 graph vocabulary:

- the report now models `capability-gateway-backend` as a distinct allowed tier for real gateway backend packages such as `@sdl/git`/`@sdl/github`-style adapters, rather than treating all such edges as transitional or neutral-infra;
- the old report-level `transitional` tier policy is removed from the tier lattice, matching the architecture direction that `@sdl/domain-primitives-transitional` is temporary debt rather than a durable graph tier;
- selected known violating edges are reported as accepted `debt` rather than hard tier-policy failures: `@sdl/ccc` → `@sdl/pi`, `@sdl/kernel` → `@sdl/slot`, `@sdl/brmem` → `@sdl/capability-kit`, and `@sdl/brmem` → `@sdl/git`.

Evidence basis: uncommitted diff on `master` in `skills/architecture-topology-report/scripts/extract-graph.mjs`; no committed branch diff beyond `master...HEAD` was present.

## Objective Impact

This does not complete a Phase 2 roadmap row, but it sharpens Step 5/Step 6 evidence gathering: topology reporting can distinguish real gateway-backend placement and explicitly tracked debt from hard graph violations. The remaining Objective work is unchanged: finish broader `ccc` clean-consumer conversion and retire `@sdl/domain-primitives-transitional` only after live consumers are gone.

The parent architecture guidance should continue to treat `@sdl/domain-primitives-transitional` as deletion-bound and avoid adding new transitional consumers.

## Follow-Ups

- Keep the report's accepted-debt list in sync with the source-of-truth graph guard/debt policy as the remaining Step 5 work lands.
- Do not treat this report rebaseline as permission to preserve transitional-package consumers; Step 6 still requires deleting `@sdl/domain-primitives-transitional` once the graph is ready.
