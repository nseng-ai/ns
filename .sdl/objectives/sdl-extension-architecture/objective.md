# SDL Extension Architecture

## Thesis

SDL should become a small Source Development Lifecycle kernel whose useful workflow capabilities are expressed as SDL extensions. The command-first experiment is bottom-up: remove repository workflow domain commands from privileged built-in registration, then restore them through project-local extension discovery in this repository. Each migrated command should pressure-test the public SDL extension SDK and reveal which kernel services are genuinely reusable versus which logic belongs in an extension, a project-local helper, or a separately owned lower package.

This Objective supersedes the narrower `handoff-sdl-extension` Objective. Handoff remains useful as a future sophisticated workflow pressure test, but the architecture should first be proven with simpler project-local commands before committing to nested command trees, bundled extension shape, or Handoff-specific API design.

## Scope

- Reframe `@sdl/sdl` as an extension kernel rather than a package with privileged built-in lifecycle commands.
- Use the grouped project-local flow extension under `.sdl/extensions/flow`, treating lifecycle commands such as `changes`, `cp`, `regenerate-pr`, `submit`, and `land` as repository-authored command entries rather than universal SDL built-ins.
  - The current public CLI shape in this repository is `sdl flow <command>` rather than flat `sdl <command>`.
  - `land` is a special case: it had no prior `sdl land` built-in to remove. It started as a Pi-only CCC land-stack orchestration surface and now has a project-local `sdl flow land` command entry plus `/sdl:flow:land` Pi mirror. Its implementation deliberately delegates to `@sdl/ccc/land` instead of promoting a public landing SDK in this Objective.
- Use each command migration to discover and refine the minimal public SDL extension SDK.
  - Begin from the current `@sdl/sdl/sdk` surface where possible.
  - Promote only repeated, demonstrated pain into kernel-provided interfaces or public SDK helpers.
  - Keep internal migration exports and project-local helper aliases distinct from public extension-author APIs.
- Preserve user-facing command behavior intentionally while changing ownership and implementation shape.
  - The selected lifecycle commands should remain reachable as `sdl flow <name>` when the project-local flow extension is present.
  - Pi mirrors are static engineered adapters for selected project-local flow commands, not evidence that commands are universal built-ins or that arbitrary SDL extension commands are dynamically mirrored into Pi.
- Document the emerging kernel/extension mental model, including classification rules for kernel services, project-local commands, future bundled extensions, internal migration exports, and parked sophisticated workflows.
- Consolidate duplicated command-author code across the `flow` group through the project-local shared-helper tier and existing internal-migration-export subpaths, not new public SDK surface.
  - Treat the checked-in `submit.ts` bundle as a first-class design input and eventual consumer for the whole consolidation track, not as a quarantined file to ignore until the final rewrite row.
  - Route command-local reimplementations — PR-description machinery, generic exec/format/JSON helpers, GitHub-PR access, and CCC-CLI delegation boilerplate — through `.sdl/extensions/flow/src/shared/`, re-exposing existing `@sdl/core/submit` and `@sdl/ccc` behavior via `@sdl/sdl/*` internal-migration-export subpaths.
  - Replace the checked-in `submit.ts` bundle with a readable hand-authored command that delegates to `@sdl/core/submit` orchestration, removing the bundled-artifact liability flagged in `.sdl/extensions/AGENTS.md`.
  - Keep this consolidation within the internal-migration-export and project-local shared-helper tiers; do not promote new `@sdl/sdl/sdk` author API as part of this track.
- Close `handoff-sdl-extension` as subsumed by this broader command-first architecture track, preserving its content as provenance and parked future input.

## Non-Goals

- Do not exhaustively migrate every current SDL capability/package in this Objective. Broader capability modeling, bundled extensions, and sophisticated workflow migrations are parked until command-first learning produces a stable enough SDK/kernel model.
- Do not create a privileged bundled-extension path for `cp`, `submit`, `land`, or similar repository workflow commands in the first pass; model them as project-local flow commands.
- Do not design nested SDL CLI command trees, Handoff lifecycle commands, Objective migration, Slot migration, or extension-owned agent-resource installation as part of the initial command-first slices.
- Do not keep long-lived compatibility aliases or duplicate public implementations when a command is intentionally moved into project-local SDL extension form.
- Do not expose internal implementation modules as public SDK just to make a migrated command easy.
- Do not add hidden registries, task databases, UUID state, or workflow-controller behavior to SDL extensions.

