# Final API/Export Cleanliness Rebaseline

## Summary

Removed the remaining Flow land-stack implementation exports from `sdl-flow/api` and deleted the unused CCC land-stack shim.

Removed `sdl-flow/api` exports:

- `ExecuteStackLandingOptions`
- `LandStackExtensionAPI`
- `executeStackLanding`
- `landArgumentCompletions`
- `parseArgs`
- `registerLandStackRenderer`
- `LandStackCommandContext`
- `ParsedArgs`
- `LandStackOutcome`
- `LandStackResult`

Deleted `ts/packages/ccc/src/land-stack.ts`; `@sdl/ccc` still exposes no `./land-stack` package export. While validating CCC land tests, updated stale CCC test fixtures from the retired `refs/ccc/land-backup*` namespace to the current `refs/sdl/flow-land-backup*` namespace; no runtime fallback or compatibility shim was reintroduced.

Validation passed:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `just ts-check`
- `just ts-lint`
- `just ts-format-check` after `just ts-format-fix`

Boundary searches are clean for removed `sdl-flow/api` land-stack symbols, external CCC/Pi/host consumers of those symbols, private Flow land-stack imports from CCC/Pi/host packages, and `./land-stack` package exports in `sdl-flow` or `@sdl/ccc`.

## Objective Impact

Completes the roadmap row **Final API/export cleanliness rebaseline**: `sdl-flow/api` now keeps land command façade, autoslot, autobranch, and trunk-pull surfaces while no longer exporting land-stack internals or CCC-era helper leaks. Package exports remain narrow; `sdl-flow/package.json` still exposes `./api`, shared output, and command-loader entries, not `./land-stack`.

The broader **Decompose Flow land command shells from land-stack domain orchestration** row remains open: Flow still owns command registration, CLI adapter/result-block wiring, top-level landing dispatch, upfront stack confirmation, mutation-heavy landing orchestration, and post-landing cleanup sequencing.

## Follow-Ups

- Continue decomposition work in Flow-owned land command shells separately from this API/export cleanup.
- Keep CCC and Pi consumers on `sdl-flow/api` command-facing surfaces; do not re-add land-stack internals or old backup-ref compatibility surfaces without a new explicit decision.
