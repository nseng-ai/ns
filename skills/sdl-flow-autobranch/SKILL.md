---
name: sdl-flow-autobranch
disable-model-invocation: true
description: "Create a Graphite branch from dirty worktree changes by delegating to `ji flow autobranch`."
allowed-tools:
  - "Bash(ji flow autobranch*)"
  - "Bash(git status*)"
metadata:
  internal: true
---

# sdl-flow-autobranch

Create a Graphite branch from dirty worktree changes by delegating to the public `ji flow autobranch` CLI. This is the cross-harness skill path corresponding to Pi `/ji:flow:autobranch`; do not recreate the stash, Graphite, or checkpoint sequence by hand.

## When to use

Use only when the user explicitly asks to autobranch, move current dirty worktree changes to a new branch, or branch pending changes. For a clean latest-commit split, use `sdl-flow-branch-latest-commit` / `ji flow branch-latest-commit` instead. This mutates Git/Graphite state: branches, stashes, and commits may be created.

## Workflow

Optionally inspect state first:

```bash
git status --short --branch
```

Run:

```bash
ji flow autobranch
```

With an explicit branch slug:

```bash
ji flow autobranch --slug <slug>
```

The Flow CLI owns the dirty-worktree transaction: stash pending tracked and untracked changes, create a Graphite branch with `gt create`, restore the stash, then create a checkpoint commit. It refuses clean worktrees with guidance to use `ji flow branch-latest-commit`.

Branch slug derivation uses the SDL slug model contract and `JI_SLUG_MODEL`. Checkpoint message generation uses SDL checkpoint text-generation settings, including `JI_CHECKPOINT_MODEL` with legacy `JI_DEV_CHECKPOINT_MODEL` fallback.

## Failure handling

If `ji flow autobranch` fails, surface its output and stop. Do not manually replay the stash, `gt create`, or checkpoint sequence unless the user explicitly chooses a recovery path after seeing the failure.

## Boundaries

- Graphite/`gt` is part of this command contract.
- This does not submit, land, restack, or create plain git branches.
- Pi may add notification/status UX, but the public command boundary is `ji flow autobranch` / `/ji:flow:autobranch`.
- Hidden `ccc exec autobranch` remains available for internal compatibility; do not use it as the public/cross-harness path.
