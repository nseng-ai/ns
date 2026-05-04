# asdl-slots

Work on multiple branches in parallel without stashing, losing your
place, or waiting for a clean working tree. `asdl-slots` gives each
in-flight branch its own dedicated directory, so switching contexts is
just `cd` — your editor, terminal, running processes, and uncommitted
changes all stay exactly where you left them on every other branch.
Pick up a code review, jump on a hotfix, or revisit yesterday's WIP
without disturbing what you're doing now.

## Quick start

```
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
```

## Pool lifecycle

`slot init --size N` creates `slot-01` through `slot-N` as detached
worktrees at trunk. It refuses to run if any managed `slot-XX` worktree
already exists.

`slot resize --size N` grows or shrinks the pool to N total slots.

- **Grow** fills numbering gaps first (e.g. a missing `slot-02` between
  `slot-01` and `slot-03`), then extends past the highest existing
  number.
- **Shrink** removes only clean detached slots above the target size.
  It refuses if any slot it would remove is assigned to a branch or has
  uncommitted changes, and reports the full set of offenders rather than
  failing on the first one.

Capacity changes are always explicit: nothing else in the package
creates or removes slots on demand.

## Working with slots

### `slot checkout BRANCH` / `slot checkout -b NEW [BASE]` / `slot checkout --current`

Checks a branch out into the lowest-numbered clean detached managed
slot. Branches already checked out elsewhere (including in the main
worktree) report their existing location instead of being moved.

- `-b NEW [BASE]` creates `NEW` from `BASE` (or `HEAD` if omitted) before
  allocation.
- `--current` redirects the branch on the current worktree into a slot;
  it refuses if the current worktree is dirty or detached, and rebuilds
  the inventory after the redirect so the moved branch can be assigned
  from actual Git state.

If the pool is full or has no clean detached slot, checkout fails with
a `pool_full` error that lists the current assignments. Run
`slot free` to release a slot, or increase `--size` via `slot resize`
to grow the pool.

## Opt-in shell integration

By default, navigation commands print a `cd <path>` command and, when
available, copy that command to the clipboard. A child process cannot
change its parent shell's working directory directly, so automatic
parent-shell `cd` is opt-in through a shell function wrapper.

### Supported shells and installation

Supported shells are `zsh` and `bash`. If `--shell` is omitted,
`slot shell ...` detects `$SHELL` when it is one of those shells and
otherwise defaults to `zsh`. Other shells can keep using the printed or
copied `cd <path>` fallback.

Install the wrapper for your shell:

```bash
slot shell install --shell zsh
slot shell install --shell bash
```

`slot shell install` appends an idempotent marked block to `.zshrc` or
`.bashrc`. Open a new shell or run `source ~/.zshrc` / `source ~/.bashrc`
to activate it. Inspect the generated wrapper before installing or
redirecting it:

```bash
slot shell show --shell zsh
```

### Behavior and fallback

The wrapper defines a shell function named `slot`. For each invocation,
it creates a temporary directive file, then invokes the real `slot`
binary with `SLOT_CD_DIRECTIVE_FILE=<temp> command slot "$@"` so the
function does not recursively call itself. On successful navigation,
`slot` writes only the raw destination path to that file; the wrapper
reads the path and performs `cd -- <path>` in the parent shell. The
Python command never emits shell code for the wrapper to `eval`, and the
directive file is removed after each invocation.

The directive-file navigation surface is `slot checkout` / `slot co`,
`slot goto`, `slot gt up`, and `slot gt down`. If the wrapper is inactive
or uninstalled, existing fallback behavior remains: commands still print
the `cd <path>` command and optionally copy it. `--no-clipboard` only
skips clipboard writes; it does not disable an active parent-shell `cd`.
Use `command slot ...` for a one-off invocation of the real binary
without the wrapper.

### Non-interactive and JSON behavior

The standalone `slot` binary remains script-safe: without the wrapper, it
cannot change its caller's working directory and only emits normal
command output. JSON commands (`--format json`) and schema requests
(`--schema`) do not write cd directives, so an installed wrapper will not
move the parent shell for machine-readable calls. Scripts that source the
wrapper but need stable machine output should call `command slot ...` or
use `--format json`.

### Troubleshooting

