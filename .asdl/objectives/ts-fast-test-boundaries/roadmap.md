# Roadmap

## Work

- [x] Decide and document the TypeScript integration-test layout, command contract, deterministic-time convention, and performance-proof standard.
  - Evidence: `ts/TESTING.md` documents package-local `test/integration/**/*.test.ts`, default Vitest integration excludes, the intentional `test:integration` command, deterministic `Clock`/`TimerScheduler` test guidance, and the required `Performance evidence` block.
- [x] Add the minimal TypeScript clock/timer seams in `@asdl/core`.
  - Evidence: local branch adds `@asdl/core/clock` with `Clock`/`systemClock`, `@asdl/core/timers` with one-shot cancellable `TimerScheduler`/`systemTimerScheduler`, and `@asdl/core/testing` manual clock/timer helpers.
  - Production code receives only the production seam shapes; manual controls remain in the testing subpath.
- [~] Replace touched default-path time sleeps and wall-clock reads with injected clock/timer seams.
  - Evidence: `packages/asdl-core/test/exec.test.ts` timeout tests now inject a manual timer scheduler into `runCommand`, advance parent-side timeout/grace timers deterministically, and no longer use `Date.now()` elapsed assertions.
  - Evidence: `packages/pi-extensions/test/runner-subagent-process.test.ts` now uses `createManualClock()` for elapsed progress assertions and `createManualTimerScheduler()` for runner subagent abort kill-grace cancellation and SIGKILL escalation coverage.
  - Remaining work: assess additional timeout-sensitive default-path tests only when those areas are touched; the `runCommand` and runner-subagent process slices are covered by the shared seams.
- [ ] Split `brmem` real Git coverage into default fake-driven gateway tests and integration tests.
  - Default `test/gateways` coverage should mock or inject Git command execution.
  - Real `createTempGitRepo` / `RealGitBrmemGateway` subprocess coverage should move to the integration suite.
  - Completion evidence should include before/after timing for the affected default TypeScript test command plus confirmation that real Git coverage remains in the integration command.
- [~] Move Node runtime import and CLI smoke tests into the integration suite.
  - Evidence: `packages/branch-context/test/scenario/node-runtime-cli.test.ts` moved to `packages/branch-context/test/integration/node-runtime-cli.test.ts` as the seed CLI runtime smoke test; `pnpm --dir ts run test:integration` runs it intentionally.
  - Remaining work: migrate broader pi-extensions/package Node runtime import and CLI smoke coverage in later slices with their own performance evidence.
- [ ] Move sqlite-backed Graphite/worktree-status coverage into the integration suite or replace default-path sqlite setup with injected fakes.
  - Preserve representative real sqlite coverage intentionally.
  - Completion evidence should include before/after timing for the affected default command and explicit accounting for retained sqlite-backed coverage.
- [x] Add CI wiring for the separated TypeScript integration suite.
  - Evidence: `.github/workflows/ci.yml` has a separate non-draft `typescript-integration` job that runs `just ts-test-integration`; local `pnpm --dir ts run test:integration` passes for the seeded suite.

## Parked

*None.*
