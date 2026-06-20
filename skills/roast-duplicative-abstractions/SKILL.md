---
name: roast-duplicative-abstractions
disable-model-invocation: true
description: Invoke the Duplicative abstractions Roaster review against a supplied diff or current branch.
---

# Roast: Duplicative abstractions

Use `reviews/duplicative-abstractions.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run duplicative-abstractions
```

If reviewing inline, first read `reviews/duplicative-abstractions.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
