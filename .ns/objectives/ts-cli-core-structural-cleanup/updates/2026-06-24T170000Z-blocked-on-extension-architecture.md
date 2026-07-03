# Blocked on SDL Extension Architecture Rebaseline

## Summary

Remaining uncompleted work in this Objective is now explicitly sequenced behind `sdl-extension-architecture`. The extension architecture endgame owns the ADR 0009 foundation — `@sdl/extension-kit`, Peer API conventions, `@sdl/domain-primitives-transitional`, and the per-capability migration shape — that determines where several cleanup/deepening rows should ultimately live.

The completed structural cleanup rows remain valid history. The pause applies to starting new uncompleted rows or decomposing this Objective further before the extension architecture foundation has landed enough to rebaseline.

## Objective Impact

`objective.md` now states that remaining cleanup/deepening work is paused behind the active `sdl-extension-architecture` endgame. `roadmap.md` now carries a blocked/sequencing note above `## Work`, and the absorbed architecture-deepening section calls out that those rows are especially subject to reclassification.

The intended future flow is: advance `sdl-extension-architecture` first, then rebaseline this Objective into neutral structural cleanup, capability-owned migration work, or obsolete debt. This avoids decomposing or implementing rows that may be invalidated, moved, or reframed by capability-extension migration.

## Follow-Ups

- Do not pick up new open rows from this Objective until the extension architecture foundation has landed enough to rebaseline.
- After that point, refresh this roadmap and explicitly classify each remaining row as neutral cleanup, capability-extension work, or no-longer-needed.
- If urgent bugfix work touches one of these areas before the rebaseline, keep it narrow and avoid making capability-layering decisions here.
