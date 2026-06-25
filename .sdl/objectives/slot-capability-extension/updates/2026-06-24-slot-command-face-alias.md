# Semantic Update — Slot command-face alias

## Summary

Implemented the Slot command-face strategy slice: `sdl slot ...` is now an in-process alias over Slot's command implementation, while the standalone `slot` CLI remains canonical and compatible.

## Objective impact

- Marked “Define Slot command-face strategy” complete in the roadmap.
- Added a curated Slot command-face export so SDL can mount the Slot command tree without subprocess pass-through or deep imports.
- Added separate `sdl shell show/install` support using `SDL_CD_DIRECTIVE_FILE`; existing `slot shell` integration continues to use `SLOT_CD_DIRECTIVE_FILE` and its own markers.
- Documented that programmatic first-party consumers should continue to use curated Peer APIs such as `@sdl/slot/api`, not parse `sdl slot --format json` output.

## Evidence

- `sdl slot --help` shows the Slot command tree under SDL.
- Hidden Slot exec helpers remain reachable under `sdl slot gt exec ...`.
- `sdl shell show --shell zsh` emits a wrapper containing `SDL_CD_DIRECTIVE_FILE` and `command sdl "$@"`.
- New shell-install tests cover idempotent marker behavior and preservation of unrelated rc-file content.
- Cd directive tests cover `SDL_CD_DIRECTIVE_FILE` as the alias wrapper directive channel.

## Follow-ups

- Decide which `slot gt` operations need curated Peer APIs for machine consumers.
- Continue removing remaining CLI/deep sibling dependencies from orchestration packages.
