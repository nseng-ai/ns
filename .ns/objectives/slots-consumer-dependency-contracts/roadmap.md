# Roadmap

## Work

- [ ] Establish the durable consumer accounting and reconcile current state: for each package, Pi workflow, internal tool, skill, test, and documentation surface, record its current behavior, decided dependency contract, presence or identity signal, and delivery owner.
  - Revalidate the implemented SDK `hasExtension` / `requiresExtension` seam and reconcile historical `kernel` wording and stale status in `flow-slots-opt-in` against current ns SDK/host source.
  - Record the former cmux relationship as completed by the proved package retirement and migration to resource-first Herdr; do not create work against deleted surfaces.
- [ ] Correct optional Herdr label enrichment: compose Pi-hosted Herdr with the host's complete ns extension API, narrow it to one Herdr-owned capability predicate, require both effective Slots presence and managed-Slot path identity, and align tests plus README/CONTEXT/AGENTS contracts.
  - Apply the rule to `/ns:herdr:space:goal`, `/ns:herdr:tab:goal`, and `/ns:herdr:space:objective-summary`.
  - Retain Herdr dispatch as explicitly Slots-required and record pluggable dispatch only as future direction.
- [ ] Complete or explicitly re-delegate the linked `flow-slots-opt-in` work: remove Flow's hard package/API coupling, gate autoslot across ns and Pi registration surfaces, and make land's pre-merge and post-landing behavior explicit when Slots is absent.
- [ ] Make current hard workflow dependencies legible: smart-restack must refuse precisely when its Slot-aware safety preflight is unavailable, and every affected portable skill must declare the Slots prerequisite prominently near its entry contract.
  - Preserve the later audit question; do not claim each skill's dependency is permanent.
- [ ] Give generic structured Graphite topology a focused delivery owner: define the boundary between topology facts and Slot occupancy/mutation, then create and link a separate Objective if migration is not a small coherent slice of this work.
- [ ] Synthesize delivered and delegated outcomes, verify package and user-facing contracts agree, and close only when no audited relationship lacks either implementation evidence or a linked focused Objective with explicit completion criteria.

## Parked

- Herdr pluggable dispatch design and non-Slots checkout strategies.
- A portability audit of currently Slots-required skills after their prerequisites are explicit and enough workflow context exists to classify them safely.
- A generic Git-worktree occupancy service that could eventually replace Slots in smart-restack; current smart-restack safety remains Slots-required.
- A universal cross-host capability-presence abstraction; the current design composes the complete ns extension API at the Pi/project edge and narrows it inside Herdr.
