# Aretro CLI Context Options Narrowing

## Summary

Narrowed the remaining raw optional-undefined option/helper fields in `ts/packages/aretro` to omission-only optional properties:

- `CliDeps.context`, `CliDeps.cwd`, `CliDeps.stdout`, and `CliDeps.stderr` in `ts/packages/aretro/src/cli.ts`.
- `createRealAretroContext` options `cwd`, `git`, and `sessionSource` in `ts/packages/aretro/src/context.ts`.
- `ScenarioRunOptions.cwd`, `ScenarioRunOptions.env`, and `ScenarioRunOptions.context` in `ts/packages/aretro/test/support/run-scenario.ts`.

Semantic claim: these first-party internal/test dependency and helper option shapes use omission as the absent state; present-key `undefined` is not a domain, compatibility, input, or external-conformance contract. The existing `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` env-map contracts in aretro CLI/context code remain preserved as typed explicit-undefined contracts, and env-map value types under payload code were intentionally left alone.

Scorecard measured with `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| --- | ---: | ---: | ---: | ---: |
| `ts` before | 289 | 86 | 0 | 2308 |
| `ts` after | 279 | 86 | 0 | 2308 |
| `ts/packages/aretro` before | 10 | 2 | 0 | 33 |
| `ts/packages/aretro` after | 0 | 2 | 0 | 33 |

While running the full TypeScript check, the upstack branch exposed one non-aretro omission-building fallout from the prior brmem helper-contract narrowing: `ts/packages/handoff/src/operations/create.ts` passed `file: request.file` into an omission-only `prepareEntryContentFromSource` option. I corrected that producer with a small `sourceOptions` union so the `file` key is omitted for stdin input. This did not change the Objective raw-property scorecard or undefined-check count.

## Objective Impact

This completes a coherent `@sdl/aretro` package slice: its raw optional-undefined property count is now zero while preserving the two env-map typed contracts. It also records a reusable validation finding: after narrowing shared helper contracts, cross-package call sites should be adapted with omission-building unions/spreads rather than widening callee option types back to raw `?: T | undefined`.

Validation evidence:

- `pnpm --dir ts exec vitest run packages/aretro/test`: passed before the handoff adaptation.
- `pnpm --dir ts run check`: initially failed on `ts/packages/handoff/src/operations/create.ts` because `file: string | undefined` was passed to an omission-only brmem helper option.
- `pnpm --dir ts run fmt` then `pnpm --dir ts run fmt:check`: passed after formatting the handoff adaptation.
- `pnpm --dir ts exec vitest run packages/aretro/test packages/handoff/test`: passed, 17 files / 118 tests.
- `pnpm --dir ts run check`: passed.
- `pnpm --dir ts run lint`: passed.

## Follow-Ups

- Continue selecting package/subsystem clusters with enough adjacent safe candidates for review-substantive slices.
- Preserve typed `ExplicitUndefined<"env-map", ...>` and env-map value contracts unless a separate normalized boundary justifies narrowing.
- When shared helper contracts are already omission-only, adapt producers by omitting absent keys rather than reintroducing raw optional-undefined types.
