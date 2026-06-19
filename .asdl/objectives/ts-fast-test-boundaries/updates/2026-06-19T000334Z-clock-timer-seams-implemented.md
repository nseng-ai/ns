# Clock and Timer Seams Implemented for Command Timeouts

## Summary

The `@asdl/core` time-seam slice now includes the planned minimal `Clock` seam and a separate one-shot cancellable `TimerScheduler` seam. The timer seam has a concrete default-path use case: `runCommand` timeout and kill-grace scheduling accepts an injected scheduler while defaulting to system timers for normal callers.

The `packages/asdl-core/test/exec.test.ts` timeout tests now use `createManualTimerScheduler()` to advance parent-side timeout and grace timers deterministically instead of waiting on real 500ms/100ms sleeps or measuring elapsed wall time with `Date.now()`.

## Objective Impact

This completes the shared `@asdl/core` time-seam deliverable for the current slice and partially completes the touched default-path time-test migration row. The Objective language now distinguishes wall-clock reads from one-shot timeout scheduling so the clock seam does not become a scheduler dumping ground.

Validation evidence: direct local Vitest for `packages/asdl-core/test` passed, and direct local TypeScript check, legacy check, formatting check, and lint passed. The planned pnpm command path remains locally blocked before test execution by `ERR_PNPM_IGNORED_BUILDS`, matching the implementation-plan environment note.

## Follow-Ups

- Continue the larger Objective by deciding/documenting the TypeScript integration-test layout and command contract.
- Assess additional timeout-sensitive default-path tests only when those areas are touched; do not broaden this slice into repo-wide time-call migration.
