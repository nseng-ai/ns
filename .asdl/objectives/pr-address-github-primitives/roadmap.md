# Roadmap

## Work

- [ ] Inventory concrete GitHub feedback interactions used by PR-address and the planned stack variant.
  - Include `download-feedback`, `PrAddressGitHubGateway`, review-thread pagination/comment hydration, PR reviews, discussion comments, PR lookup, and direct review-thread mutation needs such as replying to and resolving review threads.
  - Evidence: summarize the current duplicated or prompt-level GraphQL/`gh` mechanics that the primitive layer is meant to remove, including the observed `addPullRequestReviewThreadReply` + `resolveReviewThread` shell-loop pattern used during PR #1750 feedback triage.

- [ ] Design the narrow `@asdl/core` primitive surface for PR feedback operations.
  - Favor small composable operations over a workflow-level download API.
  - Decide the result/failure vocabulary, exported types, pagination boundaries, and whether reply-thread and resolve-thread mutations belong in the first slice.
  - Prefer primitive operations such as `replyToReviewThread(threadId, body)` and `resolveReviewThread(threadId)` over a roaster- or PR-address-specific “reply and resolve all feedback” workflow.

- [ ] Implement and test the shared GitHub PR feedback primitives.
  - Cover successful parsing, nonzero `gh` results, startup errors, malformed JSON, pagination defects, reply mutation outcomes, and resolve mutation outcomes when included.
  - Evidence: tests demonstrate callers can compose primitives without embedding GraphQL text or shell loops.

- [ ] Adapt PR-address to consume the primitive layer while preserving local workflow behavior.
  - Keep filtering, feedback snapshot selection, and Markdown rendering in PR-address.
  - Ensure `download-feedback` remains compatible and the adapter shape can be reused by a stack feedback variant.

- [ ] Capture primitive-pushdown evidence for follow-on documentation work.
  - Record what complexity moved from prompts/workflows into tested primitives, what composition remains flexible, and what tradeoffs or failed assumptions appeared.

## Parked

- [ ] Evolve CLI-pushdown documentation to emphasize reducing systemic complexity through reusable primitives rather than only pushing down specific Markdown chunks.
  - Use evidence from this Objective before making durable guidance changes.

- [ ] Broaden GitHub primitives beyond PR feedback, such as checks, mergeability, landing, or release operations.

- [ ] Replace all existing package-local GitHub gateways with one universal GitHub client.
