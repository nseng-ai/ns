# Submit Hard Cutover

## Summary

The submit hard-cutover slice is implemented. Local branch diff against Graphite parent `submit-cli-output-helper-sdl-run-deps` adds a repo-local `.asdl/commands/submit.ts` SDL command module backed by lower-level `@asdl/core/submit` helpers/gateways. SDL selected-command loading now imports only the chosen project command for command-specific help, JSON schema, and invocation, so option-bearing project commands such as `sdl submit --restack` receive parsed requests without importing every project command for top-level help.

The old submit ownership surfaces were deleted: `asdl-dev submit` helper/export/source files were removed, and the transitional `/code:submit` Pi bridge was removed. Pi now registers `/sdl:submit`; `asdl-dev` retains `preview-url` and `pr-regen` only. Active docs, parity metadata, push guidance, CCC dispatch prompts, and the renamed `sdl-submit` skill point to `sdl submit` / `/sdl:submit`.

Validation evidence: full TypeScript check passed; full TypeScript test suite passed; `just dprint-check` passed after dprint autofix; non-mutating CLI checks for `sdl --help`, `sdl submit --help`, `sdl submit --json-schema`, and `asdl-dev --help` passed. Source-search evidence shows remaining `asdl-dev submit` / `/code:submit` hits are historical migration notes or tests/assertions documenting old-surface absence, not active invocation guidance.

## Objective Impact

The roadmap row “Migrate `submit` as the first hard-cutover lifecycle command” is complete. This also completes the command-specific cleanup promised by the submit SDK and Pi-bridge groundwork updates: the temporary `/code:submit` bridge is gone, the SDL replacement exists, and agent-facing skill/parity/docs have the SDL naming.

The Objective remains open because other lifecycle command migrations are still active backlog rows: `changes`, `autobranch`, `autoslot`, landing/push, PR metadata/review-feedback flows, and broader stale vocabulary retirement as future slices migrate.

## Follow-Ups

- Keep `pr-regen` under `asdl-dev pr-regen` / `/code:pr-regen` until its own SDL migration decision lands.
- Decide later whether dynamic Pi discovery should mirror arbitrary repo-local `.asdl/commands/*.ts` modules, or whether static registration per migrated command remains sufficient.
- Continue using command-specific source searches when migrating the next SDL lifecycle slice so old `/code:*` or `asdl-dev` instructions do not remain as active guidance.
