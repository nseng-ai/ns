---
name: roast-thermonuclear-review
disable-model-invocation: true
description: Invoke the Thermonuclear Review Roaster review against a supplied diff or current branch.
---

# Roast: Thermonuclear Review

Use `reviews/thermonuclear-review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run thermonuclear-review
```

If reviewing inline, first read `reviews/thermonuclear-review.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
