# Roadmap

## Work

- [ ] Decide and document the TypeScript integration-test layout, command contract, and deterministic-time convention.
  - Capture the folder or filename convention, the default Vitest include/exclude behavior, the intentional integration command, and when time-based tests should use a manual clock instead of sleeping.
- [x] Add the minimal TypeScript clock/timer seams in `@asdl/core`.
  - Evidence: local branch adds `@asdl/core/clock` with `Clock`/`systemClock`, `@asdl/core/timers` with one-shot cancellable `TimerScheduler`/`systemTimerScheduler`, and `@asdl/core/testing` manual clock/timer helpers.
  - Production code receives only the production seam shapes; manual controls remain in the testing subpath.
- [~] Replace touched default-path time sleeps and wall-clock reads with injected clock/timer seams.
  - Evidence: `packages/asdl-core/test/exec.test.ts` timeout tests now inject a manual timer scheduler into `runCommand`, advance parent-side timeout/grace timers deterministically, and no longer use `Date.now()` elapsed assertions.
  - Remaining work: assess any other timeout-sensitive default-path tests beyond the `runCommand` slice when those areas are touched.
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

*None.*
