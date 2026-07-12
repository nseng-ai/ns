# Slice 2 progress seam

## Summary

Completed Slice 2 by adding the core-owned `LandExecutionProgress` host seam and its null implementation. The seam owns execution notes/status, the closed gate/merge/verify/restack step vocabulary, the execution-assigned active/done/skipped/failed states, merged-PR recording, and recalculated-plan notification without importing Flow matrix, command-stream, Pi, or kernel UI types.

`stack/landing-operations.ts` now receives only this progress seam for merge-loop presentation. The former tracked-matrix helper behavior is inlined without changing operation order: each gate, merge, and verify step becomes active immediately before its operation and failed/done immediately after its failure/success result; restack remains active before maintenance, failed on halt, skipped on skip (with warning accumulation still afterward), and done on proceed. Merged-PR live progress and merge-loop notes now travel through the seam.

The Flow adapter remains in composition code. It maps notes to the command stream, status to the existing progress reporter, step updates and recalculated plan rows to the optional matrix, and merged PRs to the existing command-stream live-progress path, preserving matrix title updates and live progress behavior.

## Objective Impact

The Slice 2 roadmap row is complete. Matrix and command-stream types remain Flow-side, while `execution/host-seams.ts` imports only core land types. No later execution phase was migrated.

## Test Evidence

- Focused affected Vitest passed: 5 files / 105 tests, covering the null seam, Flow adapter mappings, import direction, full stack command scenarios, Graphite maintenance, and landing helpers.
- `just ts-check` passed with tsgo.
- `just ts-format-check` and `just ts-lint` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 70 files / 612 tests.
- `git diff --check` passed.

## Scenario Invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. No transcript scenario, script fixture, backup-ref fixture, shared land test helper, git-state filesystem support, or topology-guard file changed.

## Follow-Ups

Proceed to Slice 3. Confirmation gateway work remains reserved for Slice 4, and no confirmation scaffolding was added here.
