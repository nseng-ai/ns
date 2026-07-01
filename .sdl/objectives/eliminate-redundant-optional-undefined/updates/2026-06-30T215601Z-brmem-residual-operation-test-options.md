# Brmem Residual Operation/Test Options Narrowing

## Summary

Narrowed the remaining safe `@sdl/brmem` residual operation and test-helper optional-undefined fields to omission-only optional properties, while preserving the process command `env`/`stdin` seam.

Changed declarations:

- `ts/packages/infra/brmem/src/operations/check.ts`: `emptyResult` local option `at?: string`.
- `ts/packages/infra/brmem/src/operations/shared.ts`: `resolveEntryRequest` request `branch?: string`.
- `ts/packages/infra/brmem/test/gateways/prompt-resolution.test.ts`: `FakeGitGateway` options `repoRoot?: string` and `repoRootError?: GitErrorInfo`.
- `ts/packages/infra/brmem/test/gateways/real-git-gateway.test.ts`: scripted command step `result?: Partial<ExecResult>`.
- `ts/packages/infra/brmem/test/scenario/copy-operation.test.ts`: fake `checkEntry` override `at?: string`.
- `ts/packages/infra/brmem/test/scenario/export-operation.test.ts`: fake `listEntries` override `key?: string` / `branch?: string`, and fake `checkEntry` / `getEntry` override `at?: string`.

Exact-optional typecheck exposed existing producers that passed `branch: request.branch` or `at: request.at` into the narrowed helper shapes. Those producers now omit absent keys with `optionalEntry` in `check`, `delete`, `get`, and `put` operations rather than widening the helper types back to raw optional-undefined.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                            | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| -------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                      |                                87 |                                 86 |                       0 |                                2368 |
| `ts` after                       |                                77 |                                 86 |                       0 |                                2368 |
| `ts/packages/infra/brmem` before |                                12 |                                  3 |                       0 |                                 106 |
| `ts/packages/infra/brmem` after  |                                 2 |                                  3 |                       0 |                                 106 |

Validation:

- `pnpm --dir ts --filter @sdl/brmem run check` passed.
- `pnpm --dir ts --filter @sdl/brmem run test` passed: 17 files / 112 tests.
- `pnpm --dir ts run fmt:check` initially failed after hand edits; `pnpm --dir ts run fmt` fixed formatting; rerun `fmt:check` passed.
- `pnpm --dir ts run lint` passed.

## Objective Impact

This completes the safe residual brmem operation/test-helper cluster left after earlier brmem cleanup slices. The semantic claim is that these helper/fake fields model absence by omission; present-key `undefined` has no separate domain or compatibility meaning. Producer normalization is now located at operation construction boundaries with `optionalEntry`, so the narrowed helper contracts remain honest under `exactOptionalPropertyTypes` without increasing the Objective's undefined-normalization/check count.

Preserved/deferred categories:

- Preserved `ts/packages/infra/brmem/src/real-git-gateway.ts` command helper `env?: NodeJS.ProcessEnv | undefined` and `stdin?: string | undefined` as process command input seams.
- Preserved existing typed `ExplicitUndefined<"env-map", ...>` contracts in brmem CLI/context/prompt-resolution code.
- No public SDK/capability, external-schema, abort-signal, or durable payload compatibility surface was narrowed in this slice.

## Follow-Ups

The scoped brmem raw optional-undefined count is now down to the two preserved process command seams. Future brmem cleanup should not reopen those mechanically; only narrow them if a separate process-command boundary decision proves explicit-present `undefined` is unobservable or replaces the seam with a typed explicit-undefined contract.
