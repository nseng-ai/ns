# Checkpoint Extension Migration

## Summary

`cp` is restored as a project-local SDL extension at `.sdl/extensions/cp.ts`. The extension imports only `@sdl/sdl/sdk` plus Node runtime modules, preserves the default checkpoint flow, adds `--dry-run` for safe preview, and removes the inactive built-in `ts/packages/sdl/src/default-commands/cp.ts` implementation. Pi restores only the explicit `/sdl:cp` mirror; old `/code:*` and nested checkpoint aliases remain unavailable.

## Objective Impact

This completes the mutating checkpoint-command slice of the SDL extension architecture Objective. The slice pressure-tested branch refusal, dirty-worktree inspection, staging/commit behavior, model-generated checkpoint messages, validation/repair, output readback, and the preview boundary through the normal project-local SDL extension loader rather than a privileged built-in command object.

## Follow-Ups

- Compare the duplicated git snapshot, model-selection, validation/repair, command-error, and commit helpers against `changes`, future `regenerate-pr`, and future `submit` migrations before promoting any public SDK or kernel helper.
- Keep `/sdl:cp` as the explicit Pi mirror unless a later dynamic Pi discovery design deliberately changes exact mirror registration.
