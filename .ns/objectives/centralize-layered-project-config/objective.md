# Centralize Layered Project Configuration

## Thesis

Give ns one deep, typed project-config API. A caller supplies its invocation scope: `cwd`, environment, and active harness. The API discovers the project root, reads the applicable sources, applies source and setting-family rules, and returns effective typed values with provenance.

Production consumers must use this API instead of discovering roots, locating or reading `ns.toml`, constructing Node config adapters, or applying precedence. First consolidate the current project-only behavior without changing it. Activate `ns.local.toml` or user settings only after a new ADR refines ADR 0056 and defines their authority, provenance, and setting-family rules.

The current implementation does not provide this boundary. `ts/packages/public/sdk/src/project-config/points.ts` combines the low-level `ProjectConfigGateway`, its Node adapter, parsing, typed settings, and point-catalog behavior. Callers must supply repository roots and relative paths. Other production consumers read `ns.toml` directly, probe Git only to find config, or treat `cwd` as the project root.

## Scope

- Define separate contracts for effective config reads and source-specific mutation.
- Make project-root and config-root discovery part of effective config reads.
- Preserve `SettingsSchema`, shared parsing, point behavior, and source-aware diagnostics where they fit the new boundary.
- Create one invocation-scoped config capability or snapshot for ns CLI and Pi composition roots to reuse.
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

## Open Questions

- What is the public name of the effective-read interface, and does the current filesystem `ProjectConfigGateway` become private or receive a narrower name?
- How does project-root discovery behave outside a Git repository?
- How long does an invocation snapshot remain valid in a long-lived Pi session, and what invalidates it?
- Which sources can define each setting family, and does that family merge or replace values?
- Does the active harness gate user model settings or only user extension contributions?
- What are the source-control, secret, path, mutation, and inspection rules for `ns.local.toml`?
- How do extension-provided setting schemas become available without a discovery cycle?
- Does a malformed lower-precedence source fail the read when a higher-precedence source supplies the effective value?
