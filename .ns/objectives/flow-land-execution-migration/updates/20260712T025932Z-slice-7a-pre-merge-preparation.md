# Slice 7a pre-merge preparation migrated

## Summary

Completed Slice 7a by creating `execution/pre-merge.ts` over `LandContext`, `LandExecutionProgress`, `LandConfirmationGateway`, plans, and core result types. It now owns managed-slot freeing and rechecks, required restack/submit and plan recheck, residual pre-merge failures, and the execution-specific clean-repository guard. `landing-execution.ts` composes the core functions with Flow progress and confirmation adapters. Pre-merge implementation was removed from `stack/landing-operations.ts`; `stack/pre-merge-submit.ts` was deleted with no compatibility shim. Merge-loop functions remain in `stack/landing-operations.ts` for Slice 7b.

## Objective Impact

The reserved confirmation payloads now carry semantic managed slots or submit/restack requirements plus the exact landing target and optional restack target. Flow's confirmation gateway adapts both request kinds through `confirmLandStackAction`. Titles, details, non-interactive refusal prose, suggested action, one-prompt behavior, undefined/default host answer, and evaluation before mutation remain unchanged. Core tests prove refused confirmation occurs before `freeSlots`, restack, or submit. Presentation tests lock exact free-slot and restack-submit strings; fake-driven tests lock exact semantic request payloads.

## Clean-repository parity

`assertCleanRepoForExecution` calls `context.git.workingTreeStatus` and preserves the old stack strings byte-for-byte:

- dirty: `Working tree is dirty; refusing to start stack landing.`
- merge: `A merge is in progress; refusing to start stack landing.`
- cherry-pick: `A cherry-pick is in progress; refusing to start stack landing.`
- revert: `A revert is in progress; refusing to start stack landing.`
- rebase: `A rebase is in progress; refusing to start stack landing.`
- bisect: `A bisect is in progress; refusing to start stack landing.`

The old `formatInProgressOperationLabel` and live preflight `operationInProgressLabel` tables are identical for all five variants. Table-driven tests cover every variant and explicitly reject adoption of ordinary preflight's dirty wording.

## Worktree normalization parity

The post-free recheck now calls core `detectWorktreeConflicts`. Filesystem normalization remains exclusively at the real adapter boundary: `classifyWorktree` compares `normalizeExistingPath(path)` and `normalizeExistingPath(repoRoot)`, which uses native realpath for existing paths and resolved absolute paths otherwise. A protocol test proves equivalent relative/absolute current-worktree paths classify as current, while a paired pure test proves core trusts the adapter's normalized `current` classification even when path strings differ. No filesystem normalization entered core.

## Fake-driven evidence

The pre-merge tests cover managed-slot success, exact free request and semantic mutation request, slot-free failure with no rechecks, residual checkout, non-interactive refusal before mutation, required restack plus submit plus plan recheck and residual requirements, exact submit request, restack failure preventing submit, submit failure after restack with exact core recovery guidance and no plan recheck, and all clean-repository variants. Existing G2/G5 fake controls were sufficient; no new fake knob or typed adapter variant was added, so no new protocol-control pairing was required.

## Validation

- Focused `land-pre-merge.test.ts` passed: 1 file / 16 tests.
- `just ts-check` passed with tsgo.
- `just ts-lint` passed.
- `just ts-format-check` passed.
- `just ts-test-typescript-style-guard` passed: 1 file / 148 tests.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 74 files / 661 tests.
- Focused behavior is included in `land-pre-merge.test.ts`, `land-pre-merge-presentation.test.ts`, `land-context-adapter.test.ts`, and `land-import-direction.test.ts`.
- `git diff --check` passed.

The parent agent retains responsibility for full `just`. The integration lane remains required after Slice 7b completes.

## Scenario invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. No permanent transcript scenario or fixture changed.

## Invariant diff

Empty. Command shapes/order, prompt counts/defaults/evaluation points, safety gates, user-visible text, telemetry, exports, CCC entry, and dispatch ordering are unchanged.

## Follow-Ups

Proceed to Slice 7b only. `prepareMergeLoopState`, `runMergeLoop`, and their stack orchestration deliberately remain unmigrated.
