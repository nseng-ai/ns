## Instructions before responding

Triage and group the feedback above across the current Graphite downstack. Identify shared fixes, per-PR fixes, ordering constraints, and ambiguous feedback.

Default stack feedback policies:

- Address stack feedback at the current branch by default: if the user asks you to address the feedback, put all resulting changes in a single omnibus follow-up PR at the current branch rather than rewriting downstack PRs, unless the user explicitly asks for downstack surgery.
- Plan against the current remaining state, not stale original comments: inspect the repository first, identify feedback that is already fixed, and separate remaining work from verification of already-fixed groups.
- Treat automation feedback as downstack-level remediation: comments may appear on downstack PRs, but remediation can happen at the current branch and be considered against the downloaded downstack.
- After implementation and validation, resolve all automation review threads stack-wide with `sdl address exec resolve-review-thread --thread-id <THREAD_ID> --format json` unless the user instructs otherwise.
- Use `sdl address exec reply-review-thread --thread-id <THREAD_ID> --body <BODY> --format json` for review-thread replies after validation.

Do not edit files yet; propose a plan and wait for human confirmation. Do not resolve or reply to GitHub threads during this initial triage prompt; the stack policy above applies only after the user asks you to address the feedback, current repository state has been inspected, and validation has passed. Do not use raw `gh api graphql` for review-thread resolve/reply mutations.
