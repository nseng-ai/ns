# SDLCC Host Option Shapes

## Summary

Narrowed the SDLCC host internal helper/model option-shape cluster from raw optional `| undefined` to omission-only optional properties.

Changed fields:

- `ts/packages/hosts/sdlcc/src/cli.ts`: `SdlccCliDeps.cwd`, `.runCommand`, `.stdout`, `.stderr`, `.startTui`.
- `ts/packages/hosts/sdlcc/src/cmux-report.ts`: `RunSdlccCmuxReportOptions.cwd`, `.runCommand`.
- `ts/packages/hosts/sdlcc/src/stack-map-effects.ts`: `CreateStackMapCmuxActivationExecutorOptions.cwd`, `.runCommand`, `.slotClient`.
- `ts/packages/hosts/sdlcc/src/stack-map-model-loader.ts`: `LoadStackMapModelOptions.cwd`, `.runCommand`.
- `ts/packages/hosts/sdlcc/src/opentui-renderer.ts`: `StartHelloWorldTuiOptions.model`.
- `ts/packages/hosts/sdlcc/test/unit/tab-controller.test.ts`: test-only key fixture shape `name` and `FakeModuleOptions.runEffect`.
- `ts/packages/hosts/sdlcc/test/unit/cli.test.ts`: normalized the fake command runner helper return type to `CommandRunner` so narrowed deps do not inherit optional-indexed `undefined`.

Preserved category: `SdlccCliDeps.env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>` remains explicit because environment maps deliberately model undefined values.

Scorecard using `rg -n "\\?:[^;=\\n]*\\| undefined" ... --glob '*.ts'` for typed optional-undefined properties and `rg -n "=== undefined|!== undefined|\\?\\? undefined|: undefined|undefined \\?" ... --glob '*.ts'` for undefined-normalization/check lines:

| Scope                     | Typed before | Typed after | Normalization/check before | Normalization/check after |
| ------------------------- | -----------: | ----------: | -------------------------: | ------------------------: |
| `ts/packages`             |          306 |         295 |                       2540 |                      2540 |
| `ts/packages/hosts/sdlcc` |           12 |           1 |                         74 |                        74 |

## Objective Impact

This advances the continuous cleanup row with one coherent package/subsystem cluster. The semantic claim is that SDLCC host helper/dependency/test options use absence-by-omission; present-key `undefined` has no separate SDLCC domain or compatibility meaning for the narrowed fields. The only remaining SDLCC typed optional-undefined candidate is the intentionally preserved `ExplicitUndefined<"env-map", ...>` environment contract.

Validation evidence:

- `pnpm --dir ts --filter sdlcc run check` passed.
- `pnpm --dir ts --filter sdlcc run test` passed: 6 files / 66 tests.
- `pnpm --dir ts run fmt:check -- packages/hosts/sdlcc/src/cli.ts packages/hosts/sdlcc/src/cmux-report.ts packages/hosts/sdlcc/src/stack-map-effects.ts packages/hosts/sdlcc/src/stack-map-model-loader.ts packages/hosts/sdlcc/src/opentui-renderer.ts packages/hosts/sdlcc/test/unit/tab-controller.test.ts packages/hosts/sdlcc/test/unit/cli.test.ts` passed after formatting `tab-controller.test.ts`.
- `pnpm --dir ts run lint` passed.
- Full `pnpm --dir ts run check` was attempted and failed on pre-existing/upstack `@sdl/plans` exact-optional call-site fallout in `branch-context`, `capability-pi/branch-context`, and `ccc`, not on SDLCC files.

## Follow-Ups

Continue selecting coherent internal package/subsystem clusters. Do not treat env-map `ExplicitUndefined` contracts as cleanup candidates unless a separate boundary-normalization plan replaces them.
