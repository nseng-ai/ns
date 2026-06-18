# PR Thread Mutation Evidence

## Summary

PR #1750 feedback triage required prompt-level `gh api graphql` mutations to reply to and resolve review threads. The agent session hand-rolled GraphQL for `addPullRequestReviewThreadReply` and `resolveReviewThread`, iterated over thread IDs, and managed mutation invocation from shell rather than through a tested TypeScript primitive.

This is concrete evidence that PR feedback workflows need composable review-thread mutation primitives, not only read-side feedback download primitives.

## Objective Impact

The Objective scope, completion criteria, assumptions, open questions, and roadmap now explicitly include review-thread reply and resolve mutations. The intended primitive shape remains small and composable: expose operations such as replying to a review thread and resolving a review thread, while leaving workflow-specific batching or triage policy above the primitive layer.

## Follow-Ups

- During inventory, include the observed `addPullRequestReviewThreadReply` + `resolveReviewThread` shell-loop pattern as prompt-level GitHub mechanics to eliminate.
- During design, decide whether thread reply and thread resolution ship in the first primitive slice or immediately after read-side extraction.
- During implementation, test nonzero `gh`, startup errors, malformed GraphQL responses, and missing mutation payloads for both reply and resolve operations.
