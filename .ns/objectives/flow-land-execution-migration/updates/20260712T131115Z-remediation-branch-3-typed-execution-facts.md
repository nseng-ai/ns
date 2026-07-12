# Remediation Branch 3 typed execution facts completed

## Summary

Completed remediation Slice 12 / Branch 3. Failed canonical landing results now carry a required `failedPhase`, set only by the central failure-result constructor. The matching failed phase audit entry is derived from that same typed value.

Flow's post-cleanup partial-success route now uses typed execution facts: the failed phase, non-empty landed results, and a declined or failed post-landing cleanup outcome. It no longer scans phase names or ordering, and retains the existing success-summary-before-cleanup-failure presentation order.

Phase records are observational only. Prepared execution records repository discovery as skipped with the exact reason `shape supplied by caller`, while discovered execution records completion only after the repository shape loader succeeds. In both cases a completed `stack-shape` entry means execution observed a usable shape. Submit preparation completion is tracked from work that actually ran rather than by reinspecting the original plan. The identity-only pre-merge Graphite failure helper was inlined at both call sites.

## Objective Impact

Slice 12 is complete. The Objective remains open for remediation Slices 13–14.

## Tests and invariants

Focused tests cover exact `failedPhase` values for request validation, confirmation, submit preparation, merge, and post-landing cleanup; failure-phase audit derivation; prepared versus discovered source records and gateway calls; submit-preparation presence and absence based on observed work; typed post-cleanup partial-success routing with an empty phase list; and success output before cleanup failure.

All six permanent transcript scenario/fixture/support invariant files are byte-for-byte unchanged.

## Validation

- Focused execute, completion-presentation, and permanent transcript scenario Vitest tests: 3 files, 93 tests passed.
- Full `@nseng-ai/flow` package: 78 files, 728 tests passed.
- `pnpm --dir ts run check`: passed.
- `just ts-lint`: passed.
- Stale source sweep for `didLandBeforePostLandingCleanupFailure`, `preMergeGraphiteFailure`, and `phases.some/find/filter`: empty.
- `just`: passed (513 files / 5214 default tests, 148 TypeScript style-guard tests, plus formatting, lint, typecheck, dependency, and Objective checks).
- `ns objective check flow-land-execution-migration`: passed with 0 errors and 0 warnings.
- `git diff --check`: passed.

No commit, branch creation, push, submit, or Branch Memory mutation was performed.

## Follow-Ups

Continue only with remediation Slice 13 under its own branch contract. Slices 13–14 remain incomplete; this update does not claim Objective closure.
