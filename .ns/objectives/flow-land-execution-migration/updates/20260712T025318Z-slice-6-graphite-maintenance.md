# Slice 6 Graphite maintenance migrated

## Summary

Completed Slice 6 by moving the Graphite maintenance implementation and pure maintenance planner from `stack/graphite-maintenance.ts` and `stack/graphite-maintenance-plan.ts` to `execution/maintenance.ts` and `execution/maintenance-plan.ts`. The old private implementation files were deleted with no compatibility shims because every live import moved cleanly.

Created state-only `execution/merge-loop.ts` as the owner of `MergeLoopState` and `RemainingCleanup`. Transitional stack landing operations and Flow presentation now import those types from core. `prepareMergeLoopState` and `runMergeLoop` remain in `stack/landing-operations.ts`; no Slice 7 function moved.

## Objective Impact

The three Slice 6 execution modules import only foundation command types, the existing commit-display boundary, sibling core modules, and core land types. They contain no stack, Pi, kernel UI, command-exec, command-stream, or renderer imports. Import-direction coverage now inventories `execution/maintenance.ts`, `execution/maintenance-plan.ts`, and the state-only `execution/merge-loop.ts`; the focused import-direction test passed.

Maintenance now operates on `LandContext`, `LandExecutionProgress`, `MergeLoopState`, `LandingPlan`, and core failure/warning types. It uses core `parseGitCheckedOutElsewhere` and `LAND_BACKUP_RECOVERY_HINT`. Existing warning/failure text, branch traversal, Graphite request order, and maintenance decisions remain unchanged. `graphiteRefreshFailure` deliberately still parses the command result instead of branching on the typed refresh variant; typed-variant branching remains parked.

## G2 and G4 fake/adapter evidence

G2 adds `refreshBranchFromRemoteResults`, keyed by branch, with exact `LandGraphiteRefreshBranchResult` success, failure, and checkout-conflict shapes. Unconfigured branches retain semantic success. Constructor state and every read are cloned. Fake-contract coverage locks default success, injected failure, injected checkout conflict, request logging, and clone-on-read. Real-adapter protocol coverage pairs representative exit-7 stdout/stderr with the typed failure shape and checked-out stderr/exit-1 with the typed checkout-conflict shape; the existing success protocol case remains green.

G4 expands Graphite `OperationState` failure injection with optional typed `commandDisplay` and `ExecResult`, retaining the existing typed boundary and defaults. Maintenance-relevant restack and submit fake failures preserve custom displays, stdout, stderr, exit codes, and signals. Paired real-adapter protocol coverage proves representative restack exit-8 and submit exit-9 results produce the same typed command/result shapes.

## Maintenance matrix evidence

`land-graphite-maintenance.test.ts` now has 14 tests: three planner cases and eleven execution cases. The execution matrix covers required SHA-moved halt and optional SHA-moved warning with the exact `LAND_BACKUP_RECOVERY_HINT`, checkout-conflict refresh deferral with no delete/restack/submit afterward, unexpected children, retained deletion, ordinary failed deletion, typed mid-rebase/in-progress deletion wording, multi-descendant warning aggregation in branch order, skip-submit for current metadata, normal required maintenance, and optional restack failure with injected command/result diagnostics. Assertions use semantic gateway request logs and typed outcomes rather than reconstructed subprocess commands.

## Validation

- Focused maintenance, fake-contract, adapter-protocol, and import-direction Vitest: 4 files / 37 tests passed.
- `just ts-check` passed with tsgo.
- `just ts-lint` passed.
- `just ts-format-check` passed.
- `just ts-test-typescript-style-guard` passed: 1 file / 148 tests.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 72 files / 643 tests.
- `git diff --check` passed.

The parent agent retains responsibility for the full `just` validation.

## Scenario invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. No permanent transcript scenario or fixture changed.

## Invariant diff

Empty. No command shape/order, prompt count, safety gate, text, telemetry, API export, CCC entry, or dispatch ordering changed.

## Follow-Ups

Typed-variant branching for `graphiteRefreshFailure` remains explicitly parked. Proceed to Slice 7a only; pre-merge preparation and merge-loop function migration remain untouched.
