# Thermo Council Outcome and Scope Dedupe

## Summary

Re-probed the local-pi-tools Thermo Council medium findings and confirmed the repeated `ThermoCouncilReviewerOutcome.type` switch plus duplicated report Scope blocks were still present. The slice now adds `summarizeThermoCouncilReviewerOutcome` for shared completed/blocked/failed progress and diagnostic summaries, and `renderScopeBlock` for the normal, final-synthesis-failure, and all-seats-failed report Scope section variants.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @local-pi-tools/thermo-council run check`, `pnpm --dir ts --filter @local-pi-tools/thermo-council run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`. The first `just ts-format-check` flagged `report.ts`; `just ts-format-fix` was run and the format check passed afterward.

## Objective Impact

Two Thermo Council findings in the `local-pi-tools` cluster now have fixed dispositions: repeated outcome switching and duplicated Scope block construction. The larger Thermo Council `orchestrator.ts` Divergent Change finding remains open for a later dedicated slice.

## Follow-Ups

Continue the `local-pi-tools` cluster with another coherent remaining sub-slice, likely the dedicated Thermo Council orchestrator split or the PR Preview modal chrome dedupe.
