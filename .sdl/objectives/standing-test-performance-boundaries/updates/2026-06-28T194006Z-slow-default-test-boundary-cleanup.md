# Slow Default Test Boundary Cleanup

## Summary

Moved the selected real-backend/default-lane leaks out of the default suite:

- deleted `packages/sdl/test/scenario/land-cli.test.ts` after adding package-owned fake-driven coverage for `flow exec read-graphite-branch-metadata` and extending the checked-in flow extension integration smoke for hidden exec help routing;
- refactored the Pi `objective:list` default test to inject a narrow Objective client seam instead of creating a temp Git repository with `git init`;
- split dynamic SDL extension module import/execution cases from `packages/sdl/test/scenario/cp-cli.test.ts` into `packages/sdl/test/integration/extension-loader-cli.test.ts`, leaving cheap kernel/parser/discovery coverage in the default lane.

## Objective Impact

Advances the standing test performance boundary by making default coverage more fake-driven and intentional. Default tests no longer include the SDL land behavior file, no longer shell out to real Git for the Objective Pi list rendering case, and no longer exercise the SDL extension loader's real `jiti` user-module import path from `cp-cli.test.ts`. Real extension loader coverage remains explicit in the integration lane.

## Performance evidence

- Baseline measured command:
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/land-cli.test.ts --reporter verbose`
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/cp-cli.test.ts --reporter verbose`
  - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/hosts/pi/test/objective.test.ts --reporter verbose`
  - `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/flow-extension-registry.test.ts --reporter verbose`
- Baseline timing:
  - `land-cli.test.ts`: 4 tests passed, duration 685ms, tests 239ms.
  - `cp-cli.test.ts`: 21 tests passed, duration 795ms, tests 350ms.
  - `objective.test.ts`: 67 tests passed, duration 504ms, tests 155ms; the real-git case itself was 117ms.
  - `flow-extension-registry.test.ts`: 1 integration test passed, duration 508ms, tests 254ms.
- Post-change default timing:
  - Targeted default command covering the replacement set passed: 4 files / 117 tests, duration 734ms, tests 187ms.
  - Default `cp-cli.test.ts` now lists 13 cheap kernel/discovery tests; `land-cli.test.ts` lists no default tests because the file was deleted.
  - Full default suite passed: 362 files / 3560 tests, duration 3.64s.
- Post-change integration timing:
  - Targeted integration command covering `flow-extension-registry.test.ts` and `extension-loader-cli.test.ts` passed: 2 files / 10 tests, duration 755ms, tests 570ms.
  - Full integration suite passed: 28 files / 137 tests, duration 11.30s.
- Repetition/noise notes:
  - Timings are single-run local measurements from this worktree; use them as directional evidence only.
  - The `flow` package command tests still show import/transform cost, but their behavior is package-owned and fake-driven.
- Cost handling:
  - Default-lane real Git subprocess cost was eliminated from the Objective Pi list rendering case.
  - Default-lane checked-in flow extension loader/import behavior for land was removed; retained checked-in extension import coverage is a small integration smoke.
  - Dynamic user extension module import/execution coverage from `cp-cli.test.ts` was moved to the integration lane.
- Coverage retention:
  - `flow exec read-graphite-branch-metadata` now has fake-driven package-owned success, empty-output, failure, and killed/timeout coverage.
  - CCC land tests continue to cover `runLandCli` confirmation and live output behavior.
  - Flow checked-in extension integration still imports every checked-in flow command entry and now asserts the hidden `flow exec read-graphite-branch-metadata` help path.
  - Pi `objective:list` still verifies accepted args, rendered output, no Pi shell-out, and message details through an injected Objective client.
  - SDL extension loader integration retains real module import, command invocation, schema/help, load failure, and invalid schema diagnostics.

## Follow-Ups

None required for this cleanup slice. The remaining slow/default candidates called out by the classification pass were intentionally left in place for this pass.
