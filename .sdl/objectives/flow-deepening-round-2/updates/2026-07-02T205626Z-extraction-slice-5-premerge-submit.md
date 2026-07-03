# Extraction slice 5 landed — pre-merge submit/restack through the Graphite gateway

## Summary

Fifth autonomous slice of the extraction migration row (runner step,
commit `e7f834fdd` on `flow-map-slice5-premerge-submit-gateway`, stacked
on `flow-map-slice4-backup-refs-gateway`). Three-file diff, all flow src.

- `LandGraphiteGateway.prepareSubmitUpdate` and `prepareRestackForSubmit`
  are no longer no-op stubs: they are real operations backed by the
  operation-shaped Graphite command channel, preserving per-command
  start/finish streaming per the settled progress-reporting decision.
- Pre-merge submit/restack orchestration calls the gateway methods and
  reuses one passed `LandContext`. Parent-verified: `pre-merge-submit.ts`
  contains zero `createLandContext` calls — the second mid-execution
  boundary crossing the inventory flagged is gone; remaining constructors
  are the expected entry points (`landing-dispatch.ts`,
  `landing-coordination.ts`, `landing-plan.ts`,
  `landing-plan-execution.ts`).
- Mutation argv freeze held with zero relaxation: no scenario assertion
  file is in the diff; existing byte-for-byte pins passed unchanged.

Slice gate held: the step reported plain `just` green plus integration
and style-guard suites; parent re-verified flow (47 files / 421 tests)
and `just ts-check`. `sdl-flow/api` untouched.

## Objective Impact

- Slice 5 of 10 done, in map order. Both `LandGraphiteGateway` mutation
  stubs the inventory called "unwired no-op stubs" are now wired and
  called; the five-crossing count from the inventory is down by one more.
- Next is slice 6 (slot-action seam + pre-merge slot freeing): add the
  `freeSlots` gateway method per the settled decision — it keeps shelling
  out to `sdl slot free`, only the call site moves behind the seam.

## Follow-Ups

- Continue the migration row at map slice 6.
