# Moved Planned-Branch Up-and-Impl Launch to CCC

## Summary

Moved the launch portion of `/planned-branch:up-and-impl` into `@asdl/ccc` while preserving the public planned-branch slash command behavior and leaving planned-branch domain primitives below CCC.

- Added `ts/packages/ccc/src/planned-branch-up-and-impl.ts` for dry-run follow-up formatting, planned-branch checkout, replacement Pi session startup, `/planned-branch:impl <key>` dispatch, status progression, cancellation recovery text, and typed launch failure results.
- Exported the new module from `ts/packages/ccc/package.json` as `@asdl/ccc/planned-branch-up-and-impl`.
- Updated `ts/packages/pi-extensions/src/planned-branch-extension.ts` so the public `/planned-branch:up-and-impl` adapter still resolves the saved plan, derives the slug/target branch, creates and attaches the planned branch, and renders planned-branch messages, but delegates checkout/new-session launch orchestration to CCC.
- Added focused CCC tests in `ts/packages/ccc/test/planned-branch-up-and-impl.test.ts` and preserved existing pi-extension tests covering public command behavior.
- Updated `ts/packages/ccc/CONTEXT.md` to record that planned-branch up-and-impl launch orchestration is CCC-owned while storage/slugging/create/load primitives remain lower capabilities.

## Objective Impact

This completes the planned-branch up-and-impl sub-slice of “Move cross-domain launch orchestration into CCC while preserving lower domain ownership.” The row remains partial because Objective stack implementation orchestration is still open.

Validation evidence:

- `bun test --cwd ts/packages/ccc --sequential` passed.
- `bun test --cwd ts/packages/pi-extensions --sequential` passed.
- `bun run --cwd ts check` passed.
- `bun run --cwd ts test` passed.
- Import-direction searches returned no matches for lower-package imports of `@asdl/ccc` and no CCC imports of `@asdl/pi-extensions` or `ts/packages/pi-extensions/src`.

## Follow-Ups

- Move or delegate Objective stack implementation orchestration into CCC while keeping Objective record/list/update semantics below.
- Run final formatting and diff checks before branch closeout.
