**Direction: CONTEXT.md, CONTEXT-MAP.md, and ADRs stay synced with repo reality.**

Getting to: every package's boundary and canonical terms are recorded; the map's
inventory matches the actual workspace.

What you see now — drift, do not trust blindly: the workspace is 29 packages under role
directories (`@nseng-ai/*` except unscoped `nscc` and three `@internal/*` residents; `@ns/*`
scope retired to `@nseng-ai/*` per ADR 0028; seven packages renamed per ADR 0029;
`local/`→`internal/`; new `extensions/` role dir).
CONTEXT-MAP.md was rebaselined to that world but its Inventory Baseline count (26) now
lags the actual 29 (`harness-artifacts`, `ns-init`, `ns-pi-subagents`, then `@internal/ns-dev`
landed since); several packages still lack a recorded context decision and the Planned contexts are unauthored.

Operating rule: fix obvious, source-backed drift when it is small, local, and needs no
new terminology/product decision; report or record broader, ambiguous, or decision-bearing
drift instead of silently widening the work.

Avoid: recreating retired Python package paths or retired identities (`@sdl/*`, `@ns/*`,
`sdl-sdk`, `sdl-land`, `sdlcc`, and pre-ADR-0029 npm names like `core`/`objective`/`roaster`);
auto-generating glossaries; expanding context into implementation detail or task tracking;
inventing new doc frameworks; leaving obvious current-reality drift untouched solely
because the slice began elsewhere.

Active slice: see this objective's roadmap.md.
