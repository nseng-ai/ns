# CLI Entry Runtime Harness Relocated

## Summary

`@sdl/cli-runtime` now owns the CLI runtime harness helpers formerly exported by `@sdl/core/cli-entry`. The moved package exports `defineCli`, `runOperationCommand`, `runClinkrCommand`, `isDirectCliInvocation`, and the associated entrypoint types from its root export. All live consumers now import `@sdl/cli-runtime`; the old `@sdl/core` source, test, and `./cli-entry` export were deleted.

Validation/source-search evidence:

- `pnpm --dir ts --filter @sdl/cli-runtime run check`
- `pnpm --dir ts --filter @sdl/cli-runtime run test`
- `pnpm --dir ts --filter @sdl/core run check`
- `pnpm --dir ts --filter @sdl/core run test`
- `rg -n '@sdl/core/cli-entry' ts/packages ts/scripts -S --glob '*.ts'` produced no matches.
- `rg -n '"\\./cli-entry"' ts/packages/infra/core/package.json` produced no matches.
- `test ! -f ts/packages/infra/core/src/cli-entry.ts` passed.

## Objective Impact

This completes the `cli-entry` portion of the runtime-harness/residual roadmap row and removes one more non-pure export from `@sdl/core`. The selected home is a neutral CLI-runtime infra package rather than the kernel so neutral-infra packages and standalone tools can share the boot harness without depending upward on SDK/kernel tiers.

## Follow-Ups

Classify or move the remaining residual subpaths in later slices: `stdin`, `clock`, `timers`, XDG/temp/workspace/shell helpers, mixed `model-slug`/`machine-envelope`, `runner-usage`, `branch-slug`, and `brmem-cli`; then complete the final `@sdl/core` purity proof.