- If `slot checkout ...` or `slot goto ...` still prints `cd <path>` but
  your shell does not move, the wrapper is not active in that shell. Run
  `type slot` and confirm it reports a shell function, then source the rc
  file or open a new shell.
- If `slot shell ... --shell fish` fails, that shell is unsupported for
  automatic parent-shell cd today. Use `zsh`/`bash`, or keep using the
  printed/copied fallback in other shells.
- If the wrapper says `slot: command not found`, make sure the real
  `slot` console script is on `PATH`; the wrapper deliberately uses
  `command slot "$@"` to bypass the shell function and avoid recursion.
- If you need to prevent directory changes for one command, call
  `command slot ...` or use `--format json`. `--no-clipboard` only
  disables clipboard writes.
- If clipboard copying fails, navigation still prints the `cd <path>`
  command and the wrapper can still change directory when active.

### `slot list`

Renders the pool from `git worktree list`. One row per managed `slot-XX`
worktree, showing slot name, `assigned`/`available`, the branch (if
any), and the worktree path. Aliased as `slot ls`.

### `slot goto -n N` / `slot goto -w slot-XX`

Prints and copies a `cd` command for an assigned slot, matching
`slot checkout` / `slot co` navigation behavior. Pass `--no-clipboard`
to print the command without writing the system clipboard.

```
slot goto -n 1
```

Refuses if the slot is detached, missing, or out of range.

### `slot free`

Detaches one or more assigned managed slots back to trunk and keeps the
worktree directories for reuse. Targets are passed via `-n/--num`,
`-w/--wt`, or `-c/--current`, and may be combined; duplicates are
removed and the rest are processed in first-seen order.

`slot free` refuses dirty worktrees and unassigned slots up front, then
rechecks each target immediately before detach so a concurrent change
between validation and action surfaces as `slot_not_assigned` or
`dirty_worktree` rather than corrupting the worktree. Already-freed
slots are reported in any partial-failure message.

### `slot gc`

Sweeps assigned managed slots and frees the ones whose branch has a
merged or closed PR. Open PRs are kept; missing PRs are kept; lookup
errors are reported per-slot; dirty worktrees are skipped. Pass
`--dry-run` to see the plan without freeing, or `-f/--force` to skip the
interactive confirmation.

### `slot gt free-stack`

Graphite-aware. Releases every slot in the current Graphite stack
_except_ the slot holding the current branch and the slot holding
trunk. Uses the
same `find_by_slot` resolution and dirty/assignment checks as
`slot free`.

## What slots does not do

- Does not create slots on demand during checkout — full pool means run
  `slot resize` or `slot free` first.
- Does not persist any assignment metadata. The pool is always derived
  from `git worktree list`. If you need to know when a branch was
  assigned, use Git history.

## Where state lives

```
~/.slots/repos/<repo-name>/worktrees/slot-01/
~/.slots/repos/<repo-name>/worktrees/slot-02/
...
```

Each `slot-XX` is an ordinary Git worktree of the main repo. Inspect
with `git worktree list` from inside the main repo, or with
`slot list` from any of the slot worktrees.

## CLI surface

This package provides:

- Standalone CLI: `slot` console script (declared in `pyproject.toml`).
- ASDL plugin: `asdl slot ...` via the `asdl.plugins` entry point.
- Shell integration subgroup: `slot shell ...`.
- Graphite-aware subgroup: `slot gt ...`.

Run `slot --help` for the full command list and `slot <cmd> --help` for
per-command flags.

## How it works

Git worktrees are the only source of truth.

- A managed slot is a Git worktree at
  `~/.slots/repos/<repo>/worktrees/slot-XX/`.
- A slot is **assigned** when its worktree has a branch checked out, and
  **available** when the worktree is detached.
- The pool size is the number of managed `slot-XX` worktrees on disk.
  Capacity is physical: there is no separate "configured size" stored
  anywhere.
- Inspect the underlying state at any time with `git worktree list`.

There is no persisted branch-to-slot mapping and no reconciliation
layer. Every `slot` command derives the pool's state by listing Git
worktrees.

## See also

- `slot <cmd> --help` — authoritative per-command reference.
- Top-level `AGENTS.md` — repo-wide conventions, including the
  Graphite/`gt` workflow and the runtime Graphite dependency boundary.
