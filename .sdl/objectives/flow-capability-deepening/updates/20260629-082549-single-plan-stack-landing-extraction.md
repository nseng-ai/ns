# Single-Plan Stack Landing Extraction

## Summary

Single-plan stack landing coordination moved out of `ts/packages/capabilities/flow/src/land-stack.ts` into the internal Flow module `ts/packages/capabilities/flow/src/land-stack/single-plan-landing.ts`. The new module owns the package-private `executeSinglePlanLanding(...)` path for dry-run presentation, confirmation/refusal, pre-merge preparation, merge-loop execution, failure presentation, and success presentation.

`ts/packages/capabilities/flow/src/land-stack.ts` remains the public façade/dispatcher: it still owns help, argument parsing/completions, renderer registration, command-stream setup, preflight/load shape handling, auto-chunk dispatch, and public land-stack exports.

## Objective Impact

This advances the roadmap row “Decompose Flow land command shells from land-stack domain orchestration” by shrinking `src/land-stack.ts` toward a façade and matching the prior chunked extraction with a single-plan internal module. Public command/API behavior stayed stable: no package exports or `sdl-flow/api` exports were added, and CCC continues to consume Flow through `sdl-flow/api` rather than private Flow modules.

Boundary evidence:

- `ts/packages/capabilities/flow/src/api.ts` was not changed.
- `ts/packages/capabilities/flow/package.json` was not changed.
- `rg -n 'land-stack/single-plan-landing|capabilities/flow/src/land-stack' ts/packages/ccc ts/packages/capabilities/flow/src/api.ts ts/packages/capabilities/flow/package.json` returned no matches.

Validation evidence:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `just ts-format-check`
- `just ts-lint`

## Follow-Ups

`src/land.ts` shell cleanup and a fake-driven land-stack domain seam remain. The broader decomposition row should stay open until those follow-up slices land or are deliberately descoped.
