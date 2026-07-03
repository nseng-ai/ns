# zshrc shell integration renamed to ji

## Summary

Updated the owner machine's `.zshrc` shell integration block from the legacy `sdl`
surface to the new `ji` surface. The block markers now read `ji shell integration`, the
function is `ji()`, the cd-directive environment variable is `JI_CD_DIRECTIVE_FILE`, the
temporary file prefix is `ji-cd`, and the completion line now sources
`ji completion zsh` instead of `sdl completion zsh`.

Verification after the edit found no remaining `.zshrc` matches for the old shell block
markers, `SDL_CD_DIRECTIVE_FILE`, `command sdl`, or `source <(sdl completion zsh)`, and
`zsh -n /Users/schrockn/.zshrc` passed.

## Objective Impact

One manual machine-migration sub-surface is complete: the owner shell rc file no longer
installs or completes the legacy `sdl` wrapper for new zsh sessions. The broader manual
migration roadmap row remains open for saved-plan migration, checkout/worktree slot path
migration, old `refs/sdl/flow-land-backup*` handling, and straggler branch repair.

## Follow-Ups

- Open a fresh zsh session or source `.zshrc` when ready to activate the new wrapper in
  the interactive shell.
- Move or intentionally retire `$XDG_STATE_HOME/sdl/enriched-plan` into the ji namespace.
- Decide whether to preserve, rename, or delete old `refs/sdl/flow-land-backup*` refs.
- Complete checkout/worktree slot path migration and record post-migration evidence.
