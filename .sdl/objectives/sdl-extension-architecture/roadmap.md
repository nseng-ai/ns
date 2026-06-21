# Roadmap

## Work

- [x] Reset the SDL CLI kernel and restore `changes` as the first project-local extension.
  - Policy: direct execution after preview.
  - Evidence: local branch diff removes privileged domain-command registration from `ts/packages/sdl/src/command-registry.ts`, adds `.sdl/extensions/changes.ts` as an SDK-only direct project-local extension, rewrites SDL scenario/unit coverage for an empty built-in catalog and project-local `changes`, and leaves `cp`, `submit`, and `regenerate-pr` unavailable until later project-local migration slices. Verification: full Vitest suite, TypeScript typecheck/lint/format checks, dprint check, and source searches for default command registration and stale built-in/mirror wording.

- [x] Migrate checkpoint creation (`cp`) as a project-local mutating command extension.
  - Policy: direct execution after preview for code/docs/tests; ask before running a real mutating checkpoint command as validation.
  - Evidence: `.sdl/extensions/cp.ts` restores `sdl cp` as an SDK-only project-local extension, copies checkpoint snapshot/model/validation/commit helpers locally instead of importing internal migration exports, removes the inactive `ts/packages/sdl/src/default-commands/cp.ts` module, adds `--dry-run` as the non-mutating preview boundary, restores only the explicit `/sdl:cp` Pi mirror, and keeps old `/code:*` plus nested checkpoint aliases absent. SDL and Pi tests exercise selected project-extension loading, default faked commit behavior, dry-run no-mutation, model repair/failure paths, branch/clean-worktree refusals, typed git diagnostics, and Pi delegation. No public SDK helpers were promoted; duplicated git/model/message/commit helpers remain recorded SDK-pressure evidence for comparison with later `regenerate-pr` and `submit` slices.

- [ ] Migrate PR metadata regeneration as a project-local GitHub-facing command extension.
  - Policy: direct execution after preview for implementation; ask before mutating real GitHub PR state.
  - Use this slice to pressure-test whether SDL needs a well-tested GitHub Gateway in the kernel/public SDK or whether this command should own its GitHub interactions through lower packages.
  - Evidence should cover selected command loading, request schema/options behavior, GitHub failure modes, and docs for project-local availability.

- [x] Migrate submit as the highest-pressure project-local command extension.
  - Policy: direct execution after preview for implementation; ask before running real submit, restack, push, PR edit, or other external mutations.
  - Evidence: `.sdl/extensions/submit.ts` restores `sdl submit` as an SDK-only project-local extension with local copies of checkpoint, Graphite submit, GitHub PR metadata, managed PR-description, raw-log, and model failure-summary orchestration; the SDL kernel remains empty of repository workflow built-ins; `ts/packages/sdl/src/default-commands/submit.ts` and `ts/packages/sdl/src/submit-failure-interpretation.ts` were removed; SDL scenario tests now load the project extension through the public CLI and preserve the previous submit behavior matrix with faked `git`/`gt`/`gh` commands. Pi restores only the flat `/sdl:submit` mirror, keeps `/sdl:code:submit` and legacy submit aliases absent, and maps the old command-skill replacement to the flat mirror. Validation: `pnpm --dir ts run test -- packages/sdl/test/scenario/submit-cli.test.ts packages/pi-extensions/test/sdl-extension.test.ts packages/pi-command-surfaces/test/pi-command-surfaces.test.ts packages/pi-extensions/test/push.test.ts packages/areg/test/gateways/real-gateways.test.ts` (Vitest full configured suite: 296 files / 2992 tests passed).

- [~] Rework Pi SDL mirrors/adapters for project-local command ownership.
  - Policy: steer first if dynamic Pi registration or command taxonomy changes are proposed.
  - Current evidence: first-slice Pi changes kept only explicit `changes` mirrors; the `cp` slice restored flat `/sdl:cp`; the submit slice restored flat `/sdl:submit` only, left `/sdl:code:submit` and legacy submit aliases absent, and updated command-surface replacement/push guidance accordingly. The broader row remains active for later `regenerate-pr` migration and any dynamic Pi discovery decision.
  - Evidence should include parity/registration tests or documented limitations for project-local static mirrors.

- [x] Promote the first command-result evidence helpers into the public SDL SDK.
  - Policy: direct execution after the promotion report selected the proof-of-mechanism surface.
  - Evidence: `@sdl/core/exec` now owns `commandSucceeded()` and `formatCommandEvidence()`, `@sdl/sdl/sdk` re-exports them, the jiti virtual SDK module binds them for user-authored `.sdl/extensions/*.ts` modules, and `.sdl/extensions/push.ts` imports them instead of carrying local copies. SDK type coverage and the virtual-module mirror test cover the public surface; the push scenario validates selected extension loading through `@sdl/sdl/sdk`.

- [~] Document the emerging SDL kernel and extension SDK model.
  - Policy: direct execution after preview; steer first before finalizing public extension terminology that affects authors.
  - Current evidence: the single-file SDL extension boundary is now documented in SDL README/context language and in `.sdl/extensions/AGENTS.md`: direct `.sdl/extensions/<name>.ts` modules are leaf authoring surfaces, packages must not import from them, and reusable behavior must move or be copied into package-owned modules before packages depend on it. The first promoted helper slice documents `commandSucceeded()` and `formatCommandEvidence()` as public SDK command-result evidence helpers.
  - Remaining scope: explain kernel responsibilities, public SDK imports, internal migration exports, project-local extension discovery, project-local versus bundled extension criteria, and the command-first promotion rule for new SDK capabilities.
  - Evidence should include SDL README/context updates and any necessary context-map language refresh.

- [ ] Record the command-first closure boundary and spawn or park follow-up capability work.
  - Policy: steer first before creating child Objectives for bundled or sophisticated capability migrations.
  - Decide what command-first completion proves, what remains parked, and whether Handoff, Objectives, Slots, or another workflow should become the next pressure test after this Objective.
  - Evidence should include a final roadmap/status update that keeps broader capability modeling from becoming hidden scope creep.

## Parked

- Handoff nested SDL command-tree design and `sdl handoff ...` lifecycle migration, preserved as provenance in the closed `handoff-sdl-extension` Objective.
- Bundled first-party extension packaging and discovery semantics.
- Exhaustive migration of every current SDL capability/package into the extension structure.
- Objective, Slot, Branch Context, Handoff, Roaster, PR Address, CCC, and Pi workflow capability modeling beyond what is needed for the command-first SDK experiment.
- Dynamic arbitrary `/sdl:*` Pi mirrors for all project-local SDL extension commands.
- Extension-owned agent resources such as skills, Pi extensions, prompts, or install/update/marketplace behavior.
- Nested SDL CLI command trees such as `sdl handoff list`, `sdl code checkpoint`, or `sdl review address`.
