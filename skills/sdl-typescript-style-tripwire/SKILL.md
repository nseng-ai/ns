---
name: sdl-typescript-style-tripwire
disable-model-invocation: true
description: Invoke the SDL TypeScript style Tripwire against a supplied diff or current branch.
---

# Tripwire: SDL TypeScript style

Use `.sdl/reviews/sdl-typescript-style-tripwire.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the Roaster CLI is available, prefer:

```bash
sdl roaster review run sdl-typescript-style-tripwire
```

If reviewing inline, first read `.sdl/reviews/sdl-typescript-style-tripwire.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
