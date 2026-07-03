# Skill apply/list/show TypeScript port complete

## Summary

Implemented the TypeScript skill invocation kinds slice for `@asdl/areg` on branch `skill-apply-invocation-kind-flattening`.

The completed slice changes the current target surface from the intermediate `areg skill kind ...` shape to the flattened commands:

- `areg skill list`
- `areg skill show <skill>`
- `areg skill apply <kind> <skill...>`

`areg skill apply` now reconciles managed artifacts for `normal`, `invoke-only`, `command-backed`, and `ambient-only`, including SKILL.md frontmatter updates, Codex `agents/openai.yaml` management, `.pi/settings.json` Pi exclusion reconciliation, command-backed replacement verification, dry-run output, deletion confirmation, and `--yes` approval for planned managed-artifact removals only.

The implementation also adds package-local apply-plan gateway contracts and fake/real adapters, with filesystem path/symlink safety in the real adapter. A small `@asdl/clinkr` extension now supports final variadic string-array positionals so the desired `apply <kind> <skill...>` CLI shape is represented directly rather than parsed by package-local argument hacks.

Validation evidence:

- `pnpm --dir ts/packages/areg run check`
- `pnpm --dir ts/packages/areg run test`
- `pnpm --dir ts/packages/clinkr run check`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/clinkr/test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`
- `just dprint-check`

## Objective Impact

The roadmap row `Reimplement the skill invocation kinds system in TypeScript` is complete.

The Objective-local `skill-invocation-kinds.md` and live Objective prose now describe the flattened `areg skill apply|list|show` surface and no longer preserve final legacy `areg command convert|revert|list` compatibility. Historical updates that mention profile/kind intermediate surfaces remain immutable provenance.

This also revises one Objective assumption: existing TypeScript foundations were sufficient except for a small Clinkr variadic-positional extension. The areg-specific mutation logic remains package-local, preserving the Objective's boundary against premature shared extraction.

## Follow-Ups

- Continue with the TypeScript distribution/install model row.
- During distribution/cutover, update public callers and docs to invoke the TypeScript-backed flattened `areg skill apply|list|show` surface.
- Keep reusable lessons from the Clinkr variadic positional extension in mind when feeding migration lessons back to the parent TypeScript migration Objective.
