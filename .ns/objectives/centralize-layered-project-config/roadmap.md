# Roadmap

## Work

- [ ] Inventory and contracts — account for every production config reader and mutator. Define invocation scope, effective reads, and source-specific mutation.
- [x] Project-only API — implemented current `ns.toml` behavior behind `EffectiveProjectConfig.get(setting)`, including nested-`cwd` discovery, typed failures, and project-source provenance.
- [x] Composition roots — ns CLI preparation creates one capability from final invocation facts; long-lived Pi registrations retain factories that create a fresh capability for each command callback.
- [ ] Catalogs — move command-source inventory, extension descriptors, point definitions, and point installations to the shared invocation scope.
- [ ] Typed settings — the `[models]` steel thread is complete across Flow, Handoffs, Reviews, Branch Context, Herdr, Context Profiler, Stack View, and Thermo Council. Continue with Reviews diff settings, Slots, and the remaining setting families. Preserve behavior with tests for each family. Finish each slice with bounded searches for direct `ns.toml` access, `createNodeProjectConfigGateway`, config-only root probes, and old-interface imports.
- [ ] Source mutation — centralize source-targeted edits. Preserve byte fidelity, stale-state checks, scope authority, path containment, and safe writes.
- [ ] Enforcement and documentation — add an architecture guard, update SDK and context vocabulary, and document config inspection and provenance.
- [ ] Layering ADR — refine ADR 0056 without reviving the caller-identity gate superseded by ADR 0058. Decide source precedence and authority, path and security rules, diagnostics, provenance, and setting-family merge ownership.
- [ ] Local config — implement `ns.local.toml` only as the accepted ADR specifies. Include inspection and mutation behavior.
- [ ] User settings — activate only the setting families that the ADR approves. Keep hooks and prompt installations dormant unless the ADR authorizes them.

## Parked

- User hook and prompt-installation layers without separate approval.
- Remote or organization-managed policy layers.
- Config files outside ns configuration.
- Performance caching without evidence that it is necessary.
