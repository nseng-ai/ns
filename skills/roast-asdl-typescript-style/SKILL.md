---
name: roast-asdl-typescript-style
disable-model-invocation: true
description: Invoke the ASDL TypeScript style Roaster review against a supplied diff or current branch.
---

# Roast: ASDL TypeScript style

Use `reviews/asdl-typescript-style.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run asdl-typescript-style
```

If reviewing inline, first read `reviews/asdl-typescript-style.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
