# Path-write and cleanup hardening landed

## Summary

The destructive/path-sensitive filesystem remediation slice has landed in branch evidence via commit `7379b9ae` ("[cp] Harden init and cleanup path checks"). The change hardens `areg init` and `areg exec skillx cleanup` without changing their happy-path user contracts.

`areg init` now refuses to manage symlinked `asdl.toml`, `AGENTS.md`, `CLAUDE.md`, `.claude`, and `.claude/settings.local.json` paths. Apply-time validation rechecks write targets after `npx skills add`, including parent-directory safety and outside-project resolution, so post-install path changes cannot redirect managed writes outside the project root.

`skillx cleanup` now validates the requested cleanup target as an existing, non-symlink directory whose canonical resolved path is under the canonical temp root and whose basename keeps the `skillx.` prefix. Expected validation and deletion failures return `CleanupResult(success=False, error=...)`, preserving clean JSON CLI failures rather than incidental Python exceptions. The successful cleanup contract still returns `removed` as the input path.

Evidence basis: local branch diff against Graphite parent `master` plus PR #877 corroborating the same file set. Verification: targeted areg unit/scenario suite passed; full `just` passed.

## Objective Impact

- Roadmap Work item #2 (path-sensitive/destructive filesystem hardening) moved from `[ ]` to `[x]`.
- The symlink/path-hardening risk is de-risked for this slice by an explicit conservative policy: reject managed-path symlinks rather than following them. Support for legitimate symlinked config directories remains a future policy decision if users need it.
- Completion criterion "Destructive path operations reject traversal/symlink escape cases and report clean user-facing errors" is now evidenced for the planned `areg init` and `skillx cleanup` surfaces.
- No other roadmap rows changed: gateway/fake ownership, lockfile validation, skill docs/templates reconciliation, and final strict review rerun remain open.

## Follow-Ups

- Continue with the remaining Objective rows: external boundary ownership, typed lockfile validation, migrated skill docs/template reconciliation, and strict review rerun.
- If real users need symlinked project config directories, design that as an explicit follow-up policy with docs and tests rather than silently following symlinks in managed write paths.
