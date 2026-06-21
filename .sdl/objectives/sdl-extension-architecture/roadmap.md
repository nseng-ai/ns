# Roadmap

## Work

- [ ] Reset the SDL CLI kernel and restore `changes` as the first project-local extension.
  - Policy: direct execution after preview.
  - Remove privileged domain-command registration from the SDL kernel, then restore the read-only `sdl changes` surface through `.sdl/extensions` using the public SDK.
  - Evidence should include empty-kernel command catalog behavior, project-local `changes` scenario coverage, and source-search or test evidence that `changes` is not registered through a built-in command table.

- [ ] Migrate checkpoint creation (`cp`) as a project-local mutating command extension.
  - Policy: direct execution after preview for code/docs/tests; ask before running a real mutating checkpoint command as validation.
  - Use this slice to test branch safety, dirty-worktree inspection, staging/commit behavior, model-generated messages, output, and confirmation boundaries.
  - Evidence should distinguish logic that remains extension-owned from any Git/model helpers that deserve public SDK or kernel treatment.

- [ ] Migrate PR metadata regeneration as a project-local GitHub-facing command extension.
  - Policy: direct execution after preview for implementation; ask before mutating real GitHub PR state.
  - Use this slice to pressure-test whether SDL needs a well-tested GitHub Gateway in the kernel/public SDK or whether this command should own its GitHub interactions through lower packages.
  - Evidence should cover selected command loading, request schema/options behavior, GitHub failure modes, and docs for project-local availability.

- [ ] Migrate submit as the highest-pressure project-local command extension.
  - Policy: direct execution after preview for implementation; ask before running real submit, restack, push, PR edit, or other external mutations.
  - Use this slice to test command composition, Graphite/GitHub boundaries, progress output, confirmation hooks, failure summarization, persistent logs, and lower-orchestration ownership.
  - Evidence should explicitly record which API pressures were handled in the extension and which, if any, became kernel/SDK additions.

- [ ] Rework Pi SDL mirrors/adapters for project-local command ownership.
  - Policy: steer first if dynamic Pi registration or command taxonomy changes are proposed.
  - Ensure Pi surfaces no longer imply `changes`, `cp`, `submit`, or `regenerate-pr` are universal SDL built-ins when their CLI behavior is project-local.
  - Evidence should include parity/registration tests or documented limitations for project-local static mirrors.

- [ ] Document the emerging SDL kernel and extension SDK model.
  - Policy: direct execution after preview; steer first before finalizing public extension terminology that affects authors.
  - Explain kernel responsibilities, public SDK imports, internal migration exports, project-local extension discovery, project-local versus bundled extension criteria, and the command-first promotion rule for new SDK capabilities.
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
