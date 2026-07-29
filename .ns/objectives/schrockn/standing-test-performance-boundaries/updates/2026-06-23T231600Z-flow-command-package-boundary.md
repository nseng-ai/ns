# Semantic Update: Flow Command Behavior Tests Moved to Package-Owned Default Lane

## Performance evidence

- Measured command (baseline from plan evidence):
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/cp-cli.test.ts --reporter verbose`
  - Baseline: 32 tests passed, duration 1.46s, tests 954ms.
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/submit-cli.test.ts --reporter verbose`
  - Baseline: 23 tests passed, duration 1.82s, tests 1.28s.
- Measured command (post-change):
  - `pnpm --dir ts --filter @sdl/flow run test -- --reporter verbose`
  - Post-change: 30 command behavior tests passed, duration 439ms, tests 94ms.
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/cp-cli.test.ts packages/sdl/test/scenario/submit-cli.test.ts --reporter verbose`
  - Post-change SDL kernel/default coverage: 23 tests passed, duration 361ms, tests 79ms.
  - `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/flow-extension-cli.test.ts --reporter verbose`
  - Integration smoke: 4 tests passed, duration 415ms, tests 150ms.
- Repetition/noise notes: post-change commands were single local runs; baseline evidence came from the saved implementation plan and was also single-run evidence.
- Cost handling: direct flow command behavior no longer loads the checked-in `.sdl/extensions/flow` implementation through real SDL discovery/import. Package-owned tests import `@sdl/flow` command objects and use fake `SdlExtensionApi` collaborators. Real discovery/import cost is kept explicit in a small integration smoke.
- Coverage retention: behavior assertions for `cp` and `submit` moved to `@sdl/flow`; SDL package tests still prove no built-in flow commands and exercise generic extension discovery/loading; integration tests prove the checked-in flow adapter manifest reaches package command behavior through the real loader.

## Boundary result

The default lane now better separates command behavior ownership from SDL kernel loading concerns. This improves the test boundary without deleting the real-loader confidence path.
