---
edges:
  - objective: generic-flow-extension
    annotation: "Follow-up decoupling slice: the repo-specificity audit's flagged slots assumption becomes dedicated work making flow's slots dependency opt-in, while that objective keeps the README contract and point mechanics."
  - objective: slots-consumer-dependency-contracts
    annotation: "Flow owns its focused optional-Slots migration while the coordination Objective owns cross-consumer accounting and synthesis."
---

# Flow Slots Opt-In

## Thesis

Flow's core Graphite lifecycle does not require the Slots capability, but its current package and command surfaces still do. `@nseng-ai/slots` remains a runtime dependency used directly by `autoslot`, the ns and Pi catalogs expose `autoslot` unconditionally, and land invokes `ns slot free` whenever path-based worktree facts identify a managed Slot. This Objective makes Slots an opt-in Flow enhancement: installing and enabling `@nseng-ai/slots` adds `autoslot` and managed-Slot land cleanup; without it, the rest of Flow remains coherent and operational.

The generic presence mechanism is already delivered in `@nseng-ai/sdk` and the ns host. `ExtensionCommandEntry.requiresExtension` filters command candidates by exact package identity, while `NsExtensionApi.hasExtension(packageName)` reads the same effective-catalog package-name set at command invocation. Flow now owns consuming those surfaces, severing its direct Capability API dependency, and documenting precise absent-Slots behavior.

## Scope

- Gate `autoslot` on exact effective-catalog presence of `@nseng-ai/slots` across both the ns command catalog and the Pi mirror, so absence removes the command rather than exposing a broken path.
- Replace Flow's in-process `@nseng-ai/slots/api` checkout composition by invoking `ns slot checkout --format json` through the existing injected command-exec seam for current-commit and named-branch modes, while keeping command selection, result parsing, and navigation policy in Flow domain logic.
- Remove `@nseng-ai/slots` from `ts/packages/capabilities/flow/package.json` and its generated lockfile edge after all direct imports are gone.
- Pass exact invocation-time Slots presence into land from the ns command boundary. Keep canonical managed-Slot path identity as the worktree fact, but do not treat path shape or command execution failure as capability presence.
- Define land's absent-Slots behavior for the uninstalled-after-use edge case: before merge, stale managed-Slot conflicts block with actionable manual-detach guidance; after landing, optional cleanup is reported as skipped and never changes a successful merge into a cleanup failure.
- Align fake-driven and command-surface tests, Flow's README command/requirements contract, and code-adjacent guidance with the optional dependency.

## Non-Goals

- Changing Slots commands, the Slots Capability API, Slot inventory semantics, or managed-Slot path identity.
- Building another capability-presence mechanism, an installed-extension enumeration API, a general plugin/dependency resolver, or a universal cross-host abstraction.
- Reintroducing or migrating cmux; the capability is retired and its useful destination behavior moved to resource-first Herdr.
- Making Herdr dispatch, smart-restack, portable skills, or other consumers Slot-neutral; `slots-consumer-dependency-contracts` owns their separate classifications.
- Abstracting Graphite or changing Flow's Graphite-native identity.
- Writing a general optional inter-capability convention before another consumer proves enough common behavior to justify one.

## Completion Criteria

- `ts/packages/capabilities/flow/package.json` has no `@nseng-ai/slots` dependency, and Flow production source has no direct Slots package imports.
- With Slots present in the effective catalog, ns and Pi retain `autoslot`; its successful checkout behavior uses the `ns slot checkout --format json` boundary with focused fake-driven coverage.
- Without Slots, neither the ns nor Pi Flow surface registers `autoslot`, while every other Flow command remains available.
- Land receives the exact `hasExtension("@nseng-ai/slots")` fact at invocation time. Ordinary repositories with no managed-Slot paths land unchanged; stale managed-Slot conflicts without Slots block before merge with manual-detach guidance; post-landing cleanup without Slots records an explicit skipped outcome and does not block an otherwise successful landing.
- Present, absent, stale-path, command-failure, and relevant registration behavior are covered without relying on package resolvability or a real Slot backend in default tests.
- The Flow README presents Slots as optional, explains hidden `autoslot` behavior and land degradation, and agrees with package manifests, registration code, and tests.
- The linked `slots-consumer-dependency-contracts` Objective receives enough completion evidence to synthesize Flow's delivered relationship.

## Assumptions and Risks

- **Validated mechanism — exact effective-catalog presence.** `@nseng-ai/sdk` constructs one package-name set from valid project descriptors and explicit preinstalled metadata. `requiresExtension` filters against it before candidate validation/loading, and the ns host passes it into `createNsExtensionApi`, whose `hasExtension` performs an exact, case-sensitive lookup. Package resolution, aliases, subpaths, and command probes are not presence facts.
- **Validated constraint — isolated extension install trees.** Managed npm extensions install under `.ns/managed-extensions/npm/<package>/`; one extension cannot rely on a sibling extension's dependency tree. Optional or peer dependency declarations therefore cannot preserve Flow's direct Slots import in consumer repositories. The command boundary is required.
- **Delivered decoupling — autoslot crosses the CLI boundary.** Flow no longer imports the Slots package or declares it in its manifest. Its autoslot domain logic invokes `ns slot checkout --format json` through the injected command-exec seam, preserves structured failures, and consumes Slots-owned structured parent-shell navigation evidence.
- **De-risked — ns and Pi surfaces agree.** The ns entry uses `requiresExtension: "@nseng-ai/slots"`, while the Pi mirror resolves the same exact package identity from the startup catalog and omits only autoslot when absent. Present/absent registration coverage protects both surfaces.
- **Risk — path identity and capability presence become conflated.** A canonical Slot path can remain after Slots is removed. Land must use path shape only to identify managed-Slot worktrees and the catalog boolean only to decide whether Slot operations are available.
- **Risk — degraded mode is mistaken for silent data loss.** Pre-merge cleanup cannot be silently skipped when stale worktrees conflict with branches about to land. It must stop before mutation with manual recovery guidance; only post-landing cleanup may degrade to a visible skipped outcome.
- **Resolved contract — CLI-boundary side effects.** Flow owns two-mode current and named-branch checkout policy above its existing command-exec seam. Autoslot builds and invokes the Slots JSON command with clipboard copying disabled and validates the result envelope. Slots remains the sole owner of the established parent-shell cd directive; its JSON result reports inactive, written, or failed navigation, and Flow turns a write failure into a non-fatal autoslot warning. The flat directive fields now encode only legal status-specific combinations in Slots, and Flow independently rejects malformed combinations at its external command boundary instead of inventing fallback warning evidence. Valid Slots failures preserve their `errorType` and message; execution and malformed-protocol failures use explicit Flow-owned typed errors rather than throwing through autoslot presentation. No high-level checkout Gateway substitutes for this Flow-owned logic.
- **Resolved contract — Pi registration timing.** The Pi mirror resolves exact Slots presence once from the startup repository's effective catalog and omits only `/ns:flow:autoslot` when absent. Command registration remains static for the Pi session; changing repositories requires rebuilding the session command surface rather than adding dynamic registration infrastructure.

## Open Questions

No design question currently blocks implementation. Exact package identity, hidden absent-`autoslot` UX, command-boundary severing, and pre-/post-landing degradation were decided in `updates/2026-07-12T182349Z-design-decisions-frontloaded.md`; this refresh corrects their implementation location and current delivery status.
