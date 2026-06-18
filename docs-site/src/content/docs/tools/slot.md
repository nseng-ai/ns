---
title: slot
description: Work on multiple git branches in parallel, each in its own worktree — switching context is just a cd.
sidebar:
  order: 1
---

`slot` manages a pool of git-worktree-backed slots for working on multiple
branches at once. Reach for it when stashing, re-checking-out, or losing your
place is slowing you down.

```console
$ slot init --size 3
Initialized pool with 3 slot(s) at ~/.slots/repos/myrepo/worktrees
  + slot-01
  + slot-02
  + slot-03

$ slot checkout feature-x
Checked out slot-01 -> feature-x
cd ~/.slots/repos/myrepo/worktrees/slot-01

$ slot list
Slot     Status     Branch      Worktree
slot-01  assigned   feature-x   ~/.slots/repos/myrepo/worktrees/slot-01
slot-02  available              ~/.slots/repos/myrepo/worktrees/slot-02
slot-03  available              ~/.slots/repos/myrepo/worktrees/slot-03

$ slot free -n 1
✓ Freed slot-01 (feature-x)
  Worktree kept at ~/.slots/repos/myrepo/worktrees/slot-01; detached HEAD at trunk
```

## Mental model

A slot is an ordinary Git worktree at
`~/.slots/repos/<repo>/worktrees/slot-NN/`. `slot init --size N` creates the pool;
commands then derive assignments from `git worktree list` rather than persisted
slot metadata.

- **Slot** — one managed `slot-XX` worktree for the current repository.
- **Assigned / available** — assigned means a branch is checked out; available
  means detached at trunk and ready for reuse.
- **Pool** — the physical set of managed worktrees. Capacity is how many
  `slot-XX` directories exist.

## Install

Install the standalone console script from an asdl checkout:

```bash
just install-slot
slot --help
```

The source shim requires the checkout and TypeScript workspace dependencies. Run
`just ts-install` or `pnpm --dir ts install` if dependencies are missing. npm
registry publishing and checkout-free bundling are not part of the current
`slot` distribution model.

## Common commands

| Goal                            | Command                          | Boundary                                      |
| ------------------------------- | -------------------------------- | --------------------------------------------- |
| Create a fixed-size slot pool   | `slot init --size 3`             | Writes Git worktrees.                         |
| Check out a branch into a slot  | `slot checkout feature-x`        | Writes Git worktree checkout state.           |
| Use the short checkout alias    | `slot co feature-x`              | Same as `slot checkout`.                      |
| Inspect assignments             | `slot list` or `slot ls`         | Read-only; derives from `git worktree list`.  |
| Jump back to an assigned slot   | `slot goto -n 1`                 | Prints/copies `cd`; wrapper may change shell. |
| Free an assigned slot           | `slot free -n 1`                 | Detaches the slot at trunk.                   |
| Change pool capacity            | `slot resize --size 5`           | Adds/removes clean detached worktrees.        |
| Free branches with closed PRs   | `slot gc`                        | Can detach assigned slots after confirmation. |
| Install parent-shell navigation | `slot shell install --shell zsh` | Writes a shell rc file block.                 |

## Command reference

Run `slot <cmd> --help` for the installed authoritative reference. The tables
below summarize the stable public surface.

### `slot init`

Create `slot-01` through `slot-N` as detached worktrees at trunk. The command
refuses to run if any managed `slot-XX` worktree already exists.

| Option   | Type / default    | Description                |
| -------- | ----------------- | -------------------------- |
| `--size` | integer, required | Number of slots to create. |

### `slot checkout` / `slot co`

Check a branch out into the lowest-numbered clean detached slot. If the branch is
already checked out elsewhere, `slot` reports the existing location instead of
moving it.

| Option           | Type / default | Description                                                      |
| ---------------- | -------------- | ---------------------------------------------------------------- |
| `<branch>`       | argument       | Existing branch to place in a slot.                              |
| `-b`, `--new`    | `NEW [BASE]`   | Create `NEW` from `BASE`, or from `HEAD` when `BASE` is omitted. |
| `--current`      | boolean, false | Redirect the current branch into a slot.                         |
| `--no-clipboard` | boolean, false | Print the `cd` command without writing the system clipboard.     |

### `slot list` / `slot ls`

Render the pool from `git worktree list`. One row is shown per managed `slot-XX`
worktree.

| Option | Type / default | Description                               |
| ------ | -------------- | ----------------------------------------- |
| None   | —              | Read-only inventory of managed worktrees. |

### `slot goto`

