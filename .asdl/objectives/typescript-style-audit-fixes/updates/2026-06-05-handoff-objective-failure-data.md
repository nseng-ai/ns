# Handoff and Objective Failure Data Slice Completed

## Summary

The remaining handoff/objective parsing slice of the expected-failure-as-data roadmap row is now implemented in `ts/packages/pi-extensions`.

Expected parse and usage failures now flow as discriminated returned data instead of parser exceptions:

- `machine-envelope.ts` returns `MachineEnvelopeDataParseResult` with `{ type: "valid"; data }` or `{ type: "invalid"; message }`, preserving `Malformed <label>: ...` messages and bounded stdout-tail behavior.
- `objective-list.ts` returns `ObjectiveListParseResult` and parses Objective records through record-level result data, preserving invalid-shape message substrings such as `expected trunk_branch` and `Invalid Objective list record`.
- `objective.ts` returns typed parse results for `/objective:list` arguments and branches in `handleCustomCliCommand` before invoking the `objective` CLI. Objective picker loading now returns `loaded`/`failed` data for startup, command, and parse failures so invalid `objective list --format json` output notifies without relying on parser throws.
- `handoff.ts` returns typed result data for pickup/list arguments, handoff item/key parsing, and handoff list loading. `handlePickupHandoffCommand` and `handleListHandoffCommand` branch on those values while preserving `Usage error: ...` notifications and existing list/pickup behavior.
- `worktree-status.ts` branches on invalid `brmem list JSON` machine envelopes and continues to the next brmem candidate rather than catching parser exceptions.

The throw-based `HandoffUsageError` and `CustomCliUsageError` classes were removed. Remaining source throws in the touched area are command-boundary or hard-error paths outside this expected parser/usage slice, such as current branch or handoff artifact read failures.

## Objective Impact

This completes the roadmap row "Rework expected failure APIs toward discriminated returned data where callers branch on failures." The earlier brmem/planned-branch, submit-gateway, land-stack, and runner runtime slices were already complete; this branch removes the last recorded open handoff/objective parsing portion.

User-facing behavior was preserved: `/handoff:pickup` and `/handoff:list` still emit the same usage/help/error notification shapes for invalid arguments, `/objective:list` still rejects removed or unsupported flags before CLI invocation with the same custom-message content, Objective picker commands still notify users on invalid Objective list JSON, and worktree status treats malformed brmem list JSON as a nonfatal candidate failure.

Tests were updated from expected parser `toThrow` assertions to result-variant assertions for machine envelopes, Objective lists, Objective list arguments, handoff arguments, and handoff brmem-list JSON. Command-level coverage now includes invalid Objective list JSON notifying without a prompt.

Validation passed:

- `bun test ts/packages/pi-extensions/test/machine-envelope.test.ts ts/packages/pi-extensions/test/objective-list.test.ts ts/packages/pi-extensions/test/objective.test.ts ts/packages/pi-extensions/test/handoff.test.ts`
- `bun run --cwd ts/packages/pi-extensions check`
- `bun run --cwd ts/packages/pi-extensions test`
- `just ts-check`
- `just ts-test`
- `just dprint-check`

Focused scans found no `HandoffUsageError` or `CustomCliUsageError` references and no expected parser-failure `toThrow` assertions for the touched parser helpers.

## Follow-Ups

- Continue with the remaining open Objective rows: dependency-injection / adapter ownership, and final exception capture / closeout.
- When closing the audit loop, summarize this row as completed across all five semantic slices and document any intentionally retained hard-error throws separately from expected parser/usage failures.
