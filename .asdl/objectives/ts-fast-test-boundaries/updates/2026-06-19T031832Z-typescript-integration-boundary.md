# TypeScript Integration Boundary Convention

## Summary

The TypeScript workspace now has an executable integration-test boundary. Default Vitest runs continue to
use `ts/vitest.config.ts`, which includes package-local tests but excludes
`packages/*/test/integration/**/*.test.ts`. Integration tests run intentionally through the new
`test:integration` script and `ts/vitest.integration.config.ts`.

`ts/TESTING.md` records the convention: integration tests live under
`ts/packages/<package>/test/integration/**/*.test.ts`, default-path tests should stay fake-driven and
deterministic, project-owned time behavior should inject `Clock` or `TimerScheduler` with
`@asdl/core/testing` manual helpers, and speedup-claiming slices must include a `Performance evidence`
block.

## Objective Impact

- Completed the roadmap item to decide and document the TypeScript integration-test layout, command
  contract, deterministic-time convention, and performance-proof standard.
- Completed CI wiring for the separated TypeScript integration suite by adding a non-draft PR job that
  runs `just ts-test-integration` separately from the default TypeScript job.
- Partially advanced the Node runtime smoke-test migration by moving the branch-context CLI runtime smoke
  test from `packages/branch-context/test/scenario/node-runtime-cli.test.ts` to
  `packages/branch-context/test/integration/node-runtime-cli.test.ts`.
- Left broader pi-extensions/package Node runtime migrations, brmem real-Git migration, and
  sqlite/worktree-status migration open for later slices.

## Validation

- `pnpm --dir ts run test packages/branch-context/test/scenario` passed after the seed move with 2 files
  and 45 tests, confirming the default branch-context scenario path no longer runs the moved Node runtime
  smoke test.
- `pnpm --dir ts run test:integration` passed with 1 file and 3 tests, confirming the integration suite is
  non-empty and runs the moved seed test.
- Full validation run in the implementation branch: `pnpm --dir ts run test`,
  `pnpm --dir ts run test:integration`, `pnpm --dir ts run check`,
  `pnpm --dir ts run check:legacy`, `pnpm --dir ts run fmt:check`, `pnpm --dir ts run lint`,
  `just ts-guard`, `just ts-deps-check`, `just ts-test`, `just ts-test-integration`, and
  `dprint check`.
- GitHub Actions validation for the new `typescript-integration` job remains pending remote PR execution.

## Performance evidence

- Measured command: `pnpm --dir ts run test packages/branch-context/test/scenario`.
- Baseline timing: 3 local `/usr/bin/time -p` runs before the move: 1.08s, 0.97s, 0.96s real time; Vitest
  reported 3 files / 48 tests and durations around 439-450ms.
- Post-change timing: 3 local `/usr/bin/time -p` runs after the move: 0.83s, 0.81s, 0.82s real time;
  Vitest reported 2 files / 45 tests and durations around 305-309ms.
- Repetition/noise notes: measurements were taken back-to-back in the same local worktree using the same
  command and warmed dependencies. The improvement is directional and small because this slice moved only
  one seed smoke test.
- Cost handling: the Node runtime CLI smoke cost was shifted out of the default scenario path into the
  explicit integration suite, not eliminated.
- Integration cost: `pnpm --dir ts run test:integration` ran the seeded integration suite in 0.94s,
  0.93s, and 0.98s real time locally.
- Coverage retention: the moved branch-context Node runtime CLI smoke test still asserts the CLI help
  surface and runtime diagnostics through the integration command.

## Follow-Ups

- Migrate the remaining Node runtime import and CLI smoke tests in later slices with their own baseline,
  post-change, and integration-cost evidence.
- Split brmem real-Git coverage and sqlite/worktree-status coverage into default fake-driven tests plus
  intentional integration coverage in separate slices.
