# Roadmap

## Work

- [ ] Establish the durable consumer accounting and reconcile current state: for each package, Pi workflow, internal tool, skill, test, and documentation surface, record its current behavior, decided dependency contract, presence or identity signal, and delivery owner.
  - Revalidate the implemented SDK `hasExtension` / `requiresExtension` seam and reconcile historical `kernel` wording and stale status in `flow-slots-opt-in` against current ns SDK/host source.
  - Record the former cmux relationship as completed by the proved package retirement and migration to resource-first Herdr; do not create work against deleted surfaces.
- [ ] Complete or explicitly re-delegate the linked `flow-slots-opt-in` work: remove Flow's hard package/API coupling, gate autoslot across ns and Pi registration surfaces, and make land's pre-merge and post-landing behavior explicit when Slots is absent.
- [x] Make current hard workflow dependencies legible: smart-restack refuses precisely when its Slot-aware safety preflight is unavailable, and every affected portable skill declares the Slots prerequisite prominently near its entry contract.
  - The refusal names `@nseng-ai/slots`, requires installation and enablement before retry, preserves the command diagnostic, and starts neither `gt restack` nor the resolver.
  - Preserve the later audit question; the contracts describe current command availability without claiming each skill's dependency is permanent.
- [x] Record generic Graphite/Git helpers as compatibility placements rather than Slot semantics, without creating speculative migration work.
  - `stack-branches` is generic Graphite topology, `descendants-report` is cross-domain branch reporting, and `backup-refs` is Git recovery mechanics for Graphite workflows; code-adjacent comments now prevent their `ns slot gt exec` path from implying permanent Slots ownership.
  - Keep the current command contracts until concrete consumer demand justifies migration. Slot placement, assignment, occupancy, freeing, and Slot-aware safety operations remain Slots-owned.
- [ ] Synthesize delivered and delegated outcomes, verify package and user-facing contracts agree, and close only when no audited relationship lacks either implementation evidence or a linked focused Objective with explicit completion criteria.

## Parked

- Herdr pluggable dispatch design and non-Slots checkout strategies.
- A portability audit of currently Slots-required skills if concrete non-Slots consumer demand emerges; current command-path compatibility alone does not justify migration.
- A generic Git-worktree occupancy service that could eventually replace Slots in smart-restack; current smart-restack safety remains Slots-required.