## Completion Criteria

- SDL's kernel command registry no longer imports or registers repository workflow domain commands such as `changes`, `cp`, `submit`, `regenerate-pr`, or `land` as privileged built-ins, and `land` has a project-local `sdl flow land` surface rather than remaining a Pi-only CCC delegation.
- This repository restores the selected command surfaces through project-local `.sdl/extensions/flow` entries that exercise SDL extension discovery and the author SDK boundary.
- The command migration sequence starts with a kernel reset plus a project-local `changes` extension, then uses mutating and GitHub/Graphite-heavy commands to test whether the SDK needs deeper Git, GitHub, Branch Memory, output, confirmation, command-composition, or lower-package delegation interfaces.
- Each promoted SDK/kernel interface has concrete evidence from at least two command slices or a clearly documented single-command necessity.
- Pi mirrors and docs stop assuming these commands are universal SDL built-ins; they either delegate through the grouped project-local SDL flow CLI or document the static project-local nature of the mirror.
- The emerging architecture is documented in SDL docs/context language with clear terms for kernel, public extension SDK, project-local extension, future bundled extension, internal migration export, and static Pi mirror.
- `handoff-sdl-extension` is closed as subsumed, with Handoff-specific nested command-tree work parked as future input rather than active parallel architecture work.
- The Objective records a disposition for broader capability modeling: commands-first complete now, bundled/sophisticated capability migrations deferred to later child Objectives or follow-up Objectives.
- The `flow` group's command-author duplication is consolidated: hand-written commands import shared helpers (or internal-migration-export-backed `shared/` re-exports) instead of re-implementing PR-description, exec/format/JSON, GitHub-PR, or CCC-CLI delegation logic; `submit` is a readable delegating command rather than a checked-in bundle; and no new public `@sdl/sdl/sdk` surface is added to achieve it.

## Definition of Progress

Progress is keepable when:

- It removes privileged domain-command assumptions from the SDL kernel or restores one command through the same project-local extension path a repository flow command uses.
- It makes the public SDK boundary clearer by either proving the existing surface is enough, proving that project-local shared helpers are the right intermediate layer, accepting a lower-package delegation boundary for a specific command, or documenting a concrete missing kernel service discovered during migration.
- It keeps command behavior, tests, docs, and Pi adapter behavior aligned with the grouped `sdl flow` ownership model.
- It reduces internal-import leakage from user-authored extensions rather than papering over missing SDK shape with private package imports, except for deliberate migration aliases such as CCC-owned `land` orchestration that are recorded as architecture evidence.
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

- Direct execution is allowed after a preview for one bounded command-first architecture slice, such as kernel reset plus `changes`, migrating `cp`, migrating `regenerate-pr`, migrating `submit`, migrating `land`, updating Pi adapters for a migrated command, or documenting SDK/kernel learning from a completed slice.
- Steer or ask first when choosing command naming, deciding to promote a new public SDK interface, changing extension discovery precedence, introducing a compatibility alias, deciding a command should become bundled instead of project-local, or pulling a parked sophisticated capability such as Handoff, Objectives, or Slots back into active scope.
- Work may edit repo-local TypeScript, tests, docs, context files, Pi extension adapters, project-local `.sdl/extensions` files, and Objective tracking for this Objective. Work may be left as local file changes on the current branch after the confirmed slice.
- Validation before keeping work should include targeted tests/checks for touched packages and docs formatting where applicable. Full TypeScript validation is useful evidence for broad slices but should remain evidence, not a standalone roadmap row.
- The runner must not push, submit, land, publish packages, deploy, mutate GitHub issues/PRs, or call external write APIs unless the user explicitly includes that action in the confirmed preview scope.

## Assumptions and Risks

Assumptions:

