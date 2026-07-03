# Temp-Files Helper Relocated

## Summary

Moved the temporary-file helpers `withTemporaryFile` and `withTemporaryJsonFile` from `@sdl/core/temp-files` to `@sdl/capability-kit/temp-files`. Live consumers in Flow and Roaster now import the Capability Kit subpath directly, and the former kit subpath no longer re-exports through core. The old core source, test file, and `./temp-files` package export were deleted in the same slice.

Behavior coverage moved to `ts/packages/sdl-capability-kit/test/unit/temp-files.test.ts`.

Validation and source-search evidence:

- `rg -n '@sdl/core/temp-files' ts/packages ts/scripts -S --glob '*.ts'` returned no matches.
- `rg -n '"\\./temp-files"' ts/packages/infra/core/package.json` returned no matches.
- `test ! -f ts/packages/infra/core/src/temp-files.ts` passed.
- Targeted checks passed: `pnpm --dir ts --filter @sdl/capability-kit run check`, `pnpm --dir ts --filter @sdl/capability-kit run test`, `pnpm --dir ts --filter @sdl/core run check`, `pnpm --dir ts --filter @sdl/core run test`, `pnpm --dir ts --filter sdl-flow run check`, `pnpm --dir ts --filter @sdl/roaster run check`, and `just ts-deps-check`.
- Broad TS lane passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`.

## Objective Impact

This completes the `temp-files` portion of the runtime-harness/residual roadmap row and removes another filesystem-backed helper door from `@sdl/core`. The chosen home follows the Objective's residual policy for straightforward gateway helpers: the capability-facing helper now lives in `@sdl/capability-kit`, with no compatibility shim in core.

## Follow-Ups

Continue the residual order with `xdg` and `workspace-root`, checking package-tier/dependency evidence before selecting exact target homes. This slice intentionally did not move unrelated residual subpaths such as `xdg`, `workspace-root`, `shell-support`, `text-repair`, `model-slug`, `clock`, or `timers`.
