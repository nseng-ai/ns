# Branch-Context Option Shapes Narrowing

## Summary

Narrowed the branch-context package's internal option/helper shapes from raw optional `| undefined` to omission-only optional properties where callers/builders already model absence by omitting the key.

Changed fields included:

- `BranchContextPrimitiveOptions.signal` and `planStoreRoot` in `ts/packages/branch-context/src/attach.ts`.
- `LoadAttachedPlanOptions.signal`, `sessionEntries`, and `readTextFile` in `ts/packages/branch-context/src/attached-plan.ts`.
- Branch creation operation `signal` fields and preview context `signal` in `ts/packages/branch-context/src/branch-context-creation.ts`.
- Branch-context context factory `cwd` options in `ts/packages/branch-context/src/context.ts`.
- Existing-branch reuse `signal` in `ts/packages/branch-context/src/existing-branch-reuse.ts`.
- CLI/context dependency options in `ts/packages/branch-context/src/operations.ts`.
- Plan-content slug derivation `signal` and `readTextFile` in `ts/packages/branch-context/src/plan-content-slug.ts`.
- In-memory branch-context test gateway state/options and call shapes in `ts/packages/branch-context/src/testing/index.ts`.

Construction-path fixes kept exact-optional semantics honest by omitting absent fields in branch-context callers instead of passing present-key `undefined`:

- `createBranchContextFromFile` conditionally includes `signal` when calling `createBranchContextFromResolvedSource`.
- `cli.ts` conditionally includes `planStoreRoot` for real context construction.
- `sdl/command.ts` conditionally includes `stderr` for SDL extension context construction.

Preserved/deferred:

- `LoadAttachedPlanOptions.planStoreRoot?: string | undefined` remains temporarily preserved because an existing cross-package `capability-pi/branch-context` caller still passes a maybe-undefined plan-store root directly. This slice stayed inside `ts/packages/branch-context/**` rather than touching a second package; a future capability-pi/branch-context caller-normalization slice can omit that field and then narrow the branch-context option.

Metric scorecard:

| Scope | Metric | Before | After |
| --- | --- | ---: | ---: |
| `ts` | Raw optional-undefined properties | 381 | 355 |
| `ts` | Typed explicit-undefined contracts | 83 | 83 |
| `ts` | Legacy preserve markers | 0 | 0 |
| `ts` | Undefined-normalization/check lines | 2329 | 2332 |
| `ts/packages/branch-context` | Raw optional-undefined properties | 27 | 1 |
| `ts/packages/branch-context` | Typed explicit-undefined contracts | 0 | 0 |
| `ts/packages/branch-context` | Legacy preserve markers | 0 | 0 |
| `ts/packages/branch-context` | Undefined-normalization/check lines | 63 | 66 |

The undefined-check count rose by three due to new conditional omission builders that prevent present-key `undefined` after narrowing.

Validation:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test -- --run ts/packages/branch-context` passed; Vitest ran the full configured suite (379 files / 3672 tests) despite the selector.
- `pnpm --dir ts run fmt:check` initially failed after the type edits; `just ts-format-fix` was run, then `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.

## Objective Impact

This removes 26 raw optional-undefined branch-context declarations while preserving one boundary that still has an explicit cross-package maybe-undefined caller. The slice reinforces the Objective's preferred pattern: narrow internal option shapes only after converting producers/builders to omit absent fields.

## Follow-Ups

- Consider a later `capability-pi/branch-context` caller-normalization slice to omit `planStoreRoot` when absent and then narrow the remaining `LoadAttachedPlanOptions.planStoreRoot` declaration.
- Continue selecting package/subsystem clusters where construction-path evidence supports omission-only optional properties.
