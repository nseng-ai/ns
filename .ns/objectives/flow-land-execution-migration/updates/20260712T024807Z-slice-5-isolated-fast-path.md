# Slice 5 isolated fast path migrated

## Summary

Completed Slice 5 by moving isolated-path selection and execution into `execution/isolated-landing.ts`. The core entrypoint accepts `LandContext`, `LandingShape`, plain cleanup options, and an `IsolatedLandingHost` containing `LandConfirmationGateway` plus `LandExecutionProgress`. `isIsolatedFastPath` now accepts only `StackSnapshot`.

The typed core outcome distinguishes dry-run completion, verified merge completion, and failures tagged by execution stage (`load`, `base-check`, `cleanup-confirmation`, `merge`, or `verification`). It carries the exact `LandingFailure`, cleanup decision, pull-request facts, and successful merge output needed by the Flow adapter. Boundary failures retain all diagnostics unchanged. Verification still requires `state === "MERGED"`, a truthy `mergedAt`, the expected trunk base, and the expected landing-branch head.

The root `isolated-fast-path.ts` is now Flow composition/presentation plus the retained PR-view compatibility parser. Flow owns byte-identical isolated dry-run and success formatters in the consolidated `land-presentation.ts`; base-refusal and verification messages retain their previous verbatim notification path, while gateway and confirmation failures use the existing typed failure presenter.

## Confirmation Timing Evidence

Cleanup confirmation now travels through `IsolatedLandingHost.confirmation` and the existing `post-landing-cleanup` request/decision semantics. Core evaluates it after PR loading, base validation, and the dry-run return, immediately before emitting merge progress and calling `squashMergePullRequest`. The focused refusal test returns a fully worded Flow failure and proves the squash-merge request log remains empty. Existing `--yes`, `--force`, `--preserve`, dry-run, and interactive decision rules continue to come from the shared cleanup resolver, so prompt count and auto-approval policy are unchanged.

## Fake and Adapter Evidence

- G1 now auto-transitions a PR to cloned `MERGED` facts with a non-empty `mergedAt` after successful squash merge.
- `postMergeFacts`, keyed by PR number, overrides post-merge facts with either representative mismatch facts or a typed load failure.
- Fake-contract tests lock auto-MERGED behavior, both override variants, merge/facts request logs, and clone-on-read.
- Real-adapter protocol coverage locks the existing representative squash-merge success mapping and adds representative post-merge `gh pr view` success/failure mappings into the corresponding typed result variants.

## Test Evidence

- Focused Vitest passed: 4 files / 27 tests (`isolated-fast-path`, in-memory gateway contract, land-context adapter protocol, and import direction).
- `just ts-check` passed with tsgo.
- `just ts-lint`, `just ts-format-check`, and `just ts-test-typescript-style-guard` passed (style guard: 148 tests).
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 72 files / 633 tests.
- `git diff --check` passed.

## Objective Impact

Focused tests cover dry run, verified success, confirmation refusal before merge, merge failure with exact boundary fields, verification not-MERGED, verification load failure, request ordering, and exact typed outcome mapping. A dedicated assertion pins the refusal failure at `level: "error"`, `failureLevel === "error"`, and resulting CLI exit code `1`. Formatter assertions pin the exact dry-run and successful-merge notification bytes, including merged command output.

## Scenario Invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. The invariant diff is empty: no transcript scenario, script fixture, backup-ref fixture, shared land test helper, git-state filesystem support, or topology-guard file changed.

## Invariant Diff

Empty. No command shape/order, prompt count/evaluation point, safety gate, telemetry, API entry, CCC entry, dispatch ordering, or permanent transcript/fixture invariant changed.

## Follow-Ups

Proceed to Slice 6 only. Maintenance, pre-merge preparation, and merge-loop migration remain untouched.
