# Vibechk Internal Options Narrowing

## Summary

Narrowed the `@sdl/vibechk` internal optional-undefined cluster to omission-only optional properties. The slice removed redundant explicit `| undefined` from `CliDeps` dependency overrides, `RealVibechkWorkdirGatewayOptions` constructor overrides, the scenario `RunOptions` helper, and the local `request` test helper model option.

Preserved `CliDeps.env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` because environment maps intentionally carry explicit undefined in their values/contract. Preserved `null` in the runner request helper's `model?: string | null` because `null` remains the normalized no-model value.

Scorecard:

| Scope                       | Metric                              | Before | After |
| --------------------------- | ----------------------------------- | -----: | ----: |
| `ts`                        | Raw optional-undefined properties   |    495 |   482 |
| `ts`                        | Typed explicit-undefined contracts  |     71 |    71 |
| `ts`                        | Legacy preserve markers             |      0 |     0 |
| `ts`                        | Undefined-normalization/check lines |   2308 |  2308 |
| `ts/packages/tools/vibechk` | Raw optional-undefined properties   |     13 |     0 |
| `ts/packages/tools/vibechk` | Typed explicit-undefined contracts  |      1 |     1 |
| `ts/packages/tools/vibechk` | Legacy preserve markers             |      0 |     0 |
| `ts/packages/tools/vibechk` | Undefined-normalization/check lines |     19 |    19 |

Validation:

- `pnpm --dir ts --filter @sdl/vibechk run check` passed.
- `pnpm --dir ts --filter @sdl/vibechk run test` passed: 7 files / 52 tests.
- `pnpm --dir ts run fmt:check -- packages/tools/vibechk/src/cli.ts packages/tools/vibechk/src/repository.ts packages/tools/vibechk/test/support/run-scenario.ts packages/tools/vibechk/test/unit/runners.test.ts` passed.

## Objective Impact

This keeps a coherent package-level cleanup slice under the standing Objective's Runner Policy. It reduces the repo-wide raw optional-undefined score by 13 without changing typed explicit-undefined contracts or adding normalization churn. The semantic claim is that these `vibechk` fields are internal dependency/test-helper options whose consumers already treat omission and present-key `undefined` identically via `??` defaults; omission-only optional properties tell the truth under `exactOptionalPropertyTypes`.

## Follow-Ups

Continue selecting coherent package/subsystem clusters. `env`/process-map fields remain a recurring preserve category unless split behind a normalized internal type or encoded with `ExplicitUndefined<"env-map", T>`.
