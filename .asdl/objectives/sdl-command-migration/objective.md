# SDL Command Migration

## Thesis

`@asdl/sdl` should become the durable command boundary for software development lifecycle workflows, including project-specific lifecycle extensions. A command may belong under SDL even when this repository's implementation uses Graphite, slots, Vercel, CCC internals, or repo-local policy, as long as the user-facing verb is part of the development lifecycle.

The migration should hard-cut selected workflows from `asdl-dev` and `/code:*` into `sdl` and `/sdl:*` one slice at a time. `asdl-dev` commands should be deleted as they move, not retained as long-lived wrappers. Legacy `/code:*` mirrors should also be removed in the same slice unless an explicitly documented short exception is approved before implementation.

## Scope

- Define and document the SDL command model where project-specific SDL extensions and their command entries are first-class, not exceptions.
- Standardize project-specific SDL extension loading before moving the larger backlog. The current `sdl cp` override is useful precedent, but this Objective should establish the general SDL extension shape before migrating command families like submit, autobranch, autoslot, land, and review flows.
- Use flat command names for the first migration pass: `sdl submit`, `sdl pr-regen`, `sdl changes`, `sdl autobranch`, `sdl autoslot`, `sdl land`, and `sdl push`, mirrored into Pi as `/sdl:submit`, `/sdl:pr-regen`, `/sdl:changes`, `/sdl:autobranch`, `/sdl:autoslot`, `/sdl:land`, and `/sdl:push` when implemented.
- Move `submit` from `asdl-dev submit` and `/code:submit` to SDL as an early hard-cutover slice after the extension mechanism and docs are in place.
- Include `/code:autoslot` in the migration backlog: this repo may treat slot movement as part of its project-specific development lifecycle, so autoslot should be evaluated and migrated under SDL rather than dismissed as non-SDL.
- Include the broader SDL backlog: `changes`, `autobranch`, `autoslot`, `land`, `push`, `pr-regen`, `pr-address`, `stack-address`, and `pr-feedback-watch`, sequenced so risky or semantically dense flows move after the extension model is proven.
- Update docs and domain language: `ts/packages/sdl/README.md`, SDL context/domain vocabulary (`ts/packages/sdl/CONTEXT.md` or context map entry), Pi docs, skill conventions, and migration guidance should all explain project-specific SDL extensions and the hard-cutover policy.
- Keep implementation modules in lower/private packages such as `@asdl/ccc` where appropriate, but make SDL the public lifecycle command boundary when a workflow migrates.

## Non-Goals

- Do not keep long-lived compatibility aliases for migrated `asdl-dev` commands or `/code:*` Pi commands.
- Do not migrate every repo command into SDL. Planning, handoff, Objective, branch-context, cmux/CCC workspace orchestration, model-selection shortcuts, and Pi-native UI commands keep their existing domain namespaces unless a separate design decision says otherwise.
- Do not require nested SDL command groups in the first pass; nested naming can be revisited after the flat migration proves the extension model.
- Do not treat `code-workflows` or `code-gh` as SDL commands. They are skill/reference routers, not lifecycle command capabilities.
- Do not move `pr-regen` before the project-specific SDL extension mechanism is established; it is deliberately deferred even though it is lifecycle-relevant.
- Do not add hidden registries, task databases, or state-machine behavior to Objectives as part of this migration.

## Completion Criteria

- The SDL docs explicitly state that project-specific SDL extensions are supported and describe how command entries are discovered, authored, tested, and mirrored into Pi.
- The repo has a general project-specific SDL extension mechanism that is documented and covered by tests beyond the one-off `cp` override precedent.
- At least the first hard-cutover command slice lands through SDL with the old `asdl-dev` command and old `/code:*` Pi mirror deleted in the same slice.
- The command backlog has explicit dispositions: migrated, deliberately parked, or intentionally out of SDL scope, with `/code:autoslot` represented as an SDL migration candidate.
- Pi docs, skill conventions, parity metadata/docs, and relevant skills use `/sdl:*` / `sdl-*` naming for migrated workflows and no longer describe `/code:*` as the durable namespace for those migrated lifecycle commands.
- `asdl-dev` no longer owns any command that has migrated to SDL.

## Definition of Progress

Progress is keepable when:

- It clarifies the SDL extension contract or moves one bounded command slice toward SDL ownership without preserving stale aliases.
- It deletes or updates old command surfaces in the same slice that introduces the SDL replacement.
- It updates tests, parity metadata, skills, and docs alongside command-surface changes.
- It leaves the repo in a locally verifiable state with targeted TypeScript checks/tests and relevant repo checks passing for the touched packages.

