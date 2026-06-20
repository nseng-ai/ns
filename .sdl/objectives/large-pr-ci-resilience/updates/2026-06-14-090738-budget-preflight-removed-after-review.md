# Budget Preflight Removed After Review

## Summary

The first hard-fail budget preflight implementation was removed after code-quality review. That slice had introduced a `roaster.review_budget` policy module, `ReviewBudgetFacts`, `LocalReviewFailureResult`, and custom negative Clinkr envelopes for budget and post-metadata harness failures. Review found that shape mixed product policy into lower-level harness prompt assembly and treated real harness/runtime failures as `negative` results.

The branch now keeps only small generic publication hardening: when a nonzero roaster Clinkr envelope already contains structured `data`, findings publication preserves `review_name`, `base_ref`, `error_type`, and `message` so summary comments can use review-specific markers. Inline posting still no-ops before GitHub file/comment reads for any error payload or empty findings payload.

Harness prompt assembly retains direct defensive caps owned by the harness layer. Roaster no longer hard-fails oversized diffs before invoking the harness on this branch.

## Objective Impact

The oversized-review policy is reopened/deferred. This branch no longer claims to complete the prompt-too-long resilience slice through deterministic budget preflight. The remaining durable improvement is consumer-side hardening for structured nonzero publication metadata.

## Follow-Ups

- Decide a future oversized-review policy separately: hard-fail, skip, sharding, or another bounded review strategy.
- If a producer-side metadata result is needed later, design it as an explicit Clinkr capability rather than laundering runtime failures through `negative` results.
- Keep semantic sharding parked until the product policy is settled.
