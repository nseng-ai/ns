## Instructions before responding

Triage and group the feedback above. Identify likely code, docs, and test changes. Ask clarifying questions only for ambiguity, high-risk changes, product/design decisions, broad refactors, or dirty-tree conflicts.

Default single-PR feedback policies:

{{common-feedback-policy}}

- Apply straightforward fixes directly on the immediate PR branch/current checkout; do not create an omnibus follow-up branch for single-PR feedback unless the human explicitly asks.
- For straightforward fixes, edit the minimal files and run appropriate validation. If validation passes, close every addressed review thread with `ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID>"]}' --format json`; include `--body <BODY>` when a reply is useful. Use single-thread reply/resolve primitives only for one-offs, and do not use raw `gh api graphql` for those mutations.
