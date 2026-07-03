# Planned-Branch Adapter Boundary

## Summary

- Decided that `planned-branch-layer-deepening` owns planned-branch domain policy: saved plans, planned branches, attached plans, and the `brmem-plans` namespace/key contract.
- Kept Candidate 4 in this Objective as the home for any future generic Branch Memory CLI Adapter, limited to shared CLI discovery/execution plumbing rather than planned-branch workflow policy.
- Clarified that a future Adapter migration must preserve caller policy differences: planned-branch paths need fatal diagnostics and planning-level presentation, while status surfaces may degrade nonfatally.
- Verification: `just dprint-check` passed. Evidence: explicit user decision plus local planned-branch branch evidence against Graphite parent `brmem-plans/impl-planned-branch-reader`; PR evidence was not required.

## Objective Impact

- Candidate 4 is now in progress with its ownership boundary decided, but it is not implemented or closed.
- The broader candidate remains useful for `worktree-status` and future Branch Memory-using Pi extensions, while avoiding duplicate ownership with the planned-branch Objective.
- The Objective remains open because Candidate 4 still needs an implementation/parking/rejection disposition and other candidates still need triage.

## Follow-Ups

- When Candidate 4 is implemented or parked, update this Objective with the concrete disposition and validation evidence.
- Preserve planned-branch behavior if shared CLI plumbing is later extracted from the planned-branch helpers.
