# Flow Autobranch Family Behavior Migration

## Summary

Migrated `sdl flow autobranch` and `sdl flow branch-latest-commit` behavior coverage out of SDL's default-lane checked-in extension loader tests. The default lane now keeps the behavior assertions in package-owned `@sdl/flow` fake-driven command tests, while the real SDL loader coverage for these commands lives as help/schema smoke in `ts/packages/sdl/test/integration/flow-extension-cli.test.ts`.

Deleted:

- `ts/packages/sdl/test/scenario/autobranch-cli.test.ts`
- `ts/packages/sdl/test/scenario/branch-latest-commit-cli.test.ts`

## Objective Impact

This removes another repeated project-local `.sdl/extensions/flow` copy/discovery/import fan-out from SDL default scenario tests. The retained behavior coverage runs directly against the package-owned flow command objects with scripted fakes for Git, Graphite, stash, and model interactions. The integration lane keeps the checked-in adapter/import confidence for command help and JSON schema exposure.

## Performance evidence

- Baseline measured command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/branch-latest-commit-cli.test.ts packages/sdl/test/scenario/autobranch-cli.test.ts --reporter verbose`
  - Baseline timing: 2 files / 16 tests, `Duration 847ms`, Vitest `tests 715ms`.
- Baseline package-owned command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/scenario/branch-latest-commit-command.test.ts packages/capabilities/flow/test/scenario/autobranch-command.test.ts --reporter verbose`
  - Baseline timing: 2 files / 10 tests, `Duration 674ms`, Vitest `tests 12ms`.
- Post-change package-owned default command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/scenario/branch-latest-commit-command.test.ts packages/capabilities/flow/test/scenario/autobranch-command.test.ts --reporter verbose`
  - Post-change timing: 2 files / 13 tests, `Duration 632ms`, Vitest `tests 15ms`.
- Post-change integration smoke command: `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/flow-extension-cli.test.ts --reporter verbose`
  - Integration timing: 1 file / 10 tests, `Duration 1.07s`, Vitest `tests 609ms`.
- Repetition/noise notes: timings are single local runs after formatting. The package-owned post-change duration is transform/import-noise dominated; Vitest test body time stayed low at 15ms while coverage increased from 10 to 13 tests.
- Cost handling: the default lane no longer copies and dynamically imports the checked-in flow extension for 16 autobranch-family SDL scenario tests. Checked-in loader/import coverage is shifted to two integration smoke cases in the existing flow extension integration file.
- Coverage retention: package-owned tests now retain success stdout/stderr routing, exact Git/Graphite/stash/model call assertions, no-`pi` subprocess assertions, dirty/clean refusal behavior, branch suffix reporting, Graphite/recovery failure guidance, recovery-create stop-before-reset behavior, and recovery cleanup warning routing. Integration keeps command help/schema assertions for `flow branch-latest-commit` and `flow autobranch`.

## Follow-Ups

No immediate follow-up for the autobranch family. `ts/packages/sdl/test/scenario/land-cli.test.ts` remains a possible but higher-risk future slice because it wraps CCC land behavior and controlled metadata reads rather than package-local flow command logic alone.
