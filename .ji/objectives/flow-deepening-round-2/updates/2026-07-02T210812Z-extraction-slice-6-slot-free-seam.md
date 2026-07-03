# Extraction slice 6 landed — slot-action seam and pre-merge slot freeing

## Summary

Sixth autonomous slice of the extraction migration row (runner step,
commit `e3a8da316` on `flow-map-slice6-slot-free-gateway`, stacked on
`flow-map-slice5-premerge-submit-gateway`).

- `freeSlots` added to `LandWorktreeSlotFactsGateway` (`land/types.ts`) —
  the slot-action seam the map names — with the in-memory fake extended.
- Per the settled owner decision, the real implementation in
  `land-context-adapter.ts` shells out to the identical `sdl slot free`
  invocation; only the call site moved behind the seam. Pre-merge
  managed-slot cleanup in `landing-operations.ts` now routes through the
  gateway.
- Mutation argv freeze held with zero relaxation: no scenario assertion
  file is in the diff; pins passed unchanged.
- Recorded intentional residual: post-landing `--free` slot cleanup
  (behavior B12) is deliberately unchanged; map slice 9 migrates it,
  reusing this seam.

Slice gate held: the step reported plain `just` green plus integration
and style-guard suites, and self-verified `sdl-flow/api` untouched via
git diff; parent re-verified flow (47 files / 421 tests) and
`just ts-check`.

## Objective Impact

- Slice 6 of 10 done, in map order. The wholly-absent slot-action seam
  the inventory flagged now exists; the last named gateway gaps are the
  post-merge Graphite maintenance operations (slice 8).
- Next is slice 7 (stack merge loop onto gateways) — the first
  high-risk slice: interleaved presentation, with the settled
  progress-reporting decision (channel-backed gateways preserving
  per-command streaming) as the execution boundary. The
  `squashMergePullRequest` gateway method from slice 3 is already
  available for the loop's merges.

## Follow-Ups

- Continue the migration row at map slice 7.
