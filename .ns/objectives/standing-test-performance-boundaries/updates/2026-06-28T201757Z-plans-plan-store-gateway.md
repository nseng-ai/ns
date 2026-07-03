# Plans PlanStoreGateway default test split

## Summary

Introduced a domain-specific `PlanStoreGateway` seam for `@sdl/plans`, moved package-owned saved-plan filesystem behavior in the default tests onto `InMemoryPlanStoreGateway`, and retained real filesystem confidence in a small integration smoke for the real adapter.

## Objective Impact

Advances the standing test performance boundary by removing repeated real local plan-store temp-directory and file operations from the default `@sdl/plans` tests. Real Node filesystem behavior is now isolated to `ts/packages/plans/test/integration/plan-store-gateway.test.ts` and the production `RealPlanStoreGateway` adapter.

## Performance evidence

- Measured command:
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/plans/test/scenario/cli.test.ts --reporter verbose`
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/plans/test --reporter verbose`
  - `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/plans/test/integration/plan-store-gateway.test.ts --reporter dot`
- Baseline timing:
  - `cli.test.ts`: 38 tests passed, duration 295ms, tests 35ms.
  - `packages/plans/test`: 6 files / 90 tests passed, duration 336ms, tests 133ms.
- Post-change default timing:
  - `cli.test.ts`: 38 tests passed, duration 282ms, tests 25ms.
  - `packages/plans/test`: 6 files / 90 tests passed, duration 304ms, tests 52ms.
- Post-change integration timing:
  - `plan-store-gateway.test.ts`: 1 file / 2 tests passed, duration 251ms, tests 9ms.
- Repetition/noise notes:
  - Timings are single-run local measurements from this worktree; treat them as directional only.
  - Import/transform overhead dominates these small commands, so the most meaningful change is the test-time reduction and explicit cost placement.
- Cost handling:
  - Default `@sdl/plans` saved-plan storage/source-file tests use `InMemoryPlanStoreGateway` instead of temp directories, `writeFile`, `readFile`, `utimes`, or `realpath`.
  - Real filesystem adapter behavior is paid only in the integration lane.
- Coverage retention:
  - Default tests still cover CLI help/errors/JSON envelopes, saved-plan writes, list/latest selection, explicit source-file resolution, session evidence validation, collisions, XDG root calculation, branch/repo keys, and stale/unsafe cases through the fake gateway.
  - Integration smoke covers real exclusive writes/collision refusal, real mtime latest selection, real source-file reading, and repository-internal source-file rejection.

## Follow-Ups

None required for this slice.
