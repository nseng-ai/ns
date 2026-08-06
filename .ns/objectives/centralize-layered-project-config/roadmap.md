# Roadmap

## Work

- [ ] Inventory and contract decision — complete the production-reader/mutator inventory; define effective-read versus source-mutation interfaces and invocation scope.
- [ ] Behavior-preserving deep gateway — implement single-project-`ns.toml` behavior behind the new external interface, including nested-cwd root discovery and source-labelled diagnostics.
- [ ] Composition-root adoption — have ns CLI preparation and Pi-hosted workflows receive/reuse the project config capability/snapshot instead of constructing adapters inside workflows.
- [ ] Catalog convergence — make command-source inventory, extension descriptors, point definitions, and installations use the coherent config scope.
- [ ] Typed-setting migration — migrate model policy, Reviews, Slots, harness settings, and remaining consumers; remove direct reads and config-only Git root probes.
      Execution strategy: use deterministic TypeScript AST/codemod tooling only where a slice is purely syntactic and a suitable repository tool exists; use `refactor-swarm` for the 5+ mixed semantic call-site migration; migrate by consumer family with behavior-preserving tests, not one unreviewable repository-wide replacement; finish with bounded greps for direct `ns.toml` access, `nodeProjectConfigGateway`, config-only `repoRoot` probes, and stale old-interface imports.
- [ ] Mutation separation — centralize source-targeted edits while preserving byte fidelity, stale-state checks, scope authority, and safe writes.
- [ ] Enforcement and documentation — add a style/architecture guard, stale-access grep, SDK/context vocabulary updates, and user-facing inspection/provenance docs.
- [ ] Layering ADR — decide precedence, allowed sources, active-harness effects, paths/security, diagnostics, provenance, and per-setting merge ownership; explicitly refine ADR 0056.
- [ ] Local layer — implement `ns.local.toml` only under the accepted ADR, with inspection and mutation behavior.
- [ ] Approved user settings — activate only ADR-approved setting families; keep hooks/prompts dormant unless explicitly authorized.

## Parked

- User hook and prompt installation layers unless separately approved.
- Remote/organization-managed policy layers.
- Arbitrary config-file support outside ns configuration.
- Performance caching beyond evidence-backed need.
