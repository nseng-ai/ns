# SDL Extension Architecture

## Thesis

SDL should become a small Source Development Lifecycle kernel whose useful workflow capabilities are expressed as SDL extensions. The immediate experiment is command-first and bottom-up: remove SDL's current domain commands from privileged built-in registration, then add them back one by one as project-local user-authored extensions in this repository. Each migrated command should pressure-test the public SDL extension SDK and reveal which kernel services are genuinely reusable versus which logic belongs in an extension.

This Objective supersedes the narrower `handoff-sdl-extension` Objective. Handoff remains useful as a future sophisticated workflow pressure test, but the architecture should first be proven with simpler project-local commands before committing to nested command trees, bundled extension shape, or Handoff-specific API design.

## Scope

- Reframe `@sdl/sdl` as an extension kernel rather than a package with privileged built-in lifecycle commands.
- Start with project-local command extensions under `.sdl/extensions`, treating `changes`, `cp`, `regenerate-pr`, and `submit` as if a user authored them for this repository.
- Use each command migration to discover and refine the minimal public SDL extension SDK.
  - Begin from the current `@sdl/sdl/sdk` surface where possible.
  - Promote only repeated, demonstrated pain into kernel-provided interfaces or public SDK helpers.
  - Keep internal migration exports distinct from public extension-author APIs.
- Preserve user-facing command behavior intentionally while changing ownership and implementation shape.
  - The command should remain reachable as `sdl <name>` when the project-local extension is present.
  - Pi mirrors should become adapters over discovered/project-local SDL behavior where practical, not parallel implementations that assume commands are universal built-ins.
- Document the emerging kernel/extension mental model, including classification rules for kernel services, project-local commands, future bundled extensions, and parked sophisticated workflows.
- Close `handoff-sdl-extension` as subsumed by this broader command-first architecture track, preserving its content as provenance and parked future input.

## Non-Goals

- Do not exhaustively migrate every current SDL capability/package in this Objective. Broader capability modeling, bundled extensions, and sophisticated workflow migrations are parked until command-first learning produces a stable enough SDK/kernel model.
- Do not create a privileged bundled-extension path for `cp`, `submit`, or similar repository workflow commands in the first pass; model them as project-local user-authored extensions.
- Do not design nested SDL CLI command trees, Handoff lifecycle commands, Objective migration, Slot migration, or extension-owned agent-resource installation as part of the initial command-first slices.
- Do not keep long-lived compatibility aliases or duplicate public implementations when a command is intentionally moved into project-local SDL extension form.
- Do not expose internal implementation modules as public SDK just to make the first migrated command easy.
- Do not add hidden registries, task databases, UUID state, or workflow-controller behavior to SDL extensions.

## Completion Criteria

- SDL's kernel command registry no longer imports or registers repository workflow domain commands such as `changes`, `cp`, `submit`, or `regenerate-pr` as privileged built-ins.
- This repository restores the selected command surfaces through project-local `.sdl/extensions` entries that exercise the same public SDK available to user-authored extensions.
- The command migration sequence starts with a kernel reset plus a project-local `changes` extension, then uses mutating and GitHub/Graphite-heavy commands to test whether the SDK needs deeper Git, GitHub, Branch Memory, output, confirmation, or command-composition interfaces.
- Each promoted SDK/kernel interface has concrete evidence from at least two command slices or a clearly documented single-command necessity.
- Pi mirrors and docs stop assuming these commands are universal SDL built-ins; they either delegate through SDL discovery or document the project-local nature of the command.
- The emerging architecture is documented in SDL docs/context language with clear terms for kernel, public extension SDK, project-local extension, future bundled extension, and internal migration export.
- `handoff-sdl-extension` is closed as subsumed, with Handoff-specific nested command-tree work parked as future input rather than active parallel architecture work.
- The Objective records a disposition for broader capability modeling: commands-first complete now, bundled/sophisticated capability migrations deferred to later child Objectives or follow-up Objectives.

## Definition of Progress

Progress is keepable when:

- It removes privileged domain-command assumptions from the SDL kernel or restores one command through the same project-local extension path a user extension would use.
- It makes the public SDK boundary clearer by either proving the existing surface is enough or documenting a concrete missing kernel service discovered during a command migration.
- It keeps command behavior, tests, docs, and Pi adapter behavior aligned with the new ownership model.
- It reduces internal-import leakage from user-authored extensions rather than papering over missing SDK shape with private package imports.
- It records architectural learning in docs, context language, roadmap updates, or follow-up Objective candidates.

Do not keep changes that:

