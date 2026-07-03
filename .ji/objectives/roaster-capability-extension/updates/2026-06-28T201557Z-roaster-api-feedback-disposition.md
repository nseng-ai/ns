# Roaster API Feedback Disposition

## Summary

Investigated PR #2318 Roaster review feedback on the initial `@sdl/roaster/api` boundary and recorded the intended follow-up in the Objective roadmap.

## Findings

- Roaster's current API facade mirrors Objective/Slot's client-factory shape, but the read/list/log API methods still delegate through `ClinkrExit`-returning command operations and convert those exits into `RoasterApiResult<T>`.
- Objective has the cleaner precedent for the next Roaster slice: domain builders such as `buildObjectiveListResult()` return domain-result values, while command-facing functions such as `runListObjectives()` wrap those values into `ClinkrExit`.
- The current Roaster shape is acceptable as transitional API-boundary proof, but it should not become the long-term pattern for read/list/log migration.
- Package-local `{ ok, result/failure }` API result shapes remain acceptable duplication for now because they are public per-capability contracts; a shared generic helper would add coupling for little value.

## Objective Impact

Updated the next roadmap row, "Migrate low-risk read/list surfaces to the SDL command face," to explicitly include splitting Roaster read/list/log builders into domain-result operations before CLI/API wrapping. This anchors the deferred cleanup to the slice that already owns `review list`, `review ls`, `review log`, and `roast list` parity.
