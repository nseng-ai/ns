# Scenario Fake Helper Options Narrowing

## Summary

Narrowed a coherent internal test-helper cluster for scenario fake helpers in kernel and Flow:

- `ts/packages/kernel/test/scenario/sdl-cli-fakes.ts`
- `ts/packages/capabilities/flow/test/scenario/sdl-cli-fakes.ts`
- `ts/packages/capabilities/flow/test/scenario/flow-command-fakes.ts`

The selected scoped inventory had 30 `?: ... | undefined` grep hits across those three files before editing. Twenty-five outer optional-property declarations were narrowed to omission-only `?: T` for fake state/options/defaults/callback fields, and five remaining hits are intentionally preserved environment-map false positives where the nested value type is `Record<string, string | undefined>`.

Producer/forwarding code was normalized where `exactOptionalPropertyTypes` exposed present-key `undefined`: constructors now assign optional fake callbacks/extensions only when values are defined, and fake helper option forwarding uses object spread to omit `cwd`, `state`, and `missingTextGenerationResult` when absent.

## Objective Impact

This advances the standing cleanup row by removing redundant explicit `undefined` from internal helper-only shapes where present-key `undefined` has no domain, compatibility, input, or external-schema meaning. It also records a reusable classification: scenario fake/test helper option bags can be narrowed when callers and constructors already treat `undefined` as omission, but nested env maps should preserve `string | undefined` for individual environment variables.

Validation performed:

- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts exec vitest run packages/kernel/test/scenario packages/kernel/test/integration/flow-extension-cli.test.ts packages/capabilities/flow/test/scenario` passed: 18 files, 119 tests.
- `pnpm --dir ts run lint` passed.

## Follow-Ups

Remaining nearby scenario-test candidates in `completion-cli.test.ts`, `roaster-extension-cli.test.ts`, and `shell-cli.test.ts` were deliberately left for later classification because they are separate local fixtures, not part of the shared fake-helper cluster changed here.
