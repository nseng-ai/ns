# Overlap Boundary Decided

## Summary

- Decided the overlap with `pi-extension-deepening` by layer ownership rather than by extracting more code in this Objective.
- `planned-branch-layer-deepening` owns planned-branch domain policy: saved plans, planned branches, attached plans, the `brmem-plans` namespace/key contract, and the focused read/write seams used by `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch`.
- `pi-extension-deepening` owns any future generic Branch Memory CLI Adapter for shared discovery/execution plumbing across `worktree-status` or future Branch Memory-using Pi extensions.
- Verification: `just dprint-check` passed. Evidence: local committed planned-branch branch diff against Graphite parent `brmem-plans/impl-planned-branch-reader`; PR evidence was not required because local branch evidence and explicit user decision were sufficient.

## Objective Impact

- The overlap-resolution roadmap item is complete: planned-branch closure no longer waits on generic Branch Memory Adapter extraction.
- The Objective still allows a future Adapter migration, but only for plumbing that preserves planned-branch caller policy, fatal diagnostics, planning-level presentation, and read/write tests.
- The Objective remains open for final module/type naming review and explicit human closure.

## Follow-Ups

- Decide whether remaining module/type names should move further away from `brmem` vocabulary before requesting closure.
- If `pi-extension-deepening` later implements Candidate 4, migrate only shared CLI discovery/execution plumbing that passes the deletion test and preserves planned-branch behavior.
