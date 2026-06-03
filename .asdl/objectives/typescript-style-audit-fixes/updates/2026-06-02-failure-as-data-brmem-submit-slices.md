# Failure-as-Data: brmem/planned-branch and Submit-Gateway Slices Landed

## Summary

Two landed master commits advance the previously-untouched "Rework expected
failure APIs toward discriminated returned data" roadmap row, which prior updates
still described as fully open.

- **brmem / planned-branch (commit `82fdc07b`)** — `runFirstAvailableBrmemCommand`
  in `ts/packages/pi-extensions/src/brmem-cli.ts` now returns a discriminated
  `FirstAvailableBrmemCommandRun` union (`CompletedBrmemRun | NoAvailableBrmemCommandRun`)
  instead of throwing on unavailability, and a new `formatBrmemUnavailableMessage`
  extracts the message string from `formatBrmemUnavailableError` so callers can format
  without constructing an `Error`. A discriminated `BrmemRun` (`"completed" |
  "unavailable"`) threads through `planned-branch/plan-persistence.ts`, with call
  sites in `attached-plan.ts` (`list.type`/`get.type === "unavailable"`) and
  `planned-branch-creation.ts` (`put.type`/`check.type === "unavailable"`) branching
  on the discriminant. The preflight `brmem check` now aborts before creating the
  branch when no brmem command is available, avoiding partial state; post-creation
  unavailability raises a partial-failure error carrying branch and plan metadata.
  Tests assert on the returned `type` field rather than catching throws, with new
  coverage for the unavailable paths in `loadAttachedPlan` and
  `createPlannedBranchFromFile`.

- **submit gateway typed causes (commit `62c64246`)** — `ts/packages/asdl-dev/src/submit.ts`
  replaces presentation-string failure fields with typed semantic causes:
  `SubmitRunResult.semanticFailure` → `semanticFailureCause: SubmitSemanticFailureCause`
  (`"empty_branch_skipped"`), and `CurrentPrVerificationResult` drops its `message`
  string in favor of `cause: CurrentPrVerificationFailureCause` (`"no_current_pr" |
  "startup_error" | "timeout" | "command_failed"`). `RealSubmitGateway` maps
  Graphite/process observations to cause values; English guidance moves entirely into
  formatter helpers (`formatSubmitSemanticFailureCause`,
  `formatCurrentPrVerificationFailureReason`) behind an `assertNever` exhaustiveness
  guard. In-memory fakes carry the typed causes and scenario/gateway tests exercise
  the cause mappings. (This commit's own roadmap edit lived in the
  `asdl-dev-submit-consolidation` Objective; the same change is what advances the
  failure-as-data theme tracked here.)

Evidence: `git show 82fdc07b` and `62c64246` (both 2026-06-02, ancestors of current
`master`); current TS source confirms the discriminated unions and typed causes are
present on the default branch. Both commits are landed — this update reflects
post-landing trunk state.

## Objective Impact

Moves the roadmap row "Rework expected failure APIs toward discriminated returned
data where callers branch on failures" from `[ ]` to `[~]`. The brmem/planned-branch
and submit-gateway slices are done; the remaining named slices stay open and
throw-based on master: `land-stack` (`LandStackError` throws in `errors.ts` and a
re-throw in `command-stream.ts`), `handoff`/`objective` parsing (`throw new Error` /
`CustomCliUsageError` in `objective.ts` and `handoff.ts`), and runner runtime
parsing.

The cascade risk for throw-to-returned-data conversion is recorded as partially
de-risked in `objective.md`: both landed slices preserved user-facing messages by
relocating English prose into formatter helpers and updated tests to assert on
returned `type`/`cause` fields rather than caught throws.

## Follow-Ups

- Complete the failure-as-data row by converting or explicitly justifying throws in
  `land-stack`, `handoff`/`objective` parsing, and runner runtime parsing.
- When closing the audit loop, fold these two landed slices into the
  fixed-versus-accepted summary.
