# Pi Adapter Peer API Migration

## Summary

Migrated Pi branch-context and enriched-plan adapter source imports away from broad `@sdl/branch-context` and `@sdl/plans` package roots for in-process capability behavior.

- Added curated `@sdl/branch-context/api` re-exports for portable branch-context behavior Pi composes in process: branch-context plan keys, target-branch derivation, attached-plan loading/prompt/evidence helpers, existing-branch reuse helpers, output/evidence types, branch creation method typing, and plan-content slug evidence typing.
- Added curated `@sdl/plans/api` re-exports for saved-plan selection/write behavior and evidence: no-saved-plan errors, selected-file/repo identity types, saved-plan writes, saved-plan content slug derivation, saved-plan file evidence formatting, saved-plan evidence types, and the saved-plan write tool evidence name.
- Updated Pi adapter source files to import capability behavior from Peer API subpaths: `options.ts`, `host-types.ts`, `from-plan-commands.ts`, and `enriched-plan-save.ts`.
- Moved Pi implementation-command name usage in Pi source to `@sdl/pi-command-surfaces`, preserving command-surface ownership rather than expanding branch-context Peer API for command registration/presentation ownership.

## Objective Impact

This completes the roadmap row to migrate Pi branch-context/enriched-plan adapters to curated seams where they need in-process capability behavior. Pi command names, prompt/usage text, structured grill behavior, saved-plan storage semantics, Branch Memory namespace/key behavior, branch naming, slug derivation, attached-plan selection, and Pi/cmux launch semantics were intentionally unchanged; this slice only changes import ownership and Peer API curation.

The Peer API additions remain explicit named re-exports rather than broad `export *` barrels. The added branch-context exports represent portable domain behavior/evidence used by sibling composition. The added plans exports represent saved-plan selection/write behavior and evidence used by the Pi saved-plan tool.

## Follow-Ups

- Retire the remaining broad/deep sibling imports in the final-boundary row, including the existing `ccc` source imports and non-Pi/test cleanup.
- Decide later whether tests should consistently exercise Peer API subpaths or continue to use package roots for public-surface coverage.
- Revisit whether any Peer API additions should be narrowed or documented more formally after the Pi and `ccc` migrations converge.
