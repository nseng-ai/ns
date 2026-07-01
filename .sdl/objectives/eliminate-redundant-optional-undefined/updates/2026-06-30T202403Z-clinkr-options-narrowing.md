# Clinkr Option Override Narrowing

## Summary

Narrowed Clinkr-owned option/override/test-helper shapes so omission is the only absent state for fields whose consumers already treated present-key `undefined` the same as absence.

Scorecard:

- Repo typed optional-undefined properties (`rg "\\?:[^;=\\n]*\\| undefined" ts -g '*.ts' | wc -l`): 262 → 251.
- Repo undefined-normalization/check count (`rg "=== undefined|!== undefined|\\?\\? undefined|\\{\\}|\\.\\.\\.\\(" ts -g '*.ts' | wc -l`): 3730 → 3738.
- Scoped Clinkr typed optional-undefined properties (`ts/packages/infra/clinkr`): 11 → 1.
- Scoped Clinkr undefined-normalization/check count (`ts/packages/infra/clinkr`): 201 → 202.

Changed fields:

- Removed redundant explicit `undefined` from `ClinkrIoOverrides` (`stdout`, `stderr`, `canEmitAnsi`, `caps`).
- Removed redundant explicit `undefined` from Clinkr fake/scenario interaction options (`confirmations`, `isInteractive`, `interaction`).
- Removed redundant explicit `undefined` from Clinkr confirmation options (`isInteractive`, `formatPrompt`, `interaction`).
- Reworked the `capsEnv` test helper from present-key `columns: undefined` to an omission-only `columns?: number` plus a `columnsKnown?: boolean` test sentinel.
- Updated direct Clinkr helper producers in `cli-runtime`, brmem tests, areg tests, and packagechk tests/CLI to omit absent keys instead of passing `prop: undefined`.

## Objective Impact

This advances the standing optional-undefined cleanup loop with a coherent Clinkr subsystem slice. The semantic claim is that these Clinkr option and helper fields do not expose a meaningful present-key `undefined` contract; absence is represented by key omission, and producers now build those option objects accordingly.

The normalization/check count rose because this slice added explicit omission-building at callsites before and around the narrowed Clinkr contracts. That is expected under the Objective metric policy: normalization count can increase when producers are made honest for exact optional property types.

Preserved/deferred categories:

- Preserved `CreateClinkrInteractionOptions.injectedStdin?: (() => Promise<string | null>) | undefined` because it is passed to `defaultIsInteractive` as a stdin sentinel and was not normalized in this slice.
- Preserved `ScenarioStdin = string | (() => Promise<string | null>) | undefined` because it is a direct input sentinel union, not an optional property.
- Preserved environment-map value types such as `Record<string, string | undefined>` because explicit `undefined` can be meaningful in process-like env maps.

Validation:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test -- --run ts/packages/infra/clinkr` passed; Vitest executed the full configured suite (386 files, 3708 tests).
- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.

## Follow-Ups

Future slices can continue package/subsystem clusters, but should keep preserving stdin/env/signal/compatibility surfaces unless a normalized internal boundary proves explicit `undefined` is unobservable.
