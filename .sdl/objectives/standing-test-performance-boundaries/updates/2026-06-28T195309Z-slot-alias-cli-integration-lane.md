# Slot alias CLI integration lane move

## Summary

Moved `packages/sdl/test/scenario/slot-alias-cli.test.ts` to `packages/sdl/test/integration/slot-alias-cli.test.ts` without changing the test body.

## Objective Impact

Advances the standing test performance boundary by removing a real SDL/Slot CLI entrypoint contract from default Vitest discovery while retaining the same alias/help/hidden-command/shell coverage in the explicit integration lane.

## Performance evidence

- Baseline measured command:
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/slot-alias-cli.test.ts --reporter verbose`
- Baseline timing:
  - 1 file / 4 tests passed, duration 664ms, tests 224ms, transform 199ms, import 327ms.
- Post-change default discovery:
  - `pnpm --dir ts exec vitest list --config vitest.config.ts packages/sdl/test/scenario/slot-alias-cli.test.ts` listed no tests because the scenario file was removed.
  - `pnpm --dir ts exec vitest list --config vitest.config.ts packages/sdl/test/integration/slot-alias-cli.test.ts` listed no tests because default config excludes integration globs.
- Post-change integration discovery and timing:
  - `pnpm --dir ts exec vitest list --config vitest.integration.config.ts packages/sdl/test/integration/slot-alias-cli.test.ts` listed the 4 retained `sdl slot CLI` tests.
  - `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/slot-alias-cli.test.ts --reporter verbose` passed 1 file / 4 tests, duration 617ms, tests 203ms, transform 185ms, import 306ms.
- Repetition/noise notes:
  - Timings are single-run local measurements from this worktree; use them as directional evidence only.
- Cost handling:
  - This change shifts the full SDL/Slot CLI contract cost out of the default lane into the explicit integration lane; it does not eliminate the cost.
- Coverage retention:
  - The moved test still verifies SDL CLI metadata, `sdl slot --help`, hidden Slot exec command invocation through `sdl slot`, and canonical shell integration output.

## Follow-Ups

None required for this move.
