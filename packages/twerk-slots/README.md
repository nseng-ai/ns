# Slots

Slots are worktrees managed in a reusable pool. You can checkout a branch
in a specific worktree as easily as checking out a branch.

- Worktrees are managed in a well-known location
- Worktrees are reused

A pool of reusable git worktrees. Check a branch into a slot, `cd` into
its worktree, do the work, free the slot, and the worktree is ready for
the next branch — without you ever running `git worktree add` by hand.

Slots is one of several [twerk](../../README.md) features. It stands on
its own: you can adopt it without buying into the rest of the toolkit.

## What is a slot?

- **Pool** — a fixed set of 16 slot directories that live under
  `~/.slots/repos/<repo>/worktrees/slot-01`, `slot-02`, and so on. You
  never interact with the pool directly; it's just where worktrees
  live.
- **Slot** — one entry in that pool. A slot is either _assigned_ (a
  branch is checked out in it), _available_ (the directory exists but
  nothing is checked out), or _unallocated_ (the directory hasn't been
  created yet).
- **Assignment** — the mapping from a branch to a slot. When you
  `slot checkout feature/x`, twerk-slots picks a slot, checks
  `feature/x` into its worktree, and records the assignment so next
  time you ask for that branch you land in the same slot.

The payoff: every branch you work on gets its own real directory on
disk. Switching between three in-flight branches is three `cd` commands,
not three `git stash` dances.

## Minimum viable workflow

### Install

Slots is a workspace member of the twerk monorepo. From the repo root:

```sh
uv sync
```

That installs the `slot` CLI into the workspace venv. Activate it
(`source .venv/bin/activate`) or prefix commands with `uv run`.

> **Heads up:** a standalone `pip install twerk-slots` isn't published
> yet, and the `twerk slot` plugin subcommand is currently broken —
> only the standalone `slot` CLI works today. See
> [Pressure-Test Findings](#pressure-test-findings) on the objective
> issue for both gaps.

### 1. Check a branch into a slot

```sh
slot checkout -b feature/my-thing
```

Output:

```
Checked out slot-05 -> feature/my-thing
cd /Users/you/.slots/repos/twerk/worktrees/slot-05
Copied cd command to clipboard.
```

The `cd` line is also copied to your clipboard (macOS). Paste it into
your terminal and you land in the worktree. Drop `-b` to check out an
existing branch instead.

### 2. Work and commit

Inside the worktree, everything is normal git:

```sh
# ... edit files ...
git commit -am "add the thing"
```

The worktree is a real git worktree, sharing the repo's object database
with every other slot. Your commit shows up everywhere you'd expect.

### 3. Free the slot when you're done

From anywhere inside the worktree:

```sh
slot free --current
```

The slot goes back into the pool. The worktree directory stays on disk
(so the next `slot checkout` can reuse it) and is quietly checked out
onto a placeholder branch named `__slot-05-br-stub__`. Your real branch
is untouched and keeps all its commits — `slot free` only releases the
assignment.

You can also free by slot number (`slot free --num 5`) or by worktree
name (`slot free --wt slot-05`).

## Inspecting the pool

```sh
slot list   # alias: slot ls
```

```
Slot      Status        Branch                 Assigned   Worktree
──────────────────────────────────────────────────────────────────
slot-01   assigned      slot-repair              3d ago   /Users/you/.sl…
slot-02   assigned      add-working-memory       20h ago  /Users/you/.sl…
slot-03   assigned      obj-115-part-1           22m ago  /Users/you/.sl…
slot-04   available                                       /Users/you/.sl…
slot-05   unallocated
```

Status values:

- **assigned** — a branch lives in this slot right now.
- **available** — the worktree directory exists and is free to reuse on
  the next checkout.
- **unallocated** — the slot hasn't been created yet; `slot checkout`
  will make it on demand.

## What's next

Later sections (coming in follow-up PRs) will cover:

- Reusing slots, handling evictions, and running `slot gc` to reclaim
  slots whose PRs have merged.
- Wiring slots into parallel agent sessions and Graphite stacks.
- Where state lives on disk (`~/.slots/`, `pool.json`, placeholder
  branches) and what to expect when you go looking.

In the meantime, `slot <command> --help` is the authoritative reference
for flag details, and the source under
`packages/twerk-slots/src/twerk_slots/cli/slot/` is short and readable.