- Recreate a privileged built-in or bundled command path for repository-specific commands before the project-local extension experiment has run.
- Add public SDK surface only because one command can conveniently reuse an internal helper, without proving the helper is a deep kernel interface.
- Leave command behavior split between a new SDL extension and an old parallel implementation without a documented short migration reason.
- Treat Pi mirrors as the source of truth for SDL command existence when the CLI command is project-local.
- Fold Handoff, Objectives, Slots, or all existing capabilities into this Objective before the command-first model has produced enough evidence.

Useful evidence includes targeted SDL CLI scenario tests, extension discovery/loading tests, Pi adapter/parity tests where touched, source searches showing domain built-ins or old surfaces were removed where intended, docs/context diffs explaining the ownership change, and relevant TypeScript package checks/tests for touched packages.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed after a preview for one bounded command-first architecture slice, such as kernel reset plus `changes`, migrating `cp`, migrating `regenerate-pr`, migrating `submit`, updating Pi adapters for a migrated command, or documenting SDK/kernel learning from a completed slice.
- Steer or ask first when choosing command naming, deciding to promote a new public SDK interface, changing extension discovery precedence, introducing a compatibility alias, deciding a command should become bundled instead of project-local, or pulling a parked sophisticated capability such as Handoff, Objectives, or Slots back into active scope.
- Work may edit repo-local TypeScript, tests, docs, context files, Pi extension adapters, project-local `.sdl/extensions` files, and Objective tracking for this Objective. Work may be left as local file changes on the current branch after the confirmed slice.
- Validation before keeping work should include targeted tests/checks for touched packages and docs formatting where applicable. Full TypeScript validation is useful evidence for broad slices but should remain evidence, not a standalone roadmap row.
- The runner must not push, submit, land, publish packages, deploy, mutate GitHub issues/PRs, or call external write APIs unless the user explicitly includes that action in the confirmed preview scope.

## Assumptions and Risks

Assumptions:

- Modeling `changes`, `cp`, `regenerate-pr`, and `submit` as project-local user-authored extensions will expose more useful SDK design pressure than keeping them as SDL built-ins or first-party bundled extensions.
- A command-first migration is the right bottom-up path before designing bundled extensions or migrating sophisticated workflows like Handoff, Objectives, and Slots.
- `@sdl/sdl/sdk` should remain the only public author API unless concrete migration evidence justifies adding or reshaping exports.
- Project-local command discovery can preserve the user-facing `sdl <name>` surface in this repository without implying the command is universally available in every SDL installation.
- Handoff's nested command-tree design remains valuable provenance, but it should not drive the first kernel/SDK shape before simpler commands have been re-modeled.

Risks:

- Removing built-in commands before restoring project-local equivalents did intentionally create a temporary availability gap for `cp`, `submit`, and `regenerate-pr`; this is accepted as first-slice architecture evidence and should be closed by later project-local migration rows rather than by restoring stubs or built-ins.
- Restoring `changes` as a direct SDK-only extension required localized duplication of git snapshot loading, model prompt/default selection, model-output validation, and output formatting. This is acceptable one-command duplication for the first slice, but it is now concrete SDK-pressure evidence to compare against later command migrations.
- Extensions may be forced to shell out or duplicate internal logic too much if the SDK is too thin. Mitigate by allowing duplication briefly, then promoting repeated pain into deep kernel interfaces with test coverage.
- The SDK may become overfit if every migrated command's convenience helper is exposed publicly. Mitigate by requiring concrete reuse evidence or a documented necessity before promotion.
- Pi mirrors may drift from CLI discovery if they continue to hardcode command names. The current mitigation is explicit documentation that project-local SDL extension discovery is CLI-only and exact `/sdl:*` mirrors are static engineered adapters requiring tests/parity metadata; dynamic Pi discovery remains future design work, not hidden current scope.
- Closing `handoff-sdl-extension` may hide useful nested-command thinking. Mitigate by preserving it as a closed provenance Objective and parking Handoff as a future sophisticated workflow pressure test.

## Open Questions

- What is the smallest useful SDL kernel once all domain commands are removed?
- Should project-local SDL command extensions eventually be able to contribute exact dynamic Pi mirrors, or should Pi keep static adapters for selected project commands?
- Which repeated pain from `changes`, `cp`, `regenerate-pr`, and `submit` justifies first-class SDK interfaces for Git, GitHub, Branch Memory, model generation, output, confirmation, or command composition?
- Which parts of the documented project-local versus future bundled extension model should become follow-up Objectives rather than remaining parked design space?
- After the command-first migration, which parked capability should become the first bundled/sophisticated extension pressure test: Handoff, Objectives, Slots, or another workflow?
