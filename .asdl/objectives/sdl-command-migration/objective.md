# SDL Command Migration

## Thesis

`@asdl/sdl` should become the durable command boundary for software development lifecycle workflows, including project-specific lifecycle extensions. A command may belong under SDL even when this repository's implementation uses Graphite, slots, Vercel, CCC internals, or repo-local policy, as long as the user-facing verb is part of the development lifecycle.

The migration should hard-cut selected workflows from `asdl-dev` and `/code:*` into `sdl` and `/sdl:*` one slice at a time. `asdl-dev` commands should be deleted as they move, not retained as long-lived wrappers. Legacy `/code:*` mirrors should also be removed in the same slice unless an explicitly documented short exception is approved before implementation.

The code lifecycle family should now be built up as a project-local SDL example extension and Pi command taxonomy under `/sdl:code:*`. These commands should exercise and shape the SDL extension API while preserving lower implementation ownership in packages such as `@asdl/ccc` where appropriate.

## Scope

- Define and document the SDL command model where project-specific SDL extensions and their command entries are first-class, not exceptions.
- Standardize project-specific SDL extension loading before moving the larger backlog. The current `sdl cp` override is useful precedent, but this Objective should establish the general SDL extension shape before migrating command families like submit, autobranch, autoslot, land, and PR metadata flows.
- Use `/sdl:code:*` as the target Pi taxonomy for the code lifecycle family while keeping SDL CLI nesting as a separate future design. Current flat SDL Pi mirrors for built-in commands such as `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` remain primary surfaces alongside the nested family.
- Move `submit` from `asdl-dev submit` and `/code:submit` to SDL as an early hard-cutover slice after the extension mechanism and docs are in place.
- Include `/code:autoslot` in the migration backlog: this repo may treat slot movement as part of its project-specific development lifecycle, so autoslot should be evaluated and migrated under SDL rather than dismissed as non-SDL.
- Include the code lifecycle backlog as `/sdl:code:changes`, `/sdl:code:checkpoint`, `/sdl:code:submit`, `/sdl:code:autobranch`, `/sdl:code:autoslot`, `/sdl:code:land`, `/sdl:code:push`, and `/sdl:code:regenerate-pr`. The existing `/code:autobranch`, `/code:autoslot`, `/code:land`, `/code:push`, and `/code:pr-regen` surfaces should be removed at their cutovers, with `pr-regen` becoming the descriptive canonical `regenerate-pr` name. `pr-feedback-watch` is excluded from this code lifecycle family as review workflow, and `preview-url` is excluded as dev/deployment tooling.
- Update docs and domain language: `ts/packages/sdl/README.md`, SDL context/domain vocabulary (`ts/packages/sdl/CONTEXT.md` or context map entry), Pi docs, skill conventions, and migration guidance should all explain project-specific SDL extensions and the hard-cutover policy.
- Keep implementation modules in lower/private packages such as `@asdl/ccc` where appropriate, but make SDL the public lifecycle command boundary when a workflow migrates.

## Code Lifecycle Taxonomy

The `/sdl:code:*` family is the project-local Pi command taxonomy for current-checkout, branch, commit, Graphite stack, and PR metadata lifecycle workflows. It is also the practical example extension that should harden the SDL extension API: every command slice should teach something reusable about command contribution, selected loading, request schemas, confirmation hooks, Pi registration/presentation, parity metadata, skill linkage, or lower-orchestration boundaries.

Canonical target mappings:

