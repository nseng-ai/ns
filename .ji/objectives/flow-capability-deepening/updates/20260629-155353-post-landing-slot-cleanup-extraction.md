# Post-Landing Slot Cleanup Extraction

## Summary

Post-landing `--free` slot cleanup moved out of `ts/packages/capabilities/flow/src/land.ts` into the internal Flow module `ts/packages/capabilities/flow/src/land/post-landing-slot-cleanup.ts`. The new module owns the package-private `runPostLandingSlotCleanup(...)` path for managed-slot detection, cleanup confirmation/refusal, `sdl slot free`, local Graphite branch deletion, partial-failure presentation, and success notification.

`ts/packages/capabilities/flow/src/land.ts` remains the public command/CLI façade and top-level dispatcher: it still owns command registration, argument parsing dispatch, CLI adapter/result-block wiring, stack-vs-fast-path selection, isolated single-PR landing, PR parsing/loading, and public land command exports.

## Objective Impact

This advances the roadmap row “Decompose Flow land command shells from land-stack domain orchestration” by removing a bounded cleanup responsibility from `src/land.ts` without widening Flow's public API. The row remains open because isolated single-PR fast-path landing and PR parsing/loading still live in `src/land.ts`.

Boundary evidence:

- `ts/packages/capabilities/flow/src/api.ts` was not changed.
- `ts/packages/capabilities/flow/package.json` was not changed.
- `rg -n 'land/post-landing-slot-cleanup|post-landing-slot-cleanup|capabilities/flow/src/land/' ts/packages/ccc ts/packages/capabilities/flow/src/api.ts ts/packages/capabilities/flow/package.json` returned no matches.

Validation evidence:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run test -- land-command`
- `just ts-format-check`
- `just ts-lint`

## Follow-Ups

Continue decomposing `src/land.ts` in a later slice before marking the roadmap row complete. The expected next areas are isolated single-PR fast-path extraction and/or the fake-driven land-stack domain seam, while keeping `sdl-flow/api` narrow.
