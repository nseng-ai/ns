---
name: ns-flow-autobranch
disable-model-invocation: true
description: "Create a Graphite branch from dirty worktree changes by delegating to `ns flow autobranch`."
allowed-tools:
  - "Bash(ns flow autobranch*)"
  - "Bash(git status*)"
references:
  - references/autobranch-family-boundaries
metadata:
  internal: true
---

# ns-flow-autobranch

Create a Graphite branch from dirty worktree changes by delegating to the `ns flow autobranch` CLI.

## When to use

Use only when the user explicitly asks to autobranch, move current dirty worktree changes to a new branch, or branch pending changes. For a clean latest-commit split, use `ns-flow-branch-latest-commit` / `ns flow branch-latest-commit` instead. This mutates Git/Graphite state: branches, stashes, and commits may be created.

## Workflow

Run:

```bash
ns flow autobranch
```

With an explicit branch slug:

```bash
ns flow autobranch --slug <slug>
```

The Flow CLI owns the dirty-worktree transaction: stash pending tracked and untracked changes, create a Graphite branch with `gt create`, restore the stash, then create a checkpoint commit.

## Failure handling

If `ns flow autobranch` fails, surface its output and stop; recovery only on an explicit user choice after seeing the failure.

## Boundaries

Shared family boundaries live in `references/autobranch-family-boundaries.md`.

Command-specific public boundary: this skill delegates only to `ns flow autobranch`, mirrored in Pi as `/ns:flow:autobranch`.
