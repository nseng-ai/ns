# Round trip retired — the Flow Land Compatibility Boundary is one crossing

## Summary

The round-trip retirement row landed (runner step, commit `a7c05569a` on
`flow-r2-round-trip-retirement`, stacked on
`flow-map-slice9-post-landing-slot-cleanup`), dissolving review candidate
#4 as the Objective thesis intended — deleted, not consolidated.

- `land-stack/plan-mapping.ts` is deleted outright: the `LandPlanForFlow`
  mirror, both `type↔kind` mappers, the duplicate operation-label
  heuristic, and the redundant nothing-to-land copy all died with it.
- The slice 1 residual (`pr-facts.ts` validator delegation adapters) and
  the slice 2 residual (`preloadedShape` preflight bypass) are retired;
  production enters domain preflight through the gateways.
- `toLandFailure`'s failure-collapse is gone: domain failures flow through
  domain/boundary failure shapes with no `flow-adapter-failure` sentinel.
- Parent-verified evidence, matching the row's stated expectations: zero
  `LandPlanForFlow`, `plan-mapping`, `preloadedShape`, or
  `flow-adapter-failure` references in flow/ccc; ccc has no private Flow
  land imports; every changed scenario assertion line is a read-only fact
  command (domain preflight path) — the mutation argv stream is untouched.

Slice gate held: the step reported plain `just` and the full DoP suite
green; parent re-verified flow (47 files / 422 tests) and ccc
(11 files / 122 tests) suites plus `just ts-check`. `sdl-flow/api`
untouched.

## Objective Impact

- All six work streams in the Objective's Scope are now delivered; every
  non-parked roadmap row is `[x]`. The extraction migration and the
  retirement it unlocked completed in one day of autonomous per-slice
  runner steps (nine migration slices plus this row), each gated and
  parent-verified.
- The extraction blast-radius risk is retired for this record: the live
  merge path runs on the Land Domain Core's four gateways with the
  compatibility round trip deleted.
- The only remaining roadmap item is the Parked presentation row
  (review #5), whose closure gate requires an owner decision: promote,
  re-scope, or drop with rationale before `closed.md` can be written. Its
  premise is stale in the direction the parked note predicted (slices 7–8
  and the retirement churned `presentation.ts` inputs); a re-inventory is
  the first act of whichever choice the owner makes.

## Follow-Ups

- Owner decision on the Parked row (promote / re-scope / drop), then the
  Closure Gate.
- The branch stack ends at `flow-r2-round-trip-retirement`; submission to
  PRs stays outside runner scope per the Runner Policy.
