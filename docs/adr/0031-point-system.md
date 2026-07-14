# ADR 0031: Point system for extension-defined hooks and prompts

## Status

Accepted

Decision record for the `point-system` Objective (`.ns/objectives/point-system`), which implemented the kernel project-config loader, point catalog, first consumer migrations, and CLI introspection.

## Context

ns had several customization and configuration surfaces that solved the same shape of problem independently: ad-hoc `ns.toml` parsers for flow hooks and capability settings, multiple prompt-resolution ladders, and a provisional `[flow.hooks]` key. Those surfaces were hard to introspect together and invited each workflow to invent its own naming, parser, and diagnostics.

The needed model has two authors. Extension authors need to declare typed places where a workflow can be customized. Repo consumers need to install scripts or prompt content at those places. The kernel needs a single project-config parse path and a read-only catalog that can explain definitions, installations, active sources, and diagnostics.

## Decision

Adopt the point system.

A **Point** is a named place an extension defines where consumer config alters platform behavior. Extension authors **define** points; consumers **install** hooks or prompts at points. A **Hook** is a script command that runs. A **Prompt** is pure LM content resolved by the platform and consumed by the defining workflow; it is not executed by the point system. The kernel computes a **Point catalog** by joining point definitions with consumer installations.

Extension descriptors declare static point metadata. The original implementation used static `package.json` `ns.points` metadata beside `ns.commands`; that legacy manifest surface has since been removed in favor of descriptor modules exposed as `exports["./ns-extension"]` and selected through `ns.toml` `extensions`. First-party extensions normally use ids shaped like `<group>.<workflow>.<leaf>`, but that is a convention rather than a platform rule. Each point declares two type axes: `accepts: hook | prompt` and `cardinality: many | one` (`many`: installations add behavior; `one`: a single installation replaces the default). The catalog reports the same `cardinality` axis. Cardinality-one prompt points may declare a package-relative markdown `default` file.

Repo-root `ns.toml` has one `[points]` table keyed by full point id. Conventional prompt files at `.ns/prompts/<point-id>.md` also count as prompt installations without a TOML line. Hook resolution is `[points]` or no installation; workflow flags such as `flow submit --no-checks` are execution controls, not resolution tiers. Prompt resolution is development environment override reported by the catalog, then `[points]`, then conventional `.ns/prompts/<point-id>.md`, then manifest default. v1 installations are project-only; there is no XDG/global installation tier.

Settings remain typed plain config, not points. They keep extension-rooted TOML tables such as `[reviews.diff]`; point metadata is parsed by the shared loader from descriptors, not by changing settings into `[points]` entries.

Hooks exec directly and sequentially with no shell; the first failure aborts the surrounding workflow step. The platform resolves prompts but never executes them. Agentic work at a lifecycle moment is represented as a hook invoking an agentic CLI, not as prompt execution by the point system.

The shared single-parse project-config loader, declared settings schemas, point catalog, and read-only introspection commands are kernel machinery. CLI introspection lives under singular `ns extension`: `ns extension points` for the catalog and `ns extension point <id>` for detail.

## Considered options

- Treat settings as points — rejected. Settings are typed config, while points are installable workflow customization sites.
- Use a separate `[install]` table — considered, but `[points]` keeps the join key and installed behavior together in the consumer config.
- Use “extension point”, “hook point”, or event-like names — rejected because they collide with existing repo terms, overfit hooks, or imply a lifecycle/event model that this design deliberately does not reify.
- Add a global/XDG installation tier in v1 — deferred until there is a concrete cross-repo behavior need.
- Add a first-class agent-task `accepts` kind — deferred until the runner/harness story is concrete.
- Reify a lifecycle graph or `ns lifecycle` lens — deferred; the point catalog is the introspectable substrate for now, not a lifecycle model.

## Consequences

Consumers install; extension authors define. Future customization surfaces should define points, settings, or both through the shared loader rather than adding direct `ns.toml` parsers or bespoke prompt ladders.

The point catalog can report installed-but-undefined errors, installation-in-effect information, defined-but-uninstalled entries, and active prompt sources. Existing provisional surfaces migrated onto this model: `[flow.hooks].pre_submit` became `[points]."flow.submit.pre"`, prompt ladders moved to declared prompt points with id-based prompt files/defaults, and reviews/areg/ns-init settings moved to manifest-declared schemas.

The temporary Objective brief was a planning artifact. After this decision and the corresponding context vocabulary landed, the brief was deleted; durable truth is this ADR plus mutable `CONTEXT.md` files.

## Open questions

- Whether generalized prompt development override environment variable naming needs a broader convention beyond the implemented active-source reporting.
- Whether a global installation tier, agent-task point kind, or lifecycle lens becomes necessary after concrete usage appears.
