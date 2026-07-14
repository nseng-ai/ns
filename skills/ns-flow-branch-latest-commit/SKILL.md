---
name: ns-flow-branch-latest-commit
disable-model-invocation: true
description: "Move the latest eligible commit to a new Graphite branch by delegating to `ns flow branch-latest-commit`."
allowed-tools:
  - "Bash(ns flow branch-latest-commit*)"
  - "Bash(git status*)"
metadata:
  internal: true
---

# ns-flow-branch-latest-commit

Move the latest eligible commit on a clean worktree to a new Graphite child branch by delegating to the `ns flow branch-latest-commit` CLI.

## When to use

Use only when the user explicitly asks to extract, split, or move the latest commit to its own branch and the worktree is clean. For pending dirty worktree changes, use `ns-flow-autobranch` / `ns flow autobranch` instead. This mutates Git/Graphite state: recovery branches, resets, and commits may be created or moved.

## Eligibility contract

The command permits a latest commit when its source branch has no upstream, is locally ahead of its upstream, or is exactly synchronized and is not the configured Graphite trunk. No-upstream and local-ahead commits remain eligible even on trunk; the trunk lookup is conditional on exact synchronization. After a synchronized non-trunk split, the upstream remains unchanged, and the user must explicitly run `ns flow submit` from the new child branch to publish the reshaped stack.

The command refuses remote-ahead and diverged branches, synchronized Graphite trunk, branches with existing children, root commits, and merge commits. Eligibility checks use local Git tracking refs only; they do not implicitly fetch. The operation is local-only and does not push, publish, submit, or update PRs. Never authorize or perform automatic submission.

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

Shared family boundaries live in `docs/conventions/autobranch-family-boundaries.md` (repo root).

Command-specific public boundary: this skill delegates only to `ns flow branch-latest-commit`, mirrored in Pi as `/ns:flow:branch-latest-commit`.
