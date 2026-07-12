# Feedback follow-up 2: narrow landing execution progress by use

## Summary

Second follow-up PR for the July 12, 2026 landing-execution feedback snapshot, addressing #3441 thread `PRRT_kwDOR4YhMs6QKtQX`: isolated and post-landing cleanup adapters no longer fake stack-matrix and plan-recalculation methods.

`LandExecutionProgress` is now the composition of two capabilities declared in `execution/host-seams.ts`:

- `LandExecutionStatusProgress` (`setStatus`) and `LandExecutionMessageProgress` (`note` + `setStatus`) for executors that only report text updates;
- `LandExecutionStackObservationProgress` (`setStep`, `recordMergedPullRequest`, `planRecalculated`) for stack-only observation events.

Executors narrowed by actual method use:

- isolated landing (`IsolatedLandingHost.progress`) accepts `LandExecutionMessageProgress`;
- managed-slot post-landing cleanup accepts `LandExecutionStatusProgress` (it only sets status);
- Graphite maintenance (`GraphiteMaintenanceProgress`) narrows to `LandExecutionMessageProgress`;
- pre-merge stays on the full aggregate because it legitimately calls `planRecalculated`; canonical execution, the merge loop, and `createFlowLandExecutionProgress()` keep the full contract.

Flow adapters `isolatedLandingProgress()` and `createCleanupProgress()` now return the narrow interfaces with all fake `setStep`/`recordMergedPullRequest`/`planRecalculated` (and, for cleanup, `note`) no-ops deleted. `nullLandExecutionProgress` remains the full no-op implementation and the `@nseng-ai/flow/land/api` exports (`LandExecutionProgress`, `nullLandExecutionProgress`) are unchanged in name and shape.

## Objective Impact

No roadmap slice changes; post-completion review remediation. The Objective remains open.

## Tests and invariants

- Test fixtures for isolated landing, cleanup, and maintenance now implement only their accepted narrow capability, providing compile-time evidence the executors no longer require unrelated methods.
- New unit assertion pins that the cleanup progress adapter exposes only `setStatus`.
- Existing `land-execution-progress` forwarding test still proves the full Flow adapter forwards every stack event.
- All note/status text and call timing unchanged; all six permanent invariant files byte-for-byte unchanged.

## Validation

- `just ts-check`: passed.
- Full `@nseng-ai/flow` package: 80 files, 739 tests passed.
- `just ts-format-check`, `just ts-lint`: passed.
- `ns objective check flow-land-execution-migration`: passed.
- `git diff --check`: passed; permanent invariant diff empty.

No push, submit, or Branch Memory mutation was performed.

## Follow-Ups

- Follow-up PR 3 (confirmation-policy ownership) completes the code changes for this feedback snapshot.
- Reply to and resolve thread `PRRT_kwDOR4YhMs6QKtQX` after stack submission is authorized.
