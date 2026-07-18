# Roadmap

## Work

- [ ] Establish the durable consumer accounting and reconcile current state: for each package,
      Pi workflow, internal tool, skill, test, and documentation surface, record its current
      behavior, decided dependency contract, presence or identity signal, and delivery owner.
  - Revalidate the implemented SDK `hasExtension` / `requiresExtension` seam and the stale
    status of the corresponding `flow-slots-opt-in` roadmap row.
- [ ] Correct optional Herdr label enrichment: give goal and Objective labels one narrowly
      Herdr-owned, injectable Pi capability predicate, require both availability and managed-Slot
      path shape, and align tests plus `AGENTS.md` / `CONTEXT.md` contracts.
  - Retain Herdr dispatch as explicitly Slots-required and record pluggable dispatch only as
    future direction.
- [ ] Repair cmux Slot identity presentation without weakening its current dispatch contract:
      replace basename-only sidebar inference with verified identity, cover ordinary worktrees,
      and document hard Slots-backed dispatch plus future pluggability direction.
- [ ] Complete or explicitly re-delegate the linked `flow-slots-opt-in` work: remove Flow's hard
      package/API coupling, gate autoslot across ns and Pi registration surfaces, and make land's
      pre-merge and post-landing behavior explicit when Slots is absent.
- [ ] Make current hard workflow dependencies legible: smart-restack must refuse precisely when
      its Slot-aware safety preflight is unavailable, and every affected portable skill must
      declare the Slots prerequisite prominently near its entry contract.
  - Preserve the later audit question; do not claim each skill's dependency is permanent.
- [ ] Give generic structured Graphite topology a focused delivery owner: define the boundary
      between topology facts and Slot occupancy/mutation, then create and link a separate
      Objective if migration is not a small coherent slice of this work.
- [ ] Synthesize delivered and delegated outcomes, verify package and user-facing contracts
      agree, and close only when no audited relationship lacks either implementation evidence or
      a linked focused Objective with explicit completion criteria.

## Parked

- Herdr and cmux pluggable dispatch design and non-Slots checkout strategies.
- A portability audit of currently Slots-required skills after their prerequisites are explicit
  and enough workflow context exists to classify them safely.
- A generic Git-worktree occupancy service that could eventually replace Slots in smart-restack;
  current smart-restack safety remains Slots-required.
- A universal cross-host capability-presence abstraction; ns and Pi retain host-specific seams.
