# Stack-Native Resolution Payload Builder

## Summary

This branch adds `pr-address exec build-stack-resolve-thread-payloads`, a deterministic, non-mutating helper that consumes a validated `stack-feedback-plan` data object, selected stack batch, batch commit SHA, `continue_on_error`, and explicit `(pr_number, thread_id)` resolve/skip decisions. It emits per-PR `resolve-thread-batch` payload entries or structured semantic errors without reconstructing per-PR `plan-feedback` wrappers.

The helper validates stack plan shape/state, selected batch identity, missing and duplicate decisions, wrong-PR references, wrong-batch references, informational/unknown thread decisions, all-skipped/no-thread no-payload cases, and the same resolution mode/message/commit/provenance rules used by the per-PR builder. The public `pr-address` skill, CLI reference, and internal stack-address skill now route stack runs through the stack-native builder before mutating through `resolve-thread-batch`.

Verification: targeted stack scenario coverage passed for one-PR and multi-PR success, missing/duplicate decisions, wrong PR/batch references, all-skipped batches, mixed fixed/explained/pre-existing outcomes, non-thread ignored items, and raw-body sentinel discipline. Adjacent per-PR builder regression tests passed; `pr-address exec build-stack-resolve-thread-payloads --json-schema` printed successfully; `just lint`, `just ty`, and `just dprint-check` passed.

## Objective Impact

This completes the stack-native resolution payload building roadmap slice. The stack-address workflow no longer needs to manually reconstruct per-PR `plan-feedback` wrappers from merged `stack-feedback-plan` output just to prepare thread-resolution payloads.

The broader stack work remains open. Current-feedback reconciliation before stack mutation is still not helper-owned, and `internal-pr-stack-address` cannot be fully simplified around a short deterministic command sequence until that drift comparison exists.

## Follow-Ups

- Add deterministic current-feedback reconciliation for stack plans before GitHub mutation.
- Simplify `internal-pr-stack-address` further after current-feedback diffing exists, keeping fallback mechanics out of the normal stack path.
- Preserve the GitHub mutation boundary: `build-stack-resolve-thread-payloads` remains non-mutating, and `resolve-thread-batch` remains the mutating helper for ready per-PR payloads.
