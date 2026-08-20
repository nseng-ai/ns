---
name: ns-flow-gs-autobranch
disable-model-invocation: true
description: "Create a github/gh-stack branch from dirty worktree changes with `ns flow gs autobranch`."
allowed-tools:
  - "Bash(ns flow gs autobranch*)"
  - "Bash(git status*)"
---

# ns-flow-gs-autobranch

Create a branch with the official `github/gh-stack` extension by delegating to `ns flow gs autobranch`.

## Workflow

Run `ns flow gs autobranch`, optionally with `--slug <slug>`. Flow owns stashing, `gh stack add`, stash restoration, and the checkpoint commit. An untracked non-trunk source is adopted with `gh stack init <source>` before branch creation. An untracked Git trunk is refused before stash or mutation; create or check out a non-trunk source first.

## Failure handling

Surface command output and stop. Initialization is durable and may be retained after a later failure. If adoption is ambiguous, preserve the source, child, and recovery branches; never delete only the Git child or edit `.git/gh-stack`.

## Boundaries

Shared boundaries: `docs/conventions/autobranch-family-boundaries.md`. This skill delegates only to `ns flow gs autobranch`, mirrored as `/ns:flow:gs:autobranch`.
