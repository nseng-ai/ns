**Direction: CONTEXT.md, CONTEXT-MAP.md, and ADRs stay synced with repo reality.**

Getting to: every package's boundary and canonical terms are recorded; the map's
inventory matches the actual workspace.

What you see now — drift, do not trust blindly: the workspace is 25 `@nseng-ai/*`
packages under role directories (`@ns/*` scope retired to `@nseng-ai/*` per ADR 0028;
seven packages renamed per ADR 0029; `local/`→`internal/`). CONTEXT-MAP.md is already
rebaselined to that world, but several packages still lack a recorded context decision
and the Planned contexts are unauthored.

Operating rule: fix obvious, source-backed drift when it is small, local, and needs no
new terminology/product decision; report or record broader, ambiguous, or decision-bearing
drift instead of silently widening the work.

Avoid: recreating retired Python package paths or retired identities (`@sdl/*`, `@ns/*`,
`sdl-sdk`, `sdl-land`, `sdlcc`, and pre-ADR-0029 npm names like `core`/`objective`/`roaster`);
auto-generating glossaries; expanding context into implementation detail or task tracking;
inventing new doc frameworks; leaving obvious current-reality drift untouched solely
because the slice began elsewhere.

Active slice: see this objective's roadmap.md.
