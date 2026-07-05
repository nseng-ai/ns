**Direction: CONTEXT.md, CONTEXT-MAP.md, and ADRs stay synced with repo reality.**

Getting to: every package's boundary and canonical terms are recorded; the map's
inventory matches the actual workspace.

What you see now — drift, do not trust blindly: CONTEXT-MAP.md lags the `ns` rename and
container-package restructure (a retired `sdl-land` Present entry, a phantom `@ns/flow-pi`
Planned entry, stale naming-exception and link-path claims); several packages still lack a
recorded context decision.

Operating rule: fix obvious, source-backed drift when it is small, local, and needs no
new terminology/product decision; report or record broader, ambiguous, or decision-bearing
drift instead of silently widening the work.

Avoid: recreating retired Python package paths or retired package identities (`@sdl/*`,
`sdl-sdk`, `sdl-land`, `sdlcc`); auto-generating glossaries; expanding context into
implementation detail or task tracking; inventing new doc frameworks; leaving obvious
current-reality drift untouched solely because the slice began elsewhere.

Active slice: see this objective's roadmap.md.
