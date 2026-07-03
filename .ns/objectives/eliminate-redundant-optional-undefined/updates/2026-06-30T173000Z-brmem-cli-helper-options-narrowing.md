# Brmem CLI Helper Options Narrowing

## Summary

Narrowed a coherent `@sdl/brmem` internal CLI/helper option slice from raw optional `| undefined` to omission-only optional properties, while preserving environment maps as typed explicit-undefined contracts.

Changed fields:

- `PrepareEntryContentSourceOptions.stdin`, `.file`, and `.force`.
- `PutEntryFromFileOptions.sourceReader` and `.force`.
- `CliDeps.context`, `.cwd`, `.stdin`, `.sourceReader`, `.interaction`, `.stdout`, and `.stderr`.
- `createRealBrmemContext` `cwd` option.
- `RealBrmemPromptResolver` constructor `commands` and `git` options.
- `BrmemErrorInfo.displayCommand`.

Environment-map fields in `CliDeps`, `createRealBrmemContext`, and `RealBrmemPromptResolver` are now `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` instead of raw optional-undefined declarations. Two producer sites now omit absent optional keys with `optionalEntry`: `putEntryFromFile` omits absent `force`, and `runPut` omits absent `file` before calling the narrowed content-preparation helper.

Scorecard, measured with `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                            | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| -------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                      |                               308 |                                 83 |                       0 |                                2292 |
| `ts` after                       |                               289 |                                 86 |                       0 |                                2292 |
| `ts/packages/infra/brmem` before |                                60 |                                  0 |                       0 |                                  88 |
| `ts/packages/infra/brmem` after  |                                41 |                                  3 |                       0 |                                  88 |

Validation:

- `pnpm --dir ts --filter @sdl/brmem run check` passed.
- `pnpm --dir ts --filter @sdl/brmem run test` passed: 16 files / 107 tests.
- `pnpm --dir ts run fmt:check -- packages/infra/brmem/src/put-entry-from-file.ts packages/infra/brmem/src/operations/put.ts packages/infra/brmem/src/cli.ts packages/infra/brmem/src/context.ts packages/infra/brmem/src/prompt-resolution.ts packages/infra/brmem/src/contracts.ts` passed.
- `pnpm --dir ts run lint` passed.

## Objective Impact

This advances the continuous cleanup row with a package-local internal helper slice. The semantic claim is that these Brmem CLI/content-source/prompt-resolver/helper fields use omission/defaulting only; present-key `undefined` does not carry separate domain, compatibility, external-schema, or durable-record meaning. The environment map remains a deliberate explicit-present-undefined category and is now encoded as typed `ExplicitUndefined` rather than raw debt.

The scoped raw optional-undefined count dropped by 19 while preserving the larger Brmem gateway, fake, real-git, and scenario-test mirror surfaces for separate classification. The undefined-normalization/check score stayed flat because this slice reused the shared `optionalEntry` helper at producer boundaries instead of adding new ad hoc `=== undefined` checks.

## Follow-Ups

Remaining `@sdl/brmem` raw candidates are mainly public gateway request shapes, fake/real gateway mirrors, git subprocess helper options, and scenario fixtures. Future slices should classify those as a separate gateway/API-compatibility cluster rather than batching them with internal CLI helper options. Continue encoding environment maps as `ExplicitUndefined<"env-map", ...>` when explicit present-key `undefined` is meaningful.
