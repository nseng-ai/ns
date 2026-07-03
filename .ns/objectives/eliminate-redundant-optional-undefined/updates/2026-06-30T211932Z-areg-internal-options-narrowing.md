# Areg Internal Options Narrowing

## Summary

Narrowed areg-owned CLI dependency, real-gateway constructor, helper, and test harness option shapes from raw optional `| undefined` to omission-only optional properties where present-key `undefined` has no distinct meaning from absence.

Changed fields and call sites:

- `ts/packages/tools/areg/src/cli.ts`: narrowed `CliDeps.context`, `CliDeps.interaction`, and `CliDeps.env`. The dependency bag is areg's internal CLI launch seam; callers either omit these fields or pass concrete values, while `NodeJS.ProcessEnv` still preserves environment variable values that may be `undefined`.
- `ts/packages/tools/areg/src/context.ts`: narrowed `createRealAregContext`'s local factory options `cwd` and `env`.
- `ts/packages/tools/areg/src/gateways/github-gateway.ts`, `npx-skills-gateway.ts`, and `project-gateway.ts`: narrowed injected `runner` / `git` constructor options.
- `ts/packages/tools/areg/src/gateways/errors.ts`: narrowed the optional `displayCommand` helper parameter; callers omit it when absent.
- Areg tests: narrowed matching scenario harness and local fake options in `init-cli.test.ts` and `real-gateways.test.ts`.

Semantic claim: these are areg-owned dependency/test/helper option fields that use omission as the absent state. Existing construction already omits absent values or reads with `??` / exact checks, so no producer needed to encode present-key `undefined`.

Preserved/deferred categories:

- Preserved `AregGithubGateway.listSkillDirectoryNames` request field `ref?: string | undefined`; this is a GitHub API/query selector input surface and this slice did not prove explicit `undefined` is not part of caller compatibility.
- No broad areg operation/result schema or external payload surfaces were narrowed.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                    | Raw optional-undefined properties before | Raw optional-undefined properties after | Undefined-normalization/check lines before | Undefined-normalization/check lines after |
| ------------------------ | ---------------------------------------: | --------------------------------------: | -----------------------------------------: | ----------------------------------------: |
| `ts`                     |                                      172 |                                     157 |                                       2357 |                                      2357 |
| `ts/packages/tools/areg` |                                       16 |                                       1 |                                         78 |                                        78 |

## Objective Impact

This advances the continuous cleanup row with a coherent areg internal option-shape slice and classifies the remaining areg raw optional-undefined candidate as an external/request selector to preserve for now.

Validation evidence:

- `pnpm --dir ts --filter @sdl/areg run check`: passed.
- `pnpm --dir ts --filter @sdl/areg run test`: passed, 20 files / 157 tests.
- `pnpm --dir ts run fmt:check`: initially failed on `packages/tools/areg/src/gateways/errors.ts`; fixed with `pnpm --dir ts run fmt`, then passed.
- `pnpm --dir ts run lint`: passed.
- `pnpm --dir ts run check`: passed.

## Follow-Ups

Continue preserving request/input selectors such as areg's GitHub `ref` until a separate normalized internal boundary or compatibility review justifies narrowing them.
