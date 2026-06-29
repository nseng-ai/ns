# Placement-Gate Narrative Reconciled

## Summary

The durable Objective narrative was reconciled with the ADR 0019 placement gate and the corrected dependency evidence from the package-placement branch.

PR evidence:

- PR #2369: `Document the gateway package-placement gate` — open PR that adds ADR 0019, cross-references ADR 0018/CONTEXT.md, records the placement-gate assessment, and removes the stale `@sdl/graphite` dependency from `@sdl/kernel`'s manifest/lockfile.

Important correction: the prior Semantic Update `2026-06-29T122508Z-package-placement-gate-documented.md` said `graphite`/`cmux` were cycle-sensitive because the kernel depended on graphite. That was historical branch evidence, but the edge was later checked and found to be a stale manifest-only dependency: no kernel `.ts` imported `@sdl/graphite`. PR #2369 removes that dependency, and ADR 0019 now records that graphite/cmux are not cycle-sensitive on the current graph. Existing updates remain immutable; this update records the corrected durable meaning.

## Objective Impact

The Objective no longer says every gateway real implementation must be folded wholesale into `@sdl/capability-kit`. The durable target is now:

- `@sdl/core` doors are still deleted atomically when consumers move.
- `@sdl/capability-kit/<domain>` owns capability-facing seams, interfaces, fakes/testing support, and light adapters.
- Large reusable real implementations may remain in standalone packages when ADR 0019's placement gate justifies it.
- `graphite` and `cmux` decisions are now kit-size/consumer-semantics decisions, not cycle-driven decisions, unless a future graph check finds a new live edge.

`objective.md`, `roadmap.md`, and `orientation.md` were updated to reflect this package-placement refinement so future `git`, `exec`, GitHub, graphite/cmux, SDK-service, and runtime-harness slices start from the corrected rule rather than the earlier all-reals-in-kit wording.

## Follow-Ups

- Start the next `git` slice from the updated roadmap wording: move the capability-facing `git` seam/fake/testing support out of `@sdl/core/git`, decide whether `RealGitGateway` remains standalone by ADR 0019's gate, repoint consumers, and delete the old `@sdl/core/git` and `@sdl/core/git/testing` doors in the same slice.
- Keep re-checking live dependency graphs during future placement decisions, but do not treat the removed kernel→graphite manifest edge as live evidence.
- Existing Semantic Updates are immutable; use this update as the durable correction for the earlier cycle-sensitivity wording.
