---
name: roast-improve-codebase-architecture
disable-model-invocation: true
description: Invoke the Improve codebase architecture Roaster review against a supplied diff or current branch.
---

# Roast: Improve codebase architecture

Use `.sdl/reviews/improve-codebase-architecture.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.sdl/reviews/improve-codebase-architecture.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
roaster review run improve-codebase-architecture
```

In Pi, the equivalent isolated runner surface is `roaster:run:improve-codebase-architecture`.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
roaster exec record-findings --review-key improve-codebase-architecture --format json < findings.json
```

Pipe that JSON envelope to `roaster exec publish-findings` when publishing to GitHub.
