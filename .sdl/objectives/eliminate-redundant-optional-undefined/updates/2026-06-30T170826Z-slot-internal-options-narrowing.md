# Slot Internal Options Narrowing

## Summary

Narrowed a coherent `@sdl/slot` internal-helper slice from raw `?: T | undefined` to omission-only optional properties:

- `RunDiagnosticCommandOptions.diagnosticSink` and `DiagnosticCommandRunnerOptions.diagnosticSink`
- `RealClipboardGateway` constructor `runner`
- `buildSlotInventory` `mainRepoRoot`
- `planCurrentCheckout` `mainRepoRoot`
- `CdDirectiveOptions.isEnabled` and `CdDirectiveOptions.filesystem`

Construction/call sites now omit optional keys with conditional object construction when the source value may be `undefined`, preserving exact-optional-property semantics without re-widening the destination contracts.

Objective scorecard:

| Scope                           | Metric                              | Before | After |
| ------------------------------- | ----------------------------------- | -----: | ----: |
| `ts`                            | Raw optional-undefined properties   |    311 |   304 |
| `ts`                            | Typed explicit-undefined contracts  |     83 |    83 |
| `ts`                            | Legacy preserve markers             |      0 |     0 |
| `ts`                            | Undefined-normalization/check lines |   2334 |  2339 |
| `ts/packages/capabilities/slot` | Raw optional-undefined properties   |     17 |    10 |
| `ts/packages/capabilities/slot` | Typed explicit-undefined contracts  |      8 |     8 |
| `ts/packages/capabilities/slot` | Legacy preserve markers             |      0 |     0 |
| `ts/packages/capabilities/slot` | Undefined-normalization/check lines |     83 |    88 |

The undefined-normalization/check count rose by five because call sites that previously passed `diagnosticSink: maybeUndefined` / `mainRepoRoot: maybeUndefined` now explicitly omit those keys under `exactOptionalPropertyTypes`.

Validation:

- `pnpm --dir ts --filter @sdl/slot run check` passed.
- `pnpm --dir ts --filter @sdl/slot run test` passed (27 files, 220 tests).
- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.
- Workspace `pnpm --dir ts run check` still fails on pre-existing/upstack branch-context and ccc exact-optional-property call-site issues outside this slot slice; no slot diagnostics remained after the local fixes.

## Objective Impact

This reduces the repo-wide and slot-scoped raw optional-undefined debt by seven declarations while preserving the existing typed explicit-undefined contracts. The semantic claim is that these slot fields are internal diagnostic, DI, planning, and helper options where present-key `undefined` has no separate compatibility, external-schema, environment, or domain meaning; explicit undefined only selected the same default or absent behavior as omission.

Preserved/deferred categories:

- Preserved `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` environment-map fields in slot context/clipboard/cd-directive surfaces.
- Preserved existing typed DI/external contracts in slot gateways.
- Deferred slot tests that mirror external Graphite/sqlite JSON or fixture knobs (`parent_branch_name?: ... | undefined`, fake option fields) because their semantics are not the same internal-helper boundary.

## Follow-Ups

Future slices can classify the remaining slot test/external-mirror candidates separately, but should not batch them with internal helper option narrowing unless the external/fake fixture semantics are explicitly traced.
