# Plans Branch-Context Helper Options

## Summary

Narrowed a plans/branch-context helper slice where optional fields are omission-only and do not carry a meaningful present-key `undefined` contract.

Changed fields:

- `ts/packages/plans/src/testing.ts`
  - `WriteInMemoryPlanStoreFileOptions.mtimeMs?: number`
  - `mkdir(... options: { mtimeMs?: number } = {})`
- `ts/packages/plans/test/saved-plan-file.test.ts`
  - replaced raw `currentBranch?: string | undefined` / `originUrl?: string | undefined` fake options with omission-only `currentBranch?: string` / `originUrl?: string` plus explicit `isDetached?: boolean` and `hasOrigin?: boolean` flags for the two tests that intentionally model missing git facts.
- `ts/packages/branch-context/src/attached-plan.ts`
  - `LoadAttachedPlanOptions.planStoreRoot?: string`
- `ts/packages/branch-context/src/testing/index.ts`
  - `listSnapshots(options: { namespace?: string })`
- `ts/packages/capability-pi/branch-context/src/from-plan-commands.ts`
  - normalized the `loadBranchContextPlan` call with `optionalEntry("planStoreRoot", ...)` before passing the narrowed internal loader option.

Scorecard:

- Repo-wide scope `ts`: raw optional-undefined properties 151 -> 145; typed explicit-undefined contracts 86 -> 86; undefined-normalization/check lines 2357 -> 2357.
- Scoped `ts/packages/plans ts/packages/branch-context ts/packages/capability-pi/branch-context`: raw optional-undefined properties 11 -> 5; typed explicit-undefined contracts 1 -> 1; undefined-normalization/check lines 145 -> 145.

Validation:

- `just ts-format-fix` after initial formatter check reported one formatting issue in `ts/packages/plans/test/saved-plan-file.test.ts`.
- `just ts-format-check` passed.
- `just ts-check` passed.
- `pnpm --dir ts exec vitest run packages/plans/test/saved-plan-file.test.ts packages/branch-context/test/attached-plan.test.ts` passed: 2 files / 21 tests.

## Objective Impact

This slice removes six redundant raw optional-undefined properties from internal plans/branch-context helper shapes. The semantic claim is that these fields are omission-only:

- in-memory test helper `mtimeMs` is consumed with `??` and is only supplied as a real number by callers;
- fake git tests now model detached HEAD and missing origin as explicit test booleans instead of relying on present-key `undefined`;
- branch-context `planStoreRoot` is omitted at the producer boundary with `optionalEntry` before entering the internal loader option;
- branch-context testing `namespace` forwarding remains an omission-only fake/helper option.

Deferred/preserved adjacent candidates:

- `signal?: AbortSignal | undefined` in plans content-slug and saved-plan file paths remains deferred because cancellation/signal option surfaces are a known Objective risk category.
- `env?: ExplicitUndefined<"env-map", ...>` in saved-plan file remains preserved as a typed explicit-undefined contract.
- Pi branch-context host extension options remain deferred as plugin/host compatibility surfaces.

## Follow-Ups

- Continue with another coherent package/subsystem cluster rather than broad syntax sweeps.
- If future slices touch the brmem gateway itself, re-evaluate whether `listSnapshots` and related fake/real gateway option shapes can be narrowed at the owning brmem boundary.
