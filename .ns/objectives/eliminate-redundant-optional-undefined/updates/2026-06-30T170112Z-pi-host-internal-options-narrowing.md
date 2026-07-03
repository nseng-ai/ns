# Pi Host Internal Options Narrowing

## Summary

Narrowed six redundant optional-undefined property declarations in Pi host internal option/result/context shapes:

- `DownloadPrFeedbackOptions.prNumber?: number`
- `DownloadPrFeedbackOptions.runner?: PrAddressRunner`
- `DownloadPrFeedbackOptions.shouldAllowFailureData?: boolean`
- `ParsedDownloadFeedbackArgs` valid variant `prNumber?: number`
- `LoadGhCommandOptions.shouldAllowNonZeroWithStdout?: boolean`
- `PiCommandContext.model?: ModelInfo`

The semantic claim is omission-only: these are internal Pi host fields where callsites either omit the property or read it with the normal optional-property `undefined` result. Present-key `undefined` is not a compatibility, input, external-schema, environment, or abort-signal contract.

## Objective Impact

Scorecard before/after:

| Scope                                                                                                                               | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                                                                                                                         |                               317 |                                 83 |                       0 |                                2334 |
| `ts` after                                                                                                                          |                               311 |                                 83 |                       0 |                                2334 |
| `ts/packages/hosts/pi` before                                                                                                       |                                 9 |                                  3 |                       0 |                                  80 |
| `ts/packages/hosts/pi` after                                                                                                        |                                 3 |                                  3 |                       0 |                                  80 |
| `ts/packages/hosts/pi/src/pr ts/packages/hosts/pi/src/shared/gh-command.ts ts/packages/hosts/pi/src/runtime/command-host.ts` before |                                 6 |                                  3 |                       0 |                                   6 |
| same narrow scope after                                                                                                             |                                 0 |                                  3 |                       0 |                                   6 |

No explicit-undefined typed contracts were removed. The undefined-normalization/check metric stayed unchanged because this slice only narrowed internal type declarations; existing guards and conditional omission builders remain the construction-path evidence.

Preserved/deferred categories:

- Environment-map shapes such as `Record<string, string | undefined>` remain value-level undefined contracts.
- `signal?: ExplicitUndefined<"abort-signal", AbortSignal>` remains the typed cancellation seam contract.
- Callback/method return types such as `string | undefined` are value-result types, not redundant optional-property declarations.
- Pi extension/UI compatibility surfaces that may be consumed by the host remain deferred unless a later slice normalizes the boundary.

Validation evidence:

- `pnpm --dir ts exec vitest run packages/hosts/pi/test/cli-command-extension.test.ts packages/hosts/pi/test/home-directory-guard.test.ts` passed: 44 tests.
- `pnpm --dir ts exec tsgo -p packages/hosts/pi/tsconfig.json` passed for the touched package.
- `just ts-format-check` passed.
- `just ts-lint` passed.
- `just ts-check` was run and failed on pre-existing/upstack exact-optional-property issues in branch-context/capability-pi/ccc files, outside this slice and not caused by the Pi host edits.

## Follow-Ups

The remaining raw Pi host candidates are outside this slice: env-map/external-ish command extension shape, test fixture helper shapes, and value-return `undefined` cases. Future runners should continue to preserve env maps and typed `ExplicitUndefined` contracts rather than chasing the raw grep output mechanically.
