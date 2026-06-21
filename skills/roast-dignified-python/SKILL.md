---
name: roast-dignified-python
disable-model-invocation: true
description: Invoke the Dignified Python Roaster review against a supplied diff or current branch.
---

# Roast: Dignified Python

Use `reviews/dignified-python.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run dignified-python
```

If reviewing inline, first read `reviews/dignified-python.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
