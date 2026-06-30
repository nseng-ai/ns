# Pre-Merge Submit/Restack Extraction

## Summary

Flow's stack landing pre-merge submit/restack maintenance now lives in a Flow-private module:

- Added `ts/packages/capabilities/flow/src/land-stack/pre-merge-submit.ts` for `PreMergeConfirmation`, `confirmAndSubmitRequiredPrUpdates`, submit/update details formatting, and submit/restack residual formatting helpers.
- Reduced `landing-operations.ts` by removing submit/restack confirmation/execution ownership while leaving managed-slot cleanup, residual pre-merge composition, merge-loop state, backup refs, branch deletion/restack maintenance, and other merge-loop logic in place.
- Updated Flow-internal callers to import submit/restack pre-merge symbols from the new private module.
- Kept `sdl-flow/api`, `sdl-flow/package.json`, CCC consumption, and durable CCC-era ref names unchanged.

## Evidence

Validation run in this slice:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test -- land-stack-command-scenarios`
- `pnpm --dir ts --filter sdl-flow run test -- land-stack-helpers`
- `pnpm --dir ts --filter sdl-flow run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`

Boundary checks:

- `git diff -- ts/packages/capabilities/flow/src/api.ts ts/packages/capabilities/flow/package.json` returned no diff.
- `rg -n "pre-merge-submit|capabilities/flow/src/land-stack" ts/packages/ccc ts/packages/capabilities/flow/src/api.ts ts/packages/capabilities/flow/package.json` returned no results.

## Objective Impact

This advances the Flow land-stack orchestration decomposition row by giving submit/restack pre-merge maintenance a narrower owner while preserving the curated Flow API boundary. Remaining follow-up slices can still target merge-loop execution, backup refs, branch deletion/restack maintenance, or deliberate future `sdl-land` seams without this slice moving mutation-heavy command execution out of Flow.
