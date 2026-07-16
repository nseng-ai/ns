# Semantic Update: branch-pr-checks enrichment complete

## Summary

`ns address exec branch-pr-checks` now returns complete branch-to-PR triage facts. The GitHub adapter verifies the last PR commit OID against `headRefOid`, returns `head_commit_committed_at`, and completely follows independent status-context and review-thread continuations before normalizing or classifying. Check normalization runs after all pages are collected so workflow-attempt deduplication crosses page boundaries.

The additive machine result includes `pr_status`, `review_threads`, per-check `freshness`, and exact `is_trailing` recognition while preserving mapping `status`, raw counts/check fields, input order, and coarse exits. The standalone `pr-checks` contract remains unchanged. The package README and real Zod/`--json-schema` surface document the additions and committed-time limitation.

## Objective Impact

The roadmap's `branch-pr-checks` enrichment row is complete. Focused capability-kit tests pass 314 tests, focused PR Feedback tests pass 142 tests, TypeScript typecheck passes, Objective validation passes, and `--json-schema` publishes all five additive field groups. The focused suites cover the status/freshness/trailing policy matrix, runtime and wait-for-checks schema compatibility, head-OID validation, continuation cursor/parse/GraphQL/gh failures, and cross-page workflow-attempt deduplication. A same-SHA re-push remains unobservable because GitHub exposes `committedDate`, not commit-level push time.

## Follow-Ups

Keep the failed-check log excerpt command, final `code-fix-gh-stack` rewrite, and push-down audit roadmap rows open. The later Flow migration remains owned by its existing downstream Objective.