| Current surface    | Canonical target          | Notes                                                                                                |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/sdl:changes`     | `/sdl:code:changes`       | Flat `/sdl:changes` remains primary because it mirrors the current built-in SDL command.             |
| `/sdl:cp`          | `/sdl:code:checkpoint`    | Prefer descriptive canonical naming; flat `/sdl:cp` remains primary for the existing SDL command.    |
| `/sdl:submit`      | `/sdl:code:submit`        | Flat `/sdl:submit` remains primary for the existing mutating SDL command.                            |
| `/code:autobranch` | `/sdl:code:autobranch`    | Remove the old `/code:*` surface at cutover.                                                         |
| `/code:autoslot`   | `/sdl:code:autoslot`      | Include as code lifecycle despite slot orchestration because it starts from current code work.       |
| `/code:land`       | `/sdl:code:land`          | Keep CCC or lower orchestration ownership where appropriate; SDL owns the public lifecycle boundary. |
| `/code:push`       | `/sdl:code:push`          | Replace the guarded Pi push helper with an SDL-owned lifecycle surface.                              |
| `/code:pr-regen`   | `/sdl:code:regenerate-pr` | Use the descriptive canonical name; any `pr-regen` spelling is non-canonical if retained at all.     |

The target taxonomy is Pi-first for now. It does not require immediate SDL CLI nesting such as `sdl code checkpoint`; the current CLI may stay flat while the project-local Pi family proves whether nested SDL CLI groups are worth designing later.

Explicit exclusions from `/sdl:code:*`:

- `pr-feedback-watch`: review-monitoring workflow, not a code lifecycle command in this family.
- `preview-url`: dev/deployment lookup, not source-control lifecycle.
- `code-workflows` and `code-gh`: skill/reference routers, not lifecycle command capabilities.

## Non-Goals

- Do not keep long-lived compatibility aliases for migrated `asdl-dev` commands or `/code:*` Pi commands.
- Do not migrate every repo command into SDL. Planning, handoff, Objective, branch-context, cmux/CCC workspace orchestration, model-selection shortcuts, and Pi-native UI commands keep their existing domain namespaces unless a separate design decision says otherwise.
- Do not require nested SDL CLI command groups in the first pass; `/sdl:code:*` is the target Pi taxonomy and SDL CLI nesting remains a separate future design.
- Do not treat `code-workflows` or `code-gh` as SDL commands. They are skill/reference routers, not lifecycle command capabilities.
- Do not move `pr-regen` before the project-specific SDL extension mechanism is established; it is deliberately deferred even though it is lifecycle-relevant and its target canonical Pi name is `/sdl:code:regenerate-pr`.
- Do not add hidden registries, task databases, or state-machine behavior to Objectives as part of this migration.

## Completion Criteria

- The SDL docs explicitly state that project-specific SDL extensions are supported and describe how command entries are discovered, authored, tested, and mirrored into Pi.
- The repo has a general project-specific SDL extension mechanism that is documented and covered by tests beyond the one-off `cp` override precedent.
- The `/sdl:code:*` project-local Pi command family exists as an example extension surface with tests/parity/docs proving nested Pi registration, CLI delegation or lower-orchestration delegation, request schema handling, confirmation/presentation behavior, and hard-cutover expectations.
- At least the first hard-cutover command slice lands through SDL with the old `asdl-dev` command and old `/code:*` Pi mirror deleted in the same slice.
- The command backlog has explicit dispositions: migrated, deliberately parked, or intentionally out of SDL scope, with `/code:autoslot` represented as an SDL migration candidate and `pr-feedback-watch` / `preview-url` excluded from the `/sdl:code:*` code lifecycle family.
- Pi docs, skill conventions, parity metadata/docs, and relevant skills use `/sdl:*` / `sdl-*` naming for migrated workflows and no longer describe `/code:*` as the durable namespace for those migrated lifecycle commands.
- `asdl-dev` no longer owns any command that has migrated to SDL.

## Definition of Progress

Progress is keepable when:

- It clarifies the SDL extension contract or moves one bounded command slice toward SDL ownership without preserving stale aliases.
- It turns a concrete `/sdl:code:*` command slice into reusable extension API learning rather than a one-off Pi adapter.
- It deletes or updates old command surfaces in the same slice that introduces the SDL replacement.
- It updates tests, parity metadata, skills, and docs alongside command-surface changes.
- It leaves the repo in a locally verifiable state with targeted TypeScript checks/tests and relevant repo checks passing for the touched packages.

Do not keep changes that:

- Add a new SDL mirror while leaving an old `asdl-dev` command or `/code:*` surface as an undocumented long-lived alias.
- Move implementation details into SDL when a lower package such as `@asdl/ccc` should remain the internal orchestration owner and SDL should only be the public lifecycle boundary.
- Rename commands without updating the user-facing docs, skill names/prose, and parity metadata that agents rely on.
- Add nested `/sdl:code:*` Pi commands as opaque aliases that do not improve or validate the SDL extension API.
- Treat project-specific implementation details as a reason to exclude a lifecycle workflow from SDL without a documented decision.

Useful evidence includes targeted scenario tests for the SDL CLI, Pi extension tests proving the new `/sdl:*` surface and absence of the old `/code:*` mirror, package `check`/`test` runs for touched TypeScript packages, dprint for docs/skills, and source searches showing deleted stale names where the slice requires deletion.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed after a preview for one bounded roadmap slice that edits repo-local code, tests, docs, skill files, parity metadata, and Objective tracking for this Objective.
- Steer or ask first when choosing command naming beyond the settled `/sdl:code:*` code lifecycle names, deciding whether a workflow is intentionally out of SDL scope, changing the extension architecture in a way that affects public plugin authors, or introducing any compatibility alias exception.
- Work may be left as local file changes on the current branch after the confirmed slice. The runner may create or modify tests and docs required for that slice, but should not start a broad multi-command migration without a fresh preview.
- Validation before keeping work should include targeted tests/checks for touched packages and docs formatting where applicable. Full-repo validation is useful completion evidence but should not become a standalone roadmap item unless the slice changes verification behavior itself.
- The runner must not push, submit, land, publish packages, deploy, mutate GitHub PRs/issues, or call external write APIs unless the user explicitly includes that action in the confirmed preview scope.

## Assumptions and Risks

Assumptions:

- SDL is allowed to host project-specific lifecycle commands, not only generic installable core commands.
- A flat SDL CLI command surface remains acceptable for the current CLI pass and is consistent with the current `sdl cp` command shape; the Pi code lifecycle taxonomy now targets nested `/sdl:code:*` names.
- Hard cutover is preferred over compatibility aliases: users and agents should update to the SDL command immediately when a slice migrates.
- `asdl-dev` can shrink or disappear as durable workflows migrate into SDL; remaining repo-internal developer utilities should be justified separately.
- The first implementation should establish the general project-specific SDL extension mechanism before moving `submit` or deferred PR metadata flows such as `pr-regen`. Revised by the submit hard-cutover: general command loading exists, typed selected-command schemas are supported for option-bearing project commands, `sdl submit` / `/sdl:submit` proved the first migrated lifecycle slice, and `submit` now ships as a built-in SDL command after the repo-local command-module shape served its migration purpose.

Risks:

- The migration can become a broad namespace churn project unless each slice ties a command move to tests, docs, deletion of the old surface, and concrete SDL extension API learning.
- Project-specific SDL extensions could blur product boundaries if docs do not distinguish public SDK surface, internal migration exports, built-in SDL commands, and repo-local command modules. De-risked for the general command-loading slice by the SDL README/context baseline plus CLI tests that prove project-only command discovery/loading beyond `cp`; further de-risked for option-bearing commands by the submit hard-cutover's selected-command schema loading, by promoting `submit` into `ts/packages/sdl/src/default-commands/submit.ts`, and by keeping repo-local command modules as an extension path rather than the final home for commands that should ship with SDL itself.
- The nested Pi taxonomy could become a cosmetic alias layer if it does not force reusable extension API improvements. Mitigate by requiring each `/sdl:code:*` slice to identify the SDL API behavior it proves or extends, such as schema loading, command discovery, confirmation, output presentation, or lower orchestration delegation.
- Hard cutover may break agent muscle memory and stale docs; source searches and parity metadata updates need to be part of every slice. De-risked for the submit slice by removing the transitional `/code:submit` bridge and `asdl-dev submit` helper/export, renaming the active submit skill to `sdl-submit`, updating Pi docs/parity/push guidance/CCC prompts, and keeping source-search evidence that remaining old-name hits are historical or absence assertions. Further de-risked for the changes slice by replacing `/code:changes` with built-in `sdl changes` and `/sdl:changes`, removing the custom Pi renderer/command implementation, and updating docs/context/parity/tests so old-name hits are absence assertions or migration-away notes.
- `submit`, `land`, `autobranch`, `autoslot`, and review-feedback flows mutate Git, Graphite, GitHub, or worktree-slot state; moving their public boundary must not weaken existing safety checks.
- Keeping implementation cores in CCC while exposing SDL commands could create another “shared TypeScript is not shared CLI” gap unless SDL scenario tests and skills prove non-Pi reachability. Partially de-risked for the current `cp` and `changes` surfaces by the SDL scenario fake-harness cleanup, which keeps behavior coverage in SDL while reducing duplicated CLI test plumbing for future command slices.

## Open Questions

- Should `pr-address`, `stack-address`, or `pr-feedback-watch` remain standalone review workflows, receive SDL wrappers outside `/sdl:code:*`, or eventually become SDL review commands directly?
- Should changelog updates and verification/fix workflows join SDL later, or remain outside the initial lifecycle migration backlog? `preview-url` is currently excluded from `/sdl:code:*` as dev/deployment tooling.
- When command implementations depend on Graphite, slots, or CCC internals, what docs should explain the boundary between SDL public command ownership and lower-package orchestration ownership?

## Closure

Closed as completed on branch `nested-sdl-code-aliases` after the SDL code-lifecycle hard cutover landed and was submitted as PR #1665.

Key evidence:

- The SDL project-specific extension model, command loading behavior, and documentation baseline are complete.
- `submit`, `changes`, checkpoint, and the full settled Pi-first `/sdl:code:*` lifecycle taxonomy are implemented with hard cutovers away from old `/code:*` lifecycle surfaces.
- `/sdl:code:autobranch`, `/sdl:code:autoslot`, `/sdl:code:land`, `/sdl:code:push`, and `/sdl:code:regenerate-pr` replaced `/code:autobranch`, `/code:autoslot`, `/code:land`, `/code:push`, and `/code:pr-regen` without compatibility aliases.
- The roadmap's active work rows are all complete; remaining nested SDL CLI taxonomy, preview URL migration, changelog/release prep, verification/fix workflows, and compatibility-alias policy notes are parked future scope rather than closure blockers.
- Validation for the final hard-cutover slice passed: `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just dprint-check`, and `git diff --check`.

Caveats and follow-ups:

- `/sdl:code:regenerate-pr` still delegates to the remaining `asdl-dev pr-regen` lower implementation; that is accepted as a lower-implementation ownership seam for this Objective, not a blocker to closing the SDL command-surface migration.
- A separate follow-up should plan removal of as much remaining `asdl-dev` code as can now be retired.
- Review workflow taxonomy remains separate: `pr-feedback-watch` stays outside `/sdl:code:*` until a future review-workflow decision.