Print and copy a `cd` command for an assigned slot. With shell integration
active, the parent shell can change directories automatically.

| Option           | Type / default | Description                                                  |
| ---------------- | -------------- | ------------------------------------------------------------ |
| `-n`, `--num`    | integer        | Select by slot number, such as `1` for `slot-01`.            |
| `-w`, `--wt`     | string         | Select by worktree name, such as `slot-01`.                  |
| `--no-clipboard` | boolean, false | Print the `cd` command without writing the system clipboard. |

### `slot free`

Detach one or more assigned slots back to trunk and keep the worktree directories
for reuse. Selectors may be combined; duplicates are removed and processed in
first-seen order.

| Option            | Type / default     | Description                                                   |
| ----------------- | ------------------ | ------------------------------------------------------------- |
| `-n`, `--num`     | repeatable integer | Select by slot number.                                        |
| `-w`, `--wt`      | repeatable string  | Select by worktree name.                                      |
| `-b`, `--branch`  | repeatable string  | Select by branch name.                                        |
| `-c`, `--current` | boolean, false     | Select the current worktree's assigned slot.                  |
| `--all`           | boolean, false     | Also close the matching PR and force-delete the local branch. |
| `--dry-run`       | boolean, false     | Show the free/cleanup plan without mutating anything.         |
| `-y`, `--yes`     | boolean, false     | Skip confirmation for destructive cleanup.                    |

### `slot resize`

Grow or shrink the fixed pool. Growing fills numbering gaps first, then extends
past the highest existing number. Shrinking removes only clean detached slots
above the target size.

| Option   | Type / default    | Description                     |
| -------- | ----------------- | ------------------------------- |
| `--size` | integer, required | Target number of managed slots. |

### `slot gc`

Sweep assigned managed slots and free the ones whose branch has a merged or
closed PR. Open PRs, missing PRs, lookup errors, and dirty worktrees are kept or
reported rather than force-freed.

| Option          | Type / default | Description                          |
| --------------- | -------------- | ------------------------------------ |
| `--dry-run`     | boolean, false | Show the plan without freeing slots. |
| `-f`, `--force` | boolean, false | Skip the interactive confirmation.   |

### Shell integration

A child process cannot change its parent shell's working directory, so automatic
`cd` is opt-in through a shell wrapper. Without it, navigation commands print and
optionally copy a `cd <path>` command.

| Command                                | Description                                      |
| -------------------------------------- | ------------------------------------------------ |
| `slot shell install --shell zsh`       | Append the parent-shell wrapper to `.zshrc`.     |
| `slot shell install --shell bash`      | Append the parent-shell wrapper to `.bashrc`.    |
| `slot shell show --shell zsh`          | Print the wrapper without installing it.         |
| `slot completion install --shell zsh`  | Append shell-completion activation to `.zshrc`.  |
| `slot completion install --shell bash` | Append shell-completion activation to `.bashrc`. |
| `slot completion show --shell zsh`     | Print the completion activation line.            |

`--shell` accepts `zsh` or `bash`. If omitted, `slot` detects `$SHELL` when it is
supported and otherwise defaults to `zsh`.

### Graphite: `slot gt`

`slot gt` is the explicit opt-in Graphite-dependent surface. Everything outside
this subgroup works from plain Git worktrees.

| Command              | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `slot gt up`         | Navigate to the immediate upstack Graphite branch.                    |
| `slot gt down`       | Navigate to the immediate downstack Graphite branch.                  |
| `slot gt free-stack` | Free every slot in the current stack except current branch and trunk. |

`slot gt up` and `slot gt down` navigate to an already checked-out target branch
when possible; otherwise they check out the target branch into an available clean
slot from the existing pool before navigating. They do not create slots on
demand.

## What slot does not do

- It does not create slots on demand during checkout. A full pool means run
  `slot resize` or `slot free` first.
- It does not persist assignment metadata. The pool is always derived from
  `git worktree list`.
- It does not delete remote branches during cleanup.

## Where state lives

```text
~/.slots/repos/<repo-name>/worktrees/slot-01/
~/.slots/repos/<repo-name>/worktrees/slot-02/
...
```

Each `slot-XX` is an ordinary Git worktree of the main repo. Inspect the
underlying state with `git worktree list` or `slot list` from any managed slot.

## Conventions

`slot` follows the shared [CLI conventions](/concepts/conventions/), including
help flags, machine-readable output where exposed, and predictable exit codes.

## See also

- `slot <cmd> --help` — authoritative reference for the installed version.
- [Parallel branches with slot](/guides/parallel-branches/)
- [CLI conventions](/concepts/conventions/)
