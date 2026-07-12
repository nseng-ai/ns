# Slice 7b merge loop migrated

## Summary

Completed Slice 7b by moving `prepareMergeLoopState` and `runMergeLoop` into `execution/merge-loop.ts`. The core loop now depends only on `LandContext`, `LandExecutionProgress`, core plan/result/failure vocabulary, strict-gate policy, and core Graphite maintenance. It has no stack, Pi, command-stream, renderer, kernel UI, adapter, or subprocess dependency. `landing-execution.ts` now only supplies the real context/progress, adapts the returned accumulated values into the transitional Flow session arrays, and presents failure or success. `stack/landing-operations.ts` was deleted; `stack/pre-merge-submit.ts` remains deleted. A stale-import sweep found no `landing-operations` source or test imports.

## Objective Impact

`runMergeLoop` returns a merge-specific discriminated result rather than mutating landed/warning out-parameters. Success contains `{ landed, warnings, cleanup }`; failure contains `{ failure, landed, warnings }`, preserving partial landing and warning evidence for Flow presentation. `prepareMergeLoopState` returns the canonical `LandResult<MergeLoopState>`. Snapshot state remains local and mutable only within the loop/maintenance execution.

The exact semantic order remains: snapshot all landing and descendant branches once; for each landing branch, strict gate (`localBranchSha`, PR facts), squash merge, numeric-PR verification, landed accumulation/progress, then Graphite maintenance. Progress retains active then failed/done transitions for gate/merge/verify, active then failed/skipped/done for restack, the existing status/note messages, and record-after-verification behavior. Snapshot failure returns before any merge. Strict-gate, squash, verification, and maintenance halt failures return all previously landed PRs and stop immediately. Maintenance skip appends its warning and continues.

## Fake-driven evidence

Added `test/land/unit/merge-loop.test.ts` with eight direct in-memory cases covering:

- two-branch success, landed/warning/cleanup accumulation, G1 automatic MERGED verification, and the exact cross-gateway semantic sequence for both branches;
- exactly one backup snapshot before all branch work;
- snapshot failure with zero squash merges;
- strict-gate failure at branch k with branches 0..k-1 retained;
- mid-loop squash rejection with `failedBranch` and `failedPrNumber`;
- post-merge facts that remain non-MERGED;
- post-merge fact-load failure;
- optional descendant maintenance refresh failure producing a warning and successful continuation;
- required next-landing maintenance refresh failure halting after the already merged branch.

To prove cross-gateway order without reconstructing command strings, the in-memory context now owns a minimal testing-only semantic event recorder for merge-loop Git, GitHub, and Graphite calls. Each gateway receives the shared recorder at construction; `callEvents` is clone-on-read. Gateway interfaces and production adapters are unchanged, and no scripted behavior or external result variant was added. Existing G1/G2 controls supply merge transition and maintenance failures, so no new adapter-pair requirement arose.

The happy-path semantic sequence is snapshot; branch A SHA/facts/merge/verification; branch B maintenance guard/refresh; branch A child check/delete; branch B restack and current-metadata check; branch B SHA/facts/merge/verification; branch B child check/delete. The suite asserts the exact typed operation/request sequence, including branch/PR identities, and separately proves the snapshot gateway was called once.

## Validation

- Focused `merge-loop.test.ts` passed: 1 file / 8 tests.
- `pnpm --dir ts --filter @nseng-ai/flow test -- test/land/unit/merge-loop.test.ts` passed the full Flow package: 75 files / 670 tests.
- `just ts-check` passed with tsgo.
- `just ts-lint` passed.
- `just ts-format-check` passed.
- `just ts-test-typescript-style-guard` passed: 1 file / 148 tests.
- `just ts-test-integration` passed: 40 files / 155 tests.
- Affected maintenance, presentation, adapter, import-direction, and transcript coverage is included in the green Flow package suite.
- `git diff --check` passed.

The parent agent retains responsibility for full `just`.

## Scenario invariant

`git diff --exit-code --` across all six permanent scenario/fixture paths passed with no output. No permanent transcript scenario or fixture changed.

## Invariant diff

Empty. Command shapes/order, prompt counts/defaults/evaluation points, safety gates, user-visible text, telemetry, exports, CCC entry, and dispatch ordering are unchanged.

## Follow-Ups

Proceed to Slice 8 only. Slice 9 end-to-end `executeLanding` composition was not started.
