# Moved Objective Stack Implementation Orchestration to CCC

## Summary

Moved the orchestration behind public `/objective:stack-impl` into `@asdl/ccc` while preserving the public command name and leaving Objective record/list/update semantics below CCC.

- Added `ts/packages/ccc/src/objective-stack-impl.ts` and exported it as `@asdl/ccc/objective-stack-impl`.
- Extracted active Objective selection into neutral `@asdl/pi-extension-runtime/objective-selection`, including `objective list --format json`, Objective diff/status checks, changed-first picker behavior, cancellation handling, and no-active-Objective notifications.
  The shared helper is used by `/objective:stack-impl` and by the existing `/objective:next`, `/objective:current`, and `/objective:update` pickers, so those commands now share the same parallel diff/status evidence collection and combined `checking Objective changes…` status label.
- Updated `ts/packages/pi-extensions/src/objective.ts` so the Objective extension still registers `/objective:stack-impl` through the public Objective surface, but delegates stack implementation orchestration to CCC.
- Added focused CCC tests for explicit slug dispatch, skill expansion/fallback prompts, no-arg active Objective selection, changed-Objective grouping, second-picker behavior, cancellation, and zero-active-Objective handling.
- Updated CCC, pi-extension, runtime, and context-map language to record the ownership boundary.

## Objective Impact

This completes the Objective stack implementation sub-slice of “Move cross-domain launch orchestration into CCC while preserving lower domain ownership.” With handoff-tab launch, planned-branch up-and-impl launch, and Objective stack implementation orchestration now CCC-owned, the roadmap row is complete.

Validation evidence:

- `bun test --cwd ts/packages/pi-extension-runtime --sequential` passed.
- `bun test --cwd ts/packages/ccc --sequential` passed.
- `bun test --cwd ts/packages/pi-extensions --sequential` passed.
- `bun run --cwd ts check` passed.
- `bun run --cwd ts test` passed.
- `just dprint-check` passed.
- `git diff --check` passed.
- Import-direction checks showed no lower-package imports of `@asdl/ccc` and no CCC imports of `@asdl/pi-extensions` or `ts/packages/pi-extensions/src`.

## Follow-Ups

- Run full workspace tests and formatting/diff checks before branch closeout.
- Continue with later CCC migration rows for source-control command/control workflows and workspace status splitting.
