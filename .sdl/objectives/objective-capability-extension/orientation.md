**Direction: the objectives domain is moving out of `@sdl/pi` into `@sdl/objective`.**

Getting to: objectives domain lives in `@sdl/objective/api` (gateway-injected Domain Core);
consumers (ccc, sdlcc) import `@sdl/objective/api`; the `@sdl/pi` ↔ `@sdl/ccc` cycle is gone.

What you see now — mid-migration, do not copy: most domain already moved to `@sdl/objective/api`,
but a residual `@sdl/pi/objectives/selection` adapter is still imported by `ccc` and the
`@sdl/pi` ↔ `@sdl/ccc` package cycle is still in place.

Avoid: new imports of `@sdl/pi/objectives/*`; new `@sdl/pi` → `@sdl/ccc` edges.

Active slice: see this objective's roadmap.md.
