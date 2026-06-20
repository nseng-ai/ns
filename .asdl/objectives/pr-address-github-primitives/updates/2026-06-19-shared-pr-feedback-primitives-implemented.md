# Shared PR Feedback Primitives Implemented

## Summary

The PR feedback mechanics formerly embedded in `pr-address` now live in a shared `@asdl/core/github-pr-feedback` primitive surface. The new core surface covers PR lookup/details, open PR listing, PR-level reviews, hydrated review threads with nested comment pagination, discussion comments, and separate review-thread mutation primitives for replying to and resolving a thread.

`pr-address` now adapts its existing package-local gateway to the core primitive gateway so downloader policy stays local: resolved-thread filtering, feedback snapshot selection, Markdown rendering, empty-review filtering, and automation-comment filtering remain in `pr-address`. A new hidden primitive exec surface exposes structured agent plumbing commands: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`, `reply-review-thread`, and `resolve-review-thread`.

Validation evidence: focused `asdl-core` tests, full `pr-address` tests, the `pi-extensions` PR feedback test, full TypeScript typecheck, legacy typecheck, lint, formatting check, and full TypeScript Vitest suite passed.

## Objective Impact

All active roadmap rows are complete. The implementation demonstrates the intended primitive pushdown: GraphQL query text, `gh` command construction, JSON parsing, GraphQL error handling, pagination defects, mutation response validation, and command diagnostics are in tested TypeScript source rather than agent-authored shell snippets or prompt-level logic.

The primitive boundary stayed narrow. Core exposes separate operations and structured `Result<T, GithubPrFeedbackFailure>` failures; it does not expose a monolithic feedback download, stack download, batch reply, or reply-and-resolve workflow API. Caller-side composition remains flexible, and a test documents preserving a successful reply when a subsequent resolve fails so callers can avoid blind double-post retries.

The Objective was closed because the active completion criteria are satisfied and parked follow-ups are intentionally outside this Objective.

## Follow-Ups

- Use this implementation as evidence for the parked CLI-pushdown documentation follow-up: reusable primitives reduced duplicated command/query mechanics while leaving workflow policy above the primitive layer.
- Keep `/pr:download-stack-feedback` CLI-composed for now; direct TypeScript stack composition can be a future slice if needed.
- Do not broaden the core module into a general GitHub SDK unless a future Objective identifies concrete PR feedback-adjacent operations that need the shared boundary.
