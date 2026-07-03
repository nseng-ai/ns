**Direction: the product is `ji`; `sdl` is the legacy name being cut over.**

Getting to: one name everywhere — `ji` bin, `.ji/`, `/ji:*`, `@nseng-ai/*` packages
with `@nseng-ai/ji` as the publish target, XDG `*/ji/`; lowercase-always `ji` in
CONTEXT.md, rationale and accepted collisions in the rename ADR.

What you see now — the core surfaces (bin, `.ji/`, `/ji:*`, `@ji/*`, XDG) are already
`ji`; remaining `sdl`/`SDL` strings live in vocabulary/prose, sdl-named skills, TS
identifiers, the repo name, and historical records. Legacy, not a convention to follow.

Avoid: introducing new `sdl`-named surfaces, paths (especially `.sdl/`), commands,
packages, or vocabulary; adding sdl→ji compat shims or fallbacks (hard cutover);
mass-editing archived records or historical prose to scrub the old name.

Active slice: see this objective's roadmap.md.
