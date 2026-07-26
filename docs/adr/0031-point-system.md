# ADR 0031: Points for Extension-defined Hooks and Prompts

## Status

Accepted

## Context

Workflow customization previously risked separate config parsers and prompt-resolution ladders. Extension authors need typed places for customization. Consumers need uniform way to install behavior or content. SDK needs one introspectable view of definitions, installations, sources, diagnostics.

## Decision

ns extension **defines** **Point** in its typed descriptor module, exported through `exports["./ns-extension"]`, created with `defineExtension()`. Repository consumer **installs** one accepted kind at that point:

- **Hook**: command owning workflow executes; or
- **Prompt**: pure LM content platform resolves for owning workflow, never executes.

Each definition declares full id, `accepts: hook | prompt`, `cardinality: many | one`; cardinality-one prompt points may declare package-relative Markdown default. Definitions discovered from descriptor modules selected through repo-root `ns.toml` `extensions`, not from `package.json` point metadata or extension-root scanning.

Shared SDK project-config loader parses one `[points]` table. Conventional `.ns/prompts/<point-id>.md` files also install prompt content. SDK computes **Point catalog** joining definitions, installations, active prompt sources, diagnostics. Settings stay typed config, not Points.

Hooks execute directly and sequentially, no shell; first failure aborts surrounding workflow step. Prompt resolution selects development override, `[points]`, conventional file, then descriptor default. Point system resolves prompt content; performs no LM interaction.

Read-only introspection uses `ns extension points` and `ns extension point <id>`.

## Consequences

- Extensions share one descriptor-based customization mechanism and config parse path.
- Consumers can inspect defined, installed, active, missing, invalid Point state.
- Workflows keep responsibility for hook execution and LM use.
- New customization surfaces choose Points, typed settings, or both, not bespoke parsers.

## Alternatives

- **Settings as Points:** rejected; typed values and installable behavior have different semantics.
- **Lifecycle graph or event system:** rejected; Points are named customization sites, not workflow state model.
- **Global installation tier:** deferred until concrete cross-repository need exists.
- **Agent-task Point kind:** deferred; agentic behavior can be installed as Hook invoking agentic CLI.
