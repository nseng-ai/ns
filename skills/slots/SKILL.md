---
name: slots
description: "Manage ns Slot worktrees. Use for Slot pool lifecycle, `ns slot foreach`, refreshing detached slots from trunk, or direnv approvals across Slot worktrees."
allowed-tools:
  - "Bash(ns slot *)"
  - "Bash(git *)"
  - "Bash(direnv *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference ns-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

<!-- PROVENANCE: This skill is entirely LM-generated and has not yet been human-curated. Treat its guidance as plausible but unverified; curation pass still required. -->

# slots

Slots are numbered managed worktrees (`slot-01`, `slot-02`, ...). An
**attached** Slot holds a branch; a **detached** Slot is parked at a commit and
available for checkout.

For lifecycle commands, run `ns slot --help`, then the subcommand's `--help` or
`--json-schema`. The guidance below covers pool-wide maintenance.

## foreach ground rules

- Pass a plain argv after `--`; shell operators and globbing are not interpreted.
  Invoke a shell explicitly (`ns slot foreach -- sh -c '...'`) or use a temporary
  executable for complex logic.
- The main worktree runs first, followed by Slots in number order. Exclude a Slot
  with repeatable `-x/--exclude SLOT`; the main worktree cannot be excluded.
- Any included worktree with a git operation in progress blocks the whole run.
- Human mode prompts unless `--yes` is passed; JSON mode requires `--yes`.
- A failed invocation does not stop later worktrees. The aggregate exits nonzero.

## Fast-forward detached slots to trunk

Use a guard so attached branches—including the main worktree and stale branches
that trunk could fast-forward—stay unchanged. Replace `master` if the repository
uses another trunk branch.

```bash
ns slot foreach --yes -- sh -c \
  'git symbolic-ref -q HEAD >/dev/null || exec git merge --ff-only master'
```

A detached Slot fast-forwards only when its commit is an ancestor of trunk. A
diverged or dirty Slot fails without starting a merge; later Slots still run.
Keep attached worktrees intact: use neither `git checkout --detach` nor
`git reset --hard` across the pool.

## direnv across slots

Each slot tracks its own direnv `.envrc` approval, so a changed `.envrc`
shows `direnv: error .envrc is blocked` per slot until re-allowed. When slots
report a blocked or stale `.envrc`, or after `.envrc` changes land on trunk,
read [references/direnv.md](references/direnv.md) for the refresh process.
