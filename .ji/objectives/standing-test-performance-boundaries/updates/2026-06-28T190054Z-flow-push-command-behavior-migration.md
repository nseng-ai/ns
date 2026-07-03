# Flow Push Command Behavior Migration

## Summary

Migrated the remaining `sdl flow push` behavior coverage out of SDL's default-lane real checked-in extension loader test and into package-owned `@sdl/flow` fake-driven command tests. Deleted `ts/packages/sdl/test/scenario/push-cli.test.ts` after preserving its unique behavior assertions in `ts/packages/capabilities/flow/test/scenario/push-command.test.ts` and retaining a small checked-in loader/import smoke in `ts/packages/sdl/test/integration/flow-extension-cli.test.ts`.

## Objective Impact

This advances the default-vs-integration boundary by removing the push-specific default test that copied `.sdl/extensions/flow`, discovered the checked-in extension, and dynamically imported it through the SDL loader for each behavior case. The default lane now asserts localized push behavior through the package-owned command object and scripted fakes; the explicit integration lane keeps the real loader confidence for `flow push` help/schema exposure and unavoidable CLI parser rejection.

## Performance evidence

- Baseline measured command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/push-cli.test.ts --reporter verbose`
  - Baseline timing: 1 file / 9 tests, `Duration 847ms`, Vitest `tests 401ms`.
- Post-change package-owned default command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/scenario/push-command.test.ts packages/capabilities/flow/test/unit/push-core.test.ts --reporter verbose`
  - Post-change timing: 2 files / 8 tests, `Duration 571ms`, Vitest `tests 5ms`.
- Post-change integration smoke command: `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/flow-extension-cli.test.ts --reporter verbose`
  - Integration timing: 1 file / 8 tests, `Duration 855ms`, Vitest `tests 465ms`.
- Repetition/noise notes: timings are single local runs in one implementation session; treat them as targeted placement evidence, not a full-suite speedup claim.
- Cost handling: repeated project-local `.sdl/extensions/flow` copy/discovery/import for push behavior was removed from the default lane; one checked-in loader/import smoke remains in the integration lane.
- Coverage retention: package-owned default tests now assert success stdout routing, command evidence, timeout option, raw stdout suppression on success, dirty refusal with porcelain output and submit guidance, status failure command/exit/stderr evidence, nonzero push stdout/stderr evidence, killed push evidence, expected git call ordering, and absence of model calls. Integration now asserts checked-in `flow push` help/schema exposure and unexpected-argument rejection before git/model calls.

## Follow-Ups

None for this slice. The remaining default SDL flow command scenario files may be considered independently by future standing-test-performance-boundaries passes; this update records only the `push` migration.
