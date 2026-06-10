# @asdl/plans migrated to clinkr

## Summary

The first CLI migration is complete: `@asdl/plans` now builds its command tree through `@asdl/clinkr` instead of its hand-rolled argv parser. The migrated CLI exposes a `buildCli()` API returning `ClinkrGroup<PlansCliContext>`, keeps the existing `runCli(args, deps)` wrapper for runtime/tests, and defines schema-derived `list`, hidden `exec write`, and hidden `exec resolve` commands. The old parser helpers and hardcoded top-level/list/exec/write/resolve help functions were deleted.

The migration also absorbed the expected feed-forward framework fixes before the next CLI migrations:

- root-group `--version`/`-V` support;
- root-group `--runtime` diagnostics support;
- compact `legacyMachine` serialization so `plans` keeps byte-exact compact `JSON.stringify` machine output;
- no generated `help` subcommand;
- pre-parse bare-group help handling so bare groups still print help to stdout/exit 0 without degrading unknown-command errors into excess-argument errors.

The stale `--runtime` help-byte fixtures in the four CLI surface-pinning suites were refreshed first. Verification evidence so far: `cd ts && pnpm vitest run packages/plans packages/planned-branch packages/asdl-dev packages/pr-address`; `cd ts && pnpm vitest run packages/clinkr`; `cd ts && pnpm vitest run packages/plans`; `pnpm --dir ts/packages/plans run check`; `pnpm --dir ts/packages/clinkr run check` all passed.

## Objective Impact

- Roadmap row "Pin current CLI behavior with scenario tests where coverage is missing" is now `[x]`: the known stale `--runtime` fixture failures were refreshed and the four package scenario suites passed together.
- Roadmap row "Migrate `@asdl/plans` to clinkr" is now `[x]`: `plans` uses clinkr for parsing/help/dispatch, preserves byte-exact compact `--format json` success and domain-failure bodies through `legacyMachine`, preserves human success output bytes, and pins accepted clinkr surface divergences in its scenario suite.
- The first migration de-risked clinkr's generated-parameter model for a real CLI and produced reusable API corrections for the remaining migrations (`planned-branch`, `asdl-dev`, `pr-address`).
- The umbrella migration-debt ledger gained an entry recording the accepted clinkr CLI surface divergences, starting with `@asdl/plans`.

## Follow-Ups

- Migrate `@asdl/planned-branch` next using the corrected clinkr API.
- Continue to preserve each CLI's legacy `--format json` body bytes through `legacyMachine` until the umbrella end-of-migration debt burn-down.
- Call out the accepted clinkr surface divergences in the PR description for this migration.
