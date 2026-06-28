# Update: deterministic `sdl handoff create`

Implemented the deterministic Handoff create slice.

## Command contract

- Added grouped SDL leaf `sdl handoff create` through the checked-in `.sdl/extensions/handoff` package.
- Requires explicit `--slug`; slug validation uses the existing flat Handoff slug/key contract.
- Reads final Handoff Artifact Markdown from stdin by default when `--file` is omitted.
- Supports `--file <path>` as the alternate content source.
- Defaults to the current branch; `--branch <branch>` stores on an explicit branch.
- Refuses to overwrite an existing artifact with stable error code `handoff_already_exists`.
- Returns Clinkr/SDL result-envelope data with `namespace`, `branch`, `slug`, `key`, `entry_locator`, `commit`, and `source_file`.
- Does not add content/model-derived slugging, overwrite flags, automatic pickup/continuation, standalone CLI cutover, or public SDL SDK author APIs.

## Storage/API evidence

- Added Handoff-owned create core in `@sdl/handoff`: `prepareHandoffCreation(...)` and `createHandoffArtifact(...)`.
- Exported create core and types from `@sdl/handoff/api`.
- Preserved storage compatibility: namespace `handoff`, flat `<slug>.md` keys, branch-scoped storage, existing Branch Memory locator encoding, and no-overwrite preflight via `checkEntry` before reading stdin/file content.
- Added an injected `BrmemSourceReader` seam to Handoff contexts so source reading is fake-backed in tests and not performed inside storage core.

## Test and validation evidence

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/handoff/test packages/sdl/test/scenario/handoff-cli.test.ts` passed after implementation.
- `just ts-format-check` initially found formatting issues in touched TypeScript files; `just ts-format-fix` was run.
- `just ts-format-check` passed after autofix.
- `just ts-check` passed.
- `just ts-guard` passed.
- `just ts-deps-check` passed.
- `just ts-lint` passed with existing warnings in untouched `packages/sdl/test/scenario/handoff-cli-contract.test.ts`.
- `just ts-test` passed: 360 files / 3539 tests.
- `just dprint-check` passed.
- Manual non-mutating checks passed:
  - `sdl handoff --help`
  - `sdl handoff create --help`
  - `sdl handoff create --json-schema`

## Remaining follow-ups

- Implement mechanical `sdl handoff pickup`.
- Align Pi Handoff adapters/skills over Handoff-owned API/SDL command behavior while preserving public Pi names and continuation UX.
- Run standalone `handoff` CLI cutover inventory and remove the standalone CLI only after SDL parity is complete.
- Refresh Handoff/SDL/Pi/context documentation at the Objective documentation stage.
