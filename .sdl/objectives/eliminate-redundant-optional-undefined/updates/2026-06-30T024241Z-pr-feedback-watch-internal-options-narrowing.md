# PR Feedback Watch Internal Options Narrowing

## Summary

Completed a coherent `pr-feedback-watch` internal helper/options cleanup slice.

Removed redundant explicit `| undefined` from omission-only optional properties in the package's internal download, REST fingerprint, check summary, `gh api`, and `gh` JSON command helper options. The narrowed fields were:

- `DownloadPrFeedbackOptions.prNumber`
- `DownloadPrFeedbackOptions.signal`
- `DownloadPrFeedbackOptions.runner`
- `DownloadPrFeedbackOptions.shouldAllowFailureData`
- `LoadRestFingerprintOptions.sinceIso`
- `LoadRestFingerprintOptions.signal`
- `LoadPrCheckSummaryOptions.signal`
- `GhApiJsonOptions.signal`
- `GhJsonCommandOptions.signal`
- `GhJsonCommandOptions.shouldAllowNonZeroWithStdout`

Construction and forwarding paths now omit absent `sinceIso` and `signal` values with conditional spreads where `exactOptionalPropertyTypes` requires omission-only semantics. Present-key `undefined` has no domain meaning for these helper options; absence is the only absent state.

Scoped grep evidence for `ts/packages/local-pi-tools/pr-feedback-watch` moved from 10 `?: ... | undefined` single-line matches before the slice to 0 after the slice.

Preserved/deferred categories:

- Preserved `Record<string, string | number | undefined>` query-param values in `buildGitHubRestEndpoint`; this is value-level per-key omission, not an optional-property declaration.
- Deferred mirrored `ts/packages/hosts/pi/src/pr/...` candidates and SDK/kernel/public option surfaces because they are compatibility, input, dependency, or public surfaces outside this internal package slice.

## Objective Impact

This advances the standing roadmap row to continuously reduce semantically redundant optional-undefined declarations with the separate `pr-feedback-watch` cluster called out by the prior `pr-previews` update. It also reinforces the reusable pattern that internal helper option interfaces can be narrowed when call sites either pass concrete values or conditionally omit absent values before forwarding.

Validation evidence:

- `just ts-check` initially exposed expected `exactOptionalPropertyTypes` forwarding fallout, then passed after conditional-spread normalization.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts --filter @local-pi-tools/pr-feedback-watch test` passed (2 files, 29 tests).
- `just ts-format-check` passed.

## Follow-Ups

- Continue treating host/SDK/kernel option surfaces as separate compatibility/input questions rather than batching them with local helper cleanups.
- Future slices can look for another coherent internal result/diagnostic/presentation cluster; do not turn the standing Objective into a repo-wide zero-count sweep.
