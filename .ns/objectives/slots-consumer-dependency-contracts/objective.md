---
edges:
  - objective: flow-slots-opt-in
    annotation: "Coordinates cross-consumer Slots dependency accounting while Flow owns delivery of its focused optional-Slots migration."
---

# Slots Consumer Dependency Contracts

## Thesis

Consumers of the Slots capability need explicit dependency contracts instead of inferring availability or identity from path shape, package resolvability, or incidental command presence. This Objective coordinates the audited relationships across Flow, resource-first Herdr, Pi workflows, internal tools, and portable skills: each consumer is deliberately hard-required, optional, a legitimate catalog/configuration reference, or delegated to a named follow-up owner, with host-appropriate presence semantics and clear absent-capability behavior.

The former cmux capability has been retired. Its useful destination behavior migrated to the resource-first Herdr capability, so this record accounts for that completed relationship without planning work against deleted cmux surfaces.

## Scope

- Maintain durable accounting of every audited Slots consumer, including its package, command, path-identity, registration, test, and documentation surfaces.
- Coordinate `flow-slots-opt-in` as the focused delivery stream that removes Flow's hard package dependency, gates `autoslot`, and makes land degrade safely without Slots.
- Make optional compact labels in all current Herdr label surfaces require both canonical managed-Slot path identity and `NsExtensionApi.hasExtension("@nseng-ai/slots")`, while retaining Slot-backed Herdr dispatch as an explicit hard requirement.
- Record the former cmux relationship as satisfied by the proved capability retirement and resource-first Herdr migration; do not recreate cmux code or terminology in live contracts.
- Keep smart-restack and affected portable skills explicitly Slots-required for now, with precise missing-capability behavior and prominent prerequisites.
- Establish focused follow-up ownership for moving generic structured Graphite topology away from `ns slot gt exec`; Slots retains occupancy, freeing, and Slot-aware safety.
- Use the effective ns command catalog's exact package identities as the canonical capability-presence fact. Pi-hosted Herdr composes the host's complete ns extension API and narrows it to a Herdr-owned predicate rather than probing a command surface.

## Non-Goals

- Designing or implementing pluggable Herdr dispatch; record it only as future direction.
- Reintroducing cmux or making plans against deleted cmux package, adapter, sidebar, or dispatch surfaces.
- Making smart-restack Slot-neutral or weakening its cross-worktree occupancy safety.
- Redesigning affected portable skills for repositories without Slots in this Objective.
- Creating a universal cross-host capability-presence abstraction: this work composes the complete ns extension API at the Pi/project adapter edge and exposes only a narrow Herdr-owned predicate to core.
- Implementing a new Graphite-topology owner inside this coordination record unless the work proves small and independently coherent; otherwise a linked focused Objective owns it.
- Changing the Slots capability's own command or Capability API behavior merely to accommodate an accidental consumer coupling.

## Completion Criteria

- Every audited consumer has a durable classification—hard requirement, optional enhancement, legitimate catalog/configuration reference, completed retired relationship, or delegated migration—with behavior and owner recorded in code-adjacent contracts or Objective evidence.
- Herdr space-goal, tab-goal, and Objective space-summary labels require both managed-Slot path identity and effective Slots extension presence before adding compact Slot prefixes; present, absent, ordinary-cwd, and construction-failure behavior is covered.
- Herdr dispatch remains explicitly Slots-required, while optional label enrichment remains successful and unprefixed when Slots is absent or complete ns extension API construction fails.
- The former cmux relationship remains retired and accounted for through source/history evidence rather than new implementation work.
- `flow-slots-opt-in` is completed or its remaining work is explicitly re-delegated with no ambiguity about Flow's optional runtime relationship.
- Smart-restack and every currently affected portable skill clearly declare Slots as a prerequisite and fail or stop with actionable missing-capability guidance.
- Generic Graphite topology migration has a precise owner and linked Objective when it remains larger than this record; topology-only consumers are accounted for without silently treating Slots as their permanent owner.
- Package manifests, registration surfaces, README/CONTEXT/AGENTS guidance, and tests agree with each consumer's decided relationship. Relevant targeted checks and broader repository validation pass for delivered changes, with commands and unrelated blockers recorded.
- The Objective closes only after each relationship is delivered directly or delegated to a linked focused Objective with explicit completion criteria, and the cross-consumer outcome is synthesized here.

## Assumptions and Risks

- **Assumption — effective catalog presence is canonical for ns commands.** `hasExtension` and `requiresExtension` read exact package identities from the effective ns command catalog. The linked Flow roadmap contains historical `kernel` wording and stale implementation status that must be reconciled against current SDK source, tests, and documentation before tracking it complete.
- **Assumption — complete ns extension API composition can serve Pi-hosted Herdr.** The ns host can construct the same complete API shape used by CLI execution from the effective project and preinstalled catalog. The project-local Pi adapter owns composition; Herdr core receives only its narrow capability-presence predicate.
- **Assumption — Herdr dispatch is legitimately Slot-backed today.** Dispatch is experimental and may be parked entirely rather than decoupled; while it exists, its Slot backing is a deliberate hard requirement, not accidental coupling or optional injection.
- **Assumption — smart-restack's Slots coupling is acceptable because the surface is internal-only.** `/code:gt-restack-resolve` lives in `@internal/pi-tools`; there is no external adopter to decouple for. If the command or its portable skill is ever promoted to an external surface, the hard requirement must be re-decided, not inherited.
- **Validated relationship — cmux is retired.** Current source and the `retire-cmux-herdr-handoff-namespace` record prove that the standalone cmux capability and adapter were removed and useful behavior migrated to the eleven-command resource-first Herdr catalog.
- **Risk — package resolution, extension presence, and path identity remain conflated.** A direct package import can resolve while the Slots extension is absent, and a Slot-shaped path can outlive the extension. Each caller must use the fact appropriate to its behavior.
- **Risk — duplicate complete API construction drifts.** CLI and non-CLI hosts must share one SDK-owned constructor rather than maintaining parallel `NsExtensionApi` object literals.
- **Risk — wrong Herdr API lifetime or cwd.** Registration-time or cross-invocation caching would make presence checks stale. Construct lazily per relevant command invocation from that handler's exact cwd.
- **Risk — topology extraction weakens safety.** Moving generic Graphite facts away from Slots must not remove Slot occupancy checks from restack, freeing, or deletion workflows.
- **Risk — prerequisite comments become permanent accidental coupling.** Skills deliberately remain Slots-required now because portability decisions lack context; the later audit must distinguish topology convenience from occupancy and mutation requirements.
- **Risk — the coordination record becomes an indefinite backlog.** Closure requires either delivery or a concrete linked owner for every relationship, not merely an inventory entry.

## Open Questions

- Which package or capability should own the future structured Graphite topology surface, and what exact contract can topology-only consumers share without importing Slots semantics?
- Should future Herdr dispatch pluggability use a destination-specific checkout strategy seam or participate in a broader checkout composition contract?
- After affected skills carry explicit prerequisites, which should be audited first for Slot-neutral operation when sufficient workflow context is available?
