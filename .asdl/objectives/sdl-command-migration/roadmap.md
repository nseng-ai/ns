# Roadmap

## Work

- [x] Define the SDL project-specific extension model and documentation baseline.
  - Policy: direct execution after preview.
  - Evidence: `ts/packages/sdl/README.md` explains flat `.asdl/commands/<command>.ts` project-specific SDL command modules, `@asdl/sdl/sdk` as the public author API, internal migration exports, hard cutover from `asdl-dev` and `/code:*`, and `/sdl:*` mirrors for migrated Pi surfaces; `ts/packages/sdl/CONTEXT.md` now records SDL command vocabulary; `CONTEXT-MAP.md` now tracks SDL and its boundaries with Pi extensions, `asdl-dev`, and CCC. Broader Pi docs and skill convention cleanup remain part of command-specific migration slices and the stale-vocabulary cleanup row.

- [x] Implement or standardize general project-specific SDL command loading beyond the one-off `cp` override.
  - Policy: direct execution after preview, but steer first if the design changes the public SDK surface for command authors.
  - Evidence: `ts/packages/sdl/src/command-registry.ts` generalizes flat `.asdl/commands/*.ts` discovery/loading; `sdl --help` scans filenames only while invocation imports and validates the selected module; `ts/packages/sdl/src/cp-command.ts` remains a wrapper over the generic runner; SDL scenario tests cover project-only discovery, no-import help, invocation, load failures, name mismatches, invalid filenames, ignored `.d.ts` files, and the existing `cp` override. `ts/packages/sdl/README.md` and `ts/packages/sdl/CONTEXT.md` document CLI-only dynamic loading, no public SDK shape change, and deferred Pi mirror/argument-schema follow-ups. Verification: targeted SDL/Pi package tests and checks passed; full TypeScript test/check passed; docs dprint check passed.

- [x] Migrate `submit` as the first hard-cutover lifecycle command.
  - Policy: direct execution after preview; ask first before running the mutating submit command itself as validation.
  - Evidence: local branch diff against Graphite parent `sdl-submit-command-hard-cutover`, corroborated by PR #1509, promotes `submit` from the repo-local `.asdl/commands/submit.ts` module into the built-in SDL default command registry at `ts/packages/sdl/src/default-commands/submit.ts`, keeps `sdl submit` / `/sdl:submit` as the durable surfaces, threads SDL runtime output/confirmation hooks through the command context, and expands built-in submit scenario coverage. The prior hard-cutover already removed the `asdl-dev submit` helper/export/source files and transitional `/code:submit` bridge; `asdl-dev` retains only `preview-url` and `pr-regen`. Active docs, Pi registration, parity metadata, skill install/prose (`sdl-submit`), push guidance, and CCC dispatch prompts point at `sdl submit` / `/sdl:submit`; old-surface references remain only as migration history or absence assertions. Verification: full TypeScript check/test passed; docs dprint check passed in the submit hard-cutover, and the built-in submit slice passed full TypeScript check/test plus stack feedback verification.

- [x] Migrate read-only worktree inspection from `/code:changes` to SDL.
  - Policy: direct execution after preview.
  - Evidence: local working-tree diff against Graphite parent `sdl-submit-built-in-registry-runtime-hooks` adds built-in `sdl changes` under `ts/packages/sdl/src/default-commands/changes.ts`, moves the summary/prompt helpers into SDL-owned modules, registers `/sdl:changes` through the generic SDL Pi bridge, removes the old `/code:changes` command and `code-changes-summary` renderer, and updates SDL/Pi docs, context, parity metadata, and tests. Source-search evidence shows old-surface hits only as no-alias migration notes or absence assertions. Verification: targeted SDL and Pi extension checks/tests passed; full TypeScript check/test passed; docs dprint check passed.

- [ ] Migrate branch/worktree creation flows: `autobranch` and `autoslot`.
  - Policy: direct execution after preview for code/docs/tests; ask before executing commands that mutate real branches, stashes, Graphite state, or slot worktrees.
  - Evidence: `sdl autobranch` and `/sdl:autobranch` replace `/code:autobranch`; `sdl autoslot` and `/sdl:autoslot` replace `/code:autoslot`; old code surfaces are deleted; Graphite/slot safety checks remain covered by tests; docs record why autoslot is a project-specific SDL lifecycle extension.

- [ ] Migrate landing and push flows under SDL.
  - Policy: direct execution after preview for implementation; ask before running any actual push, merge, landing, or GitHub mutation.
  - Evidence: `sdl land` and `/sdl:land` expose the existing landing core through SDL reachability; `sdl push` and `/sdl:push` either replace the guarded push helper or receive an explicit out-of-scope decision; old `/code:land` and `/code:push` surfaces are removed when replacements land.

- [ ] Migrate or disposition PR metadata and review-feedback lifecycle flows after the extension mechanism is proven.
  - Policy: steer first before choosing the final review command taxonomy or replacing standalone product CLIs.
  - Evidence: `pr-regen` is intentionally deferred until after the SDL extension mechanism exists; later work decides and implements SDL ownership for `sdl pr-regen`, `pr-address`, `stack-address`, and `pr-feedback-watch`, or records why a workflow remains a standalone CLI/skill outside SDL.

- [ ] Retire stale `code`/`asdl-dev` vocabulary from durable docs, skills, parity metadata, and tests as slices migrate.
  - Policy: direct execution after preview.
  - Evidence: source searches for each migrated command show no stale durable user-facing references to the old command names except historical Objective updates or deliberately documented migration notes; parity metadata and Pi command tests assert the `/sdl:*` surface and absence of the old `/code:*` mirror.

## Parked

- [ ] Nested SDL command taxonomy such as `sdl pr regen`, `sdl review address`, or `sdl slot auto`; first pass uses flat names.
- [ ] `dev:preview-url` / Vercel preview migration; decide later whether preview deployment lookup is part of SDL for this repo.
- [ ] Changelog and release-preparation workflows under SDL.
- [ ] Verification/fix workflow such as `sdl verify` or `sdl fix`; do not migrate `/just` / `code-just-fix` until there is a clearer SDL contract.
- [ ] Long-lived compatibility aliases for migrated commands; hard cutover is the default and any exception requires an explicit future decision.
