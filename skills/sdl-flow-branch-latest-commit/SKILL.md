---
name: sdl-flow-branch-latest-commit
disable-model-invocation: true
description: "Move the latest eligible commit to a new Graphite branch by delegating to `ji flow branch-latest-commit`."
allowed-tools:
  - "Bash(ji flow branch-latest-commit*)"
  - "Bash(git status*)"
metadata:
  internal: true
---

# sdl-flow-branch-latest-commit

Move the latest eligible unpushed commit on a clean worktree to a new Graphite child branch by delegating to the public `ji flow branch-latest-commit` CLI. This is the cross-harness skill path corresponding to Pi `/ji:flow:branch-latest-commit`; do not recreate the recovery branch, reset, Graphite, or verification sequence by hand.

## When to use

Use only when the user explicitly asks to extract, split, or move the latest unpushed commit to its own branch and the worktree is clean. For pending dirty worktree changes, use `sdl-flow-autobranch` / `ji flow autobranch` instead. This mutates Git/Graphite state: recovery branches, resets, and commits may be created or moved.

## Workflow

Optionally inspect state first:

```bash
git status --short --branch
```

Run:

```bash
ji flow branch-latest-commit
```

With an explicit branch slug:

```bash
ji flow branch-latest-commit --slug <slug>
```

The Flow CLI owns the clean latest-commit transaction: create a recovery branch, reset the source branch to the parent, create a Graphite branch, move the commit there, verify the result, and clean up recovery evidence. It refuses pending worktree changes with guidance to use `ji flow autobranch`.

Branch slug derivation uses the SDL slug model contract and `JI_SLUG_MODEL`.

## Failure handling

If `ji flow branch-latest-commit` fails, surface its output and stop. Do not manually replay the recovery branch, reset, `gt create`, child reset, verification, or cleanup sequence unless the user explicitly chooses a recovery path after seeing the failure.

## Boundaries

- Graphite/`gt` is part of this command contract.
- This does not submit, land, restack, or create plain git branches.
- Pi may add notification/status UX, but the public command boundary is `ji flow branch-latest-commit` / `/ji:flow:branch-latest-commit`.
- Hidden `ccc exec autobranch` remains available for internal compatibility; do not use it as the public/cross-harness path.
