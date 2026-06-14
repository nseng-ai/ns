# SDL Documentation Baseline

## Summary

The SDL project-specific extension documentation baseline is now represented in durable repo docs. Evidence: local branch diff against Graphite parent `add-sdl-command-migration-objective` adds `ts/packages/sdl/CONTEXT.md`, expands `ts/packages/sdl/README.md`, and updates `CONTEXT-MAP.md`; PR #1465 corroborates the same file set. The branch also addressed review feedback by clarifying that SDL expands to Source Development Lifecycle, not Software Development Lifecycle.

Validation evidence: `just dprint-check` passed for the docs-only slice, and targeted source searches reviewed remaining `asdl-dev`, `/code:*`, `/sdl:*`, and SDL terminology hits for migration-away or current-surface context.

## Objective Impact

The first roadmap row is complete as a package-local/domain-language baseline: SDL docs now describe flat `.asdl/commands/<command>.ts` project-specific modules, `@asdl/sdl/sdk` as the public author API, internal migration exports, `/sdl:*` Pi mirrors for migrated commands, and hard cutover away from old `asdl-dev` and `/code:*` surfaces.

This does not implement general command loading beyond the existing `cp` override. Broader Pi docs, skill convention updates, parity metadata, and stale command-surface cleanup remain intentionally deferred to command-specific migration slices and the stale-vocabulary cleanup row.

## Follow-Ups

- Implement or standardize general project-specific SDL command loading beyond the one-off `cp` override.
- Keep `@asdl/sdl/sdk` as the only public command-author API unless a later design explicitly changes the public SDK surface.
- Update Pi docs, skills, parity metadata, and stale `/code:*` or `asdl-dev` references in the migration slice that moves each command.
- Consider a later focused TypeScript context-map rebaseline; the SDL docs slice only made the narrow inventory correction needed to add SDL.
