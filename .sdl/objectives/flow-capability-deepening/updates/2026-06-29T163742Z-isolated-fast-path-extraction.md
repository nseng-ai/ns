# Isolated Fast-Path Landing Extracted

## Summary

Flow land now delegates isolated single-PR fast-path landing to `ts/packages/capabilities/flow/src/land/isolated-fast-path.ts`. The new internal module owns the PR view loading/parsing, isolated-stack predicate, dry-run/refusal/squash-merge behavior, and fast-path notification/progress routing.

`ts/packages/capabilities/flow/src/land.ts` remains the command/CLI façade: command registration, argument parsing, top-level no-op/fast-path/chunked/stack dispatch, CLI result-block wiring, upfront stack confirmation, and post-landing slot cleanup sequencing stay there.

## Objective Impact

This advances the roadmap row “Decompose Flow land command shells from land-stack domain orchestration.” The row stays open because the next meaningful step is still a fake-driven land-stack/domain seam and final cleanup/rebaseline, but `src/land.ts` is materially closer to a readable shell/orchestrator.

## Boundary Evidence

- `sdl-flow/api` remains unchanged and continues to re-export `ValidPullRequestView` and `parsePullRequestView` through `./land.ts`.
- `ts/packages/capabilities/flow/package.json` remains unchanged; no private fast-path subpath was exported.
- `loadPullRequest`, `parsePullRequestView`, `ValidPullRequestView`, and `isIsolatedFastPath` remain available from the `land.ts` façade.
- Boundary search for `land/isolated-fast-path`, `isolated-fast-path`, and `capabilities/flow/src/land/` across CCC, `sdl-flow/api`, and Flow package exports returned no matches outside Flow internals.

## Validation

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run test -- land-command`
- `just ts-format-fix` (applied formatter output after initial check found formatting issues)
- `just ts-format-check`
- `just ts-lint`
- `just dprint-check`

## Follow-ups

- Continue the decomposition row with a fake-driven land-stack domain seam rather than further widening `land.ts` or `sdl-flow/api`.
- Rebaseline final API/export cleanliness after the remaining structural slices land.
