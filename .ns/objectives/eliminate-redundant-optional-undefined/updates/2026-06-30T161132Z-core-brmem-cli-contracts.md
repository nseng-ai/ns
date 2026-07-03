# Core brmem CLI Optional-Undefined Contracts

## Summary

Normalized the optional-undefined declarations in `ts/packages/infra/core/src/brmem-cli.ts`.

Scorecard before/after:

| Scope                                            | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ------------------------------------------------ | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                                      |                               482 |                                 71 |                       0 |                                2308 |
| `ts` after                                       |                               463 |                                 82 |                       0 |                                2310 |
| `ts/packages/infra/core/src/brmem-cli.ts` before |                                19 |                                  0 |                       0 |                                  16 |
| `ts/packages/infra/core/src/brmem-cli.ts` after  |                                 0 |                                 11 |                       0 |                                  18 |

Fields changed:

- Preserved `env` seams as `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>`.
- Preserved `signal` seams as `ExplicitUndefined<"abort-signal", AbortSignal>`.
- Narrowed omission-only `branch`, `namespace`, and `timeoutMs` fields to plain optional properties.
- Narrowed `parseBrmemListEntries` expected filters and the internal parse options shape to omission-only optional properties.
- Added conditional omission when passing `namespace` / `branch` filters into `parseBrmemListEntries` so exact optional property typing remains honest.

Validation:

- `pnpm --dir ts exec vitest run packages/infra/core/test/brmem-cli.test.ts` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.

## Objective Impact

This slice removes all raw optional-undefined declarations from the core brmem CLI helper file while preserving meaningful explicit-present-undefined support for environment maps and abort signals through typed contracts. The repo-wide raw debt dropped by 19 and the typed explicit contract count rose by 11, making the preserve categories machine-visible instead of raw `?: T | undefined` debt.

The undefined-normalization/check count increased by 2 because `listBrmemEntries` now explicitly omits absent expected filters when constructing the stricter internal parse request. That is intentional producer-side normalization required before narrowing the internal expected-filter type.

## Follow-Ups

- Continue treating environment maps and abort signals as preserve-as-`ExplicitUndefined` categories when they are loose pass-through seams.
- Future slices can inspect remaining `@sdl/core` candidates such as `testing/index.ts`, `workspace-root.ts`, `xdg.ts`, and related helper files, but should classify each package surface before narrowing because some are public utility inputs.
