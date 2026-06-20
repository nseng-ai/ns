# Roadmap

## Work

- [x] Inventory concrete GitHub feedback interactions used by PR-address and the planned stack variant.
  - Evidence: the implementation moved `download-feedback`'s PR lookup, open PR listing, PR-level reviews, hydrated review-thread pagination/comment hydration, and discussion comment fetching out of `pr-address`'s real gateway and into `@asdl/core/github-pr-feedback`.
  - Evidence: the mutation need from the motivating shell-loop case is represented as separate tested primitives, `replyToReviewThread(threadId, body)` and `resolveReviewThread(threadId)`.

- [x] Design the narrow `@asdl/core` primitive surface for PR feedback operations.
  - Evidence: the exported surface is primitive-shaped: PR lookup/details, open PRs, reviews, review threads, discussion comments, reply, and resolve. It does not expose a monolithic download, stack download, batch reply, or reply-and-resolve workflow API.
  - Evidence: failures use structured `GithubPrFeedbackFailure` values over `Result<T, GithubPrFeedbackFailure>`, preserving command metadata, stdout/stderr, exit code/startup, GraphQL errors, Zod errors, cursor context, PR number, and thread ID where applicable.

- [x] Implement and test the shared GitHub PR feedback primitives.
  - Evidence: `ts/packages/asdl-core/src/github-pr-feedback.ts` owns the `gh` command shapes, review-thread GraphQL, nested pagination, GraphQL error handling, parse validation, and reply/resolve mutation queries.
  - Verification: `tsgo`, legacy `tsc`, oxlint, oxfmt check, full TypeScript Vitest suite, and focused package tests passed.

- [x] Adapt PR-address to consume the primitive layer while preserving local workflow behavior.
  - Evidence: `RealPrAddressGitHubGateway` is now an adapter over `GithubPrFeedbackGateway`; `download-feedback` keeps filtering, snapshot selection, and Markdown rendering in `pr-address`.
  - Evidence: `pr-address` scenario tests and `pi-extensions` PR download-feedback tests passed, preserving existing downloader and stack composition contracts.

- [x] Capture primitive-pushdown evidence for follow-on documentation work.
  - Evidence: hidden `pr-address exec` primitive commands now expose structured read and mutation operations (`pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`, `reply-review-thread`, `resolve-review-thread`) without resurrecting retired addressing workflow commands.
  - Evidence: tests document partial reply-success / resolve-failure composition so callers can preserve a posted reply and avoid blind double-post retries.

## Parked

- [ ] Evolve CLI-pushdown documentation to emphasize reducing systemic complexity through reusable primitives rather than only pushing down specific Markdown chunks.
  - Use evidence from this Objective before making durable guidance changes.

- [ ] Broaden GitHub primitives beyond PR feedback, such as checks, mergeability, landing, or release operations.

- [ ] Replace all existing package-local GitHub gateways with one universal GitHub client.
