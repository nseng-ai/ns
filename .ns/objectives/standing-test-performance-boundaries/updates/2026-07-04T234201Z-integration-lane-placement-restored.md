# Integration lane placement restored

## Summary

Restored the four already-classified TypeScript integration tests that were accidentally outside the shared integration globs after package/test-tree restructuring. The tests were moved from nested `test/<subdir>/integration/` paths into package-root `test/integration/<subdir>/` paths, so the default Vitest lane excludes them and the explicit integration lane discovers them.

Moved files:

- `ts/packages/infra/core/test/exec/integration/exec-run-command.test.ts` -> `ts/packages/infra/core/test/integration/exec/exec-run-command.test.ts`
- `ts/packages/capability-kit/test/git/integration/testing-create-temp-git-repo.test.ts` -> `ts/packages/capability-kit/test/integration/git/testing-create-temp-git-repo.test.ts`
- `ts/packages/capability-kit/test/graphite/integration/status.test.ts` -> `ts/packages/capability-kit/test/integration/graphite/status.test.ts`
- `ts/packages/capabilities/branch-context/test/pi/integration/branch-context-real-brmem.test.ts` -> `ts/packages/capabilities/branch-context/test/integration/pi/branch-context-real-brmem.test.ts`

This change does not delete, skip, or weaken coverage. It shifts existing real-boundary smoke coverage out of the default lane and back into the explicit integration command.

## Objective Impact

The first roadmap row can be marked complete because the known lane-placement regression is restored using the existing shared Vitest contract: `integration/` now sits directly under each package's `test/` root. The default lane no longer discovers these real-boundary smokes, and the explicit integration lane does discover and run them.

## Baseline evidence

User-provided default-lane timing baseline before this restoration:

- `exec-run-command.test.ts`: 410ms in the default lane; real child-process `runCommand` smokes.
- `branch-context-real-brmem.test.ts`: 351ms in the default lane; real Branch Memory / temp Git integration.
- `testing-create-temp-git-repo.test.ts`: 151ms in the default lane; real temp Git repo helper smoke.
- `status.test.ts`: 60ms in the default lane; real Graphite sqlite metadata tests.

Pre-fix lane discovery was reconfirmed locally:

- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest list --config vitest.config.ts <old four paths>` listed all 12 tests from the four files.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest list --config vitest.integration.config.ts <old four paths>` listed no tests.

## Performance evidence

- Measured command: lane-discovery checks plus targeted integration run and full default suite.
- Baseline timing: user-provided default-lane timings above; the four files contributed about 972ms of real-boundary test runtime to the default lane in that run.
- Post-change timing: the moved files are no longer discovered by `vitest.config.ts`; `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts run test` passed with 416 files / 4088 tests in 4.18s.
- Repetition/noise notes: no repeated timing sample was taken, so this update claims lane placement restoration rather than a precise end-to-end speedup measurement.
- Cost handling: cost was shifted out of the default lane into `test:integration`; coverage remains present.
- Coverage retention: `vitest.integration.config.ts` lists and runs all 12 moved tests from the four files.

## Validation

Post-fix discovery and validation:

- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest list --config vitest.config.ts <new four paths>` produced no listed tests.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest list --config vitest.integration.config.ts <new four paths>` listed all 12 tests.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run --config vitest.integration.config.ts <new four paths>` passed: 4 files / 12 tests.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts run test` passed: 416 files / 4088 tests.
- `find ts/packages \( -path '*/test/*/integration/*.test.ts' -o -path '*/test/*/*/integration/*.test.ts' \) -print | sort` produced no output.

## Follow-Ups

`ts/TESTING.md` was corrected to point manual time helpers at `@ns/core/time/testing`, matching the `@ns/core` package export and existing test imports.

No shared Vitest glob semantics, CI topology, or repository-wide structural guard was changed in this slice. The open structural-guard question remains a follow-up decision for a separate steer-first change.
