# PR Feedback Parser Context Narrowing

## Summary

Completed a coherent GitHub PR feedback parser/context cleanup slice.

Removed redundant explicit `| undefined` from optional internal parser/failure-context fields for `prNumber`, `threadId`, and `cursorContext` in the PR feedback parser and gateway plumbing, plus the matching test helper shape. Construction paths already model absent context by omitting keys with conditional object spread; the only required follow-up was to avoid passing a present-key `threadId: undefined` from GraphQL pagination before narrowing the option shapes.

Scoped grep evidence for the touched parser/gateway/test files moved from 14 `?: ... | undefined` matches before the slice to 1 remaining match after the slice. The remaining touched-file candidate is `GraphqlPageInfo.endCursor?: string | null | undefined`, which mirrors GraphQL pagination nullability and is preserved.

## Objective Impact

This advances the standing roadmap row to continuously reduce semantically redundant optional-undefined declarations with a review-substantive internal PR feedback cluster. The semantic claim is that PR number, review-thread id, and cursor-context diagnostics are omission-only context fields when absent; present-key `undefined` has no domain meaning after boundary/builders omit absent values.

Validation evidence:

- `just ts-check` passed.
- `just ts-format-check` passed.

Reusable classification findings:

- Internal diagnostic/failure-context fields can be narrowed when every producer uses conditional spreads and consumers already tolerate omission.
- Pagination cursors with `null` from GraphQL remain preserved until a separate boundary-normalization claim exists.
- Options/input surfaces such as env/signal remain preserved.

## Follow-Ups

- Continue preserving external schema mirrors and option/input bags unless a normalized internal type justifies narrowing.
- A future slice could inspect the remaining pr-feedback-watch or pr-previews internal command/model candidates as a separate coherent cluster.
