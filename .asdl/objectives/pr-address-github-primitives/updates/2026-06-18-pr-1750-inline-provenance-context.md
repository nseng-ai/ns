# PR 1750 Inline Provenance Context

## Summary

The motivating review-thread mutation case should be understandable from this Objective without opening PR #1750. External PRs, review threads, transcripts, and issues are useful provenance, but they should not be required reading for future implementation sessions.

In the motivating case, roaster posted inline review-thread findings against a Pi SDL trunk-pull command implementation in `ts/packages/pi-extensions/src/trunk-pull.ts`. The findings were mostly about duplicated command-extension patterns:

- custom git worktree porcelain parsing instead of the shared `parseGitWorktreePorcelain()` helper;
- locally duplicated `ExecResult` and `CommandContext` shapes;
- duplicated `commandSucceeded()` / `formatOutput()` helpers;
- direct `registerCommand()` / `exec()` command wiring instead of the shared `registerCliCommandExtension()` framework.

The agent resolved the feedback by replying directly on each review thread with either a fix explanation or an explicit deferral rationale, then resolving the thread. That required a prompt-level shell loop over GitHub review-thread IDs. For each thread, the agent had to compose and invoke GraphQL mutations equivalent to:

- `addPullRequestReviewThreadReply(threadId, body)` to post the agent's resolution or deferral note;
- `resolveReviewThread(threadId)` to mark the thread resolved.

The important primitive need is not specific to trunk-pull. The repeated mechanics were: discover thread IDs, pair each ID with a reply body, post a reply, resolve the thread, parse mutation results, and handle partial failure if replying succeeds but resolution fails. Those mechanics should live in tested TypeScript primitives rather than in agent-authored shell snippets.

## Objective Impact

The Objective now explicitly treats PRs and review-thread links as provenance rather than required reading. Future updates and completion notes should inline the relevant mechanics, decisions, and before/after comparison instead of only pointing to external PRs.

This sharpens the primitive shape: expose individual review-thread mutation operations and typed results, while leaving batching, classification, and accept-vs-defer policy to callers.

## Follow-Ups

- During inventory, include the concrete PR #1750 mechanics above rather than requiring an implementer to inspect the PR.
- During design, model reply and resolve as separately composable primitives with clear behavior for partial failure in multi-thread workflows.
- During completion, compare what prompt-level GraphQL or shell-loop logic was removed against what remains in caller-owned workflow policy.
