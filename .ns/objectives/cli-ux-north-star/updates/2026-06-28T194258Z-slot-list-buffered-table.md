# Semantic Update: Slot List Buffered Table Migration

`2026-06-28T19:42:58Z`

## What changed

- Migrated `sdl slot list` / `sdl slot ls` human output from `@sdl/core/text-table` to the house-style `@sdl/cli-theme` buffered table primitive.
- Non-empty human output now includes the concise title `Slots for <repo>` followed by the existing five columns: `SLOT`, `STATUS`, `BRANCH`, `OPERATION`, `WORKTREE`.
- Slot names use the accent intent, assigned statuses use success intent, and available statuses use muted intent. Plain/no-ANSI output preserves the exact words.
- Empty-pool wording remains unchanged: `No slots initialized for <repo>.`

## Contracts preserved

- `list` and `ls` still route through the same renderer.
- JSON output and JSON schema shapes are unchanged.
- Row data semantics are unchanged: branch and operation still render as `—` when absent, and active operations still render as `<operation> in progress`.

## Report-wrapper assessment

This is the second buffered list/report pilot after `sdl handoff list`. The repeated shape is still limited to simple title + table + command-local empty handling, so a generalized report wrapper remains deferred. `renderTable` direct usage is still clearer than extracting a thin wrapper prematurely.

## Validation

- `pnpm --dir ts --filter @sdl/slot test`
- `pnpm --dir ts --filter @sdl/slot check`
