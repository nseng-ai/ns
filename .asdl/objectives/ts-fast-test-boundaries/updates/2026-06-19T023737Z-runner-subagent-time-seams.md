# Runner Subagent Time Seams Adopted

## Summary

The runner subagent process and JSON event parser now use the shared `@asdl/core` `Clock` and `TimerScheduler` seams instead of ad-hoc `now` or timer callback injection. Tests for `packages/pi-extensions` were migrated to the production-typed manual helpers from `@asdl/core/testing`.

The runner subagent process tests now cover deterministic elapsed progress via `createManualClock()`, abort kill-grace timer cancellation when a child exits after SIGTERM, and SIGKILL escalation after the injected grace timer fires.

## Objective Impact

This extends the completed time-seam adoption beyond the original `runCommand` timeout slice while keeping the Objective's scope bounded to touched time-sensitive logic. It strengthens the shared seam story across command execution, runner subagent dispatch, and JSON event parsing without adding broader scheduler or global clock machinery.

Evidence: local branch diff against `typescript-clock-timer-seams-fast-timeout-tests`; full TypeScript validation passed (`fmt:check`, `lint`, `check`, `test`, dependency check, legacy check, and no-double-cast guard).

## Follow-Ups

- Continue with the larger integration-test layout and command-contract decision.
- Treat further time-seam migrations as touched-area work, not a repo-wide sweep.
