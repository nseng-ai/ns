# Roaster Option Narrowing

## Summary

Narrowed the residual Roaster raw optional-undefined cluster to omission-only optional properties:

- `RoasterClientOptions.stdin`, `stdout`, `stderr`, and `runtime` in `ts/packages/roaster/src/api.ts`.
- `GitDiffArgsOptions.excludeGlobs` in `ts/packages/roaster/src/project-config.ts`.

Semantic claim: these are Roaster capability/API and helper option fields whose consumers already treat explicit `undefined` exactly like absence. `createRoasterClient` defaults `runtime` with `options.runtime ?? createRealRuntime(options)`, `createRealRuntime` defaults `stdin`/`stdout`/`stderr` with `??`, and `buildGitDiffArgs` defaults `excludeGlobs` with `options.excludeGlobs ?? []`. Present-key `undefined` therefore has no distinct Roaster-domain meaning for these fields. The existing `env` and `signal` fields remain typed `ExplicitUndefined<"env-map" | "abort-signal", ...>` contracts.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                 | Metric                              | Before | After |
| --------------------- | ----------------------------------- | -----: | ----: |
| `ts`                  | Raw optional-undefined properties   |     23 |    18 |
| `ts`                  | Typed explicit-undefined contracts  |     86 |    86 |
| `ts`                  | Legacy preserve markers             |      0 |     0 |
| `ts`                  | Undefined-normalization/check lines |   2298 |  2298 |
| `ts/packages/roaster` | Raw optional-undefined properties   |      5 |     0 |
| `ts/packages/roaster` | Typed explicit-undefined contracts  |     21 |    21 |
| `ts/packages/roaster` | Legacy preserve markers             |      0 |     0 |
| `ts/packages/roaster` | Undefined-normalization/check lines |     81 |    81 |

Validation:

- `pnpm --dir ts --filter @sdl/roaster run check` passed.
- `pnpm --dir ts --filter @sdl/roaster run test` passed (22 files, 223 tests).
- `just ts-format-check` passed.
- `just ts-lint` passed.
- `just ts-check` passed.

## Objective Impact

This exhausts the Roaster raw optional-undefined group (5 → 0 scoped) while preserving typed explicit-undefined contracts for env maps, abort signals, and external/public boundaries. The repo-wide raw optional-undefined score moves from 23 to 18 without adding new normalization/check code.

This slice is intentionally smaller than the Objective's default preferred review granularity because the Roaster semantic boundary is exhausted and adjacent remaining candidates are unrelated/deferred rather than safe to batch by syntax alone.

Remaining raw candidate groups after this slice:

- `ts/packages/infra/github/test/github-cli.test.ts`: 3 callback-capture test fields previously preserved because they mirror `CommandRunner` callback parameters typed `ExecOptions | undefined`.
- `ts/packages/sdl-sdk/src/command.ts` and `ts/packages/sdl-sdk/src/execution.ts`: 15 public SDL SDK fields, still deferred pending a deliberate SDK compatibility/API review or typed explicit-undefined contract decision.

## Follow-Ups

Continue with a deliberate SDK compatibility/API review before touching the remaining public `sdl-sdk` command/execution declarations. Do not revisit the GitHub CLI callback-capture test fields unless the underlying callback contract is changed or normalized first.
