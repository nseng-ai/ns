# Attached Plan Reader Implemented

## Summary

- Added `ts/packages/pi-extensions/src/brmem-plans/attached-plan.ts` as the planning-layer reader for attached implementation plans.
- The reader refuses detached HEAD and trunk/default branches before any Branch Memory read, lists canonical `brmem-plans` entries, selects a requested or branch-segment key deterministically, parses `brmem get --format json`, and preserves the full plan content in the generated implementation prompt.
- `/impl-planned-branch [key-or-slug]` now loads the attached plan, presents branch/namespace/key/ref/byte evidence, and sends one authoritative implementation prompt instead of dispatching `/skill:brmem-plan-impl`.
- `skills/brmem-plan-impl/SKILL.md` was thinned to point at `/impl-planned-branch` and to preserve read-only, checklist, and stop-on-ambiguity guidance.
- Verification: `bun run --cwd ts check`, `bun run --cwd ts test`, and `just dprint-check` passed. PR evidence was unavailable; local working-tree evidence against Graphite parent `update-planned-branch-layer-planning-interface` was sufficient for this update.

## Objective Impact

- The read-path asymmetry called out by the baseline update is now materially reduced: attached-plan loading is owned by tested TypeScript code rather than shell workflow prose.
- The roadmap item for the tested attached-plan reader is complete for this slice, and Branch Memory attachment isolation is further in progress through a focused read-path seam that avoids a broad generic Adapter extraction.
- The Objective remains open because broader module naming, skill naming cleanup, planned-branch documentation relocation, and explicit human closure are still unresolved.

## Follow-Ups

- Decide whether to rename `brmem-plan-impl` or keep it as a compatibility skill now that `/impl-planned-branch` owns loading.
- Move planned-branch workflow docs out of `packages/brmem/README.md` into the planning/Pi extension documentation surface.
- Add the promised cross-reference or disposition update in `pi-extension-deepening`.
