# Remediation Branch 4 merge-loop observations completed

## Summary

Completed remediation Slice 13 / Branch 4. Both merge-loop result variants now carry one shared `MergeLoopObservations` snapshot; failure adds only its failure value, and success no longer wraps observations in a depth-free `value` field.

`runMergeLoop` now always prepares state through `prepareMergeLoopState`, has no merge-state injection option, iterates directly over landing-branch entries, and uses one snapshot constructor for initial snapshot failure, partial failure, and success. Canonical execution consumes observations identically before discriminating success from failure.

Descendant-maintenance aggregation is expressed by the named pure `reduceDescendantMaintenanceObservation` reducer. A later defined observation wins, while an absent next-branch observation preserves the prior observed value.

## Objective Impact

Slice 13 is complete. The Objective remains open for remediation Slice 14.

## Tests and invariants

Focused merge-loop tests cover preparation independently, exact multi-branch gateway order and one snapshot call, empty observations and no mutation after snapshot failure, partial-failure observations, later-defined observation replacement, and later-absent observation preservation.

All six permanent transcript scenario/fixture/support invariant files are byte-for-byte unchanged.

## Validation

- Focused merge-loop Vitest: 1 file, 11 tests passed.
- Full `@nseng-ai/flow` package: 78 files, 731 tests passed.
- `pnpm --dir ts run check`: passed.
- Stale sweep for optional `mergeState`, old merge-outcome field/value access, `MergeLoopValue`, and indexed landing-branch guards: empty in the merge-loop execution/test scope.
- `just`: passed (513 files / 5217 default tests, 148 TypeScript style-guard tests, plus formatting, lint, typecheck, dependency, and Objective checks).
- `ns objective check flow-land-execution-migration`: passed with 0 errors and 0 warnings.
- `git diff --check`: passed.

No commit, branch creation, push, submit, or Branch Memory mutation was performed.

## Follow-Ups

Continue only with remediation Slice 14 under its own branch contract. Slice 14 remains incomplete; this update does not claim Objective closure.
