---
name: ns-typescript-style-tripwire
disable-model-invocation: true
description: Invoke the ns TypeScript style Tripwire against a supplied diff or current branch.
---

# Tripwire: ns TypeScript style

Use `.ns/reviews/ns-typescript-style-tripwire/review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the ns command face is available, prefer:

```bash
ns reviews review run ns-typescript-style-tripwire
```

If reviewing inline, first read `.ns/reviews/ns-typescript-style-tripwire/review.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
