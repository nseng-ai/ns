# Handoff Capability Extension

## Thesis

Handoff should become an SDL Capability with its domain behavior owned by `@sdl/handoff`, exposed to in-process consumers through a curated `@sdl/handoff/api`, and made available as a portable SDL command tree under `sdl handoff <operation>`. The current split is mid-migration: `@sdl/handoff` owns a standalone inventory/admin CLI and identity/storage helpers, while `@sdl/pi` still owns substantial create, pickup, list, launch, tab, and self-continuation workflow code under `ts/packages/hosts/pi/src/handoff/**`.

This Objective is a child of `sdl-extension-architecture` Phase 2. It revives Handoff's natural nested command shape as current architecture work, but it does not reopen the closed `handoff-sdl-extension` Objective as the durable identity. That closed record remains provenance for nested command-tree concerns; this Objective owns the ADR 0009/0012/0016 Capability migration: Handoff domain logic belongs in the Capability, not the Pi Presentation Host or SDL kernel, and consumers should depend on `@sdl/handoff/api` rather than package roots, identity-only subpaths, or Pi-local domain copies.

## Scope

- Inventory the current Handoff surface area and storage-sensitive behavior across `ts/packages/handoff/**`, `ts/packages/hosts/pi/src/handoff/**`, Handoff-related Pi tests, skills/prompts that invoke Handoff workflows, and command/shim installation references.
- Define and implement a curated `@sdl/handoff/api` Capability API for lifecycle-oriented consumers. Expected candidates include identity/slug helpers, Handoff Artifact storage/list/read/create/delete/gc operations, Handoff Summary and Handoff Technical Locator types, and gateway-injected request/result shapes.
- Move Handoff domain behavior into gateway-injected Domain Core modules inside `@sdl/handoff`, with real adapters at command/Pi edges and fake-backed tests for Branch Memory, Git, filesystem/stdin where applicable, and user confirmation boundaries.
- Extend SDL's command system enough to support the natural Handoff command tree `sdl handoff <operation>` with side-effect-light discovery and selected leaf loading. The expected target leaves are `list`, `delete`, `gc`, `create`, and `pickup`.
- Implement Handoff SDL command leaves over the Handoff Domain Core and Capability API. `create` is deterministic storage over final Markdown from stdin or `--file`; Pi/skills remain authoring frontends. `pickup` owns mechanical selection/read/metadata; Pi/skills own conversational summary, user-control prompting, and continuation launch decisions.
- Align existing Pi Handoff commands and tools in place. Public Pi names such as `/handoff:create`, `/handoff:pickup`, `/handoff:list`, handoff tab/self launch tools, and Claude handoff helpers should keep their user-facing names while depending on Handoff-owned core/API behavior instead of duplicating Branch Memory recipes or handoff inventory parsing.
- Hard-cut the standalone `handoff` CLI after SDL parity exists: inventory call sites first, migrate or remove references, then remove the standalone binary/shim rather than leaving a long-lived parallel public command surface.
- Update Handoff, SDL, Pi, context, and Objective records so future agents can discover the portable SDL command core, the Handoff Capability API, and the boundary between Handoff domain behavior and Pi/session presentation.

## Non-Goals

- Do not change the Handoff Branch Memory namespace (`handoff`), flat `<slug>.md` key shape, slug validation contract, branch-scoped storage model, or Handoff Technical Locator semantics without an explicit steer-first decision.
- Do not make `sdl handoff pickup` automatically continue implementation work after reading a handoff. Pickup returns/selects artifact content and metadata; Pi/skills decide how to present and continue.
- Do not move Pi runtime presentation, tab launching, `/handoff:self` session replacement, Claude-specific handoff launch behavior, or conversational summarization into `@sdl/handoff` domain logic.
- Do not introduce dynamic arbitrary Pi mirroring, extension-owned skill installation, marketplace/update/uninstall behavior, or agent-resource management in this Objective.
- Do not create hidden registries, YAML/frontmatter, UUID lifecycle state, task databases, or workflow-controller behavior for Handoff Artifacts.
- Do not migrate unrelated capabilities such as PR Address, Roaster, Aretro, Branch Context, Plans, Slot, Objective, Flow, or CCC in this Objective.
- Do not preserve the standalone `handoff` CLI as a long-lived compatibility surface after equivalent `sdl handoff ...` commands are complete and references have been cut over.

