# Extraction slice 9 landed — post-landing slot cleanup; migration row complete

## Summary

Ninth and final code slice of the extraction migration row (runner step,
commit `28b9fe001` on `flow-map-slice9-post-landing-slot-cleanup`, stacked
on `flow-map-slice8-graphite-maintenance-gateway`). Three-file diff.

- Post-landing `--free` cleanup (`land/post-landing-slot-cleanup.ts`) now
  runs on `LandContext`: `worktrees.freeSlots` (slice 6 seam) frees the
  current managed slot and `graphite.deleteLocalBranch` (slice 8 seam,
  `checkedOutConflict: "fail"`) deletes the landed branch;
  `landing-dispatch` passes one shared land context in.
- This removes the intentional slice 6 residual: no slot-freeing behavior
  runs on land-stack primitives anymore. Command displays/messages
  preserved; mutation argv pins untouched (no assertion files in the
  diff).

Slice gate held: the step reported plain `just` green plus integration and
style-guard suites and self-verified `sdl-flow/api` untouched; parent
re-verified flow (47 files / 422 tests) and `just ts-check`.

## Objective Impact

- **The migration row is complete**: map slices 1–9 all landed 2026-07-02
  as autonomous runner steps on one branch stack
  (`flow-land-domain-strict-merge-gate` → … →
  `flow-map-slice9-post-landing-slot-cleanup`), each under the slice gate.
  The roadmap row flips to `[x]`; map slice 10 is the separate round-trip
  retirement row, whose precondition ("once the migration row's slices are
  landed") is now met.
- Residuals consciously carried into the retirement row: the
  `pr-facts.ts` delegation adapters (slice 1), the `preloadedShape`
  preflight bypass (slice 2), `toLandFailure`'s failure-collapse and the
  dual mappers/mirror in `plan-mapping.ts`, the duplicate operation-label
  heuristics, and the `plan-mapping.ts` copy of the nothing-to-land check.
  B2 stack-mode phase sequencing stays interleaved Flow-side per the
  inventory ("migrates LAST") — the retirement row should state what, if
  anything, of it remains to move.
- Premise note for the retirement row: its recorded file line counts are
  stale — `land-context-adapter.ts` has grown into the real gateway
  backend and is no longer round-trip scaffolding to delete wholesale;
  the deletions are the mirror/mappers in `plan-mapping.ts` and the
  redundant crossings, not the adapter itself.

## Follow-Ups

- Proceed to the round-trip retirement row (`Policy: direct` now active).
