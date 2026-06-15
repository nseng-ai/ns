# areg check TypeScript port complete

## Summary

Implemented the full TypeScript `areg check` validation slice in `@asdl/areg` without cutting over public callers or modifying the Python reference path.

This slice adds:

- A visible `areg check [--path PATH]` command registered on the TypeScript `areg` root CLI while keeping hidden `exec` helpers hidden from top-level help.
- Clinkr rendered-command behavior for human success (`All skills OK.`), grouped human failures through the negative message path, and additive `--format json` envelopes whose issue records include `skill`, `code`, and `message`.
- A constrained package-local project inspection gateway instead of a generic filesystem gateway. The real adapter owns path resolution, symlink/readlink facts, targeted file reads, local exclude parsing, generic Pi replacement layer presence facts, and pairing traversal pruning. The fake adapter uses constructor-state semantic project facts and copies mutable inputs/outputs.
- Package-local compatibility logic for `skills-lock.json` shape parsing, hash validation, SKILL.md frontmatter parsing and description limits, local and remote skill layout checks, invoke-only sidecar/Pi exclusion/Pi replacement checks, orphan/dangling lockfile checks, and AGENTS/CLAUDE pairing checks.
- Scenario, unit, fake-gateway, and real-adapter tests for the accepted check behavior.

Focused validation passed:

- `pnpm --dir ts --filter @asdl/areg run check`
- `pnpm --dir ts --filter @asdl/areg run test`

## Objective Impact

The `Port areg check and skill/lockfile validation` roadmap row is complete. The TypeScript package now has the second major command slice after hidden `exec skillx`, while Python `packages/areg` remains the active reference path until the later distribution/cutover rows.

One implementation detail was clarified against the Python reference: malformed `.pi/settings.json` remains a hard command error for local-skill invoke-only checks rather than being silently ignored or downgraded to a convention issue.

The constrained inspection gateway is intentionally package-local. Shared extraction for skill-lock, project inspection, Pi replacement, or frontmatter helpers remains parked until a second TypeScript consumer proves the seam.

## Follow-Ups

- Port `areg init` next, adding filesystem mutation and project-configuration seams only where that command consumes them.
- Revisit public caller/docs behavior during the distribution/cutover row; no live skill or docs path was switched to TypeScript `areg` in this slice.
- If later command rows reuse the check parsers or Pi replacement helpers, keep them package-local until repeated use demonstrates a real shared-package boundary.
