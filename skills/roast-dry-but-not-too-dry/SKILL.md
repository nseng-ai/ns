---
name: roast-dry-but-not-too-dry
disable-model-invocation: true
description: Invoke the DRY but not too DRY Roaster review against a supplied diff or current branch.
---

# Roast: DRY but not too DRY

Use `reviews/dry-but-not-too-dry.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run dry-but-not-too-dry
```

If reviewing inline, first read `reviews/dry-but-not-too-dry.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
