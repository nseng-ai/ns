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
  - Latest slow-test inventory still shows `packages/asdl-core/test/exec.test.ts` in the default path at about 386ms; reassess only if later timing shows remaining material real-time/process cost after the completed timer-seam slice.
  - Remaining work: assess additional timeout-sensitive default-path tests only when those areas are touched; the `runCommand` and runner-subagent process slices are covered by the shared seams.
- [x] Split `brmem` real Git coverage into default fake-driven gateway tests and integration tests.
  - Evidence: `packages/brmem/test/gateways/real-git-gateway.test.ts` now keeps only injected-command real-adapter sanity coverage in the default suite, and `packages/brmem/test/gateways/prompt-resolution.test.ts` uses an injected fake GitGateway for repository-root success/failure behavior.
  - Evidence: all previous temp-Git `createTempGitRepo` coverage moved under `packages/brmem/test/integration/`, including real-gateway snapshot/delete/copy/glob/branch/remote-config cases, prompt resolution, and public copy/export real-Git wiring scenarios.
  - Evidence: targeted affected default command improved from 4 files / 37 tests in 4.01s real time to 4 files / 28 tests in 0.86s real time locally; the moved brmem integration subset runs intentionally as 4 files / 10 tests in 3.97s real time.
  - Evidence: default Vitest listing excludes the new integration files, integration Vitest listing includes them, and the boundary grep reports no `createTempGitRepo` or `new RealGitBrmemGateway(repo.path)` matches in default brmem gateway/scenario tests.
- [x] Move Node runtime import and CLI smoke tests into the integration suite.
  - Evidence: `packages/branch-context/test/integration/node-runtime-cli.test.ts` remains the seed CLI runtime smoke test, and the remaining known default-path runtime smoke tests moved into package-local integration paths: `packages/pi-extensions/test/integration/node-runtime-imports.test.ts`, `packages/plans/test/integration/node-runtime-cli.test.ts`, `packages/pr-address/test/integration/node-runtime-cli.test.ts`, `packages/roaster/test/integration/node-runtime-cli.test.ts`, and `packages/sdl/test/integration/node-runtime-cli.test.ts`.
  - Evidence: default Vitest file listing no longer reports `node-runtime` or `test/integration` files; integration Vitest listing reports all six runtime smoke files; `pnpm --dir ts run test:integration` runs them intentionally.
- [ ] Move sqlite-backed Graphite/worktree-status coverage into the integration suite or replace default-path sqlite setup with injected fakes.
  - Tracked default-path tests needing improvement: `packages/pi-extensions/test/worktree-status.test.ts` (~726ms), `packages/ccc/test/worktree-status.test.ts` (~556ms), `packages/ccc/test/worktree-status-graphite-metadata.test.ts` (~191ms), `packages/slot/test/gateways/real-git-gateway-movement.test.ts` (~225ms), `packages/slot/test/gateways/real-gt-gateway.test.ts` (~290ms), and `packages/sdl/test/scenario/cp-cli.test.ts` (~72ms).
  - Preserve representative real sqlite, Git, and Graphite coverage intentionally in the integration suite.
  - Keep default-path worktree-status and checkpoint-flow behavior fake-driven where possible.
  - Completion evidence should include before/after timing for the affected default command and explicit accounting for retained sqlite-backed / real-adapter coverage.
- [x] Add CI wiring for the separated TypeScript integration suite.
  - Evidence: `.github/workflows/ci.yml` has a separate non-draft `typescript-integration` job that runs `just ts-test-integration`; local `pnpm --dir ts run test:integration` passes for the seeded suite.

## Parked

*None.*
