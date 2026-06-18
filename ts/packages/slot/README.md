# @asdl/slot

TypeScript-backed `slot` CLI for working on multiple branches in parallel without stashing, losing your place, or waiting for a clean working tree. `slot` gives each in-flight branch its own dedicated Git worktree, so switching contexts is just `cd` and every other branch keeps its editor state, terminal state, running processes, and uncommitted changes.

The standalone `slot` command is the default public surface. There is no TypeScript `asdl.plugins` analog; the legacy `asdl slot ...` Python plugin surface is parked with the dormant Python fallback package.

## Install/run model

From an asdl checkout:

```bash
just install-slot
```

`just install-slot` installs `$HOME/.local/bin/slot` as a source shim to `ts/packages/slot/src/cli.ts`. `just install-tools` includes `install-slot` and installs the other TypeScript-backed tool shims as well.

The shim requires this checkout and the TypeScript workspace dependencies. Run `just ts-install` or `pnpm --dir ts install` if dependencies are missing. npm registry publishing and checkout-free bundling are out of scope for the current distribution model.

## Quick start

```bash
slot init --size 3
slot checkout feature-x
slot list
```

`slot init --size N` creates `slot-01` through `slot-N` as detached worktrees at trunk. `slot checkout BRANCH` checks a branch out into the lowest-numbered clean detached managed slot. `slot list` renders the pool from `git worktree list`.

## Pool lifecycle

`slot init --size N` creates `slot-01` through `slot-N` as detached worktrees at trunk. It refuses to run if any managed `slot-XX` worktree already exists.

`slot resize --size N` grows or shrinks the pool to N total slots.

- Grow fills numbering gaps first, then extends past the highest existing number.
- Shrink removes only clean detached slots above the target size and reports all assigned, dirty, or operation-in-progress offenders.

Capacity changes are always explicit. No other command creates or removes slots on demand.

## Working with slots

### `slot checkout BRANCH` / `slot checkout -b NEW [BASE]` / `slot checkout --current`

Checks a branch out into the lowest-numbered clean detached managed slot. Branches already checked out elsewhere report their existing location instead of being moved.

- `-b NEW [BASE]` creates `NEW` from `BASE` or `HEAD` before allocation.
- `--current` moves the current worktree branch into a slot after planning availability and safety checks.

A full pool fails with `pool_full`; run `slot free` or `slot resize` first.

### `slot claim BRANCH`

Moves an existing local branch into a managed slot worktree. From the main worktree, it can check out an unassigned local branch into the lowest available clean detached slot. From a managed slot, it can move the branch into the current slot after detaching a source slot when safe.

### `slot goto -n N` / `slot goto -w slot-XX`

Prints and copies a `cd <path>` command for an assigned slot. Pass `--no-clipboard` to skip clipboard writes.

### `slot free`

Detaches one or more assigned managed slots back to trunk and keeps the worktree directories for reuse. Targets can be selected by slot number, worktree name, branch, current worktree, or `--all`.

`--all` also closes the matching PR and force-deletes the local branch after the slot worktree has detached. Human mode prompts for destructive cleanup unless `--yes` is passed; JSON mode never prompts.

### `slot gc`

Sweeps assigned managed slots and frees slots whose branch has a merged or closed PR. Open PRs and missing PRs are kept. Use `--dry-run` to preview or `--force` to skip interactive confirmation.

## Shell integration

Supported shells are zsh and bash. A child process cannot change its parent shell's working directory, so automatic parent-shell `cd` is opt-in through a shell function wrapper.

```bash
slot shell show --shell zsh
slot shell install --shell zsh
slot shell install --shell bash
```

`slot shell install` appends an idempotent marked block to `.zshrc` or `.bashrc`. The wrapper defines a shell function named `slot`, creates a temporary directive file, invokes the real CLI with `SLOT_CD_DIRECTIVE_FILE=<temp> command slot "$@"`, reads a successful human navigation directive, and performs `cd -- <path>` in the parent shell.

Navigation directives are used by human-output navigation commands such as `slot checkout`, `slot goto`, `slot gt up`, and `slot gt down`. `--format json` and `--json-schema` do not write cd directives, so machine-readable calls do not move the parent shell. `--no-clipboard` skips clipboard writes only; it does not disable an active parent-shell `cd`.

## Completion

Supported shells are zsh and bash.

```bash
slot completion show --shell zsh
slot completion install --shell zsh
slot completion install --shell bash
```

`slot completion install` appends an idempotent static completion block to the selected rc file. The TypeScript port intentionally does not use Click's `_SLOT_COMPLETE` protocol.

## Graphite-aware commands

`slot gt up` and `slot gt down` navigate to the immediate upstack or downstack Graphite branch. If the branch is already checked out in any worktree, `slot` prints/copies that worktree path; otherwise it checks the branch out into the lowest-numbered clean detached managed slot.

`slot gt free-stack` releases every slot in the current Graphite stack except the current branch and trunk. Graphite behavior is deliberately confined to the `slot gt` subgroup.

## Where state lives

```text
~/.slots/repos/<repo-name>/worktrees/slot-01/
~/.slots/repos/<repo-name>/worktrees/slot-02/
```

Each `slot-XX` is an ordinary Git worktree. The pool is derived from `git worktree list`; there is no persisted branch-to-slot mapping or separate configured-size store.

## See also

- `slot --help` and `slot <cmd> --help` for authoritative command flags.
- `packages/asdl-slots/README.md` for the dormant legacy Python fallback context.
