# Reusable Skill Management Subsystem

## Thesis

SDL needs a Pup-inspired agent-resource management subsystem that can list, locate, preview, and install bundled assistant resources for the first-party `sdl` CLI first, while remaining reusable by other first-party CLIs and SDL extensions later.

The first successful slice should be boring, static, and testable: a resource catalog, coding-agent platform install-path data, deterministic install plans, and CLI surfaces that make bundled SDL skills visible and installable without each package reimplementing harness-specific filesystem logic.

## Scope

This Objective covers the design and implementation path for a reusable skill-management / agent-resource subsystem inspired by DataDog/pup. The initial product target is explicitly the first-party `sdl` CLI:

- The `sdl` CLI can expose and install SDL-owned assistant resources.
- Shared implementation owns resource catalog types, platform specs, scope/path resolution, install-plan generation, and materialization semantics.
- The first scope should support skills from day one and intentionally decide whether agents and Pi extension bundles ship in the same first slice or remain parked.
- Public CLI behavior should include at least list, path, and install/plan operations analogous to Pup's `skills list`, `skills path`, and `skills install`.
- The design should preserve later reuse by other first-party CLIs and SDL extensions without requiring extension execution during ordinary discovery/help.
- A detailed Pup research report is kept as a deliberate Objective reference at `references/pup-skill-management-report.md`.

## Non-Goals

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph in the first slice.
- No automatic mutation of vendored third-party skill directories beyond explicit install commands.
- No hidden database or local cache for durable resource definitions.
- No attempt to solve every harness-specific agent/subagent/package format before the core `sdl` CLI steel thread works.
- No long-lived compatibility alias plan until the CLI command names and package boundary are deliberately chosen.
- No requirement that SDL extensions contribute catalogs in the first implementation slice, only that the core abstractions do not block that later.

## Completion Criteria

The Objective can close when:

- A canonical package/module boundary exists for reusable agent-resource catalog and install-planning logic.
- The `sdl` CLI surface can list available built-in resources, show where they would install for supported platforms/scopes, and install or deterministically preview installation.
- The first supported platform set and path table are documented and tested.
- Resource entries have enough type information to represent at least skills, and a decision is recorded for agents and extension bundles.
- The system has tests for platform alias resolution, scope/path resolution, install plan output, collision/error behavior, and at least one first-party SDL resource catalog.
- The Pup research report remains checked in under this Objective and is referenced by implementation decisions.
- Follow-up work for SDL extension catalog contribution is either implemented or explicitly split into a later Objective/roadmap item.

## Assumptions and Risks

Assumptions:

- Pup's strongest transferable idea is a static, explicit, testable resource catalog plus platform path table, not a marketplace.
- Most resource-install semantics can be shared across the first-party CLIs and SDL extensions even though they live in different package layers within the `ts/` workspace.
- The first user-visible value comes from installing existing SDL assistant resources into supported harness layouts, not from inventing new resource formats.
- Reuse across other first-party CLIs and SDL extensions can be preserved with catalog-provider interfaces without needing dynamic extension execution during command discovery.

Risks:

- The package boundary may be awkward if the subsystem must be consumed by several first-party CLIs and extensions with different runtime/layering constraints; a shared core plus thin per-CLI bindings may be needed.
- The word "skills" may be too narrow if agents and Pi extension bundles matter immediately, while "resources" may be too abstract for users.
- Installing into user-global assistant directories can be surprising or unsafe unless path preview and project-local scope are obvious.
- Catalog contribution by SDL extensions can become a plugin/registry system if overdesigned; keep the first design static and explicit.
- Existing `skillx`, the `@sdl/areg` ("SDL agent registry") CLI, `npx skills`, and repo skill conventions may overlap semantically; the implementation must avoid duplicating or breaking established workflows.

## Open Questions

- What is the canonical package name: `@sdl/agent-resources`, `@sdl/assistant-resources`, `@sdl/skill-management`, or something else?
- Should the public command say `skills`, `resources`, or `agent-resources` for the `sdl` CLI?
- Does the first slice include only skills, or also agent/subagent Markdown and Pi extension bundles?
- How should the shared subsystem be consumed by a second first-party CLI (for example a host CLI such as `ccc`/`sdlcc`) or an SDL extension to prove reuse beyond the `sdl` CLI?
- Which platform set is mandatory for the first release: Pi, Claude Code, Codex, Cursor, opencode, Gemini, Windsurf, or a smaller SDL-supported subset?
