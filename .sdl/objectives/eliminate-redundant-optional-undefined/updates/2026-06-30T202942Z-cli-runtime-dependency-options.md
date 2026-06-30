# CLI Runtime Dependency Options Narrowing

## Summary

Narrowed `@sdl/cli-runtime` omission-only option/result shapes and the direct `defineCli` dependency surfaces that must conform to `CliEntrypointDeps`:

- `CliEntrypointDeps.cwd`, `stdout`, and `stderr` in `ts/packages/infra/cli-runtime/src/index.ts`.
- `CliPrepareRunResult.args` and `DefinedCli.runIfMain` input `argv` in `ts/packages/infra/cli-runtime/src/index.ts`.
- `TestDeps.cwd`, `env`, `stdout`, `stderr`, and `label` in `ts/packages/infra/cli-runtime/test/cli-entry.test.ts`.
- Direct `defineCli` consumer dependency fields `cwd`, `stdout`, and `stderr` in `ts/packages/ccc/src/cli.ts`, `ts/packages/kernel/src/cli.ts`, and `ts/packages/tools/areg/src/cli.ts` so their dependency types satisfy the narrowed base contract.

Semantic claim: these first-party CLI runtime dependency/test-helper fields use omission as the absent state; present-key `undefined` is not a domain, compatibility, input, or external-conformance contract. Environment map value types remain preserved, and other non-runtime fields in `ccc`, `kernel`, and `areg` remain deferred unless separately classified.

Scorecard measured with `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                     | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before               |                               265 |                                 86 |                       0 |                                2316 |
| `ts` after                |                               245 |                                 86 |                       0 |                                2316 |
| changed-file scope before |                                50 |                                  1 |                       0 |                                  50 |
| changed-file scope after  |                                30 |                                  1 |                       0 |                                  50 |

Changed-file scope: `ts/packages/infra/cli-runtime/src/index.ts`, `ts/packages/infra/cli-runtime/test/cli-entry.test.ts`, `ts/packages/ccc/src/cli.ts`, `ts/packages/kernel/src/cli.ts`, and `ts/packages/tools/areg/src/cli.ts`.

## Objective Impact

This advances the standing optional-undefined cleanup loop by completing a coherent `@sdl/cli-runtime` contract slice and aligning direct consumer dependency shapes with the omission-only base contract. The repo-wide raw optional-undefined count dropped by 20 with no increase in undefined-normalization/check lines.

Preserved/deferred categories:

- Preserved `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` in cli-runtime and env-map value unions such as `Record<string, string | undefined>`.
- Deferred unrelated `ccc`, `kernel`, and `areg` dependency or build-state fields whose explicit-undefined semantics were not needed for the narrowed `CliEntrypointDeps` compatibility claim.

Validation:

- `pnpm --dir ts exec vitest run packages/infra/cli-runtime/test`: passed before the direct-consumer compatibility edits.
- `pnpm --dir ts run check`: initially failed on direct `defineCli` consumers whose `cwd` fields still allowed present-key `undefined`; passed after narrowing those direct dependency fields.
- `pnpm --dir ts exec vitest run packages/infra/cli-runtime/test packages/ccc/test packages/tools/areg/test packages/kernel/test`: passed, 46 files / 389 tests.
- `pnpm --dir ts run fmt:check`: passed.
- `pnpm --dir ts run lint`: passed.

## Follow-Ups

Continue preserving env-map/process-like contracts unless a normalized internal boundary justifies narrowing. Future slices can classify the remaining `ccc`, `kernel`, and `areg` raw optional-undefined fields separately, but should not batch them into cli-runtime cleanup unless they are required by the shared runtime contract.
