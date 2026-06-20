# Reusable Skill Management Subsystem

## Thesis

ASDL needs a Pup-inspired agent-resource management subsystem that can list, locate, preview, and install bundled assistant resources for the core `asdl` and `sdl` CLIs first, while remaining reusable by SDL extensions later.

The first successful slice should be boring, static, and testable: a resource catalog, coding-agent platform install-path data, deterministic install plans, and CLI surfaces that make bundled ASDL/SDL skills visible and installable without each package reimplementing harness-specific filesystem logic.

## Scope

This Objective covers the design and implementation path for a reusable skill-management / agent-resource subsystem inspired by DataDog/pup. The initial product target is explicitly core ASDL and SDL CLI usage:

- Core `asdl` CLI can expose and install ASDL-owned assistant resources.
- `sdl` CLI can expose and install SDL-owned assistant resources.
- Shared implementation owns resource catalog types, platform specs, scope/path resolution, install-plan generation, and materialization semantics.
- The first scope should support skills from day one and intentionally decide whether agents and Pi extension bundles ship in the same first slice or remain parked.
- Public CLI behavior should include at least list, path, and install/plan operations analogous to Pup's `skills list`, `skills path`, and `skills install`.
- The design should preserve later reuse by SDL extensions without requiring extension execution during ordinary discovery/help.
- A detailed Pup research report is kept as a deliberate Objective reference at `references/pup-skill-management-report.md`.

## Non-Goals

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph in the first slice.
- No automatic mutation of vendored third-party skill directories beyond explicit install commands.
- No hidden database or local cache for durable resource definitions.
- No attempt to solve every harness-specific agent/subagent/package format before the core ASDL/SDL CLI steel thread works.
- No long-lived compatibility alias plan until the CLI command names and package boundary are deliberately chosen.
- No requirement that SDL extensions contribute catalogs in the first implementation slice, only that the core abstractions do not block that later.

## Completion Criteria

The Objective can close when:

- A canonical package/module boundary exists for reusable agent-resource catalog and install-planning logic.
- Core `asdl` and `sdl` CLI surfaces can list available built-in resources, show where they would install for supported platforms/scopes, and install or deterministically preview installation.
- The first supported platform set and path table are documented and tested.
- Resource entries have enough type information to represent at least skills, and a decision is recorded for agents and extension bundles.
- The system has tests for platform alias resolution, scope/path resolution, install plan output, collision/error behavior, and at least one core ASDL and one SDL resource catalog.
- The Pup research report remains checked in under this Objective and is referenced by implementation decisions.
- Follow-up work for SDL extension catalog contribution is either implemented or explicitly split into a later Objective/roadmap item.

## Assumptions and Risks

Assumptions:

- Pup's strongest transferable idea is a static, explicit, testable resource catalog plus platform path table, not a marketplace.
- Core ASDL and SDL can share most resource-install semantics even if their CLIs live in different package/runtime layers.
- The first user-visible value comes from installing existing ASDL/SDL assistant resources into supported harness layouts, not from inventing new resource formats.
- SDL extension reuse can be preserved with catalog-provider interfaces without needing dynamic extension execution during command discovery.

Risks:

- The package boundary may be awkward if core `asdl` remains Python while SDL is TypeScript; a CLI bridge or separate implementation layer may be needed.
- The word "skills" may be too narrow if agents and Pi extension bundles matter immediately, while "resources" may be too abstract for users.
- Installing into user-global assistant directories can be surprising or unsafe unless path preview and project-local scope are obvious.
- Catalog contribution by SDL extensions can become a plugin/registry system if overdesigned; keep the first design static and explicit.
- Existing `skillx`, `areg`, `npx skills`, and repo skill conventions may overlap semantically; the implementation must avoid duplicating or breaking established workflows.

## Open Questions

- What is the canonical package name: `@asdl/agent-resources`, `@asdl/assistant-resources`, `@asdl/skill-management`, or something else?
- Should the public command say `skills`, `resources`, or `agent-resources` for the core `asdl` and `sdl` CLIs?
- Does the first slice include only skills, or also agent/subagent Markdown and Pi extension bundles?
- How should a Python `asdl` CLI consume a reusable subsystem if the first implementation is TypeScript-first?
- Which platform set is mandatory for the first release: Pi, Claude Code, Codex, Cursor, opencode, Gemini, Windsurf, or a smaller ASDL-supported subset?
