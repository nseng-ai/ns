---
name: review-improve-codebase-architecture
disable-model-invocation: true
description: Invoke the Improve codebase architecture review against a supplied diff or current branch.
---

# Review: Improve codebase architecture

Use `.ns/reviews/improve-codebase-architecture/review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.ns/reviews/improve-codebase-architecture/review.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
ns reviews review run improve-codebase-architecture
```

In Pi-hosted sessions, use this skill's same review instructions or the same ns command face above; no separate reviews runner alias is required.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
ns reviews exec record-findings --review-key improve-codebase-architecture --format json < findings.json
```

Pipe that JSON envelope to `ns reviews exec publish-findings` when publishing to GitHub.
