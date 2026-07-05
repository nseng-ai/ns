## Instructions before responding

Triage and group the feedback above across the current Graphite downstack. Identify shared fixes, per-PR fixes, ordering constraints, and ambiguous feedback. Ask clarifying questions only for ambiguity, high-risk changes, product/design decisions, broad refactors, or dirty-tree conflicts.

Default stack feedback policies:

{{common-feedback-policy}}

- Address stack feedback in a single omnibus follow-up PR at the current branch by default rather than rewriting downstack PRs, unless the user explicitly asks for downstack surgery.
- Plan against the current remaining state, not stale original comments: identify feedback that is already fixed, and separate remaining work from verification of already-fixed groups.
- Treat automation feedback as downstack-level remediation: comments may appear on downstack PRs, but remediation can happen in the omnibus follow-up PR and be considered against the downloaded downstack.
- For straightforward fixes, edit the minimal files and run appropriate validation. If validation passes, close all confirmed automation review threads stack-wide with `ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID>"]}' --format json`; include `--body <BODY>` when a reply is useful. Use single-thread `reply-review-thread` and `resolve-review-thread` primitives only for one-offs, and do not use raw `gh api graphql` for review-thread resolve/reply mutations.
