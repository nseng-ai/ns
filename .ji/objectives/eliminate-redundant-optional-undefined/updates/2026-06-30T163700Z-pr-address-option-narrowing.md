# PR Address Option Narrowing

## Summary

Narrowed the remaining raw optional-undefined declarations in the PR Address package's local command/helper option cluster:

- `ReadJsonInputTextOptions.filePath`, `fileOptionName`, and `canReadStdin` now use omission-only optional properties.
- `CliDeps.context`, `operations`, `cwd`, `stdin`, `stdout`, and `stderr` now use omission-only optional properties.
- `DefineExecOperationOptions.isRepoContextRequired` now uses an omission-only optional property.
- `runScenario` now conditionally omits `operations` instead of passing a present-key `undefined` through the stricter `CliDeps` contract.

Scorecard:

- Repo-wide scope `ts`: raw optional-undefined properties `403 -> 393`; typed explicit-undefined contracts `83 -> 83`; legacy preserve markers `0 -> 0`; undefined-normalization/check lines `2319 -> 2320`.
- Touched scope `ts/packages/address`: raw optional-undefined properties `10 -> 0`; typed explicit-undefined contracts `3 -> 3`; legacy preserve markers `0 -> 0`; undefined-normalization/check lines `23 -> 24`.

## Objective Impact

This advances the continuous cleanup row with a coherent PR Address internal command/helper option slice. The semantic claim is that the changed fields model absence by omission/defaulting only: JSON input helpers branch on absent file/stdin options, CLI dependency overrides default with `??`, and exec operations use `isRepoContextRequired === true`. Present-key `undefined` has no separate domain, compatibility, external-schema, or durable-record meaning for these fields.

Preserved/deferred categories:

- `optionValue: string | undefined` remains a required key because callers always provide the inline option slot and the value may be absent.
- PR Address environment maps remain explicit contracts through `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` and related gateway environment types.
- The increase in undefined-normalization/check lines is intentional construction normalization in the scenario harness, not new semantic debt.

Validation evidence:

- `pnpm --dir ts --filter @sdl/address run check` passed.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/address/test/unit/json-input.test.ts packages/address/test/scenario` passed: 6 files, 39 tests.
- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.

## Follow-Ups

Continue classifying PR Address environment and gateway option surfaces as explicit environment-map contracts rather than omission-only cleanup candidates. The next autonomous slice should choose another package/subsystem cluster rather than re-opening PR Address raw optional-undefined declarations, which are now at zero in the scoped measurement.
