---
name: roast-thermonuclear-review
disable-model-invocation: true
description: Invoke the Thermonuclear Review Roaster review against a supplied diff or current branch.
---

# Roast: Thermonuclear Review

Use `.ji/reviews/thermonuclear-review/review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.ji/reviews/thermonuclear-review/review.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
ji roaster review run thermonuclear-review
```

In Pi-hosted sessions, use this skill's same review instructions or the same ji command face above; no separate Roaster runner alias is required.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
ji roaster exec record-findings --review-key thermonuclear-review --format json < findings.json
```

Pipe that JSON envelope to `ji roaster exec publish-findings` when publishing to GitHub.
