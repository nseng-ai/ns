# Semantic Update — Flow command behavior test-boundary migration

## Summary

Moved `sdl flow changes` and `sdl flow regenerate-pr` command behavior coverage out of `@sdl/sdl` real-loader scenario tests and into direct `sdl-flow` package scenario tests over the package-owned command objects. Retained minimal SDL integration smoke for real loader help/schema exposure for both commands.

## Objective Impact

This advances the standing test-performance boundary objective by removing repeated project-local `.sdl/extensions/flow` installation and selected-extension loading from the default-lane behavior tests. Behavior now sits at the owning `sdl-flow` fake seam, while SDL keeps only kernel/unavailable checks in the default lane and command-specific adapter confidence in integration.

## Performance Evidence

Baseline command:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/changes-cli.test.ts packages/sdl/test/scenario/regenerate-pr-cli.test.ts --reporter verbose
```

Baseline result in this implementation session: 20 tests passed; reported duration 569ms, import 413ms, tests 455ms. The saved plan also recorded an earlier baseline of 20 tests passed with relevant per-file test time 416ms and total duration 532ms.

Post-change default-lane command:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/changes-cli.test.ts packages/sdl/test/scenario/regenerate-pr-cli.test.ts --reporter verbose
```

Post-change result: 4 tests passed; reported duration 368ms, import 453ms, tests 11ms. Local single-run timing is noisy, but the repeated real-loader behavior cost was removed from these default-lane files.

Moved behavior coverage command:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts packages/extensions/flow/test/scenario/changes-command.test.ts packages/extensions/flow/test/scenario/regenerate-pr-command.test.ts packages/sdl/test/scenario/changes-cli.test.ts packages/sdl/test/scenario/regenerate-pr-cli.test.ts --reporter verbose
```

Result: 19 tests passed; reported duration 453ms, tests 26ms. Behavior coverage remains in direct command tests with fake `SdlExtensionApi` collaborators, including git/GitHub protocol assertions, model environment selection, validation/failure paths, confirmation handling, and managed body preservation.

Integration smoke command:

```bash
pnpm --dir ts run test:integration packages/sdl/test/integration/flow-extension-cli.test.ts -- --reporter verbose
```

Result: 6 tests passed; reported duration 540ms. This retained real-loader help/schema smoke for `changes` and `regenerate-pr` alongside existing `cp` and `submit` loader coverage.

## Follow-Ups

None from this slice. The existing guidance to migrate localized command behavior to owning package fake seams remains accurate.
