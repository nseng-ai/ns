---
name: roast-improve-codebase-architecture
disable-model-invocation: true
description: Invoke the Improve codebase architecture Roaster review against a supplied diff or current branch.
---

# Roast: Improve codebase architecture

Use `reviews/improve-codebase-architecture.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run improve-codebase-architecture
```

If reviewing inline, first read `reviews/improve-codebase-architecture.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
