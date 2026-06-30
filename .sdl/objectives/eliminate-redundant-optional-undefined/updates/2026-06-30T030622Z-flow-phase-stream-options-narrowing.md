# Flow Phase-Stream Options Narrowing

## Summary

Narrowed the internal Flow phase-stream presentation-driver option/result shapes in `ts/packages/capabilities/flow/src/shared/phase-stream.ts` from explicit-undefined optional properties to omission-only optional properties.

Scoped before/after inventory:

- Before: `rg -n "\?: .*undefined" ts/packages/capabilities/flow/src/shared/phase-stream.ts` found 6 candidates.
- After: the same command found 0 candidates.

Changed fields:

- `SettledPhaseStreamOutcome<T>.isFailed`
- `SettledPhaseStreamOutcome<T>.finalLines`
- `SettledPhaseStreamOutcome<T>.afterFinish`
- `PhaseStreamController.finish(...).isFailed`
- `PhaseStreamController.finish(...).finalLines`
- `CreatePhaseStreamControllerOptions.begin`

Validation:

- `pnpm --dir ts exec vitest run packages/capabilities/flow/test/unit/phase-stream.test.ts` passed.
- `just ts-format-check` passed after applying `just ts-format-fix` to the touched TypeScript file.
- `just ts-check` passed.
- `just dprint-check` passed.

## Objective Impact

This advances the standing cleanup loop with a coherent internal presentation-driver slice. The semantic claim is that these Flow phase-stream fields model omission only: callers either supply concrete values when meaningful (`isFailed: true`, `isFailed: exitCode !== 0`, `begin: "lazy"`) or omit the property, while consumers use `=== true`, optional parameters, or optional chaining. Present-key `undefined` has no distinct domain or compatibility meaning for these internal shapes.

The slice intentionally preserves/defer other Flow candidates in option/dependency/test/fake-builder surfaces (`ccc-cli`, land-stack tests, fakes, and similar areas) because those need their own classification before narrowing.

## Follow-Ups

Continue selecting one coherent internal package/subsystem cluster at a time. Treat option/dependency/fake-builder surfaces as preserve/defer unless construction evidence shows explicit `undefined` is incidental and all affected callers can omit the property without crossing a public/input boundary.
