# Infra Core Smell Remediation

## Summary

The `infra` roadmap row now has a completed `@sdl/core` sub-slice. Re-probe confirmed the three referenced core findings were still present: the `isSuccessfulExecResult` pass-through predicate, local `isRecord`/`isJsonRecord` guard duplicates, and repeated marker/preserved-character recomputation in head-only truncation.

The fix removes the duplicate command-success predicate name and updates production consumers to `commandSucceeded`, reuses `isRecord` from `primitives.ts` in terminal presentation and runner-usage parsing, and names the head-truncation marker recomputation via `headMarkerState` / `refineHeadMarkerState`.

## Objective Impact

This reduces the open `infra` finding count by three with fixed dispositions for the `ts/packages/infra/core` portion of `references/infra.md`. The implementation also updates direct production consumers in `cmux`, `ccc`, and `sdl-flow` so the core API has one command-result success predicate. Behavior is preserved; validation passed for the touched packages plus repo-wide TypeScript gates.

## Follow-Ups

Continue the partially open `infra` row with another coherent package sub-slice (for example `git`, `github`, `graphite`, `cli-runtime`, `cli-theme`, `test-kit`, `time`, or `exec`) after re-verifying current code and checking ownership overlap where noted in the Objective.
