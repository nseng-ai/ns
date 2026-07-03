---
name: reinvented-abstractions-tripwire
disable-model-invocation: true
description: Invoke the Reinvented Abstractions Tripwire against a supplied diff or current branch.
---

# Tripwire: Reinvented abstractions

Use `.ji/reviews/reinvented-abstractions-tripwire/review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.ji/reviews/reinvented-abstractions-tripwire/review.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
ji roaster review run reinvented-abstractions-tripwire
```

In Pi-hosted sessions, use this skill's same review instructions or the same ji command face above; no separate Roaster runner alias is required.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
ji roaster exec record-findings --review-key reinvented-abstractions-tripwire --format json < findings.json
```

Pipe that JSON envelope to `ji roaster exec publish-findings` when publishing to GitHub.