Do not keep changes that:

- Add a new SDL mirror while leaving an old `asdl-dev` command or `/code:*` surface as an undocumented long-lived alias.
- Move implementation details into SDL when a lower package such as `@asdl/ccc` should remain the internal orchestration owner and SDL should only be the public lifecycle boundary.
- Rename commands without updating the user-facing docs, skill names/prose, and parity metadata that agents rely on.
- Treat project-specific implementation details as a reason to exclude a lifecycle workflow from SDL without a documented decision.

Useful evidence includes targeted scenario tests for the SDL CLI, Pi extension tests proving the new `/sdl:*` surface and absence of the old `/code:*` mirror, package `check`/`test` runs for touched TypeScript packages, dprint for docs/skills, and source searches showing deleted stale names where the slice requires deletion.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed after a preview for one bounded roadmap slice that edits repo-local code, tests, docs, skill files, parity metadata, and Objective tracking for this Objective.
- Steer or ask first when choosing command naming beyond the flat first-pass names, deciding whether a workflow is intentionally out of SDL scope, changing the extension architecture in a way that affects public plugin authors, or introducing any compatibility alias exception.
- Work may be left as local file changes on the current branch after the confirmed slice. The runner may create or modify tests and docs required for that slice, but should not start a broad multi-command migration without a fresh preview.
- Validation before keeping work should include targeted tests/checks for touched packages and docs formatting where applicable. Full-repo validation is useful completion evidence but should not become a standalone roadmap item unless the slice changes verification behavior itself.
- The runner must not push, submit, land, publish packages, deploy, mutate GitHub PRs/issues, or call external write APIs unless the user explicitly includes that action in the confirmed preview scope.

## Assumptions and Risks

Assumptions:

- SDL is allowed to host project-specific lifecycle commands, not only generic installable core commands.
- A flat command surface is acceptable for the first pass and is consistent with the current `sdl cp` command shape.
- Hard cutover is preferred over compatibility aliases: users and agents should update to the SDL command immediately when a slice migrates.
- `asdl-dev` can shrink or disappear as durable workflows migrate into SDL; remaining repo-internal developer utilities should be justified separately.
- The first implementation should establish the general project-specific SDL extension mechanism before moving `submit` or deferred PR metadata flows such as `pr-regen`. Revised by the submit hard-cutover: general command loading exists, typed selected-command schemas are supported for option-bearing project commands, `sdl submit` / `/sdl:submit` proved the first migrated lifecycle slice, and `submit` now ships as a built-in SDL command after the repo-local command-module shape served its migration purpose.

Risks:

- The migration can become a broad namespace churn project unless each slice ties a command move to tests, docs, and deletion of the old surface.
- Project-specific SDL extensions could blur product boundaries if docs do not distinguish public SDK surface, internal migration exports, built-in SDL commands, and repo-local command modules. De-risked for the general command-loading slice by the SDL README/context baseline plus CLI tests that prove project-only command discovery/loading beyond `cp`; further de-risked for option-bearing commands by the submit hard-cutover's selected-command schema loading, by promoting `submit` into `ts/packages/sdl/src/default-commands/submit.ts`, and by keeping repo-local command modules as an extension path rather than the final home for commands that should ship with SDL itself.
- Hard cutover may break agent muscle memory and stale docs; source searches and parity metadata updates need to be part of every slice. De-risked for the submit slice by removing the transitional `/code:submit` bridge and `asdl-dev submit` helper/export, renaming the active submit skill to `sdl-submit`, updating Pi docs/parity/push guidance/CCC prompts, and keeping source-search evidence that remaining old-name hits are historical or absence assertions. Further de-risked for the changes slice by replacing `/code:changes` with built-in `sdl changes` and `/sdl:changes`, removing the custom Pi renderer/command implementation, and updating docs/context/parity/tests so old-name hits are absence assertions or migration-away notes.
- `submit`, `land`, `autobranch`, `autoslot`, and review-feedback flows mutate Git, Graphite, GitHub, or worktree-slot state; moving their public boundary must not weaken existing safety checks.
- Keeping implementation cores in CCC while exposing SDL commands could create another “shared TypeScript is not shared CLI” gap unless SDL scenario tests and skills prove non-Pi reachability.

## Open Questions

- Should `pr-address` remain a standalone product CLI with SDL wrappers, or eventually become an SDL review command directly?
- Should `preview-url`, changelog updates, and verification/fix workflows join SDL later, or remain outside the initial lifecycle migration backlog?
- When command implementations depend on Graphite, slots, or CCC internals, what docs should explain the boundary between SDL public command ownership and lower-package orchestration ownership?
