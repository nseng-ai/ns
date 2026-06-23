# Roadmap

## Work

- [x] Reset the SDL CLI kernel and restore `changes` as the first project-local extension.
  - Policy: direct execution after preview.
  - Evidence: the kernel command registry no longer imports or registers privileged domain commands, SDL scenario/unit coverage exercises an empty built-in catalog and selected project-local `changes`, and the command later moved into the grouped flow extension as `.sdl/extensions/flow/src/commands/changes.ts` / `sdl flow changes`. Verification included the full Vitest suite, TypeScript typecheck/lint/format checks, dprint check, and source searches for default command registration and stale built-in/mirror wording.

- [x] Migrate checkpoint creation (`cp`) as a project-local mutating command extension.
  - Policy: direct execution after preview for code/docs/tests; ask before running a real mutating checkpoint command as validation.
  - Evidence: checkpoint creation is restored through `.sdl/extensions/flow/src/commands/cp.ts` as `sdl flow cp`, with `--dry-run` as the non-mutating preview boundary. SDL and Pi tests exercise selected project-extension loading, default faked commit behavior, dry-run no-mutation, model repair/failure paths, branch/clean-worktree refusals, typed git diagnostics, and Pi delegation. The old built-in checkpoint implementation remains removed, old `/code:*` plus nested checkpoint aliases remain absent, and no public SDK helpers were promoted solely for checkpoint convenience.

- [x] Extract repeated worktree helpers inside the project-local extension boundary without promoting new SDK surface.
  - Policy: direct execution after preview for code/docs/tests; keep public SDK promotion behind the documented evidence threshold.
  - Evidence: `.sdl/extensions/flow/src/shared/worktree.ts` is the project-local helper seam for flow commands that need git snapshot loading, env lookup, command detail formatting, pending-worktree errors, and checkpoint commit creation while continuing to treat `@sdl/sdl/sdk` as the public author boundary. This validates extension-owned shared helpers as the middle tier between one-off command-local duplication and public SDK promotion; it does not by itself justify a new kernel or SDK Git helper.

- [x] Migrate PR metadata regeneration as a project-local GitHub-facing command extension.
  - Policy: direct execution after preview for implementation; ask before mutating real GitHub PR state.
  - Evidence: `.sdl/extensions/flow/src/commands/regenerate-pr.ts` restores PR metadata regeneration as `sdl flow regenerate-pr`; `.sdl/extensions/flow/package.json` registers it in the grouped flow extension; SDL scenario coverage exists at `ts/packages/sdl/test/scenario/regenerate-pr-cli.test.ts`; docs and Pi mirrors expose `/sdl:flow:regenerate-pr` without old flat or `/code:*` compatibility aliases. This slice keeps GitHub/PR-description policy in the project-local command/helper layer rather than promoting a broad GitHub Gateway or managed-region API into the public SDL SDK.

- [x] Migrate submit as the highest-pressure project-local command extension.
  - Policy: direct execution after preview for implementation; ask before running real submit, restack, push, PR edit, or other external mutations.
  - Evidence: `.sdl/extensions/flow/src/commands/submit.ts` restores submit as `sdl flow submit` with local/project-helper copies of checkpoint, Graphite submit, GitHub PR metadata, managed PR-description, raw-log, and model failure-summary orchestration; the SDL kernel remains empty of repository workflow built-ins; the old inactive submit built-in wrapper and submit-failure interpretation module were removed. Pi mirrors the grouped `/sdl:flow:submit` surface, old flat/legacy submit aliases remain absent, and the submit behavior matrix is preserved by faked `git`/`gt`/`gh` scenario tests.

- [x] Migrate land as a project-local Graphite/GitHub stack-landing command extension.
  - Policy: direct execution after preview for implementation; ask before running real land, merge, restack, push, PR edit, or other external mutations.
  - Evidence: `.sdl/extensions/flow/src/commands/land.ts` establishes the missing project-local `sdl flow land` CLI surface and delegates to `runLandCli` from `@sdl/ccc/land` with `--yes` and `--dry-run` options. `.sdl/extensions/flow/package.json` registers the command; `ts/packages/pi-extensions/src/sdl-extension.ts` mirrors it as `/sdl:flow:land` with `FULL` CLI parity; `docs/pi/README.md`, `ts/packages/sdl/README.md`, and context docs describe grouped flow ownership and absent legacy aliases. The landing outcome/failure matrix remains covered in CCC land tests; this slice records CCC lower-package delegation as the accepted boundary rather than promoting a public landing/Graphite-stack SDK interface.

