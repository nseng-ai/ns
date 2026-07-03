# Flow Changes Buffered Report Migration

## Summary

`sdl flow changes` now follows the buffered report house style for dirty worktrees: it renders an `Outstanding changes on <branch>` title, a `Summary` section for the model-generated bullets, and a `Files` section for raw `git status --porcelain=v1` lines. The clean-worktree output remains the exact minimal message: `Working tree is clean; no outstanding changes.`

## Objective impact

This marks `sdl flow changes` done in `cli-surface-audit.md` for the active buffered list/detail/report row. The command remains read-only, keeps model-selection and failure behavior unchanged, and preserves the existing 50-line file display cap plus omitted-count line.

## Follow-ups

No generalized report wrapper was extracted. The direct command-local renderer remains small enough, and the next P1 buffered surfaces should provide more evidence before introducing shared title/section/footer plumbing.

Remaining P1 work stays with Objective/status and Slot command surfaces tracked in `cli-surface-audit.md`.

## Validation evidence

- Passed: `pnpm --dir ts --filter sdl-flow test`
- Passed: `pnpm --dir ts --filter sdl-flow check`
