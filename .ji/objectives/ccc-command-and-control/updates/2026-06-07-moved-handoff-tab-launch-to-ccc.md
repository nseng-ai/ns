# Moved Handoff-Tab Launch to CCC

## Summary

Moved the `handoff-tab` cmux/Pi launch orchestration into `@asdl/ccc` while preserving the public `handoff-tab`, `derive_handoff_slug_from_content`, and `handoff_tab_launch` surfaces.

- Added `ts/packages/ccc/src/handoff-tab.ts` for the launch sequence: injected handoff-existence evidence, cmux caller resolution, focused terminal surface creation, tab naming, Pi launch command construction, cmux send, status/update reporting, and manual recovery text.
- Moved focused cmux terminal-tab helpers into `ts/packages/ccc/src/cmux/focused-terminal-tab.ts` and left `ts/packages/pi-extensions/src/cmux/focused-terminal-tab.ts` as a compatibility shim.
- Kept handoff identity, slug derivation, Branch Memory namespace/key handling, create/pickup/list semantics, and `checkHandoffExists` in `@asdl/pi-extensions` / lower handoff surfaces; CCC receives sanitized params and an injected checker.
- Added CCC package exports for `./handoff-tab` and `./cmux/focused-terminal-tab`.
- Added direct CCC launch-orchestration tests and preserved pi-extension handoff-tab registration/tool behavior tests.

## Objective Impact

This completes the handoff-tab sub-slice of “Move cross-domain launch orchestration into CCC while preserving lower domain ownership.” The row remains partial because planned-branch up-and-impl and Objective stack implementation orchestration are still open.

Validation evidence:

- `bun test --cwd ts/packages/ccc` passed.
- `bun test --cwd ts/packages/pi-extensions` passed.
- `bun run --cwd ts check` passed.
- `bun run --cwd ts test` passed.
- `just dprint-check` passed.
- `git diff --check` passed.
- Import-direction searches confirmed CCC code does not import `@asdl/pi-extensions` or `ts/packages/pi-extensions/src/...`; remaining mentions are docs or pi-extension compatibility shims/imports into CCC.

## Follow-Ups

- Move `/planned-branch:up-and-impl` orchestration into CCC while keeping planned-branch primitives below.
- Move or delegate Objective stack implementation orchestration into CCC while keeping Objective record/list/update semantics below.
- None for this handoff-tab slice.
