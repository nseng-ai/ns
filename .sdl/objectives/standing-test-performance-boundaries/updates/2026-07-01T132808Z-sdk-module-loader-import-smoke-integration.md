# SDK module loader import smoke integration move

## Summary

Moved the repo-local Jiti/workspace import compatibility smoke from `packages/kernel/test/unit/sdk-module-loader.test.ts` to `packages/kernel/test/integration/sdk-module-loader.test.ts` without weakening its assertions. The unit file now keeps the fast SDK virtual-module identity and `resolveCommandExportTarget` coverage.

## Objective Impact

Advances the standing test-performance boundary by classifying the repo-local migration import smoke as a computationally expensive real import/compatibility boundary rather than local unit logic. `ts/TESTING.md` now gives general guidance for computationally expensive smoke tests, including but not limited to direct Jiti/workspace import compatibility smokes.

## Performance evidence

- Measured baseline command:
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/kernel/test/unit/sdk-module-loader.test.ts --reporter verbose`
- Baseline timing:
  - 1 file / 5 tests passed, duration 574ms, tests 343ms, transform 36ms, import 120ms. The `repo-local migration extensions can import internal migration subpaths` test body reported 339ms.
- Post-change default discovery:
  - `pnpm --dir ts exec vitest list --config vitest.config.ts packages/kernel/test/unit/sdk-module-loader.test.ts` listed the 4 remaining unit tests and did not list the repo-local migration import smoke.
- Post-change default timing:
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/kernel/test/unit/sdk-module-loader.test.ts --reporter verbose` passed 1 file / 4 tests, duration 237ms, tests 4ms, transform 37ms, import 123ms.
- Post-change integration discovery and timing:
  - `pnpm --dir ts exec vitest list --config vitest.integration.config.ts packages/kernel/test/integration/sdk-module-loader.test.ts` listed `repo-local migration extensions can import internal migration subpaths`.
  - `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/kernel/test/integration/sdk-module-loader.test.ts --reporter verbose` passed 1 file / 1 test, duration 435ms, tests 200ms, transform 39ms, import 126ms. The retained smoke test body reported 199ms.
- Repetition/noise notes:
  - Timings are single-run local measurements in this worktree. Treat them as directional; the stable signal is that the real workspace/package import smoke is no longer in the default unit file and remains in the explicit integration lane.
- Cost handling:
  - The real Jiti/workspace package import-compatibility cost was shifted from the default lane to the explicit integration command; it was not deleted.
- Coverage retention:
  - The integration test retains the same imports and assertions for repo-local migration extension subpath compatibility. Default coverage still verifies SDK virtual-module mirroring and package export target resolution/diagnostics.

## Follow-Ups

None required from this slice.
