# @ji/slot

`@ji/slot` owns Slot domain logic, operations, the Slot Capability API, and the bundled ji extension contribution for `ji slot ...`. The supported command-line surface is **only** through the ji binary:

```bash
ji slot list
ji slot checkout feature-x
ji slot gt exec stack-branches --format json
```

The package does not expose or install a top-level `slot` executable. The ji kernel discovers Slot through the generic extension manifest rather than importing Slot directly. First-party users that need in-process access should use curated exports such as `@ji/slot/api` rather than parsing command output.

## Installation

Install the ji tool shim with the repository tool installation flow, then invoke Slot commands as `ji slot ...`. There is no `just install-slot` recipe and no supported `$HOME/.local/bin/slot` shim.

## Core commands

- `ji slot init --size N` creates `slot-01` through `slot-N` as detached worktrees at trunk.
- `ji slot checkout BRANCH` checks a branch out into the lowest-numbered clean detached managed slot.
- `ji slot checkout --new NEW [BASE]` creates and checks out a new branch.
- `ji slot checkout --current` moves the current branch into a managed slot.
- `ji slot list` renders the pool from `git worktree list`.
- `ji slot goto`, `ji slot claim`, `ji slot free`, `ji slot gc`, and `ji slot resize` provide the remaining slot lifecycle operations.
- `ji slot foreach -- git clean -fd` runs a command in every managed slot worktree (sequentially, in slot-number order). It aborts when any slot has a git operation in progress, and prompts for confirmation unless `--yes` is passed. Pass the command after `--`; flag-bearing commands (e.g. `-fd`) require the `--` separator.
- `ji slot gt ...` contains Graphite-aware slot navigation and hidden agent exec helpers.

A full pool fails with `pool_full`; run `ji slot free` or `ji slot resize` first.

## Shell integration

Slot navigation remains discoverable from the Slot command tree:

```bash
ji slot shell show --shell zsh
ji slot shell install --shell zsh
ji slot shell install --shell bash
```

`ji slot shell` installs the canonical ji shell wrapper. The wrapper defines `ji()`, uses `JI_CD_DIRECTIVE_FILE`, invokes `command ji "$@"`, and lets successful human-output navigation commands such as `ji slot checkout`, `ji slot goto`, `ji slot gt up`, and `ji slot gt down` move the parent shell.

`--no-clipboard` skips clipboard writes only; it does not disable an active parent-shell `cd`.

During the extension-contract transition, the Slot ji extension uses the current `@ji/kernel/sdk` command metadata. Some legacy short option aliases, hidden-help details, and machine-output cd-directive behavior may differ from the old Clinkr-mounted command group until the generic extension contract grows those features.

## Completion

Standalone Slot completion is not supported. Use ji-level shell completion when available; do not install completion for a `slot` command.
