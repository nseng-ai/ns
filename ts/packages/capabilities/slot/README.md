# @nseng-ai/slot

`@nseng-ai/slot` owns Slot domain logic, operations, the Slot Capability API, and the bundled ji extension contribution for `ns slot ...`. The supported command-line surface is **only** through the ji binary:

```bash
ns slot list
ns slot checkout feature-x
ns slot gt exec stack-branches --format json
```

The package does not expose or install a top-level `slot` executable. The ji kernel discovers Slot through the generic extension manifest rather than importing Slot directly. First-party users that need in-process access should use curated exports such as `@nseng-ai/slot/api` rather than parsing command output.

## Installation

Install the ji tool shim with the repository tool installation flow, then invoke Slot commands as `ns slot ...`. There is no `just install-slot` recipe and no supported `$HOME/.local/bin/slot` shim.

## Core commands

- `ns slot init --size N` creates `slot-01` through `slot-N` as detached worktrees at trunk.
- `ns slot checkout BRANCH` checks a branch out into the lowest-numbered clean detached managed slot.
- `ns slot checkout --new NEW [BASE]` creates and checks out a new branch.
- `ns slot checkout --current` moves the current branch into a managed slot.
- `ns slot list` renders the pool from `git worktree list`.
- `ns slot goto`, `ns slot claim`, `ns slot free`, `ns slot gc`, and `ns slot resize` provide the remaining slot lifecycle operations.
- `ns slot foreach -- git clean -fd` runs a command in every managed slot worktree (sequentially, in slot-number order). It aborts when any slot has a git operation in progress, and prompts for confirmation unless `--yes` is passed. Pass the command after `--`; flag-bearing commands (e.g. `-fd`) require the `--` separator.
- `ns slot gt ...` contains Graphite-aware slot navigation and hidden agent exec helpers.

A full pool fails with `pool_full`; run `ns slot free` or `ns slot resize` first.

## Shell integration

Slot navigation remains discoverable from the Slot command tree:

```bash
ns slot shell show --shell zsh
ns slot shell install --shell zsh
ns slot shell install --shell bash
```

`ns slot shell` installs the canonical ji shell wrapper. The wrapper defines `ns()`, uses `NS_CD_DIRECTIVE_FILE`, invokes `command ns "$@"`, and lets successful human-output navigation commands such as `ns slot checkout`, `ns slot goto`, `ns slot gt up`, and `ns slot gt down` move the parent shell.

`--no-clipboard` skips clipboard writes only; it does not disable an active parent-shell `cd`.

During the extension-contract transition, the Slot ji extension uses the current `@nseng-ai/kernel/sdk` command metadata. Some legacy short option aliases, hidden-help details, and machine-output cd-directive behavior may differ from the old Clinkr-mounted command group until the generic extension contract grows those features.

## Completion

Standalone Slot completion is not supported. Use ji-level shell completion when available; do not install completion for a `slot` command.
