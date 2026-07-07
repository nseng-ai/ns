# Graphite Maintenance Re-Expressed over LandContext

## Summary

Candidate 3 is implemented in the current branch: `stack/graphite-maintenance.ts` now takes the already-constructed `LandContext` plus a narrow `GraphiteMaintenanceProgress` interface. Host presentation adaptation (`setStatus` and command-stream notes) lives at the `landing-operations.ts` call site, while maintenance no longer receives `StackLandingRuntime`, `LandStackCommandContext`, `LandStackCommandStream`, `runtime.commands`, `loadLocalSha`, or `loadPr`.

The executable orchestration intentionally remains under `stack/` for this pass; the seam was cleaned without moving the module wholesale into the Land Domain Core.

## Objective Impact

This completes the third roadmap row and removes the nested host/runtime maintenance context coupling that blocked fake-backed maintenance coverage. Maintenance-specific tests now exercise `performGraphiteMaintenance` through `createInMemoryLandContext`, covering required next-landing maintenance, the PR-metadata-current submit skip, and optional descendant warning behavior. Existing scenario and adapter coverage remain the behavior-facing safety net for command shapes and telemetry surfaces.

Evidence:

- `rg -n "StackLandingRuntime|LandStackCommandContext|LandStackCommandStream|runtime\.commands|loadLocalSha\(|loadPr\(|MaintenanceOperationContext|MaintenanceBranchOperationContext" ts/packages/capabilities/flow/src/land/stack/graphite-maintenance.ts` returned no hits.
- `rg -n "performGraphiteMaintenance\(" ts/packages/capabilities/flow/src/land ts/packages/capabilities/flow/test` shows the production adapter call plus the new fake-backed unit tests.
- `just ts-check` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 54 test files, 485 tests.

## Follow-Ups

Candidate 4 remains: disposition presentation consolidation, either by landing the consolidation or recording an explicit decision not to do it. Do not clear `flow-land-incremental-perf-rollout`'s Blocked Sentence until this Objective's required remaining disposition is complete and the perf rollout receives its own update.
