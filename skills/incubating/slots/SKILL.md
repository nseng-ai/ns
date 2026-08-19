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

```bash
ns slot ff-detached
```

The command resolves the repository's configured local trunk and processes
managed Slots in number order. It fast-forwards clean detached Slots only;
already-current Slots are successful no-ops. Attached, dirty, and divergent
Slots remain unchanged as planned skips; the command succeeds when every planned
fast-forward succeeds. A Git operation in progress blocks all mutation by
default. Use `--force` to skip operation-bearing Slots and process the remaining
safe Slots, or `--dry-run` to inspect all intended outcomes without mutation.
Unexpected planning or mutation errors fail the command.

`ff-detached` never modifies the main worktree or attached feature branches. It
cannot update or restack attached branches; update those through their normal
branch workflow. The command does not fetch, reset, rebase, force checkout, or
automatically detach a Slot.

## direnv across slots

Each slot tracks its own direnv `.envrc` approval, so a changed `.envrc`
shows `direnv: error .envrc is blocked` per slot until re-allowed. When slots
report a blocked or stale `.envrc`, or after `.envrc` changes land on trunk,
read [references/direnv.md](references/direnv.md) for the refresh process.
