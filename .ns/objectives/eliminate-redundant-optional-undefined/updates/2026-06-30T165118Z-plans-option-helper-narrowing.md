# Plans Option Helper Narrowing

## Summary

Narrowed the `@sdl/plans` saved-plan CLI/helper option cluster from raw optional `| undefined` properties to omission-only optional properties.

Changed fields:

- `CliDeps`: `commands`, `git`, `cwd`, `stdout`, `stderr`, `stdin`, `planStoreRoot`, and `planStoreGateway`.
- `ResolveSelectedSavedPlanFileOptions`: `explicitPath`, `sessionEntries`, `shouldFallbackToLatest`, and `shouldAllowSessionSourceBranchMismatch`.
- `ValidateSessionSavedPlanCandidateOptions`: `shouldAllowSourceBranchMismatch` and `planStoreGateway`.
- `ResolvePlanSourceFileOptions`: `signal`, `git`, and `planStoreGateway`.
- `ResolveGitRepoRootOptions`: `signal` and `git`.
- `PlanStoreOptions`: `signal`, `planStoreRoot`, `git`, and `planStoreGateway`.

Two construction sites now omit absent optional keys instead of passing present-key `undefined`: forwarding `signal` from `resolvePlanSourceFile` into `resolveGitRepoRoot`, and the plans CLI scenario harness `stdin` override.

Scorecard:

| Scope               | Metric                              | Before | After | Delta |
| ------------------- | ----------------------------------- | -----: | ----: | ----: |
| `ts`                | Raw optional-undefined properties   |    355 |   332 |   -23 |
| `ts`                | Typed explicit-undefined contracts  |     83 |    83 |     0 |
| `ts`                | Legacy preserve markers             |      0 |     0 |     0 |
| `ts`                | Undefined-normalization/check lines |   2332 |  2334 |    +2 |
| `ts/packages/plans` | Raw optional-undefined properties   |     30 |     7 |   -23 |
| `ts/packages/plans` | Typed explicit-undefined contracts  |      1 |     1 |     0 |
| `ts/packages/plans` | Legacy preserve markers             |      0 |     0 |     0 |
| `ts/packages/plans` | Undefined-normalization/check lines |     42 |    44 |    +2 |

Validation:

- `pnpm --dir ts --filter @sdl/plans run test` passed: 6 files / 90 tests.
- `pnpm --dir ts --filter @sdl/plans run check` passed.
- `pnpm --dir ts run fmt:check -- packages/plans/src/cli.ts packages/plans/src/saved-plan-selection.ts packages/plans/src/plan-persistence.ts packages/plans/src/saved-plan-file.ts packages/plans/test/scenario/cli.test.ts` passed.

## Objective Impact

This advances the continuous cleanup row with a coherent package-level saved-plan option/helper slice. The semantic claim is that these `@sdl/plans` fields model absence by omission/defaulting only: dependency overrides default through `??`, plan-store root omission selects the default XDG location, `signal` and gateway fields are optional pass-through overrides, and selection/session flags use absent/default behavior. Present-key `undefined` has no separate saved-plan domain or compatibility meaning for these narrowed shapes.

The two-check increase is expected producer-side normalization required by `exactOptionalPropertyTypes`; it prevents narrowed option objects from materializing absent values as explicit `undefined`.

Preserved/deferred categories:

- `PlanStoreOptions.env` remains `ExplicitUndefined<"env-map", Record<string, string | undefined>>` because environment maps are a meaningful explicit-undefined contract.
- The remaining `@sdl/plans` raw candidates live in separate content-slug, testing, and fixture surfaces and were not included in this saved-plan option/helper slice.

## Follow-Ups

Future `@sdl/plans` cleanup should classify the remaining content-slug/test fixture candidates separately instead of treating them as part of the saved-plan option helper contract. Continue preserving environment-map explicit contracts unless a normalized internal boundary proves omission-only semantics.
