# Branch Context Command Surface Moved to Pi

## Summary

The first implementation slice moved the concrete implementation slash-command surface out of `@sdl/branch-context/api` and into Pi presentation code. `@sdl/branch-context` no longer exports `IMPL_BRANCH_CONTEXT_COMMAND_NAME` or `formatImplBranchContextCommand` from its API/root, and the Branch Context-owned implementation-command module/test were removed. Pi now owns the formatter beside `IMPL_BRANCH_CONTEXT_COMMAND_NAME`, while CCC consumes the neutral `@sdl/pi/commands` surface only to construct Pi launch commands.

Validation evidence:

- Runner subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-XxpxKv/e391c6a1-26bf-4fe1-b07d-3d4a690ffd00.jsonl`
- `pnpm --dir ts --filter @sdl/branch-context run test` — 9 files / 123 tests passed.
- `pnpm --dir ts --filter @sdl/pi run test` — 70 files / 919 tests passed.
- `pnpm --dir ts --filter @sdl/ccc run test` — 13 files / 240 tests passed.
- `rg -n "IMPL_BRANCH_CONTEXT_COMMAND_NAME|formatImplBranchContextCommand|@sdl/pi" ts/packages/branch-context ts/packages/branch-context/package.json` now shows only the remaining package manifest dependency on `@sdl/pi`, which is intentionally left for the next slice.

## Objective Impact

This completes the command-surface ownership slice and confirms the pre-change inventory: the only remaining Branch Context → Pi edge is the package manifest dependency. User-visible command names and launch strings remain `/sdl:branch-context:impl-attached-plan <key>`, now produced from Pi/CCC presentation-owned code rather than the Branch Context Capability API.

## Follow-Ups

- Remove `@sdl/pi` from `ts/packages/branch-context/package.json` and update the lockfile if needed.
- Tighten `ts-guard` deferred-cycle expectations so Branch Context is no longer grandfathered into the legacy autobranch/pi/sdl component.
- Record final stale-edge and parent Objective evidence after the remaining slices land.
