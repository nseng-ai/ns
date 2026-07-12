# Remediation Branch 1 confirmation seam completed

## Summary

Completed remediation Slice 10 / Branch 1. Approved confirmation decisions now carry explicit `prompted` or `approved-upfront` provenance. Flow wraps its prompt-backed confirmation gateway with a decorator that snapshots an immutable approved-request-kind set, intercepts all exhaustively enumerated request variants without presentation or routing policy, and delegates every other request.

Canonical stack execution now calls the confirmation gateway unconditionally for main landing, managed-slot freeing, submit-required updates, and ordinary free-slot cleanup. Dry-run, preserve, force-cleanup, and absent cleanup targets remain policy branches. Prompted main approval completes the confirmation phase; upfront approval records the existing skipped reason `approved upfront before canonical execution`.

The temporary `LandingExecutionApprovals` and approval booleans were removed. A pure Flow mapper derives approved request kinds from parsed flags, observed upfront prompt approval, and the cleanup preview: `--yes` preserves its existing main-landing and previewed-cleanup authorization without suppressing the established pre-merge prompts; interactive upfront approval covers pre-merge requests; and `--force` remains cleanup policy rather than prompt approval. This resolves the remediation plan's conflicting `--yes` instructions in favor of its higher-level compatibility requirement and the user's explicit direction to preserve existing prompt behavior.

`ExecuteLandingOptions` now requires an explicit host and a `discover | prepared` source. The prepared source is runtime-checked against target kind and requested scope. Flow pass-through options collapsed to one execution input carrying that source and approved-kind set; explicit refusing and null-progress hosts remain available to callers.

## Objective Impact

Slice 10 is complete and the Objective remains open for remediation Slices 11–14. The Objective completion criteria and superseded non-goals now reflect the required host/source contract and explicit confirmation-gateway authorization model.

## Tests and invariants

Focused tests cover prompted/upfront provenance, immutable selective interception, mapper parity, unconditional core requests, main-phase reporting, required-host refusal, prepared-source validation, cleanup, pre-merge, isolated glue, API runtime boundary, and the permanent transcript scenario suite.

The five permanent fixture/support files outside the transcript scenario file were untouched. One wiring-only change in `test/unit/land-stack-command-scenarios.test.ts` was unavoidable because the removed `preMergeConfirmation` transport option no longer exists: that scenario now supplies the equivalent approved request kind through the single execution input. Its script, prompt assertions, command expectations, and all permanent transcript fixtures are unchanged.

## Validation

- `just ts-check`: passed.
- `just ts-lint`: passed.
- `just dprint-check`: passed.
- `ns objective check flow-land-execution-migration`: passed with 0 errors and 0 warnings.
- Focused Vitest command covering execute, Flow confirmation gateway, post-cleanup, pre-merge, isolated fast path, API boundary, and transcript scenario: 7 files, 155 tests passed.
- `pnpm --dir ts --filter @nseng-ai/flow test`: 77 files, 720 tests passed.
- `just`: passed (512 files / 5206 default tests, 148 TypeScript style-guard tests, plus formatting, lint, typecheck, dependency, and Objective checks).
- Stale-source/test sweep for `LandingExecutionApprovals`, `approvals:`, `confirmationAlreadyApproved`, `isConfirmationAlreadyApproved`, `shouldSkipMainConfirmation`, `isPostLandingCleanupApproved`, and `preparedShape`: empty.

No commit, branch, push, submit, or Branch Memory mutation was performed.

## Follow-Ups

Continue only with remediation Slice 11 on its own branch/contract. Slices 11–14 remain unchecked; this update does not claim Objective closure.
