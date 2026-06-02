# Path-Sensitive Filesystem Hardening Evidence

## Summary

The second roadmap row is complete. `skillx cleanup` now refuses unsafe removal targets before `shutil.rmtree(...)`: target symlinks, broken symlinks, non-directories, missing paths, wrong-prefix directories, paths outside the resolved temp root, lexical traversal escapes, and parent-symlink escapes. Valid `skillx.*` directories under the resolved temp root still remove successfully, and the hidden exec CLI continues to return JSON success/error payloads.

`areg init` now rejects symlinked managed prose/config paths before `npx skills add` runs: `areg.json`, `AGENTS.md`, `CLAUDE.md`, `.claude`, and `.claude/settings.local.json`. The tests assert the install fake is not invoked and symlink targets remain unchanged.

Verification passed:

- `uv run pytest packages/areg/tests/unit/test_skillx.py packages/areg/tests/scenario/test_skillx_cli.py packages/areg/tests/scenario/test_init_project.py -q`
- `uv run pytest packages/areg/tests -q`
- `just`

## Objective Impact

The second roadmap row is marked complete. The Objective now records the conservative symlink policy as intentional: managed `areg init` files/directories are not followed even when a symlink points inside the repository, while expected installed-skill symlinks under `.claude/skills/<name>` remain outside this row's managed-write checks.

This de-risks predictable destructive/path-sensitive filesystem mistakes without expanding the scope into a generic filesystem gateway or race-free deletion transaction.

## Follow-Ups

- Race-free, file-descriptor-based deletion remains out of scope for this row and can be revisited only if a later storage-boundary abstraction requires it.
- Broader gateway/fake cleanup, typed lockfile validation, and migrated skill documentation reconciliation remain separate roadmap rows.
