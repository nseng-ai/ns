# Roadmap

## Work

- [ ] Inventory and contracts — account for every production config reader and mutator. Define invocation scope, effective reads, and source-specific mutation.
- [ ] Project-only API — implement current `ns.toml` behavior behind the effective-read interface. Include nested-`cwd` root discovery and source-labelled diagnostics.
- [ ] Composition roots — create and reuse one config capability or snapshot during ns CLI preparation and Pi-hosted command execution.
- [ ] Catalogs — move command-source inventory, extension descriptors, point definitions, and point installations to the shared invocation scope.
- [ ] Typed settings — migrate model policy, Reviews, Slots, harness settings, and the remaining config consumers by setting family. Preserve behavior with tests for each family. Use `refactor-swarm` for a mixed semantic migration of at least five call sites. Use an existing TypeScript codemod only for a purely syntactic slice. Finish with bounded searches for direct `ns.toml` access, `nodeProjectConfigGateway`, config-only `repoRoot` probes, and old-interface imports.
- [ ] Source mutation — centralize source-targeted edits. Preserve byte fidelity, stale-state checks, scope authority, path containment, and safe writes.
- [ ] Enforcement and documentation — add an architecture guard, update SDK and context vocabulary, and document config inspection and provenance.
- [ ] Layering ADR — refine ADR 0056. Decide source precedence and authority, active-harness effects, path and security rules, diagnostics, provenance, and setting-family merge ownership.
- [ ] Local config — implement `ns.local.toml` only as the accepted ADR specifies. Include inspection and mutation behavior.
- [ ] User settings — activate only the setting families that the ADR approves. Keep hooks and prompt installations dormant unless the ADR authorizes them.

## Parked

- User hook and prompt-installation layers without separate approval.
- Remote or organization-managed policy layers.
- Config files outside ns configuration.
- Performance caching without evidence that it is necessary.
