# Core Utility Helper Options Narrowing

## Summary

Narrowed a cohesive `@sdl/core` utility/test-helper cluster from raw optional `| undefined` properties to omission-only optional properties.

Changed fields:

- `FormatCommandEvidenceOptions.guidance`
- `ParseMachineEnvelopeDataWithFailureDataOptions.shouldAllowFailureData`
- `TemporaryJsonFileOptions.filename`
- `WorkspaceRootMarkerOptions.nestedDirectory` and `exists`
- `XdgPathOptions.segments` and `overrideEnv`
- `TempGitRepoRunOptions.input` and `env`
- `RunnerCall.cwd`
- `ScriptedCommandExecCall.options`
- `GithubCheckRunFixture.conclusion`, `startedAt`, and `completedAt`

Construction-path change: `ScriptedCommandRunner` now omits `cwd` from recorded calls when the runner option has no `cwd`, matching the narrowed `RunnerCall` type under `exactOptionalPropertyTypes`.

Scorecard:

| Scope                    | Metric                              | Before | After | Delta |
| ------------------------ | ----------------------------------- | -----: | ----: | ----: |
| `ts`                     | Raw optional-undefined properties   |    463 |   449 |   -14 |
| `ts`                     | Typed explicit-undefined contracts  |     82 |    82 |     0 |
| `ts`                     | Legacy preserve markers             |      0 |     0 |     0 |
| `ts`                     | Undefined-normalization/check lines |   2310 |  2311 |    +1 |
| `ts/packages/infra/core` | Raw optional-undefined properties   |     14 |     0 |   -14 |
| `ts/packages/infra/core` | Typed explicit-undefined contracts  |     15 |    15 |     0 |
| `ts/packages/infra/core` | Legacy preserve markers             |      0 |     0 |     0 |
| `ts/packages/infra/core` | Undefined-normalization/check lines |    127 |   128 |    +1 |

## Objective Impact

This removes all AST-counted raw optional-undefined property declarations from the `@sdl/core` scope without broadening into unrelated packages. The semantic claim is that these selected fields are utility/presentation/helper/test-support option or fixture shapes where omitted keys already select defaults or absence; present-key `undefined` has no separate domain, external-schema, or compatibility meaning.

The one-check increase is intentional local normalization: `RunnerCall.cwd` is now stored only when present, so the call record no longer materializes `cwd: undefined`.

Preserved/deferred categories: raw grep still sees environment value types such as `env?: Record<string, string | undefined>` and style-guard fixture strings, but the Objective AST metric no longer counts them as raw optional-property debt. Existing typed `ExplicitUndefined` contracts in core remain unchanged.

Validation passed:

- `pnpm --dir ts --filter @sdl/core run check`
- `pnpm --dir ts --filter @sdl/core run test`
- `pnpm --dir ts run fmt:check -- packages/infra/core/src/command.ts packages/infra/core/src/machine-envelope.ts packages/infra/core/src/temp-files.ts packages/infra/core/src/workspace-root.ts packages/infra/core/src/xdg.ts packages/infra/core/src/testing/index.ts`
- `pnpm --dir ts run lint`
- `just dprint-check` after `just dprint-fix` formatted this update's scorecard table

## Follow-Ups

Future core-adjacent cleanup should treat Objective tool metrics as authoritative for optional-property debt instead of raw grep false positives. Continue preserving environment value maps and typed explicit-undefined contracts unless a separate normalized internal boundary proves present-key `undefined` is redundant there too.
