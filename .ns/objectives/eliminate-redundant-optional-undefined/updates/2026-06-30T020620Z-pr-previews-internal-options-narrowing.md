# PR Previews Internal Options Narrowing

## Summary

Completed a coherent `pr-previews` internal command/view cleanup slice.

Removed redundant explicit `| undefined` from omission-only optional properties in the PR preview extension helpers, feedback command helper options, checks view options, and checks log-loading helper options. Construction paths already omit absent values or normalize omission locally: optional PR number is only present for the positive integer parse path, `allowFailureData` callers pass `true` or omit it, checks view options default omitted log loaders/timeouts, and internal log-loading cancellation helpers already accept absence and now forward signals with conditional spreads instead of present-key `undefined`.

Scoped grep evidence for `ts/packages/local-pi-tools/pr-previews` moved from 8 `?: ... | undefined` single-line matches before the slice to 1 after the slice. The remaining single-line candidate is `ExtensionContext.modelRegistry?: PiModelRegistryLike | undefined`, preserved as an extension context compatibility surface rather than narrowed as part of this internal helper slice. The multi-line `onLoadLogs` candidate in `PrPreviewChecksViewOptions` was also narrowed even though it was not counted by the single-line grep pattern.

## Objective Impact

This advances the standing roadmap row to continuously reduce semantically redundant optional-undefined declarations with a review-substantive `pr-previews` internal cluster. The semantic claim is that these helper/result/view option fields use omission as the absent state; present-key `undefined` has no domain meaning once forwarding sites omit absent values with conditional spread.

Validation evidence:

- `just ts-check` passed.
- `just ts-format-check` initially failed on formatter wrapping, then `just ts-format-fix` was run and `just ts-format-check` passed.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts --filter @local-pi-tools/pr-previews test` passed (4 files, 29 tests).

Reusable classification findings:

- Internal command helper options can be narrowed when all call sites either pass a concrete value or omit the property and forwarding is updated to conditional spread.
- View constructor option fields with local defaults are safe omission-only candidates when tests/callers omit rather than depend on present-key `undefined`.
- Extension context compatibility fields such as `modelRegistry` remain preserved unless a separate boundary-normalization claim exists.

## Follow-Ups

- Treat `pr-feedback-watch` as a separate coherent slice; do not batch it with this `pr-previews` cleanup just because the syntax matches.
- Continue preserving extension/context compatibility surfaces unless a future slice proves a stricter internal boundary.
