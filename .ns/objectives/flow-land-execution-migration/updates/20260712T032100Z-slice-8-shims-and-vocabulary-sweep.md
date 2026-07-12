# Slice 8 shims and vocabulary sweep completed

## Summary

Completed Slice 8 by deleting the final `src/land/stack/errors.ts` compatibility shim and finishing the canonical land vocabulary sweep. The live implementation and ordinary tests had already moved to `LandResult`, `LandingFailure`, `LandOutcome`, `LandedPullRequest`, canonical result constructors, and the explicitly named `normalizeAdapterFailure` / `normalizeAdapterResult` inbound adapter normalization boundary.

## Objective Impact

The original Slice 8 prediction was internally inconsistent: it required deleting `stack/errors.ts` while also requiring every permanent scenario path to remain byte-for-byte unchanged, but two permanent transcript tests were the shim's only remaining importers. Deleting the shim could not typecheck without changing those imports and helper annotations.

The user selected resolution 2 and explicitly authorized import/type-only edits to exactly:

- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
- `ts/packages/capabilities/flow/test/unit/land-stack-topology-guards.test.ts`

Each file has exactly two changed lines: its type-only import now obtains canonical `LandResult` from `src/land/results.ts`, and the unchanged `expectSuccess` helper's parameter annotation uses `LandResult<T>`. No expectation line, scenario value, fixture value, telemetry assertion, command transcript, or test behavior changed. The other four permanent fixture/support files have empty diffs.

Accordingly, the Slice 8 scenario invariant is an explicit authorized exception, not empty: two files, 2 insertions and 2 deletions each, all import/type-only.

## Stale sweep

A case-sensitive source/test sweep found no remaining `stack/errors.ts`, `LandStackResult`, `LandFlowFailure`, `LandStackOutcome`, `LandedPr`, `toLandingFailure`, or `toLandResult` references. A constructor sweep also found no remaining calls to the transitional `success`, `failure`, `completed`, `isFailure`, or `landFlowFailureFacts` names. A repo-wide prose sweep still finds historical references in ADRs, retrospectives, and closed/other Objective records; those are archival descriptions rather than live land symbols or imports and were intentionally retained.

## Validation

- Focused authorized transcript/topology tests passed: 2 files / 70 tests.
- Full Flow package tests passed: 75 files / 668 tests.
- `just ts-check` passed with tsgo.
- `just ts-test-typescript-style-guard` passed: 1 file / 148 tests.
- `just ts-format-check` passed: 1,660 TypeScript files checked.
- `just ts-lint` passed.
- `just dprint-check` passed.
- `git diff --check` passed.
- `ns objective check flow-land-execution-migration` passed.

The parent agent retains responsibility for full `just`.

## Follow-Ups

Proceed to Slice 9 only in a later task. Slice 9 was not started here.
