---
name: ns-flow-gs-branch-latest-commit
disable-model-invocation: true
description: "Move the latest eligible commit to a github/gh-stack child with `ns flow gs branch-latest-commit`."
allowed-tools:
  - "Bash(ns flow gs branch-latest-commit*)"
  - "Bash(git status*)"
---

# ns-flow-gs-branch-latest-commit

Move the latest eligible commit to a child tracked by the official `github/gh-stack` extension.

## Workflow and eligibility

Run `ns flow gs branch-latest-commit`, optionally with `--slug <slug>`. Flow keeps the existing upstream, root, merge, and clean-worktree checks. The source must be topmost with no upstack child. An untracked non-trunk source is adopted with `gh stack init <source>` before destructive mutation; an untracked Git trunk is refused.

Flow creates a recovery branch at the original SHA, pre-creates the child at that SHA, resets the source to its parent, and runs `gh stack add <child>` to adopt and check out the child. It verifies Git and provider topology before deleting recovery evidence.

## Failure handling

Surface command output and stop. Retained initialization is a real side effect. Once adoption may exist, preserve source, child, and recovery branches. Never edit `.git/gh-stack`, delete only the Git child as rollback, or call whole-stack `gh stack unstack`.

## Boundaries

Shared boundaries: `docs/conventions/autobranch-family-boundaries.md`. This skill delegates only to `ns flow gs branch-latest-commit`, mirrored as `/ns:flow:gs:branch-latest-commit`.
