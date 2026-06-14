# Submit Built-In Command

## Summary

The submit migration now keeps `submit` inside SDL itself rather than as a repo-local `.asdl/commands/submit.ts` module. Evidence: local branch diff against Graphite parent `sdl-submit-command-hard-cutover`, corroborated by PR #1509, renames `.asdl/commands/submit.ts` to `ts/packages/sdl/src/default-commands/submit.ts`, registers `submit` as a built-in SDL command, threads command output and confirmation hooks through the SDL CLI/runtime context, updates Pi SDL command registration, and expands SDL scenario coverage for the built-in submit surface.

Validation evidence: full TypeScript check passed; full TypeScript test suite passed. Stack feedback verification also passed before resolving three roaster review threads as pre-existing or already addressed by the stack-tip implementation.

## Objective Impact

The `submit` hard-cutover row remains complete, with a clearer final ownership boundary: the first migrated lifecycle command is now built into SDL, while repo-local `.asdl/commands/*.ts` modules remain the project-specific extension mechanism for commands that should not ship as SDL defaults.

This de-risks the product-boundary concern for migrated commands that deserve first-party SDL ownership. It does not close the Objective because `changes`, `autobranch`, `autoslot`, landing/push, PR metadata/review-feedback flows, and broader stale vocabulary cleanup remain open roadmap rows.

## Follow-Ups

- Keep using repo-local command modules for project-specific SDL extensions, but promote commands into SDL defaults when they are intended to ship as first-party lifecycle capabilities.
- Continue source-search and parity checks in each later migration slice so old `/code:*` and `asdl-dev` surfaces do not remain as active guidance.
- Keep `pr-regen` under its existing surface until the later SDL review/metadata taxonomy decision lands.
