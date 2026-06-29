---
name: roast-thermonuclear-review
disable-model-invocation: true
description: Invoke the Thermonuclear Review Roaster review against a supplied diff or current branch.
---

# Roast: Thermonuclear Review

Use `.sdl/reviews/thermonuclear-review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.sdl/reviews/thermonuclear-review.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
sdl roaster review run thermonuclear-review
```

In Pi, the equivalent isolated runner surface is `roaster:run:thermonuclear-review`.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
sdl roaster exec record-findings --review-key thermonuclear-review --format json < findings.json
```

Pipe that JSON envelope to `sdl roaster exec publish-findings` when publishing to GitHub.
