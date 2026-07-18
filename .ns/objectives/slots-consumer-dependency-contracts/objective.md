---
edges:
  - objective: flow-slots-opt-in
    annotation: "Coordinates the cross-package Slots dependency contracts while Flow owns delivery of its focused optional-Slots migration."
---

# Slots Consumer Dependency Contracts

## Thesis

Consumers of the Slots capability need explicit dependency contracts instead of inferring
availability or identity from path shape, package resolvability, or incidental command
presence. This Objective coordinates the audited relationships across Flow, Herdr, cmux,
Pi workflows, internal tools, and portable skills: each consumer is deliberately hard-required,
optional, or delegated to a named follow-up owner, with host-appropriate presence semantics
and clear absent-capability behavior.

## Scope

- Maintain the durable accounting of every audited Slots consumer, including its package,
  command, path-inference, registration, test, and documentation surfaces.
- Coordinate `flow-slots-opt-in` as the focused delivery stream that removes Flow's hard
  package dependency, gates `autoslot`, and makes land degrade safely without Slots.
- Make Herdr's compact Slot labels optional and presence-aware while retaining current
  Slot-backed dispatch as an explicit hard requirement.
- Retain cmux's current hard Slots dispatch dependency while repairing sidebar logic that
  treats an arbitrary cwd basename as Slot identity.
- Keep smart-restack and affected portable skills explicitly Slots-required for now, with
  precise missing-capability behavior and prominent prerequisites.
- Establish focused follow-up ownership for moving generic structured Graphite topology
  away from `ns slot gt exec`; Slots retains occupancy, freeing, and Slot-aware safety.
- Use `NsExtensionApi.hasExtension("@nseng-ai/slots")` for extension presence. Pi-hosted
  Herdr receives a complete per-invocation API through explicit project-adapter composition.

## Non-Goals

- Designing or implementing pluggable Herdr or cmux dispatch; record it only as future
  direction.
- Making smart-restack Slot-neutral or weakening its cross-worktree occupancy safety.
- Redesigning affected portable skills for repositories without Slots in this Objective.
- Creating one universal capability-presence helper across ns-command and Pi hosts.
- Implementing a new Graphite-topology owner inside this coordination record unless the
  work proves small and independently coherent; otherwise a linked focused Objective owns it.
- Changing the Slots capability's own command or API behavior merely to accommodate an
  accidental consumer coupling.

## Completion Criteria

- Every audited consumer has a durable classification—hard requirement, optional enhancement,
  legitimate catalog/configuration reference, or delegated migration—with behavior and owner
  recorded in code-adjacent contracts or Objective evidence.
- Herdr goal and Objective labels require both managed-Slot path shape and available Slots
  capability before adding compact Slot prefixes; installed and absent behavior is covered.
- cmux Objective sidebar no longer presents arbitrary worktree basenames as Slot identity,
  while cmux and Herdr dispatch document their current Slots requirements and future
  pluggability direction.
- `flow-slots-opt-in` is completed or its remaining work is explicitly re-delegated with no
  ambiguity about Flow's optional runtime relationship.
- Smart-restack and every currently affected portable skill clearly declare Slots as a
  prerequisite and fail or stop with actionable missing-capability guidance.
- Generic Graphite topology migration has a precise owner and linked Objective when it remains
  larger than this record; topology-only consumers are accounted for without silently treating
  Slots as their permanent owner.
- Package manifests, registration surfaces, README/CONTEXT/AGENTS guidance, and tests agree
  with each consumer's decided relationship. Relevant targeted checks and broader repository
  validation pass for delivered changes, with commands and unrelated blockers recorded.
- The Objective closes only after each relationship is delivered directly or delegated to a
  linked focused Objective with explicit completion criteria, and the cross-consumer outcome
  is synthesized here.

## Assumptions and Risks

- **Assumption — effective registry presence is canonical for ns commands.**
  `hasExtension` and `requiresExtension` already read the effective extension registry; the
  Flow roadmap may be stale about implementation status and must be reconciled against current
  tests and documentation before tracking it complete.
- **Assumption — Pi consumers need explicit host composition.** The Pi runtime does not own
  ns registry discovery, so Pi-hosted Herdr receives a complete `NsExtensionApi` from the ns
  host through the project adapter. Consumers must not inspect private registry internals or
  infer package presence from mirrored command names.
- **Assumption — Herdr and cmux dispatch are legitimately Slot-backed today.** Their direct
  `SlotClient` dependencies are retained as explicit product contracts, not treated as optional
  injection. Future dispatch pluggability may disprove the need for those hard dependencies.
- **Risk — package resolution, extension presence, and path shape remain conflated.** A direct
  package import can resolve while `ns slot` is unavailable, and a Slot-shaped path can outlive
  the extension. Each caller must use the fact appropriate to its behavior.
- **Risk — duplicate command catalogs bypass declarative gating.** Filtering an ns descriptor
  does not automatically filter independently registered Pi mirrors such as Flow autoslot.
- **Risk — topology extraction weakens safety.** Moving generic Graphite facts away from Slots
  must not remove Slot occupancy checks from restack, freeing, or deletion workflows.
- **Risk — prerequisite comments become permanent accidental coupling.** Skills deliberately
  remain Slots-required now because portability decisions lack context; the later audit must
  distinguish topology convenience from occupancy and mutation requirements.
- **Risk — the coordination record becomes an indefinite backlog.** Closure requires either
  delivery or a concrete linked owner for every relationship, not merely an inventory entry.

## Open Questions

- Which package or capability should own the future structured Graphite topology surface, and
  what exact contract can topology-only consumers share without importing Slots semantics?
- Should the future dispatch-pluggability direction converge Herdr and cmux on one checkout
  strategy seam, or remain destination-specific?
- After affected skills carry explicit prerequisites, which should be audited first for
  Slot-neutral operation when sufficient workflow context is available?
