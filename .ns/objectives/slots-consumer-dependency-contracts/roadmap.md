# Roadmap

## Work

- [ ] Establish the durable consumer accounting and reconcile current state: for each package, Pi workflow, internal tool, skill, test, and documentation surface, record its current behavior, decided dependency contract, presence or identity signal, and delivery owner.
  - Revalidate the implemented SDK `hasExtension` / `requiresExtension` seam and reconcile historical `kernel` wording and stale status in `flow-slots-opt-in` against current ns SDK/host source.
  - Record the former cmux relationship as completed by the proved package retirement and migration to resource-first Herdr; do not create work against deleted surfaces.
- [x] Correct optional Herdr label enrichment: require every Pi host to supply a complete ns extension API factory, resolve exact Slots presence once at each relevant command boundary before entering core, require both effective presence and managed-Slot path identity for prefixes, and align tests plus README/CONTEXT/AGENTS contracts.
  - Apply the rule to `/ns:herdr:space:goal`, `/ns:herdr:tab:goal`, and `/ns:herdr:space:objective-summary`; factory/configuration/programming failures propagate before core operation or rename, while extension absence is normal and unprefixed.
  - Retain Herdr dispatch as explicitly Slots-required and record pluggable dispatch only as future direction.
- [ ] Complete or explicitly re-delegate the linked `flow-slots-opt-in` work: remove Flow's hard package/API coupling, gate autoslot across ns and Pi registration surfaces, and make land's pre-merge and post-landing behavior explicit when Slots is absent.
- [ ] Make current hard workflow dependencies legible: smart-restack must refuse precisely when its Slot-aware safety preflight is unavailable, and every affected portable skill must declare the Slots prerequisite prominently near its entry contract.
  - Preserve the later audit question; do not claim each skill's dependency is permanent.
- [ ] Give generic structured Graphite topology a focused delivery owner: define the boundary between topology facts and Slot occupancy/mutation, then create and link a separate Objective if migration is not a small coherent slice of this work.
  - Audit note: `stack-branches` is generic Graphite topology, `descendants-report` is cross-domain branch reporting, and `backup-refs` is generic Git safety mechanics; their current placement under `ns slot gt exec` is accidental rather than evidence of permanent Slots ownership.
  - Keep Slot placement, assignment, occupancy, freeing, and Slot-aware safety operations with Slots. Do not design or extract a replacement owner in this coordination slice; preserve the current command contracts until focused follow-up ownership is chosen.
- [ ] Synthesize delivered and delegated outcomes, verify package and user-facing contracts agree, and close only when no audited relationship lacks either implementation evidence or a linked focused Objective with explicit completion criteria.

## Parked

- Herdr pluggable dispatch design and non-Slots checkout strategies.
- A portability audit of currently Slots-required skills after their prerequisites are explicit and enough workflow context exists to classify them safely.
- A generic Git-worktree occupancy service that could eventually replace Slots in smart-restack; current smart-restack safety remains Slots-required.
- A universal cross-host capability-presence abstraction; the current design requires a complete ns extension API factory from each Herdr Pi host and resolves the required boolean at the relevant command boundary.
