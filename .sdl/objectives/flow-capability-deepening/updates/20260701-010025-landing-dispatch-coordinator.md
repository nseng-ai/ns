# Landing Dispatch Coordinator Extraction

## Summary

Extracted Flow land semantic dispatch from `ts/packages/capabilities/flow/src/land.ts` into private Flow module `ts/packages/capabilities/flow/src/land/landing-dispatch.ts`.

Moved into the new coordinator:

- landing-shape loading and load-failure presentation;
- trunk/no-landing-branches no-op handling;
- isolated fast-path dispatch and post-landing cleanup sequencing;
- chunked vs. normal stack dispatch and post-landing cleanup sequencing;
- upfront stack-mode confirmation policy and confirmation text.

`land.ts` now stays focused on the command shell: command registration, parse/help handling, `ctx.waitForIdle()`, command-stream/progress setup, CLI result-block wiring, and passing prepared runtime APIs into the private coordinator.

No public API/package exports were widened. The new coordinator is not exported from `sdl-flow/api` or `sdl-flow/package.json`, and no CCC/Pi/host consumer imports private Flow internals.

## Validation

Passed:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `just ts-format-check` after `just ts-format-fix`
- `just ts-lint`
- `just ts-check`

Boundary searches:

- `rg -n "\\b(executeStackLanding|LandStackCommandContext|LandStackOutcome|ParsedArgs|registerLandStackRenderer|landArgumentCompletions|parseArgs)\\b" ts/packages/capabilities/flow/src/api.ts ts/packages/ccc ts/packages/pi ts/packages/kernel ts/packages/hosts 2>/dev/null || true` returned no matches.
- `rg -n "sdl-flow/(src|land-stack|land/landing-dispatch)|packages/capabilities/flow/src/(land|land-stack)" ts/packages/ccc ts/packages/pi ts/packages/kernel ts/packages/hosts 2>/dev/null || true` returned no matches.
- `rg -n '"\\./land-stack"|"\\./land/landing-dispatch"' ts/packages/capabilities/flow/package.json ts/packages/ccc/package.json || true` returned no matches.

## Objective Impact

Advances the roadmap row **Decompose Flow land command shells from land-stack domain orchestration**. `land.ts` is now a thinner command/CLI adapter, while Flow-owned landing dispatch lives in a private coordinator beside the existing land helpers.

The row may still need a final rebaseline/closure decision for remaining `src/land-stack.ts` orchestration and future movement toward deeper land-domain seams, but the previously open `src/land.ts` top-level dispatch and upfront confirmation responsibilities have moved out of the command shell.

## Follow-Ups

- Decide whether the open decomposition row is closure-ready after reviewing remaining `src/land-stack.ts` responsibilities.
- Keep `sdl-flow/api` and package exports narrow; do not expose `land/landing-dispatch.ts` or land-stack helpers for consumer convenience.
