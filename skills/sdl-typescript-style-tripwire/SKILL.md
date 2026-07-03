---
name: sdl-typescript-style-tripwire
disable-model-invocation: true
description: Invoke the SDL TypeScript style Tripwire against a supplied diff or current branch.
---

# Tripwire: SDL TypeScript style

Use `.ji/reviews/sdl-typescript-style-tripwire/review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

If running inside this repository and the SDL command face is available, prefer:

```bash
ji roaster review run sdl-typescript-style-tripwire
```

If reviewing inline, first read `.ji/reviews/sdl-typescript-style-tripwire/review.md`, then apply that review definition exactly to the supplied diff or current branch changes. Keep findings grounded in the diff.