## Completion Criteria

- `@sdl/handoff/api` exists as the curated Capability API for Handoff lifecycle consumers; Pi/SDL command consumers use it instead of Handoff package roots, identity-only subpaths for domain decisions, or Pi-local handoff domain copies.
- Handoff Domain Core behavior for inventory, read/pickup selection, create/storage, delete, and garbage collection is gateway-injected and covered by fake-backed tests rather than raw `brmem`, Git, filesystem, stdin, or Pi host context.
- SDL supports the nested Handoff command tree `sdl handoff list`, `sdl handoff delete`, `sdl handoff gc`, `sdl handoff create`, and `sdl handoff pickup` with side-effect-light discovery, selected leaf loading, help/diagnostic behavior, and targeted SDL tests.
- Existing Handoff storage compatibility is preserved: namespace `handoff`, flat `<handoff-slug>.md` keys, branch-scoped artifacts, all-branches inventory semantics, deleted-branch garbage-collection behavior, overwrite protection, and technical locator evidence remain intentional and tested.
- Pi Handoff adapters keep their public user-facing names while delegating deterministic storage, list/read, selection, and admin behavior to Handoff-owned core/API or SDL command leaves; Pi keeps authoring prompts, UI presentation, and continuation/session launch behavior.
- The standalone `handoff` binary and durable documentation references are removed after SDL parity is established, with no long-lived compatibility binary or duplicate public implementation retained.
- Handoff, SDL, Pi, and root context/docs explain the Capability API, Command Face, Domain Core, Pi adapter boundary, and parked resource-management/dynamic-mirroring work.
- Parent Objective `sdl-extension-architecture` can record Handoff as a completed child migration, leaving any remaining nested-command or Handoff follow-ups explicitly parked or assigned to later Objectives.

## Definition of Progress

Progress is keepable when it:

- moves Handoff domain behavior out of `@sdl/pi` or standalone-CLI-only code and into `@sdl/handoff` Domain Core or `@sdl/handoff/api`;
- proves or documents a slice of the `sdl handoff <operation>` command tree without eager-loading unrelated leaves;
- preserves Handoff Artifact storage compatibility and existing Pi/skill user-facing behavior intentionally;
- narrows the boundary between Handoff domain logic, Pi presentation/session continuation, SDL kernel mechanics, and Branch Memory storage;
- records architectural decisions and follow-ups in this Objective, Handoff/SDL/Pi docs, or context files when the migration changes durable meaning.

Do not keep changes that:

- silently alter Handoff namespace, key, slug, branch selection, overwrite, deletion, or garbage-collection semantics;
- move Pi runtime UI/session continuation or Claude-specific presentation into Handoff domain logic;
- add public SDL SDK surface or nested-command manifest shape purely for one convenience without documenting the Handoff evidence;
- leave `handoff` and `sdl handoff ...` as parallel durable public implementations after parity and cutover;
- create hidden registries, task state, lifecycle databases, or agent-resource installation behavior under the Handoff migration banner.

