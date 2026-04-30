# twerk-slots

A worktree pool manager built on top of `git worktree`. `twerk-slots`
keeps a small, fixed pool of pre-created worktrees under
`~/.slots/repos/<repo>/worktrees/` and assigns branches into them with
`slot checkout`, so switching between in-flight branches is `cd
slot-XX/` instead of stash-juggling the main worktree.

## Mental model

Git worktrees are the only source of truth.

- A managed slot is a Git worktree at
  `~/.slots/repos/<repo>/worktrees/slot-XX/`.
- A slot is **assigned** when its worktree has a branch checked out, and
  **available** when the worktree is detached.
- The pool size is the number of managed `slot-XX` worktrees on disk.
  Capacity is physical: there is no separate "configured size" stored
  anywhere.
- Inspect the underlying state at any time with `git worktree list`.

There is no `pool.json`, no persisted branch-to-slot mapping, no
`assigned_at` timestamp, and no reconciliation layer. Every `slot`
command derives the pool's state by listing Git worktrees.

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

`slot resize --size N` grows or shrinks the pool to N slots.

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
slot, including the main worktree case (already-checked-out branches
report their existing location instead of being moved).

- `-b NEW [BASE]` creates `NEW` from `BASE` (or `HEAD` if omitted) before
  allocation.
- `--current` redirects the branch on the current worktree into a slot;
  it refuses if the current worktree is dirty or detached, and rebuilds
  the inventory after the redirect so the moved branch can be assigned
  from actual Git state.

If the pool is full or has no clean detached slot, checkout fails with
a `pool_full` error that lists the current assignments. Run
`slot free` to release a slot, or `slot resize --size N+1` to grow the
pool.

### `slot list`

Renders the pool from `git worktree list`. One row per managed `slot-XX`
worktree, showing slot name, `assigned`/`available`, the branch (if
any), and the worktree path. Aliased as `slot ls`.

### `slot goto --num N` / `slot goto --wt slot-XX`

Prints the worktree path for an assigned slot. Use shell substitution to
`cd` into it:

```
cd "$(slot goto --num 1)"
```

Refuses if the slot is detached, missing, or out of range.

### `slot free`

Detaches one or more assigned managed slots back to trunk and keeps the
worktree directories for reuse. Targets are passed via `-n/--num`,
`-w/--wt`, or `-c/--current`, and may be combined; targets are
deduplicated and processed in first-seen order.

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
_except_ the slot at the current branch and the slot at trunk. Uses the
same `find_by_slot` resolution and dirty/assignment checks as
`slot free`.

## What slots does not do

- Does not create slots on demand during checkout — full pool means run
  `slot resize` or `slot free` first.
- Does not persist any assignment metadata. The pool is always derived
  from `git worktree list`.
- Does not carry an `assigned_at` timestamp or any other freshness data.
  If you need to know when a branch was assigned, use Git history.
- Does not clean up legacy `pool.json` files. Earlier versions of this
  package kept a `pool.json` under `~/.slots/repos/<repo>/`; orphans
  are inert and left untouched. Delete them by hand if they bother you.

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
- Twerk plugin: `twerk slot ...` via the `twerk.plugins` entry point.
- Graphite-aware subgroup: `slot gt ...`.

Run `slot --help` for the full command list and `slot <cmd> --help` for
per-command flags.

## See also

- `slot <cmd> --help` — authoritative per-command reference.
- Top-level `AGENTS.md` — repo-wide conventions, including the
  Graphite/`gt` workflow and the runtime Graphite dependency boundary.
