# Cutover Landed Rebaseline

## Summary

The Objective record was stale relative to `master`: the main ji→ns cutover has already landed.

Evidence collected during this update:

- `origin` points at `https://github.com/nseng-ai/ns.git`.
- `.ns/` is present and `.ji/` is absent; `.pi/extensions/ns.ts` and the four `skills/ns-flow-*` directories are present.
- `ns --help`, `ns objective list --minimal --format md`, and `ns objective exec load-orientations --format md` work from this checkout.
- Workspace package names have moved to `@ns/*`; `ns.toml` is present, `ji.toml` is absent, `ts/packages/hosts/nscc` exists, and no tracked `src/ji/` path was found.
- `.ns/objectives/rename-sdl-to-ji/closed.md` closes the predecessor Objective as superseded by this one.
- `migrate.py --list` reports all mutating owner-machine migration steps done; slot worktrees are under `~/.local/state/ns/slots`, and `refs/ns/*` refs exist with no `refs/ji/*` refs reported.

Residual grep evidence still finds cleanup work: `@ji/` references in live retrospective docs and `jicc`-named symbols under `ts/packages/hosts/nscc/`.

## Objective Impact

The preparation rows, core cutover row, and owner-machine migration row are now tracked as complete. The internal sweep remains in progress because residual `jicc` identifiers still exist under `nscc`, and post-landing rebaseline remains in progress because active prose still carries stale `@ji/*` references.

The refactor-swarm/codemod pipeline assumption is now de-risked: the main cutover and package/path/config sweep landed. The stale-name-habit risk partially materialized as residual trails, so the standing orientation now points agents at cleanup rather than at the already-landed core cutover.

## Follow-Ups

- Clean the residual `jicc` identifiers under `ts/packages/hosts/nscc/` and stale `@ji/*` references in live docs/prose while preserving historical records.
- Re-run leftover-`ji` residual greps with the Objective allowlist and update the roadmap once they are clean or explicitly classified as historical.
- After residual cleanup, run ordinary validation and evaluate this Objective for closure.
