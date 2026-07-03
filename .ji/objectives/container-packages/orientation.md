**Direction: published packages become container packages of declared subpackages; new architecture granularity lives at `sdl.subpackages`, not in new published packages.**

Getting to: every workspace package has a recorded containerize/keep-flat decision; mid-conversion packages explicitly declare a remainder subpackage for unclaimed code; container packages are properly formed (no remainder — all code in a named subpackage); the topology report and TypeScript style guard both read `sdl.subpackages`. Vocabulary in root `CONTEXT.md`; end-state ADR pending.

What you see now — transitional, do not copy: convention-based auto-discovery of `src/<dir>/` topology circles; `@sdl/core` mid-pilot; most packages undeclared.

Avoid: creating a new published package for an internal boundary a subpackage can express; adding code to a declaring package outside every declared unit; hardcoding package/circle splits in report or guard code instead of the manifest.

Active slice: see this objective's roadmap.md.