- Modeling lifecycle commands as project-local flow extension entries exposes more useful SDK design pressure than keeping them as SDL built-ins, first-party bundled extensions, or Pi-only delegations.
- `land` exercised a distinct migration shape from the others: it started as a Pi command over CCC land-stack orchestration with no CLI/skill entry, and the accepted command-first result is a thin project-local `sdl flow land` command that delegates to `@sdl/ccc/land` without promoting a public landing/Graphite-stack SDK yet.
- A command-first migration remains the right bottom-up path before designing bundled extensions or migrating sophisticated workflows like Handoff, Objectives, and Slots.
- `@sdl/sdl/sdk` should remain the public author API unless concrete migration evidence justifies adding or reshaping exports.
- Project-local grouped command discovery can preserve the user-facing `sdl flow <name>` surface in this repository without implying the command is universally available in every SDL installation.
- Handoff's nested command-tree design remains valuable provenance, but it should not drive the first kernel/SDK shape before simpler commands have been re-modeled.
- The PR-description machinery, `commandFailure`, GitHub-PR gateway, and submit orchestration that `regenerate-pr` and the `submit` bundle currently duplicate already exist in `@sdl/core/submit`, so flow shared-code consolidation is mostly re-exposure through internal-migration-export subpaths plus `shared/` re-exports rather than new behavior.
- Shared-code consolidation should be designed holistically around the final `submit.ts` rewrite: even early helper extractions should be checked against submit's behavior matrix and likely delegating shape so they do not create throwaway seams that only fit `regenerate-pr` or `autobranch`.

Risks:

- The temporary availability gap for `cp`, `submit`, `regenerate-pr`, and `land` has been closed by the grouped flow extension rather than by restoring stubs or built-ins.
- Restoring and grouping the flow commands proved three intermediate patterns before public SDK promotion: local duplication for command-policy-heavy code, project-local/shared helpers for repeated repo-local seams, and explicit lower-package delegation for CCC-owned orchestration such as `land`.
- Extensions may be forced to shell out or duplicate internal logic too much if the SDK is too thin. Mitigate by allowing duplication briefly, extracting extension-owned shared helpers when multiple project-local commands prove a readable local seam, then promoting repeated pain into deep kernel interfaces with test coverage only when the helper should become public author API.
- The SDK may become overfit if every migrated command's convenience helper is exposed publicly. Mitigate by requiring concrete reuse evidence or a documented necessity before promotion.
- Pi mirrors may drift from CLI discovery if they continue to hardcode command names. The current mitigation is static grouped `/sdl:flow:*` mirror registration with package tests/parity metadata; dynamic Pi discovery remains future design work, not hidden current scope.
- Closing `handoff-sdl-extension` may hide useful nested-command thinking. Mitigate by preserving it as a closed provenance Objective and parking Handoff as a future sophisticated workflow pressure test.
- Rewriting the `submit.ts` bundle into a delegating command risks regressing the submit behavior matrix (preflight, restack confirmation, PR-metadata prewrite, semantic-failure detection). Mitigate by treating submit as a first-class consumer during earlier shared-helper design, keeping faked `git`/`gt`/`gh` scenario coverage green across the rewrite, and delegating to the already-tested `@sdl/core/submit` orchestration rather than reimplementing it.
- A shared GitHub-PR gateway seam could overreach the command-first evidence threshold. Mitigate by reusing the existing `@sdl/core/submit` `RealGithubPrGateway` through an internal-migration-export subpath and keeping the seam extension-local rather than promoting it to public SDK.

## Open Questions

- What is the smallest useful SDL kernel once all repository workflow domain commands are removed? The command-first result points to host mechanics, discovery, schema/argument parsing, execution context, and a small SDK, but exact future minimization remains follow-up design.
- Should project-local SDL command extensions eventually be able to contribute exact dynamic Pi mirrors, or should Pi keep static adapters for selected project commands? The current Objective chose static grouped `/sdl:flow:*` mirrors and parks dynamic arbitrary Pi discovery.
- Which repeated pain from `changes`, `cp`, `regenerate-pr`, `submit`, `land`, and adjacent flow commands justifies first-class SDK interfaces for Git, GitHub, Branch Memory, model generation, output, confirmation, or command composition? Exec evidence helpers have been promoted; other seams remain follow-up candidates rather than closure blockers.
- Should `land` keep depending on the CCC land-stack orchestration (`@sdl/ccc/land`) from a project-local extension, or does its migration require promoting a public landing/Graphite-stack interface? For this command-first slice, the accepted answer is CCC delegation with no public landing SDK promotion; revisit only if another extension needs the same portable contract.
- Which parts of the documented project-local versus future bundled extension model should become follow-up Objectives rather than remaining parked design space?
- Once the `flow` shared-helper tier re-exposes most of `@sdl/core/submit`, which of those helpers (if any) have earned enough cross-extension evidence to graduate into the public `@sdl/sdl/sdk`? This track deliberately defers that promotion and keeps it as the next steer-first decision.
- After the command-first migration, which parked capability should become the first bundled/sophisticated extension pressure test: Handoff, Objectives, Slots, or another workflow?
