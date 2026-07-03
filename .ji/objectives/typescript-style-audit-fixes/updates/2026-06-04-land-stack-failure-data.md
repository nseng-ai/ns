# Land-Stack Failure Data Slice Completed

## Summary

The `land-stack` slice of the expected-failure-as-data roadmap row is now implemented. `ts/packages/pi-extensions/src/land-stack/errors.ts` no longer exports `LandStackError` or `fail(...)`; it owns structured `LandStackFailure` metadata and a discriminated `LandStackResult<T>` / `LandStackOutcome` model instead.

Expected `land-stack` failures now flow as returned data through argument parsing, stack facts, PR facts and validators, worktree inspection, landing-plan construction, pre-merge submit/update and slot cleanup, and the merge loop. Presentation functions format `LandStackFailure` values directly, while the top-level command handler branches on returned results and keeps only a narrow unexpected-error boundary for hard exceptions. `withCommandStreaming` now turns `pi.exec` throws into a failed `ExecResult` and appends the failed command stream line without rethrowing.

Tests were updated to assert on success/failure result variants for direct helpers (`parseArgs`, `loadPr`, PR validation) and to cover command-stream startup throws returning failed command data. Scenario coverage remains behavior-preserving for dry-run, success, warning, cancellation, command-stream redaction, already-landed context, and stop-failure flows.

Reviewer feedback on the helper shape was addressed in the same slice: `presentLandStackFailure` now takes a named options object instead of four positional parameters, keeping the new failure-presentation helper aligned with the TypeScript style rule for multi-argument helpers.

## Objective Impact

This completes the `land-stack` portion of the roadmap row "Rework expected failure APIs toward discriminated returned data where callers branch on failures." The row remains `[~]` because `handoff`/`objective` parsing and runner runtime parsing are still open, but `land-stack` is no longer listed as an open throw-based slice.

Evidence: local branch diff against Graphite parent `master` touches only `land-stack` source/test files plus this Objective update. PR #880 corroborates the same file set and includes the options-object reviewer follow-up. Focused scans found no `LandStackError` or `fail(` references in `ts/packages/pi-extensions/src/land-stack.ts`, `ts/packages/pi-extensions/src/land-stack`, or `ts/packages/pi-extensions/test/land-stack.test.ts`; remaining `throw new Error(...)` matches in the slice are test assertion/setup guards. Current feedback fetch for PR #880 reported no unresolved review threads after the reviewer follow-up was resolved.

Validation passed:

- `bun run --cwd ts/packages/pi-extensions check`
- `bun run --cwd ts/packages/pi-extensions test`
- `just ts-check`
- `just ts-test`

After the reviewer follow-up, the focused package gate also passed again with `bun run --cwd ts/packages/pi-extensions check` and `bun run --cwd ts/packages/pi-extensions test`.

## Follow-Ups

- Convert or explicitly justify the remaining expected-failure throw sites in `handoff`/`objective` parsing.
- Convert or document runner runtime parsing throw boundaries.
- In the final closeout slice, summarize fixed versus accepted TypeScript-style exceptions after those remaining failure-as-data and adapter-ownership rows are resolved.