- [x] Rework Pi SDL mirrors/adapters for project-local command ownership.
  - Policy: steer first if dynamic Pi registration or command taxonomy changes are proposed.
  - Evidence: Pi now exposes grouped static mirrors under `/sdl:flow:*` for the selected project-local flow commands, including `changes`, `cp`, `autobranch`, `autoslot`, `submit`, `regenerate-pr`, `push`, `land`, and `pull-trunk`. `ts/packages/pi-extensions/src/sdl-extension.ts` delegates through `registerCliCommandExtension` to `sdl flow <name>` and records `FULL` parity for those mirrors; docs state that dynamic arbitrary SDL extension mirroring remains parked and old flat `/sdl:*`, `/sdl:code:*`, and `/code:*` lifecycle aliases are not retained.

- [x] Promote the first command-result evidence helpers into the public SDL SDK.
  - Policy: direct execution after the promotion report selected the proof-of-mechanism surface.
  - Evidence: `@sdl/core/exec` owns `commandSucceeded()` and `formatCommandEvidence()`, `@sdl/sdl/sdk` re-exports them, the jiti virtual SDK module binds them for user-authored `.sdl/extensions/*.ts` modules, and the project-local `push` flow command imports them instead of carrying local copies. SDK type coverage and the virtual-module mirror test cover the public surface; the push scenario validates selected extension loading through `@sdl/sdl/sdk`. The checkpoint helper cleanup deliberately did not widen this public SDK surface.

- [x] Document the emerging SDL kernel and extension SDK model.
  - Policy: direct execution after preview; steer first before finalizing public extension terminology that affects authors.
  - Evidence: SDL README/context language distinguishes the SDL kernel from project-local command policy, records grouped project-local extensions as the current command-first mechanism, keeps future bundled extensions as deferred design space, and documents the command-first SDK promotion rule. The SDK reference states that `@sdl/sdl/sdk` is intentionally small, owns curated lower-package re-exports as first-party author vocabulary, and remains the authoritative export inventory. Pi docs state that SDL extension discovery is CLI-oriented today and exact `/sdl:flow:*` mirrors are static engineered adapters requiring explicit package tests/parity metadata. `.sdl/extensions/AGENTS.md` records the readable extension boundary, helper-promotion escalation path, and generated/bundled artifact caution.

- [~] Record the command-first closure boundary and spawn or park follow-up capability work.
  - Policy: steer first before creating child Objectives for bundled or sophisticated capability migrations.
  - Current evidence: the command-first migration has enough evidence to separate public SDK promotion, project-local/shared helper consolidation, lower-package delegation, static Pi mirrors, and future bundled-extension design. The remaining work is to write the final closure-boundary disposition: what commands-first proved, which SDK-pressure seams become follow-up candidates, and whether Handoff, Objectives, Slots, or another workflow should become the next pressure test.
  - Evidence should include a final roadmap/status update that keeps broader capability modeling from becoming hidden scope creep.

## Parked

- Handoff nested SDL command-tree design and `sdl handoff ...` lifecycle migration, preserved as provenance in the closed `handoff-sdl-extension` Objective.
- Bundled first-party extension packaging and discovery semantics.
- Exhaustive migration of every current SDL capability/package into the extension structure.
- Objective, Slot, Branch Context, Handoff, Roaster, PR Address, CCC, and Pi workflow capability modeling beyond what is needed for the command-first SDK experiment.
- Dynamic arbitrary `/sdl:*` Pi mirrors for all project-local SDL extension commands.
- Extension-owned agent resources such as skills, Pi extensions, prompts, or install/update/marketplace behavior.
- Nested SDL CLI command trees such as `sdl handoff list`, `sdl code checkpoint`, or `sdl review address`.
