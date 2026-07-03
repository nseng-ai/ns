# Machine migration no-op surfaces recorded

## Summary

Read-only investigation of the owner machine confirmed that three manual-migration
surfaces require no action in the current environment:

- `$XDG_DATA_HOME/sdl/extensions` and `$XDG_DATA_HOME/ji/extensions` are both absent, so
  there is no global extension data directory to move on this machine.
- `$XDG_CONFIG_HOME/sdl/brmem/prompts` and `$XDG_CONFIG_HOME/ji/brmem/prompts` are both
  absent, so there is no brmem prompt config directory to move on this machine.
- The current process exposes no `SDL_*` or `JI_*` environment variables, so there is no
  active process-environment rename to perform from the investigated shell context.

Other manual-migration surfaces remain open: saved plans under
`$XDG_STATE_HOME/sdl/enriched-plan`, the old `sdl shell integration` block and completion
line in `.zshrc`, old `refs/sdl/flow-land-backup*` refs, checkout/worktree slot path
migration, and any straggler branch repair.

## Objective Impact

The manual machine migration roadmap row is partially de-risked: global extension data,
brmem prompt config, and current-process `SDL_*` environment handling are now marked as
complete/no-op for the investigated owner machine. The row remains open because durable
saved-plan data, shell rc cleanup, backup refs, checkout/worktree path migration, and
straggler branch handling are not yet complete.

## Follow-Ups

- Move or intentionally retire `$XDG_STATE_HOME/sdl/enriched-plan` into the ji namespace.
- Replace/remove the old `sdl shell integration` block and `sdl completion zsh` line in
  `.zshrc`.
- Decide whether to preserve, rename, or delete old `refs/sdl/flow-land-backup*` refs.
- Complete checkout/worktree slot path migration and record post-migration `ji objective
  list` evidence.
