## Instructions before responding

Triage and group the feedback above across the entire Graphite stack. Identify shared fixes, per-PR fixes, ordering constraints, and ambiguous feedback.

Default stack feedback policies:

- Address stack feedback at the stack tip by default: if the user asks you to address the stack feedback, put all resulting changes in a single omnibus follow-up PR at the current stack tip rather than rewriting downstack PRs, unless the user explicitly asks for downstack surgery.
- Plan against the current remaining state, not stale original comments: inspect the repository first, identify feedback that is already fixed, and separate remaining work from verification of already-fixed groups.
- Treat automation feedback as stack-level remediation: comments may appear on downstack PRs, but remediation can happen at the tip and be considered against the whole stack.
- After implementation and validation, resolve all automation review threads stack-wide unless the user instructs otherwise.

Do not edit files yet; propose a plan and wait for human confirmation. Do not resolve or reply to GitHub threads during this initial triage prompt; the stack policy above applies only after the user asks you to address the feedback and validation has passed.
