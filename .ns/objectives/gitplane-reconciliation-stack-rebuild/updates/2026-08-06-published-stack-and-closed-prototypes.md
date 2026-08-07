# Replacement stack published and prototype PRs closed

## Summary

The five-boundary replacement is published as open non-draft PRs #4132–#4136. GitHub base/head evidence confirms the intended chain from the contract replacement through snapshot planner, durable generation engine, CLI, and architecture accounting. Prototype PR #4076 and superseded single-commit PR #4130 are closed unmerged, so neither remains a landing candidate.

The implementation contract was reverified at the then-published accounting commit `2437a980eefabcea74fe644e2e8b26e7ea0a5a61`: source and focused tests support complete history-independent snapshots, the pure internal planner, generation-aware Reconciliation Plan and Pending Plan semantics, Resulting Cursor CAS, retry-safe ordered application of Planned Artifact Materializations through Prepared Artifact Materializations, fault convergence, and real Git/SQLite target-shape coverage. That commit and the former implementation anchor `b14adbca82c92ce4fba430e5bae31d2b1312c27b` are publication provenance, not current local stack tips after the rebase. The current rebased implementation anchor used by `architecture-accounting.md` is `e7fdc08304e956200c29e1662aaa818e55c2aaec`.

## Objective Impact

Publication, remote topology verification, and both reference-PR dispositions are complete, correcting the record's prior claim that all external actions were pending. External closure is now active rather than wholly pending. The Objective remains open because required CI lanes, review tripwires, and Graphite mergeability are still queued or running on parts of the published stack, and no replacement PR has landed.

## Follow-Ups

- Verify all required remote checks and review results after the current publication cycle settles.
- Land the replacement stack only after the complete required check set is green.
- Propagate the landed reconciliation evidence to the parent `gitplane` Objective, then close this Objective.

Provenance: objective-refresh basis target=2437a980eefabcea74fe644e2e8b26e7ea0a5a61 from=5a3090faa650c6665bb5f34becc431921e7f33ed
