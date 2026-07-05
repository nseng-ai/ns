## Instructions before responding

Triage and group the feedback above. Identify likely code, docs, and test changes. Ask clarifying questions only for ambiguity, high-risk changes, product/design decisions, broad refactors, or dirty-tree conflicts.

Default single-PR feedback policies:

{{common-feedback-policy}}

- Apply AUTO fixes directly on the immediate PR branch/current checkout; do not create an omnibus follow-up branch for single-PR feedback unless the human explicitly asks.
- If all downloaded feedback was handled by AUTO fixes and no ambiguous/complex/high-risk feedback remains, resubmit the PR with `ns flow submit` before the final summary; if submission fails, report that failure.
