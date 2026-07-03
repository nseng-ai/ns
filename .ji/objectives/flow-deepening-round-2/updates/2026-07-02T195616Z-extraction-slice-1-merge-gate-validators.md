# Extraction slice 1 landed — strict merge gate and PR validators on the domain core

## Summary

First autonomous slice of the extraction migration row (runner step, commit
`d9ad6f18e` on `flow-land-domain-strict-merge-gate`, stacked on
`flow-migration-autonomous-slice-policy`). Paths relative to
`ts/packages/capabilities/flow/`.

- `validateStrictMergeGate` moved into the Land Domain Core
  (`src/land/preflight.ts`, exported via `src/land/api.ts`); the land-stack
  implementation is gone.
- The production-dead `land-stack/pr-facts.ts` `validateInitialPrPreflight`
  is deleted (the inventory's dead-code call); the domain core's own
  `validateInitialPrPreflight` in `land/preflight.ts` is the only one and is
  live in preflight.
- Live land-stack mid-execution re-checks became thin delegation adapters
  (`validateStrictMergeGateForLandStack`, `validateOpenPrBasicsForLandStack`
  in `pr-facts.ts`) that call the domain validators and map outcomes through
  `plan-mapping.ts`'s failure mapper. Validator logic exists exactly once.

Slice gate held: land scenario argv assertions untouched
(`test/unit/land-stack-command-scenarios.test.ts` not in the diff); no
gateway-interface or subprocess changes; `sdl-flow/api` (`src/core/api.ts`)
untouched; full Definition of Progress suite reported green by the step,
parent re-verified via flow package tests (45 files / 415 tests) and
`just ts-check`.

## Objective Impact

- The migration row is in progress: slice 1 of 10 done, in map order. Next
  is slice 2 (real `stackShape`/facts gateway backend).
- Premise correction to the inventory update: the `pr-facts.ts` boundary
  crossing does not fully retire with slice 1 — it narrows to the delegation
  adapters above, which still map domain outcomes through `plan-mapping.ts`.
  That residual crossing is deleted by the round-trip retirement row (its
  file list already includes `plan-mapping.ts`; the adapters go with it).
- No dual orchestration remains for this behavior; the land-stack side keeps
  only the recorded mapping shims.

## Follow-Ups

- Continue the migration row at map slice 2.
- The retirement row deletes the `pr-facts.ts` delegation adapters together
  with `plan-mapping.ts`'s mappers.
