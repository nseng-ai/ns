# Moved Planned-Branch Up-And-Impl Launch to CCC

## Summary

Moved the cross-domain launch portion of `/planned-branch:up-and-impl` into `@asdl/ccc` while preserving the public planned-branch command family and lower-domain ownership.

- Added `ts/packages/ccc/src/planned-branch-up-and-impl.ts` for the checkout and replacement/new-session launch sequence, including status updates, parent-session propagation, `/planned-branch:impl <key>` dispatch, cancellation recovery text, checkout failure reporting, and replacement-session error rethrow behavior.
- Added the `@asdl/ccc/planned-branch-up-and-impl` package export and focused CCC tests for success, dry-run follow-up formatting, checkout failure, cancellation, pre-replacement new-session failure, and post-replacement rethrow behavior.
- Updated `ts/packages/pi-extensions/src/planned-branch-extension.ts` so the planned-branch adapter still owns command registration, argument parsing, saved-plan resolution, preview/dry-run composition, branch creation, Branch Memory attachment, and planned-branch output presentation, then delegates only the launch orchestration to CCC.
- Preserved public command names: `/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:up-and-impl`, and `/planned-branch:impl`.

## Objective Impact

This completes the planned-branch sub-slice of “Move cross-domain launch orchestration into CCC while preserving lower domain ownership.” The row remains partial because Objective stack implementation orchestration still needs to move or delegate to CCC.

The planned-branch ownership risk is partially de-risked: CCC now owns the repo-opinionated checkout/new-session control flow, while `@asdl/planned-branch` and the planned-branch adapter retain saved-plan, branch creation, Branch Memory attachment, and attached-plan loading semantics.

Validation evidence:

- `bun test --cwd ts/packages/ccc --sequential` passed.
- `bun test --cwd ts/packages/pi-extensions --sequential` passed.
- `bun run --cwd ts check` passed.
- `bun run --cwd ts test` passed.
- `just dprint-check` passed.
- `git diff --check` passed.
- Import-direction searches found no `@asdl/ccc` imports in `ts/packages/planned-branch`, `ts/packages/pi-extension-runtime`, or `ts/packages/asdl-dev`, and no `@asdl/pi-extensions` imports in `ts/packages/ccc`.

## Follow-Ups

- Move or delegate Objective stack implementation orchestration into CCC while keeping Objective record/list/update semantics below.
- Continue keeping planned-branch write/create/impl and Branch Memory semantics outside CCC.
