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
- Retain Slot-backed Herdr dispatch as an explicit hard requirement.
- Record the former cmux relationship as satisfied by the proved capability retirement and resource-first Herdr migration; do not recreate cmux code or terminology in live contracts.
- Keep smart-restack and affected portable skills explicitly Slots-required for now, with precise missing-capability behavior and prominent prerequisites.
- Make the accidental placement of generic Graphite topology and Git recovery helpers under `ns slot gt exec` explicit without requiring a command migration now; Slots retains occupancy, freeing, and Slot-aware safety.
- Use the effective ns command catalog's exact package identities as the canonical capability-presence fact for generic `requiresExtension` and `hasExtension(packageName)` behavior.

## Non-Goals

- Designing or implementing pluggable Herdr dispatch; record it only as future direction.
- Reintroducing cmux or making plans against deleted cmux package, adapter, sidebar, or dispatch surfaces.
- Making smart-restack Slot-neutral or weakening its cross-worktree occupancy safety.
- Redesigning affected portable skills for repositories without Slots in this Objective.
- Moving or aliasing the generic Graphite/Git helpers solely to correct their current command path; revisit ownership only when concrete consumer work justifies migration.
- Changing the Slots capability's own command or Capability API behavior merely to accommodate an accidental consumer coupling.

## Completion Criteria

- Every audited consumer has a durable classification—hard requirement, optional enhancement, legitimate catalog/configuration reference, completed retired relationship, or delegated migration—with behavior and owner recorded in code-adjacent contracts or Objective evidence.
- Herdr dispatch remains explicitly Slots-required.
- The former cmux relationship remains retired and accounted for through source/history evidence rather than new implementation work.
- `flow-slots-opt-in` is completed or its remaining work is explicitly re-delegated with no ambiguity about Flow's optional runtime relationship.
- Smart-restack and every currently affected portable skill clearly declare Slots as a prerequisite and fail or stop with actionable missing-capability guidance.
- Generic Graphite topology and Git recovery helpers are documented as compatibility placements rather than Slot semantics; topology-only consumers are accounted for without requiring a speculative migration owner.
- Package manifests, registration surfaces, README/CONTEXT/AGENTS guidance, and tests agree with each consumer's decided relationship. Relevant targeted checks and broader repository validation pass for delivered changes, with commands and unrelated blockers recorded.
- The Objective closes only after each relationship is delivered directly or delegated to a linked focused Objective with explicit completion criteria, and the cross-consumer outcome is synthesized here.

## Assumptions and Risks

- **Assumption — effective catalog presence is canonical for ns commands.** `hasExtension` and `requiresExtension` read exact package identities from the effective ns command catalog. The linked Flow roadmap contains historical `kernel` wording and stale implementation status that must be reconciled against current SDK source, tests, and documentation before tracking it complete.
- **Assumption — Herdr dispatch is legitimately Slot-backed today.** Dispatch is experimental and may be parked entirely rather than decoupled; while it exists, its Slot backing is a deliberate hard requirement, not accidental coupling or optional injection.
- **Assumption — smart-restack's Slots coupling is acceptable because the surface is internal-only.** `/code:gt-restack-resolve` lives in `@internal/pi-tools`; there is no external adopter to decouple for. If the command or its portable skill is ever promoted to an external surface, the hard requirement must be re-decided, not inherited.
- **Validated relationship — cmux is retired.** Current source and the `retire-cmux-herdr-handoff-namespace` record prove that the standalone cmux capability and adapter were removed and useful behavior migrated to the eleven-command resource-first Herdr catalog.
- **Risk — package resolution, extension presence, and path identity remain conflated.** A direct package import can resolve while the Slots extension is absent, and a Slot-shaped path can outlive the extension. Each caller must use the fact appropriate to its behavior.
- **Risk — duplicate complete API construction drifts.** CLI and non-CLI hosts must share one SDK-owned constructor rather than maintaining parallel `NsExtensionApi` object literals.
- **Risk — topology extraction weakens safety.** Moving generic Graphite facts away from Slots must not remove Slot occupancy checks from restack, freeing, or deletion workflows.
- **Accepted risk — compatibility placement may persist.** Skills remain operationally Slots-required while `stack-branches`, `descendants-report`, and `backup-refs` live under `ns slot gt exec`, but code-adjacent contracts state that these helpers do not use Slot semantics. Revisit command ownership only when concrete migration demand outweighs compatibility churn.
- **Risk — the coordination record becomes an indefinite backlog.** Closure requires either delivery or a concrete linked owner for every relationship, not merely an inventory entry.

## Open Questions

- Should future Herdr dispatch pluggability use a destination-specific checkout strategy seam or participate in a broader checkout composition contract?
- After affected skills carry explicit prerequisites, which should be audited first for Slot-neutral operation when sufficient workflow context is available?
