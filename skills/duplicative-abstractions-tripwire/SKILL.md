---
name: duplicative-abstractions-tripwire
disable-model-invocation: true
description: Invoke the Duplicative abstractions Tripwire against a supplied diff or current branch.
---

# Tripwire: Duplicative abstractions

Use `.sdl/reviews/duplicative-abstractions-tripwire.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.sdl/reviews/duplicative-abstractions-tripwire.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
roaster review run duplicative-abstractions-tripwire
```

In Pi, the equivalent isolated runner surface is `roaster:run:duplicative-abstractions-tripwire`.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
roaster exec record-findings --review-key duplicative-abstractions-tripwire --format json < findings.json
```

Pipe that JSON envelope to `roaster exec publish-findings` when publishing to GitHub.
