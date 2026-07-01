# Final Raw Optional Undefined Resolution

## Summary

Resolved the final raw optional-undefined inventory by making the two remaining semantic categories explicit instead of mechanically narrowing public SDK surfaces:

- `ts/packages/sdl-sdk/src/command.ts`: converted six public `SdlCommand` command-definition fields (`schema`, `positionals`, `resultSchema`, `renderHuman`, `renderMarkdown`, and `completionProvider`) from raw `?: T | undefined` to `ExplicitUndefined<"public-api-compatibility", T>`.
- `ts/packages/sdl-sdk/src/execution.ts`: converted nine public execution/host API fields (`SdlExecOptions.stdin`, `onStdout`, `onStderr`, and `SdlExtensionApi.stdout`, `stderr`, `stdin`, `onOutput`, `confirm`, `extensions`) to `ExplicitUndefined<"public-api-compatibility", T>`.
- `ts/packages/infra/core/src/primitives.ts`: added the `public-api-compatibility` explicit-undefined reason so SDK compatibility contracts are auditable rather than hidden in raw unions.
- `ts/packages/infra/github/test/github-cli.test.ts`: normalized the three callback-capture records to omit `options` when the callback parameter is `undefined`, then narrowed the local test capture type to `options?: ExecOptions`.

Semantic claim: public SDL SDK command and host API fields are compatibility/input contracts, so this slice preserves explicit-`undefined` assignability while removing raw, unclassified optional-undefined debt. The GitHub CLI fields are not public contracts; they are test capture records, and the construction path now models absence by omission before narrowing.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                                              | Metric                              | Before | After |
| -------------------------------------------------- | ----------------------------------- | -----: | ----: |
| `ts`                                               | Raw optional-undefined properties   |     18 |     0 |
| `ts`                                               | Typed explicit-undefined contracts  |     86 |   101 |
| `ts`                                               | Legacy preserve markers             |      0 |     0 |
| `ts`                                               | Undefined-normalization/check lines |   2298 |  2301 |
| `ts/packages/sdl-sdk`                              | Raw optional-undefined properties   |     15 |     0 |
| `ts/packages/sdl-sdk`                              | Typed explicit-undefined contracts  |      2 |    17 |
| `ts/packages/sdl-sdk`                              | Legacy preserve markers             |      0 |     0 |
| `ts/packages/sdl-sdk`                              | Undefined-normalization/check lines |      0 |     0 |
| `ts/packages/infra/github/test/github-cli.test.ts` | Raw optional-undefined properties   |      3 |     0 |
| `ts/packages/infra/github/test/github-cli.test.ts` | Typed explicit-undefined contracts  |      0 |     0 |
| `ts/packages/infra/github/test/github-cli.test.ts` | Legacy preserve markers             |      0 |     0 |
| `ts/packages/infra/github/test/github-cli.test.ts` | Undefined-normalization/check lines |      0 |     3 |

Validation:

- `pnpm --dir ts --filter sdl-sdk run check` passed.
- `pnpm --dir ts --filter sdl-sdk run test` passed (1 file, 3 tests).
- `pnpm --dir ts --filter @sdl/github run test -- github-cli.test.ts` passed (3 files, 48 tests).
- `just ts-format-check` initially failed on `ts/packages/sdl-sdk/src/command.ts` and `ts/packages/sdl-sdk/src/execution.ts`; `just ts-format-fix` was run.
- `just ts-format-check` passed after formatting.
- `just ts-lint` passed.
- `just ts-check` passed.
- `dprint fmt .sdl/objectives/eliminate-redundant-optional-undefined/updates/2026-07-01T034508Z-final-raw-optional-undefined-resolution.md` formatted this update, and `dprint check` for this update passed.
- Full `just dprint-check` remains failed because pre-existing parent-branch update `.sdl/objectives/eliminate-redundant-optional-undefined/updates/2026-07-01T033317Z-capability-kit-helper-option-narrowing.md` is not dprint-formatted; this slice did not rewrite that historical update.

## Objective Impact

The repo-wide raw optional-undefined scorecard reaches 0 without adopting a hard enforcement policy or erasing compatibility semantics. Public SDK fields are now recorded as typed explicit-undefined contracts under a named `public-api-compatibility` reason, while the residual GitHub test helper fields were made omission-only after producer normalization.

This does not close the standing Objective: it still tracks future reintroductions, reusable classification lessons, and any separately approved hard-guard/allowlist decision. It does mean future runners should re-inventory for newly introduced raw candidates before looking for additional cleanup slices, because the known residual raw groups from the Roaster follow-up have been exhausted.

## Follow-Ups

- Do not interpret the raw count reaching zero as approval for a checked-in guard or allowlist; that remains a separate parked decision.
- If new public API/input candidates appear, prefer typed `ExplicitUndefined` with a precise reason when explicit `undefined` is compatibility-significant, and plain optional only when present-key `undefined` has no semantic or compatibility meaning.
- Future `objective-next` runs should start by re-running the metric inventory rather than revisiting the now-exhausted Roaster/SDK/GitHub residual groups.
