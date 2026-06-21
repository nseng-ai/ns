---
name: code-autobranch
description: "Create a Graphite branch from dirty worktree changes or the latest unpushed commit by delegating to `sdl autobranch`."
allowed-tools:
  - "Bash(sdl autobranch*)"
  - "Bash(git status*)"
metadata:
  internal: true
---

# code-autobranch

Create a Graphite branch from current work by delegating to the public `sdl autobranch` CLI. This is the cross-harness skill path corresponding to Pi `/sdl:autobranch`; do not recreate the stash, Graphite, recovery, or checkpoint sequence by hand.

## When to use

Use only when the user explicitly asks to autobranch, move current work to a new branch, branch pending changes, or extract the latest unpushed commit. This mutates Git/Graphite state: branches, stashes, resets, and commits may be created.

## Workflow

Optionally inspect state first:

```bash
git status --short --branch
```

Run:

```bash
sdl autobranch
```

With an explicit branch slug:

```bash
sdl autobranch --slug <slug>
```

The CLI owns two modes:

- Dirty worktree: stash pending tracked and untracked changes, create a Graphite branch with `gt create`, restore the stash, then create a checkpoint commit.
- Clean worktree: only for an eligible latest unpushed non-root, non-merge commit with no Graphite child branches; create a recovery branch, reset the source branch to the parent, create a Graphite branch, move the commit there, verify the result, and clean up recovery evidence.

Branch slug derivation uses the SDL slug model contract and `SDL_SLUG_MODEL`. Checkpoint message generation uses SDL checkpoint text-generation settings, including `SDL_CHECKPOINT_MODEL` with legacy `SDL_DEV_CHECKPOINT_MODEL` fallback.

## Failure handling

If `sdl autobranch` fails, surface its output and stop. Do not manually replay the stash, `gt create`, reset, recovery-branch, or checkpoint sequence unless the user explicitly chooses a recovery path after seeing the failure.

## Boundaries

- Graphite/`gt` is part of this command contract.
- This does not submit, land, restack, or create plain git branches.
- Pi may add notification/status UX, but the public command boundary is `sdl autobranch` / `/sdl:autobranch`.
- Hidden `ccc exec autobranch` remains available for internal compatibility; do not use it as the public/cross-harness path.
