# Node Runtime Smoke Tests Moved to Integration

## Summary

The remaining known default-path TypeScript Node runtime smoke tests moved into package-local
`test/integration/` paths:

- `packages/pi-extensions/test/integration/node-runtime-imports.test.ts`
- `packages/plans/test/integration/node-runtime-cli.test.ts`
- `packages/pr-address/test/integration/node-runtime-cli.test.ts`
- `packages/roaster/test/integration/node-runtime-cli.test.ts`
- `packages/sdl/test/integration/node-runtime-cli.test.ts`

Together with the existing `packages/branch-context/test/integration/node-runtime-cli.test.ts` seed, the
integration suite now intentionally owns the known Node runtime import and CLI smoke coverage. The default
Vitest suite excludes these integration tests, so their cold Node/process boundary cost is shifted out of
`pnpm --dir ts run test` and into `pnpm --dir ts run test:integration`.

## Objective Impact

- Completed the roadmap row to move Node runtime import and CLI smoke tests into the integration suite.
- Preserved coverage through the integration command: branch-context plus pi-extensions, plans,
  pr-address, roaster, and sdl runtime smoke tests now run under the integration config.
- Left the brmem real-Git split and sqlite/worktree-status split open for later slices.

## Validation

- `pnpm --dir ts exec vitest list --config vitest.config.ts --filesOnly | rg 'node-runtime|test/integration' || true` produced no matches after the move.
- `pnpm --dir ts exec vitest list --config vitest.integration.config.ts --filesOnly` listed all six runtime smoke files.
- `pnpm --dir ts run test:integration` passed with 6 files and 21 tests.
- `pnpm --dir ts run test` passed with 260 files and 2711 tests.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run check:legacy` passed.
- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.
- `just ts-guard` passed.
- `just ts-deps-check` passed.
- `just ts-test-integration` passed with 6 files and 21 tests.
- `just ts-test` passed with 260 files and 2711 tests.
- `dprint check` passed.

## Performance evidence

- Measured baseline commands:
  - `/usr/bin/time -p pnpm --dir ts run test packages/pi-extensions/test/node-runtime-imports.test.ts`
  - `/usr/bin/time -p pnpm --dir ts run test packages/plans/test/node-runtime-cli.test.ts`
  - `/usr/bin/time -p pnpm --dir ts run test packages/pr-address/test/scenario/node-runtime-cli.test.ts`
  - `/usr/bin/time -p pnpm --dir ts run test packages/roaster/test/scenario/node-runtime-cli.test.ts`
  - `/usr/bin/time -p pnpm --dir ts run test packages/sdl/test/scenario/node-runtime-cli.test.ts`
  - `/usr/bin/time -p pnpm --dir ts run test`
- Baseline targeted timing samples, repeated twice in the same local worktree:
  - pi-extensions runtime imports: 1 file / 4 tests, 1.56s and 1.53s real time.
  - plans CLI runtime: 1 file / 3 tests, 0.89s and 0.92s real time.
  - pr-address CLI runtime: 1 file / 4 tests, 1.12s and 1.07s real time.
  - roaster CLI runtime: 1 file / 4 tests, 1.29s and 1.25s real time.
  - sdl CLI runtime: 1 file / 3 tests, 1.06s and 1.06s real time.
- Baseline full default timing: `pnpm --dir ts run test` passed with 265 files / 2729 tests in 8.25s
  real time locally.
- Post-change selection evidence: default Vitest listing produced no `node-runtime` or `test/integration`
  matches; integration listing included branch-context plus the five newly moved runtime smoke files.
- Post-change integration timing: `/usr/bin/time -p pnpm --dir ts run test:integration` passed with 6
  files / 21 tests in 2.33s real time locally.
- Post-change full default timing: `/usr/bin/time -p pnpm --dir ts run test` passed with 260 files / 2711
  tests in 6.60s real time locally.
- Post-change affected default-path package/path timings:
  - `packages/pi-extensions/test`: 62 files / 800 tests, 2.18s real time.
  - `packages/plans/test`: 8 files / 98 tests, 0.85s real time.
  - `packages/pr-address/test/scenario`: 5 files / 31 tests, 0.88s real time.
  - `packages/roaster/test/scenario`: 2 files / 17 tests, 0.90s real time.
  - `packages/sdl/test/scenario`: 4 files / 80 tests, 1.02s real time.
- Repetition/noise notes: targeted baseline commands were repeated twice back-to-back with warmed local
  dependencies. Full-suite baseline and post-change timings were single local samples and should be read
  as sanity evidence rather than a precise benchmark.
- Cost handling: this change shifted Node runtime smoke cost from the default path into the explicit
  integration command; it did not eliminate the coverage cost.
- Coverage retention: `pnpm --dir ts run test:integration` now runs branch-context, pi-extensions, plans,
  pr-address, roaster, and sdl Node runtime smoke coverage intentionally.

## Follow-Ups

- Continue with the brmem real-Git split.
- Continue with the sqlite/worktree-status split.
