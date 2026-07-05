## Instructions before responding

Triage and group the feedback above across the current Graphite downstack. Identify shared fixes, per-PR fixes, ordering constraints, and ambiguous feedback. Ask clarifying questions only for ambiguity, high-risk changes, product/design decisions, broad refactors, or dirty-tree conflicts.

Default stack feedback policies:

{{common-feedback-policy}}

- Address stack feedback in a single omnibus follow-up PR at the current branch by default rather than rewriting downstack PRs, unless the user explicitly asks for downstack surgery.
- Plan against the current remaining state, not stale original comments: identify feedback that is already fixed, and separate remaining work from verification of already-fixed groups.
- Treat automation feedback as downstack-level remediation: comments may appear on downstack PRs, but remediation can happen in the omnibus follow-up PR and be considered against the downloaded downstack.
- If all downloaded stack feedback was handled by AUTO fixes and no ambiguous/complex/high-risk feedback remains, submit the omnibus follow-up/current stack with `ns flow submit` before the final summary; if submission fails, report that failure.
