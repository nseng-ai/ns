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

- [x] Audit the code lifecycle command family and settle the target `/sdl:code:*` taxonomy.
  - Policy: direct execution after preview.
  - Evidence: planning audit selected `/sdl:code:changes`, `/sdl:code:checkpoint`, `/sdl:code:submit`, `/sdl:code:autobranch`, `/sdl:code:autoslot`, `/sdl:code:land`, `/sdl:code:push`, and `/sdl:code:regenerate-pr` as the target project-local Pi family. Existing flat `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` stay primary alongside nested names. Existing `/code:autobranch`, `/code:autoslot`, `/code:land`, `/code:push`, and `/code:pr-regen` should be removed at cutover. `pr-feedback-watch` is excluded as review workflow, and `preview-url` is excluded as dev/deployment tooling.

- [ ] Build the `/sdl:code:*` family as the project-local SDL example extension and API driver.
  - Policy: direct execution after preview; steer first if the slice changes the public SDL extension API or Pi command taxonomy beyond the settled names.
  - Evidence: command entries exercise the SDL extension API for discovery, selected loading, schemas/options, Pi command presentation, parity metadata, skill linkage, and lower-package orchestration boundaries without turning SDL into the implementation owner for CCC internals. A good first slice proves nested Pi registration for existing SDL commands (`changes`, `checkpoint`, `submit`) without destabilizing their flat primary mirrors; later slices should use `autobranch`, `autoslot`, `land`, `push`, and `regenerate-pr` to prove option parsing, confirmation hooks, live output, mutation safety, and CCC delegation seams.

- [ ] Migrate branch/worktree creation flows: `autobranch` and `autoslot`.
  - Policy: direct execution after preview for code/docs/tests; ask before executing commands that mutate real branches, stashes, Graphite state, or slot worktrees.
  - Evidence: `/sdl:code:autobranch` replaces `/code:autobranch`; `/sdl:code:autoslot` replaces `/code:autoslot`; old code surfaces are deleted; Graphite/slot safety checks remain covered by tests; docs record why autoslot is a project-specific SDL lifecycle extension.

- [ ] Migrate landing and push flows under SDL.
  - Policy: direct execution after preview for implementation; ask before running any actual push, merge, landing, or GitHub mutation.
  - Evidence: `/sdl:code:land` exposes the existing landing core through SDL reachability; `/sdl:code:push` replaces the guarded push helper; old `/code:land` and `/code:push` surfaces are removed when replacements land.

- [ ] Migrate PR metadata regeneration as a code lifecycle command and disposition review-feedback workflows separately.
  - Policy: steer first before choosing any review command taxonomy or replacing standalone product CLIs.
  - Evidence: `/sdl:code:regenerate-pr` replaces `/code:pr-regen` after the SDL extension API supports the needed command shape. `pr-feedback-watch` is excluded from `/sdl:code:*` as review workflow; later work decides whether `pr-address`, `stack-address`, and `pr-feedback-watch` remain standalone CLIs/skills or become separate SDL review commands.

- [ ] Retire stale `code`/`asdl-dev` vocabulary from durable docs, skills, parity metadata, and tests as slices migrate.
  - Policy: direct execution after preview.
  - Evidence: source searches for each migrated command show no stale durable user-facing references to the old command names except historical Objective updates or deliberately documented migration notes; parity metadata and Pi command tests assert the `/sdl:*` surface and absence of the old `/code:*` mirror.

## Parked

- [ ] Nested SDL CLI command taxonomy such as `sdl code checkpoint`, `sdl pr regen`, `sdl review address`, or `sdl slot auto`; the current decision only settles the Pi `/sdl:code:*` taxonomy.
- [ ] `dev:preview-url` / Vercel preview migration; preview deployment lookup is excluded from `/sdl:code:*`, but a later decision can revisit whether it belongs elsewhere in SDL.
- [ ] Changelog and release-preparation workflows under SDL.
- [ ] Verification/fix workflow such as `sdl verify` or `sdl fix`; do not migrate `/just` / `code-just-fix` until there is a clearer SDL contract.
- [ ] Long-lived compatibility aliases for migrated commands; hard cutover is the default and any exception requires an explicit future decision.
