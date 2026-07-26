# ADR 0031: Points for Extension-defined Hooks and Prompts

## Status

Accepted

## Context

Workflow customization previously risked separate config parsers and prompt-resolution ladders. Extension authors need typed places for customization, consumers need a uniform way to install behavior or content, and the SDK needs one introspectable view of definitions, installations, sources, and diagnostics.

## Decision

An ns extension **defines** a **Point** in its typed descriptor module, exported through `exports["./ns-extension"]` and created with `defineExtension()`. A repository consumer **installs** one accepted kind at that point:

- a **Hook**, which is a command the owning workflow executes; or
- a **Prompt**, which is pure LM content that the platform resolves for the owning workflow and never executes.

Each definition declares its full id, `accepts: hook | prompt`, and `cardinality: many | one`; cardinality-one prompt points may declare a package-relative Markdown default. Definitions are discovered from descriptor modules selected through repo-root `ns.toml` `extensions`, not from `package.json` point metadata or extension-root scanning.

The shared SDK project-config loader parses one `[points]` table. Conventional `.ns/prompts/<point-id>.md` files also install prompt content. The SDK computes a **Point catalog** joining definitions, installations, active prompt sources, and diagnostics. Settings remain typed config and are not Points.

Hooks execute directly and sequentially without a shell; first failure aborts the surrounding workflow step. Prompt resolution selects development override, `[points]`, conventional file, then descriptor default. The point system resolves prompt content but performs no LM interaction.

Read-only introspection uses `ns extension points` and `ns extension point <id>`.

## Consequences

- Extensions share one descriptor-based customization mechanism and config parse path.
- Consumers can inspect defined, installed, active, missing, and invalid Point state.
- Workflows retain responsibility for hook execution and LM use.
- New customization surfaces choose Points, typed settings, or both rather than inventing bespoke parsers.

## Alternatives

- **Settings as Points:** rejected because typed values and installable behavior have different semantics.
- **Lifecycle graph or event system:** rejected because Points are named customization sites, not a workflow state model.
- **Global installation tier:** deferred until a concrete cross-repository need exists.
- **Agent-task Point kind:** deferred; agentic behavior can be installed as a Hook invoking an agentic CLI.