Useful evidence includes targeted Handoff package tests, fake-gateway Domain Core tests, SDL nested command discovery/selected-loading tests, Handoff SDL command scenario tests, Pi adapter tests where touched, import-boundary searches, storage compatibility searches, docs/context diffs, and relevant TypeScript package checks for touched packages.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed after a preview for one bounded slice, such as inventorying Handoff surfaces and call sites, adding or narrowing `@sdl/handoff/api`, extracting one gateway-injected Handoff Domain Core, adding one nested-command infrastructure proof, migrating one `sdl handoff <operation>` leaf, aligning one Pi adapter family, updating docs/context, or running the standalone CLI cutover inventory.
- Direct execution may remove the standalone `handoff` binary/shim only after the preview states the parity evidence, call-site inventory, docs/test updates, and rollback/stop conditions; otherwise standalone CLI cutover is steer-first.
- Steer or ask first when choosing nested command manifest/schema shape, public SDL SDK author API, command names or aliases, JSON output contract, slug derivation policy, storage compatibility changes, destructive deletion/gc behavior, pickup continuation behavior, dynamic Pi mirroring, or agent-resource installation scope.
- Work may edit repo-local TypeScript, package metadata, tests, docs/context files, Pi adapters, skills/prompts that describe Handoff workflows, SDL command infrastructure, and Objective tracking. Work may be left as local file changes on the current branch after the confirmed slice.
- Validation before keeping work should include targeted tests/checks for touched packages and import-boundary/storage searches relevant to the slice. Full `just` is useful evidence for broad command-system or cutover slices but is not a standalone roadmap row.
- The runner must not push, submit, land, publish packages, mutate GitHub issues/PRs, mutate real Branch Memory entries as validation, or call external write APIs unless the user explicitly includes that action in the confirmed preview scope.

## Assumptions and Risks

Assumptions:

- Handoff's natural portable command shape is nested (`sdl handoff <operation>`), and this Objective is the right place to prove the needed SDL command-tree support rather than leaving Handoff permanently on a standalone CLI.
- The closed `handoff-sdl-extension` Objective remains useful provenance but should not be reopened or reused as durable identity because the parent architecture has since clarified Capability API, Capability Kit, and Extension Dependency Graph rules.
- A lifecycle-oriented `@sdl/handoff/api` is justified because Pi adapters and SDL command leaves need typed in-process Handoff behavior; the API should still exclude Pi presentation, session launch, and conversation continuation.
- Existing Handoff package operations for list/delete/gc and Pi workflows for create/pickup contain reusable behavior that can be moved behind gateway-injected cores without changing user-visible semantics.
- Hard-cutting the standalone `handoff` CLI is acceptable only after SDL command parity, call-site inventory, docs updates, and targeted tests demonstrate that the durable public surface has moved.

Risks:

- Nested command-tree infrastructure may overfit Handoff or expand the SDL extension API too much. Mitigate by proving side-effect-light discovery and selected leaf loading with focused tests and by steering before public SDK shape changes.
- Handoff create could accidentally absorb model/session authoring into SDL. Mitigate by keeping SDL create deterministic over final Markdown while Pi/skills author the artifact text.
- Handoff pickup could blur into automatic execution. Mitigate by keeping SDL pickup to selection/read/metadata and keeping continuation prompts and launches in Pi/skills.
- Storage compatibility is sensitive because Handoff Artifacts are Branch Memory entries on user branches. Mitigate with compatibility tests and explicit steer-first handling for namespace/key/slug/branch behavior changes.
- Removing the standalone `handoff` CLI could break habits, docs, or scripts if the call-site inventory is incomplete. Mitigate by making inventory and parity evidence explicit before removal.
- Pi Handoff code may mix domain behavior with presentation in ways that are hard to separate. Mitigate by slicing around one operation or adapter family at a time and preserving public Pi names.

## Open Questions

- What exact nested command manifest/schema and selected leaf authoring helper should SDL expose for `sdl handoff <operation>`?
- Which Handoff lifecycle operations should become first-class `@sdl/handoff/api` functions versus command-private helpers?
- What structured output should `sdl handoff pickup` return so Pi/skills can present summaries and ask for user-controlled continuation without parsing human text?
- Should `sdl handoff create` derive slugs from final Markdown, require explicit slugs, support both, or delegate derivation to a shared Handoff API helper?
- Which Pi/skill call sites still shell out or embed Branch Memory recipes after the API and command leaves exist?
- What minimum parity evidence is required before removing the standalone `handoff` binary and documentation references?
