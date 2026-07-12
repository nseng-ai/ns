# Feedback follow-up 1: mechanical landing review remediation

## Summary

First of three follow-up PRs addressing the July 12, 2026 landing-execution feedback snapshot, built above `landing-execution-remediation/operation-labels` (#3456). This PR contains behavior-preserving mechanical cleanups for six review threads:

- Removed the `as GraphiteOperationSpec<TOperation>` cast by deleting `graphiteOperationSpecFor()`; `buildGraphiteOperationArgs()` now uses an exhaustive discriminant `switch` over `LandGraphiteOperation`, keeping `GRAPHITE_OPERATION_SPECS` as the operation-shape source of truth and command arrays byte-for-byte identical (#3441 `PRRT_kwDOR4YhMs6QKtMO`).
- Extracted the four-part merged-PR verification into `execution/merged-pull-request-verification.ts` (`isVerifiedMergedPullRequest(facts, { expectedTrunk, expectedHeadBranch })`), shared by isolated landing and the stack merge loop; each caller keeps its distinct failure wording and cleanup consequence (#3441 `PRRT_kwDOR4YhMs6QMoRl`).
- Renamed `wasPromptApproved` → `hasPromptApproval` and `wasUpfrontPromptApproved` → `hasUpfrontPromptApproval` with the exact truth condition preserved (#3452 `PRRT_kwDOR4YhMs6QM-Y5`, `PRRT_kwDOR4YhMs6QM-Y6`).
- Removed `requestTable[0]!` / `[1]!` in the confirmation-gateway test by introducing named `ConfirmationRequestEntry` fixtures (`mainLandingEntry`, `freeManagedSlotsEntry`) used both in the table and the upfront-approval snapshot test (#3452 `PRRT_kwDOR4YhMs6QM-Y7`).
- Replaced the mutable `didRunSubmitPreparation` flag with a const `hasSubmitPreparationWork` predicate computed from the initial plan's managed-slot conflicts and PR-submit requirements; early-failure phase reporting is unchanged (#3454 `PRRT_kwDOR4YhMs6QM-Ss`).

## Objective Impact

No roadmap slice changes; this is post-completion review remediation. The Objective remains open.

## Tests and invariants

- New `test/land/unit/merged-pull-request-verification.test.ts` proves all four mismatch dimensions (state, mergedAt, base, head) independently.
- Existing table-driven confirmation-gateway tests and the upfront-approval snapshot assertion are unchanged in behavior.
- All six permanent transcript scenario/fixture/support invariant files are byte-for-byte unchanged versus `landing-execution-remediation/operation-labels`.
- Stale-symbol sweep found no remaining `graphiteOperationSpecFor`, `wasPromptApproved`, `wasUpfrontPromptApproved`, or `didRunSubmitPreparation`.

## Validation

- `just ts-check`: passed.
- Full `@nseng-ai/flow` package: 80 files, 738 tests passed.
- `just ts-format-check`, `just ts-lint`: passed.
- `ns objective check flow-land-execution-migration`: passed.
- `git diff --check`: passed.
- Permanent invariant diff: empty.

No push, submit, or Branch Memory mutation was performed.

## Follow-Ups

- Follow-up PR 2 (progress-seam narrowing) and PR 3 (confirmation-policy ownership) complete this feedback snapshot.
- Reply to and resolve the six addressed review threads after stack submission is authorized.
