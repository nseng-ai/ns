# @sdl/slot

`@sdl/slot` owns Slot domain logic, operations, the Slot Capability API, and the bundled SDL extension contribution for `sdl slot ...`. The supported command-line surface is **only** through the SDL binary:

```bash
sdl slot list
sdl slot checkout feature-x
sdl slot gt exec stack-branches --format json
```

The package does not expose or install a top-level `slot` executable. The SDL kernel discovers Slot through the generic extension manifest rather than importing Slot directly. First-party users that need in-process access should use curated exports such as `@sdl/slot/api` rather than parsing command output.

## Installation

Install the SDL tool shim with the repository tool installation flow, then invoke Slot commands as `sdl slot ...`. There is no `just install-slot` recipe and no supported `$HOME/.local/bin/slot` shim.

## Core commands

- `sdl slot init --size N` creates `slot-01` through `slot-N` as detached worktrees at trunk.
- `sdl slot checkout BRANCH` checks a branch out into the lowest-numbered clean detached managed slot.
- `sdl slot checkout --new NEW [BASE]` creates and checks out a new branch.
- `sdl slot checkout --current` moves the current branch into a managed slot.
- `sdl slot list` renders the pool from `git worktree list`.
- `sdl slot goto`, `sdl slot claim`, `sdl slot free`, `sdl slot gc`, and `sdl slot resize` provide the remaining slot lifecycle operations.
- `sdl slot foreach -- git clean -fd` runs a command in every managed slot worktree (sequentially, in slot-number order). It aborts when any slot has a git operation in progress, and prompts for confirmation unless `--yes` is passed. Pass the command after `--`; flag-bearing commands (e.g. `-fd`) require the `--` separator.
- `sdl slot gt ...` contains Graphite-aware slot navigation and hidden agent exec helpers.

A full pool fails with `pool_full`; run `sdl slot free` or `sdl slot resize` first.

## Shell integration

Slot navigation remains discoverable from the Slot command tree:

```bash
sdl slot shell show --shell zsh
sdl slot shell install --shell zsh
sdl slot shell install --shell bash
```

`sdl slot shell` installs the canonical SDL shell wrapper. The wrapper defines `sdl()`, uses `SDL_CD_DIRECTIVE_FILE`, invokes `command sdl "$@"`, and lets successful human-output navigation commands such as `sdl slot checkout`, `sdl slot goto`, `sdl slot gt up`, and `sdl slot gt down` move the parent shell.

`--no-clipboard` skips clipboard writes only; it does not disable an active parent-shell `cd`.

During the extension-contract transition, the Slot SDL extension uses the current `sdl-sdk` command metadata. Some legacy short option aliases, hidden-help details, and machine-output cd-directive behavior may differ from the old Clinkr-mounted command group until the generic extension contract grows those features.

## Completion

Standalone Slot completion is not supported. Use SDL-level shell completion when available; do not install completion for a `slot` command.
