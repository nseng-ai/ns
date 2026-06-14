# Review Feedback Hardening

## Summary

Thermonuclear review feedback was addressed after the initial hard-fail implementation. The review-budget policy is now the source of truth for the harness assembly caps: default total diff budget remains `150_000` estimated tokens, the per-file budget is explicit at `40_000` estimated tokens, and tests pin the harness caps to the default review budget so eligible reviews cannot silently enter prompt truncation.

Post-metadata harness/runtime failures are now routed through structured negative review results as well, not only budget failures. This preserves `review_name`, `model`, and `base_ref` for non-budget failures such as unsupported model or harness execution failure, preventing matrix jobs from collapsing into `roaster:unknown` after review metadata is known.

The cleanup also replaced parallel budget-specific publication fields with a nested budget facts object, removed unused failure `review_path`, and shared the oversized-review next-step prose between workflow and comment rendering.

Verification: targeted roaster tests covering budget/workflow/publication/harness/CLI scenarios passed; full `just` passed.

## Objective Impact

This resolves the two blocker gaps found in review: the silent-truncation window between budget and harness caps, and the remaining `roaster:unknown` identity collapse for non-budget post-metadata failures. The core hard-fail budget slice is now stronger and better aligned with the Objective's metadata-preservation requirement.

Live GitHub Actions behavior on an oversized PR remains a parked post-merge verification item, and broader non-review GitHub diff/file discovery hardening remains open if another path depends on a 300-file-limited diff endpoint.

## Follow-Ups

- Verify the submitted PR stack in GitHub/Graphite after updating PRs with these review-feedback fixes.
- Re-check an oversized synthetic or real PR workflow after merge to confirm live check/comment behavior.
- Keep semantic sharding parked until deterministic budget and publication semantics are proven in CI.
