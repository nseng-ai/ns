---
name: slots
description: "Manage ns Slot worktrees via the `ns slot` CLI: pool lifecycle (init, checkout, list, free, gc, resize), running a command in every slot with `ns slot foreach`, fast-forwarding detached slots to trunk, and keeping direnv `.envrc` approvals fresh across slots. Use when the user mentions slots, slot worktrees, `ns slot`, foreach across worktrees, or direnv in slots."
allowed-tools:
  - "Bash(ns slot *)"
  - "Bash(git *)"
  - "Bash(direnv *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference ns-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# slots

Slots are numbered, managed git worktrees (`slot-01`, `slot-02`, ...) that hold
branches for parallel work. A slot is either **attached** (a branch is checked
out in it) or **detached** (parked at a commit, usually trunk, ready to accept
a checkout).

This skill covers pool-wide maintenance: running commands across the pool with
`ns slot foreach`, fast-forwarding detached slots to trunk, and keeping direnv
working in every slot. For individual slot lifecycle operations, use
`ns slot --help` and the per-command `--json-schema` output.

## Core commands

- `ns slot init --size N` — create the pool as detached worktrees at trunk.
- `ns slot checkout BRANCH` — check a branch out into the lowest clean detached slot.
- `ns slot list` — show the pool.
- `ns slot free` / `ns slot gc` / `ns slot resize` — reclaim or resize.
- `ns slot foreach -- CMD...` — run a command in the main worktree and every slot.

## foreach ground rules

- The command is a **plain argv**, not a shell line. There is no shell
  interpretation: `ns slot foreach -- sh -c '...'` does **not** work (the `-c`
  is rejected). If you need shell logic, write a small executable script to a
  temp path and pass that script as the command.
- Always pass the command after `--`; flag-bearing commands (e.g. `git clean -fd`)
  require the separator.
- The **main worktree is always included** and runs first; slots follow in
  slot-number order. Exclude specific slots with `-x/--exclude SLOT` (repeatable).
- It refuses to run if any included worktree has a git operation (rebase/merge)
  in progress, and prompts for confirmation unless `--yes` is passed.
- A failure in one worktree does not stop the others; the overall exit code is
  nonzero if any worktree failed.

## Fast-forward detached slots to trunk

To bring parked (detached) slots up to the current local trunk:

```bash
ns slot foreach --yes -- git merge --ff-only master
```

Behavior per worktree:

- **Detached slot that is an ancestor of `master`**: fast-forwards and stays
  detached. This is the intended effect.
- **Main worktree on `master`**: "Already up to date" no-op.
- **Attached feature branches**: normally diverged, so git aborts with "Not
  possible to fast-forward" and changes nothing. This makes the overall exit
  code nonzero — cosmetic, not a problem.
- **Dirty worktree** whose files the fast-forward would touch: git aborts with
  "local changes would be overwritten"; nothing is lost.

`--ff-only` never starts a real merge, so merge conflicts are impossible: each
worktree either moves cleanly or is left exactly as it was.

**Caveat**: an *attached* branch that happens to be a strict ancestor of
`master` (a stale branch with no commits of its own) would also be
fast-forwarded. If the pool might contain such branches and they must not
move, use a guard script instead:

```bash
printf '%s\n' '#!/bin/sh' \
  'git symbolic-ref -q HEAD >/dev/null || exec git merge --ff-only master' \
  > /tmp/ns-ff-detached && chmod +x /tmp/ns-ff-detached
ns slot foreach --yes -- /tmp/ns-ff-detached
rm /tmp/ns-ff-detached
```

Never use `git checkout --detach` or `git reset --hard` in a foreach for this:
both would detach or clobber attached branches, including the main worktree.

## direnv across slots

Each slot is a separate directory, so direnv tracks a separate `.envrc`
approval per slot. The repo's `.envrc` is a tracked file; when it changes,
every slot that picks up the new content shows `direnv: error .envrc is
blocked` until that slot's copy is re-allowed.

Proactive refresh process after `.envrc` changes land on trunk:

1. **Propagate the new `.envrc`** to parked slots by fast-forwarding detached
   slots to trunk (previous section):

   ```bash
   ns slot foreach --yes -- git merge --ff-only master
   ```

   Attached slots pick the change up whenever their branch rebases onto or
   merges trunk; there is nothing slot-specific to do for them beyond the
   normal branch workflow.

2. **Re-approve the `.envrc` in every worktree**:

   ```bash
   ns slot foreach --yes -- direnv allow
   ```

   `direnv allow` is per-directory, so it must run in each slot; foreach does
   exactly that (main worktree included).

3. **Optionally warm each slot** by evaluating the `.envrc` now instead of on
   first `cd` (useful when the `.envrc` does slow work such as dependency
   installs):

   ```bash
   ns slot foreach --yes -- direnv exec . true
   ```

Steps 2–3 are idempotent and safe to rerun any time slots report a blocked or
stale `.envrc`.
