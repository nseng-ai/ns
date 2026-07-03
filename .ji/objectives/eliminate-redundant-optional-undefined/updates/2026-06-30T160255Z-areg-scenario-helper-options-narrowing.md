# Areg Scenario Helper Options Narrowing

## Summary

Narrowed the `ScenarioRunOptions` test-helper bag in `ts/packages/tools/areg/test/support/run-scenario.ts` from raw `?: T | undefined` declarations to omission-only optional properties.

Changed fields: `context`, `host`, `github`, `skillxWorkspace`, `project`, `git`, `npxSkills`, `prompt`, `confirmations`, `isInteractive`, `cwd`, and `env`.

Semantic claim: this helper treats missing options through defaults or direct optional forwarding to fake constructors/interactions. Present-key `undefined` has no separate test or domain meaning here, so the option object can honestly use `foo?: T` under `exactOptionalPropertyTypes`.

Validation:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test -- packages/tools/areg` passed; Vitest executed the workspace suite and reported 379 files / 3672 tests passed.

## Objective Impact

Scorecard before/after:

| Scope                                                 | Metric                              | Before | After | Delta |
| ----------------------------------------------------- | ----------------------------------- | -----: | ----: | ----: |
| `ts`                                                  | Raw optional-undefined properties   |    507 |   495 |   -12 |
| `ts`                                                  | Typed explicit-undefined contracts  |     71 |    71 |     0 |
| `ts`                                                  | Legacy preserve markers             |      0 |     0 |     0 |
| `ts`                                                  | Undefined-normalization/check lines |   2308 |  2308 |     0 |
| `ts/packages/tools/areg/test/support/run-scenario.ts` | Raw optional-undefined properties   |     12 |     0 |   -12 |
| `ts/packages/tools/areg/test/support/run-scenario.ts` | Typed explicit-undefined contracts  |      0 |     0 |     0 |
| `ts/packages/tools/areg/test/support/run-scenario.ts` | Legacy preserve markers             |      0 |     0 |     0 |
| `ts/packages/tools/areg/test/support/run-scenario.ts` | Undefined-normalization/check lines |      0 |     0 |     0 |

This keeps the standing Objective moving with a coherent test-helper-only cleanup slice. It also confirms that not every remaining areg option shape is a public/input compatibility surface: scenario helper bags whose construction paths already use omission/default semantics are safe candidates.

Preserved/deferred categories: areg production CLI/context declarations, fake gateway option contracts, real gateway inputs, and environment/process-like surfaces outside this scenario helper were not changed in this slice.

## Follow-Ups

Continue inventorying adjacent test-support helpers as coherent clusters. The next useful slices should still classify production CLI option bags, dependency seams, and environment/process maps separately instead of assuming they share the scenario-helper semantics proven here.
