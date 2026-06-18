# Clock Seam Merged into Test Organization

## Summary

The TypeScript-native clock seam design is now part of this Objective rather than a separate Objective. The scope now covers a minimal `@asdl/core/clock` production seam, a `createManualClock(startMs)` helper in `@asdl/core/testing`, and adoption in touched default-path time-based tests so they can simulate elapsed wall-clock time without real sleeps.

## Objective Impact

This changes the Objective from only separating slow integration tests to also providing a deterministic seam for tests whose slowness comes from wall-clock waits. The previously parked `packages/asdl-core/test/exec.test.ts` timeout concern is no longer categorically parked: it should be addressed through clock injection where the seam can preserve behavior coverage while making the default test path fast.

## Follow-Ups

- Implement the minimal `Clock.nowMs()` / `systemClock` API and explicit `@asdl/core/clock` export.
- Add `createManualClock(startMs)` under `@asdl/core/testing`.
- Replace touched default-path sleeps or raw wall-clock reads with required `clock: Clock` dependencies, passing `systemClock` only at composition boundaries.
