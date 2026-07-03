# Review Feedback Hardening

## Summary

Review feedback changed the implementation direction from polishing a hard-fail budget preflight to deleting that feature slice. The branch now removes the review-budget policy module, budget-specific models, budget-specific publication rendering, and the custom `LocalReviewFailureResult` path.

Harness prompt assembly owns its defensive caps directly again: `_MAX_PROMPT_DIFF_TOKENS = 120_000` and `_MAX_PROMPT_DIFF_FILE_TOKENS = 40_000`. These caps remain a low-level guardrail, not a higher-level oversized-review policy.

Publication hardening remains intentionally generic. If a nonzero Clinkr envelope already includes structured `data`, parsing preserves `review_name`, `base_ref`, `error_type`, and `message` so formatting can render a review-specific marker such as `<!-- roaster:typescript-style -->`. Real harness/runtime failures from `roaster review run` are ordinary Clinkr failures, not negative review results with extra data.

## Objective Impact

This resolves the review concerns around Clinkr semantics and layer coupling by simplifying the branch. It does not complete the oversized-review policy work; that decision is now deferred/reopened. The retained improvement is narrow publication-side resilience for structured nonzero envelopes.

## Follow-Ups

- Revisit oversized-review policy in a separate slice.
- If failure-with-data is needed for Clinkr, design it explicitly instead of overloading `negative` results.
- Keep semantic sharding parked until deterministic policy and publication semantics are settled.
