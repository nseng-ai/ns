# asdl-slots Release Preview Surface Established

## Summary

`asdl-slots` now has the first release/free/gc architecture slice: presentation-neutral release planning and cleanup helpers for explicit slot release previews, plus GC preview composition for dry-run and confirmation paths.

The slice keeps CLI confirmation, rendering, Clinkr result models, and JSON behavior in the CLI layer while moving shared cleanup policy and dry-run preview composition toward lifecycle code.

Verification so far: targeted release/free/gc lifecycle tests passed, affected `slot free`/`slot gc` scenario tests passed, and adjacent checkout lifecycle/scenario regression tests passed. Full repository validation remains to be run after this Objective update.

## Objective Impact

This moves `Deepen asdl-slots release/free/gc workflow` from unstarted to in progress. It establishes the release planning/dry-run surface requested by the roadmap and preserves current dry-run/confirmation behavior, including GC dirty-worktree dry-run semantics.

The row is not yet shipped because free/gc execution flow, cleanup accounting across mutation paths, and any scenario-test demotion remain intentionally follow-up work.

## Follow-Ups

- Consolidate more of free/gc execution flow only after preserving partial-failure semantics.
- Decide whether the release/free/gc row is complete after execution consolidation, or whether the planning surface is sufficient and the remaining work should be parked with a reason.
- Run the full repository gate and record any materially different validation result in a later update if it changes this Objective's confidence.
