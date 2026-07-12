---
name: ns-flow-branch-latest-commit
disable-model-invocation: true
description: "Move the latest eligible commit to a new Graphite branch by delegating to `ns flow branch-latest-commit`."
allowed-tools:
  - "Bash(ns flow branch-latest-commit*)"
  - "Bash(git status*)"
references:
  - ../ns-flow-autobranch/references/autobranch-family-boundaries
metadata:
  internal: true
---

# ns-flow-branch-latest-commit

Move the latest eligible unpushed commit on a clean worktree to a new Graphite child branch by delegating to the `ns flow branch-latest-commit` CLI.

## When to use

Use only when the user explicitly asks to extract, split, or move the latest unpushed commit to its own branch and the worktree is clean. For pending dirty worktree changes, use `ns-flow-autobranch` / `ns flow autobranch` instead. This mutates Git/Graphite state: recovery branches, resets, and commits may be created or moved.

## Workflow

Run:

```bash
ns flow branch-latest-commit
```

With an explicit branch slug:

```bash
ns flow branch-latest-commit --slug <slug>
```

The Flow CLI owns the clean latest-commit transaction: create a recovery branch, reset the source branch to the parent, create a Graphite branch, move the commit there, verify the result, and clean up recovery evidence.

## Failure handling

If `ns flow branch-latest-commit` fails, surface its output and stop; recovery only on an explicit user choice after seeing the failure.

## Boundaries

Shared family boundaries live in `../ns-flow-autobranch/references/autobranch-family-boundaries.md`.

Command-specific public boundary: this skill delegates only to `ns flow branch-latest-commit`, mirrored in Pi as `/ns:flow:branch-latest-commit`.
