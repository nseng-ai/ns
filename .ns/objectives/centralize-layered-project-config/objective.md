# Centralize Layered Project Configuration

## Thesis

Give ns one deep, typed project-config API. A caller supplies its invocation scope: `cwd`, environment, command execution channel, and optional cancellation signal. The API discovers the project root, reads the applicable sources, applies source and setting-family rules, and returns effective typed values with provenance. Per ADR 0058, caller identity is not part of project-config scope and Pi does not inject `NS_HARNESS`.

Production consumers must use this API instead of discovering roots, locating or reading `ns.toml`, constructing Node config adapters, or applying precedence. First consolidate the current project-only behavior without changing it. Activate `ns.local.toml` or user settings only after a new ADR refines ADR 0056 and defines their authority, provenance, and setting-family rules.

The first production slice now provides `EffectiveProjectConfig`: one invocation-scoped asynchronous `get(setting)` operation with typed failures and project-source provenance. Its Node factory owns repository discovery over the caller's command execution channel and performs `ns.toml` reads behind the effective-config boundary. Every production `[models]` reader uses this route. Lower-level `ProjectConfigGateway` and parser machinery remain for points, catalogs, non-model setting families, mutation adapters, and effective-config internals until later slices migrate them.

## Scope

- Define separate contracts for effective config reads and source-specific mutation.
- Make project-root and config-root discovery part of effective config reads.
- Preserve `SettingsSchema`, shared parsing, point behavior, and source-aware diagnostics where they fit the new boundary.
- Create one config capability per ns CLI or Pi command invocation. Share discovery and source loading within that capability, but never retain it across invocations.
- Migrate command-source discovery, extension descriptors, point definitions and installations, model policy, Reviews, Slots, harness settings, and all other production config readers.
- Preserve source mutation guarantees: byte fidelity, optimistic stale-state checks, path containment, safe writes, and scope authority.
- Report the winning source for each effective value.
- Add a mechanical guard for direct production config-file access outside approved config and mutation adapters.
- Decide later config layers in a new ADR, then implement only the approved setting families.

## Non-Goals

- Change project-only behavior during consolidation.
- Apply one generic TOML deep merge. Each setting family owns its merge or replacement rule.
- Activate user hooks or prompt installations without explicit security and path decisions.
- Keep compatibility aliases or two canonical config-access paths.
- Route arbitrary project files through the project-config API.
- Perform Git gateway cleanup that config access does not require.

## Completion Criteria

- Every production config read uses the effective project-config API.
- No production workflow discovers a root only to read config.
- Invocation from a nested directory returns the same effective project config as invocation from the project root.
- Command sources, extension descriptors, point definitions and installations, and typed settings use one invocation scope.
- Effective reads and source-specific mutations use separate interfaces.
- Consolidation tests prove compatibility with existing project-only behavior.
- Diagnostics and inspection identify the source of each effective value.
- An architecture guard rejects direct config-file access outside its explicit allowlist.
- A new accepted ADR refines ADR 0056 before `ns.local.toml` or user settings become active.
- Tests and user documentation cover every config layer that the new ADR approves.

## Assumptions and Risks

**Assumptions**

- `parseProjectConfigToml` and `SettingsSchema` are useful parts of the final implementation.
- CLI preparation and per-command Pi contexts can establish config once for each invocation.
- Each setting family can define an explicit merge or replacement rule.

**Risks**

- Extension declarations affect the schemas and point definitions available during config loading. This can create ordering cycles.
- User settings can change repository behavior or execute repository-affecting content. Each source therefore needs explicit permissions.
- Relative paths need a base from their source. A flattened config can resolve them against the wrong directory.
- Combining consolidation with new layers can hide behavior regressions.
- A broad migration can leave shallow wrappers or more than one canonical access path.

## Settled by the model-policy steel thread

- The effective-read interface is `EffectiveProjectConfig`, exposed through `@nseng-ai/sdk/project-config` and as required `NsExtensionApi.projectConfig`.
- `get(setting)` returns typed values with absolute project-source provenance. Expected discovery, source, and setting failures are returned as a closed typed union.
- A cwd outside a Git repository returns `project-not-found`; a missing `ns.toml` in a repository is a successful absent setting.
- One capability is one invocation snapshot. It shares root discovery and source loading among reads; a later invocation creates a new capability and observes source changes.
- `[models]` is the first migrated setting family. Extension Kit owns model-policy validation and operation selection while the SDK remains model-agnostic.
- Caller/harness identity is absent from the scope under ADR 0058.

## Open Questions

- Does the current filesystem `ProjectConfigGateway` become private or receive a narrower name after the remaining readers and mutations migrate?
- Which sources can define each setting family, and does that family merge or replace values?
- What are the source-control, secret, path, mutation, and inspection rules for `ns.local.toml`?
- How do extension-provided setting schemas become available without a discovery cycle?
- Does a malformed lower-precedence source fail the read when a higher-precedence source supplies the effective value?
