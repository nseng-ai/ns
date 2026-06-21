---
name: roast-sdl-typescript-style
disable-model-invocation: true
description: Invoke the SDL TypeScript style Roaster review against a supplied diff or current branch.
---

# Roast: SDL TypeScript style

Use `reviews/sdl-typescript-style.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
roaster review run sdl-typescript-style
```

If reviewing inline, first read `reviews/sdl-typescript-style.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
