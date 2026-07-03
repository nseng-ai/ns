# asdl-pr-address Feedback Snapshot Slice Landed

## Summary

The first `asdl-pr-address` feedback workflow deepening slice is now represented as landed Objective state. `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/feedback_snapshot.py` now owns the shared in-process fetch/filter policy for PR-level reviews, visible review threads, count-source review threads, and PR discussion comments.

`get-feedback` now builds its inline and payload results from the snapshot module instead of duplicating direct review filtering and thread/comment fetch policy. `summarize-feedback` now also consumes the snapshot module while preserving its existing behavior where summary counts include resolved review threads even when the returned compact thread list omits resolved threads by default.

Verification: focused snapshot unit tests passed, affected `get-feedback` / `summarize-feedback` CLI scenario tests passed through `test_operations.py`, and the full `asdl-pr-address` test suite passed. Python lint, format, and type checks passed during `just`; full `just` still fails in unrelated TypeScript package `ts/packages/ccc/src/worktree-status.ts` with `TS18048: 'result.stdout' is possibly 'undefined'` errors.

## Objective Impact

The roadmap row **Deepen `asdl-pr-address` feedback snapshot and prepare-run policy** moves from `[ ]` to `[~]`. This slice extracts the shared feedback snapshot policy behind an in-process module and gives that policy focused fake-driven unit coverage, reducing the need to test empty-review and resolved-thread behavior only through full CLI scenarios.

The row remains partial because `prepare-run` still owns additional contested-thread reopening, thread normalization, git restructure detection, warning, and payload-dispatch behavior that was intentionally deferred rather than over-unified with this first snapshot slice.

## Follow-Ups

- Design the next `prepare-run` workflow slice around contested-thread normalization, resolved-thread reopening, git restructure warning evidence, and payload preparation without moving CLI presentation concerns into the workflow module.
- Consider migrating `stack_feedback.py` to the snapshot module only after the `get-feedback` / `summarize-feedback` extraction has settled and current tests make that substitution safe.
- Keep existing scenario tests as CLI contract coverage unless and until the prepare-run workflow interface gives a clearer place to demote policy-heavy assertions.
