# PR Check HasMore Boundaries

## Summary

Tightened the PR check-count `hasMore` result boundary so normalized check tally and PR Address payload models always carry an explicit boolean instead of omitting false.

Targeted evidence:

- Before: `GithubCheckTally.hasMore` and `PrChecksCountsPayload.hasMore` were typed as `?: boolean | undefined` result/payload fields.
- After: both result fields are required `hasMore: boolean`; the targeted result-model count is 0.
- `normalizeGithubStatusChecks` now initializes `GithubCheckTally.hasMore` from `options.hasMore === true`, so missing/undefined loose input normalizes to `false` at the boundary.
- `prChecksPayload` always emits `counts.hasMore`, and the PR Address operation schema now requires `hasMore: z.boolean()`.

## Objective Impact

This advances the active “Clean small internally constructed diagnostics/result models” row for the check-count sub-slice. The semantic behavior changed intentionally: PR check result JSON that previously omitted `hasMore` for no additional checks now includes `hasMore: false`.

Preserved/deferred boundaries:

- `tallyGithubStatusChecks` and `normalizeGithubStatusChecks` keep `options: { hasMore?: boolean | undefined }` as a loose input/options boundary.
- Test fixture helper inputs may still accept `hasMore?: boolean | undefined`, but their returned `GithubStatusChecks` values now include required booleans.
- Existing non-slice optional-undefined fields remain: `GithubWorktreePrStatus.url?: string | undefined` as a GitHub response compatibility surface and `CollectPrChecksOptions.prNumber?: number | undefined` as an options bag.
- Kernel command/extension diagnostics and areg replacement info remain unresolved named areas for this roadmap row.

Validation run:

```bash
pnpm --dir ts --filter @sdl/core run check
pnpm --dir ts --filter @sdl/core run test
pnpm --dir ts --filter @sdl/address run check
pnpm --dir ts --filter @sdl/address run test
just ts-check
just ts-test
just dprint-check
```

All passed.

## Follow-Ups

Continue the small diagnostics/result-model row with kernel command/extension diagnostics and areg replacement info, then rebaseline remaining optional-undefined candidates and preserved/deferred rationale before Objective closure.
