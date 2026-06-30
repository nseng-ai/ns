# Stdin Runtime Helper Relocated

## Summary

Moved the concrete stdin helpers `readStdin` and `readStdinLine` from `@sdl/core/stdin` to the `@sdl/cli-runtime` root export. All live repository imports now use `@sdl/cli-runtime`, and the old core stdin source, package export, and core test door were removed.

Equivalent `readStdinLine` behavior coverage now lives under `ts/packages/infra/cli-runtime/test/stdin.test.ts`.

## Objective Impact

This removes the process-stdin helper from `@sdl/core`, advancing the neutral-infra invariant that core should not own concrete process/CLI I/O helpers. New `@sdl/cli-runtime` package dependencies were added to `@sdl/slot` and `@sdl/handoff`, where the imports are confined to real context-builder code that already wires host-facing services.

Validation and source-search evidence:

- `rg -n '@sdl/core/stdin' ts/packages ts/scripts --glob '*.ts' -S` returned no matches.
- `rg -n '"\\./stdin"' ts/packages/infra/core/package.json` returned no matches.
- `test ! -f ts/packages/infra/core/src/stdin.ts` passed.
- Targeted checks passed: `pnpm --dir ts --filter @sdl/cli-runtime run check`, `pnpm --dir ts --filter @sdl/cli-runtime run test`, `pnpm --dir ts --filter @sdl/core run check`, `pnpm --dir ts --filter @sdl/core run test`, `pnpm --dir ts --filter @sdl/slot run check`, `pnpm --dir ts --filter @sdl/handoff run check`, and `just ts-deps-check`.
- Broad TS lane passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`.

## Follow-Ups

None for this stdin slice. Remaining residual `@sdl/core` subpaths should be classified and moved independently under the Objective roadmap; this update intentionally did not move unrelated residual subpaths such as `clock`, `timers`, or `xdg`.
