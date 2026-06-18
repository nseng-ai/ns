# Roadmap

## Work

- [ ] Decide and document the TypeScript integration-test layout, command contract, and deterministic-time convention.
  - Capture the folder or filename convention, the default Vitest include/exclude behavior, the intentional integration command, and when time-based tests should use a manual clock instead of sleeping.
- [ ] Add the minimal TypeScript clock seam in `@asdl/core`.
  - Export `Clock` and `systemClock` from `@asdl/core/clock`.
  - Export `createManualClock(startMs)` from `@asdl/core/testing`, with production code receiving only the `Clock` shape.
- [ ] Replace touched default-path time sleeps and wall-clock reads with injected clocks.
  - Start with timeout-sensitive default-path tests such as `packages/asdl-core/test/exec.test.ts` where the seam can make tests fast without weakening behavior coverage.
  - Keep `Date.now()` and no-argument `new Date()` at composition or boundary code, not inside testable operation logic.
- [ ] Split `brmem` real Git coverage into default fake-driven gateway tests and integration tests.
  - Default `test/gateways` coverage should mock or inject Git command execution.
  - Real `createTempGitRepo` / `RealGitBrmemGateway` subprocess coverage should move to the integration suite.
- [ ] Move Node runtime import and CLI smoke tests into the integration suite.
  - Keep coverage for cold Node package exports and CLI entrypoints, but exclude it from default local tests.
- [ ] Move sqlite-backed Graphite/worktree-status coverage into the integration suite or replace default-path sqlite setup with injected fakes.
  - Preserve representative real sqlite coverage intentionally.
- [ ] Add CI wiring for the separated TypeScript integration suite.
  - Evidence should include default TypeScript tests and the new integration command passing in the intended environments.

## Parked

_None._
