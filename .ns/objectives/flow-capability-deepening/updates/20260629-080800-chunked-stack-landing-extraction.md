# Chunked Stack Landing Coordination Extraction

## Summary

Chunked stack landing coordination moved out of `ts/packages/capabilities/flow/src/land-stack.ts` into the internal Flow module `ts/packages/capabilities/flow/src/land-stack/chunked-landing.ts`. Shared pre-merge preparation and failure presentation now live in `ts/packages/capabilities/flow/src/land-stack/landing-coordination.ts` so both single-plan and chunked paths can reuse them without widening `sdl-flow/api`.

## Objective Impact

This advances the roadmap row “Decompose Flow land command shells from land-stack domain orchestration” by shrinking `src/land-stack.ts` back toward a façade/top-level orchestrator and giving the auto-chunk path a clearer Flow-owned phase module. Public command/API behavior stayed stable: no package exports or `sdl-flow/api` exports were added, and CCC continues to consume Flow through `sdl-flow/api`.

Validation evidence:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `just ts-format-check`
- `just ts-lint`

## Follow-Ups

Single-plan extraction, `src/land.ts` shell cleanup, and a fake-driven land-stack domain seam remain. The broader decomposition row should stay open until those follow-up slices land or are deliberately descoped.
